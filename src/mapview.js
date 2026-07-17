// Renders a world map into the editor, highlighting a commodity's top-10
// supplier countries in the app's warm-gold accent. Fully offline — country
// geometry comes from the bundled worldmap.js.
import { COUNTRIES, MAP_W, MAP_H, project } from "./worldmap.js";
import { matchCommodity } from "./suppliers.js";

const byId = new Map(COUNTRIES.map((c) => [c.id, c]));

// Fallback centroids (lon, lat) for supplier states too small to appear as a
// shape in the 110m map — drawn as a marker dot instead.
const MICRO_POINTS = {
  BHR: [50.55, 26.05], // Bahrain
};

// Average the points of a country's largest ring to get a label anchor.
function labelAnchor(pathD) {
  const rings = pathD.split("M").filter(Boolean);
  let best = null;
  let bestCount = 0;
  for (const ring of rings) {
    const nums = ring.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 6) continue;
    if (nums.length > bestCount) { bestCount = nums.length; best = nums; }
  }
  if (!best) return null;
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i + 1 < best.length; i += 2) {
    sx += parseFloat(best[i]);
    sy += parseFloat(best[i + 1]);
    n++;
  }
  return [sx / n, sy / n];
}

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// Build the whole map view for a market. Returns { ok, label, node }.
export function buildMapView(market) {
  const commodity = matchCommodity(market);
  const wrap = document.createElement("div");
  wrap.className = "mapview";

  if (!commodity) {
    wrap.classList.add("mapview-empty");
    wrap.innerHTML =
      '<div class="map-empty-inner">' +
      '<div class="map-empty-glyph">◍</div>' +
      "<h2>No supplier map for this market</h2>" +
      "<p>The world map highlights the top-10 producing countries for tracked " +
      "commodities (oil, gold, wheat, copper, coffee, and more). " +
      "Rename this market to a commodity to see its supply map.</p>" +
      "</div>";
    return { ok: false, label: null, node: wrap };
  }

  const rankById = new Map(commodity.suppliers.map(([id], i) => [id, i + 1]));

  // ---- Header ----
  const head = document.createElement("div");
  head.className = "map-head";
  head.innerHTML =
    '<div class="map-title">Top 10 suppliers · <strong>' +
    escapeHtml(commodity.label) +
    "</strong></div>" +
    '<div class="map-subtitle">Major producing countries, highlighted in gold</div>';
  wrap.appendChild(head);

  // ---- Body: map + legend ----
  const body = document.createElement("div");
  body.className = "map-body";

  const mapCol = document.createElement("div");
  mapCol.className = "map-col";
  const svg = svgEl("svg", {
    viewBox: `0 0 ${MAP_W} ${MAP_H}`,
    class: "world-svg",
    preserveAspectRatio: "xMidYMid meet",
  });

  // Base landmass (every country) in a muted tone.
  const base = svgEl("g", { class: "map-land" });
  for (const c of COUNTRIES) base.appendChild(svgEl("path", { d: c.d }));
  svg.appendChild(base);

  // Highlighted suppliers + rank badges.
  const hi = svgEl("g", { class: "map-suppliers" });
  const badges = svgEl("g", { class: "map-badges" });
  for (const [id, name] of commodity.suppliers) {
    const rank = rankById.get(id);
    const country = byId.get(id);
    let anchor = null;

    if (country) {
      hi.appendChild(svgEl("path", { d: country.d, class: "supplier-shape", "data-rank": rank }));
      anchor = labelAnchor(country.d);
    } else if (MICRO_POINTS[id]) {
      const [lon, lat] = MICRO_POINTS[id];
      anchor = project(lon, lat);
      hi.appendChild(svgEl("circle", { cx: anchor[0], cy: anchor[1], r: 4, class: "supplier-shape supplier-dot", "data-rank": rank }));
    }

    if (anchor) {
      const [x, y] = anchor;
      const g = svgEl("g", { class: "badge", "data-rank": rank });
      g.appendChild(svgEl("circle", { cx: x, cy: y, r: 9, class: "badge-bg" }));
      const t = svgEl("text", { x, y: y + 0.5, class: "badge-num" });
      t.textContent = String(rank);
      g.appendChild(t);
      g.setAttribute("data-name", name);
      badges.appendChild(g);
    }
  }
  svg.appendChild(hi);
  svg.appendChild(badges);
  mapCol.appendChild(svg);
  body.appendChild(mapCol);

  // ---- Legend ----
  const legend = document.createElement("ol");
  legend.className = "map-legend";
  commodity.suppliers.forEach(([id, name], i) => {
    const li = document.createElement("li");
    li.dataset.id = id;
    li.dataset.rank = i + 1;
    li.innerHTML =
      '<span class="legend-rank">' + (i + 1) + "</span>" +
      '<span class="legend-name">' + escapeHtml(name) + "</span>";
    legend.appendChild(li);
  });
  body.appendChild(legend);

  wrap.appendChild(body);

  // Hover cross-highlight between legend and map (matched by rank).
  const setHover = (rank, on) => {
    svg.querySelectorAll(`[data-rank="${rank}"]`).forEach((n) =>
      n.classList.toggle("focus", on));
    const li = legend.querySelector(`li[data-rank="${rank}"]`);
    if (li) li.classList.toggle("focus", on);
  };
  legend.addEventListener("mouseover", (e) => {
    const li = e.target.closest("li");
    if (li) setHover(li.dataset.rank, true);
  });
  legend.addEventListener("mouseout", (e) => {
    const li = e.target.closest("li");
    if (li) setHover(li.dataset.rank, false);
  });

  return { ok: true, label: commodity.label, node: wrap };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
