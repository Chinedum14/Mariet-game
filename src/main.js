// PlayMarkets — frontend logic.
// Data lives in Firestore (shared with the mobile app). Live quotes,
// notifications, and the login gate still go through the Rust backend.

import { buildMapView } from "./mapview.js";

const invoke = window.__TAURI__?.core?.invoke;

// ---------- State ----------
let markets = [];        // all markets, from the Firestore subscription
let currentId = null;    // id of the market shown in the editor
let editingId = null;    // id being edited in the modal (null = adding new)
let saveTimer = null;    // debounce handle for autosave
let fb = null;           // firebase data module (loaded after login)
let unsub = null;        // Firestore unsubscribe fn
let firstSnapshot = true;
let pendingSelectId = null; // select this market once it arrives in a snapshot
let mapOpen = false;     // true when the editor is showing the supplier map

// ---------- Element handles ----------
const $ = (id) => document.getElementById(id);
const els = {
  list: $("market-list"),
  empty: $("empty-state"),
  editor: $("editor"),
  name: $("m-name"),
  symbol: $("m-symbol"),
  category: $("m-category"),
  price: $("m-price"),
  changes: $("m-changes"),
  target: $("m-target"),
  saved: $("m-saved"),
  notes: $("notes"),
  mapPanel: $("map-panel"),
  mapBtn: $("map-market-btn"),
  footCount: $("foot-count"),
  footTotal: $("foot-total"),
  backdrop: $("modal-backdrop"),
  modalTitle: $("modal-title"),
  form: $("market-form"),
  fName: $("f-name"),
  fSymbol: $("f-symbol"),
  fQuote: $("f-quote"),
  fCategory: $("f-category"),
  fTarget: $("f-target"),
  catSuggestions: $("category-suggestions"),
  refreshBtn: $("refresh-btn"),
  refreshStatus: $("refresh-status"),
};

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Turns a "change" string into display info: colour class, arrow glyph, %text.
function changeInfo(raw) {
  const n = parseFloat(raw);
  if (raw === "" || raw == null || isNaN(n)) {
    return { cls: "flat", arrow: "—", pct: "" };
  }
  const pct = (n > 0 ? "+" : "") + n + "%";
  const cls = n > 0 ? "up" : n < 0 ? "down" : "flat";
  const arrow = n > 0 ? "↗" : n < 0 ? "↘" : "—";
  return { cls, arrow, pct };
}

function priceLabel(raw) {
  if (!raw) return "";
  const p = String(raw).replace(/^\$/, "").trim();
  return p ? "$" + p : "";
}

// True when the market has a numeric target and its live price is above it.
function aboveTarget(m) {
  const price = parseFloat(m.price);
  const target = parseFloat(m.target);
  return !isNaN(price) && !isNaN(target) && m.target !== "" && price > target;
}

function fmtDate(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function countWords(text) {
  const t = text.trim();
  const words = t ? t.split(/\s+/).length : 0;
  return { words, chars: text.length };
}

// ---------- Sidebar ----------
function renderSidebar() {
  const groups = {};
  for (const m of markets) {
    const key = (m.category || "Other").trim() || "Other";
    (groups[key] ||= []).push(m);
  }
  const catNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  els.list.innerHTML = "";
  for (const cat of catNames) {
    const rows = groups[cat].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const group = document.createElement("div");
    group.className = "group";
    const label = document.createElement("div");
    label.className = "group-label";
    label.textContent = cat;
    group.appendChild(label);

    for (const m of rows) {
      const ci = changeInfo(m.changeDay);
      const row = document.createElement("button");
      row.className = "market-row" + (m.id === currentId ? " active" : "");
      row.dataset.id = m.id;

      const ticker = [];
      if (m.symbol) ticker.push(`<span>${escapeHtml(m.symbol)}</span>`);
      ticker.push(`<span class="${ci.cls}">${ci.arrow}</span>`);
      if (ci.pct) ticker.push(`<span class="${ci.cls}">${escapeHtml(ci.pct)}</span>`);

      // Status dots, pinned to the far right of the row for easy scanning.
      const markers = [];
      if (aboveTarget(m)) {
        markers.push(`<span class="target-marker" title="Above target ${escapeHtml(m.target)}">●</span>`);
      }
      if (hasMomentum(m)) {
        markers.push(`<span class="momentum-marker" title="Rising fast — up 3%+ today or 6%+ over 3 trading days">●</span>`);
      }
      const markerBox = markers.length
        ? `<span class="row-markers">${markers.join("")}</span>`
        : "";
      row.innerHTML =
        markerBox +
        `<div class="row-name">${escapeHtml(m.name)}</div>` +
        `<div class="row-ticker">${ticker.join("")}</div>`;
      group.appendChild(row);
    }
    els.list.appendChild(group);
  }

  els.footTotal.textContent =
    `${markets.length} market${markets.length === 1 ? "" : "s"} tracked`;

  els.catSuggestions.innerHTML = catNames
    .filter((c) => c !== "Other")
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");
}

// ---------- Editor ----------
function showEmpty() {
  currentId = null;
  setMapMode(false);
  els.editor.classList.add("hidden");
  els.empty.classList.remove("hidden");
}

function selectMarket(id) {
  flushSave(); // flush pending save for the market we're leaving

  const m = markets.find((x) => x.id === id);
  if (!m) return showEmpty();

  currentId = id;
  els.empty.classList.add("hidden");
  els.editor.classList.remove("hidden");

  els.name.textContent = m.name;
  renderMeta(m);
  els.saved.textContent = m.modifiedMs ? "Saved " + fmtDate(m.modifiedMs) : "";
  els.notes.value = m.body || "";
  updateCounts();

  setMapMode(false); // always land on the notes editor when switching markets
  renderSidebar();
  els.notes.focus();
}

// ---------- Supplier map ----------
// Swaps the notes textarea for a world map of the commodity's top suppliers.
function setMapMode(on) {
  mapOpen = on;
  els.notes.classList.toggle("hidden", on);
  els.mapPanel.classList.toggle("hidden", !on);
  els.mapBtn.classList.toggle("active", on);
  els.mapBtn.textContent = on ? "Notes" : "Map";
  els.mapBtn.title = on ? "Back to notes" : "Show world map of top suppliers";

  if (on) {
    flushSave(); // persist any pending edits before hiding the textarea
    const m = markets.find((x) => x.id === currentId);
    els.mapPanel.replaceChildren();
    if (m) els.mapPanel.appendChild(buildMapView(m).node);
  } else {
    els.mapPanel.replaceChildren();
  }
}

function toggleMapMode() {
  if (!currentId) return;
  setMapMode(!mapOpen);
}

// Renders the symbol/category/price/changes/target line in the editor header.
function renderMeta(m) {
  els.symbol.textContent = m.symbol || "";
  els.category.textContent = m.category || "";
  els.price.textContent = priceLabel(m.price);

  const horizons = [
    ["1D", m.changeDay],
    ["1W", m.changeWeek],
    ["1M", m.changeMonth],
  ];
  els.changes.innerHTML = horizons
    .filter(([, v]) => v !== "" && v != null)
    .map(([label, v]) => {
      const ci = changeInfo(v);
      return `<span class="chg ${ci.cls}"><span class="chg-label">${label}</span> ${ci.arrow} ${escapeHtml(ci.pct)}</span>`;
    })
    .join("");

  if (m.target) {
    const hit = aboveTarget(m);
    els.target.textContent = `${hit ? "● " : "⌖ "}target ${m.target}`;
    els.target.className = "mono meta-target" + (hit ? " hit" : "");
  } else {
    els.target.textContent = "";
    els.target.className = "mono meta-target";
  }
}

function updateCounts() {
  const { words, chars } = countWords(els.notes.value);
  els.footCount.textContent =
    `${words} word${words === 1 ? "" : "s"} · ${chars} char${chars === 1 ? "" : "s"}`;
}

// ---------- Autosave ----------
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 600);
}

async function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const m = markets.find((x) => x.id === currentId);
  if (!m || !fb) return;
  if (m.body === els.notes.value) return; // nothing changed

  m.body = els.notes.value;
  try {
    await fb.saveMarket(m);
    m.modifiedMs = Date.now();
    if (currentId === m.id) els.saved.textContent = "Saved " + fmtDate(m.modifiedMs);
  } catch (e) {
    console.error("save failed", e);
    els.saved.textContent = "⚠ Save failed";
  }
}

// ---------- Modal ----------
function openModal(mode, market) {
  editingId = mode === "edit" ? market.id : null;
  els.modalTitle.textContent = mode === "edit" ? "Edit market" : "Add market";
  els.fName.value = market?.name || "";
  els.fSymbol.value = market?.symbol || "";
  els.fQuote.value = market?.quote || "";
  els.fCategory.value = market?.category || "";
  els.fTarget.value = market?.target || "";
  els.backdrop.classList.remove("hidden");
  els.fName.focus();
}

function closeModal() {
  els.backdrop.classList.add("hidden");
  els.form.reset();
  editingId = null;
}

async function handleSubmit(e) {
  e.preventDefault();
  const name = els.fName.value.trim();
  if (!name || !fb) return;

  const fields = {
    name,
    symbol: els.fSymbol.value.trim(),
    quote: els.fQuote.value.trim(),
    category: els.fCategory.value.trim(),
    target: els.fTarget.value.trim().replace(/^\$/, ""),
  };

  try {
    if (editingId) {
      const m = markets.find((x) => x.id === editingId);
      await fb.saveMarket({ ...m, ...fields });
      closeModal();
      refreshQuotes(); // symbol may have changed — pull fresh prices
    } else {
      const created = await fb.createMarket(fields);
      pendingSelectId = created.id; // select once the snapshot arrives
      closeModal();
      refreshQuotes(); // fetch live price for the new market
    }
  } catch (err) {
    console.error(err);
    alert("Could not save market:\n" + err);
  }
}

async function deleteCurrent() {
  const m = markets.find((x) => x.id === currentId);
  if (!m || !fb) return;
  if (!confirm(`Delete "${m.name}" and its notes from the cloud? This affects all devices.`)) return;
  try {
    await fb.deleteMarket(m.id);
    showEmpty(); // snapshot will also drop it
  } catch (err) {
    alert("Could not delete market:\n" + err);
  }
}

// ---------- Sample data ----------
const SAMPLES = [
  { name: "Crude Oil", symbol: "CL", quote: "CL=F", category: "Energy",
    body: "Supply draw reported by EIA this week — inventories fell 4.2M barrels vs 1.8M expected.\n\nOPEC+ maintaining cuts through Q3. Watch for Saudi Aramco guidance on Aug production levels.\n\nKey levels: support at $75.80, resistance at $81.40. Brent spread holding tight at ~$3." },
  { name: "Natural Gas", symbol: "NG", quote: "NG=F", category: "Energy",
    body: "Mild weather forecast easing near-term demand. Storage sitting above the 5-year average.\n\nWatch LNG export terminal utilisation for any upside surprise." },
  { name: "Wheat", symbol: "ZW", quote: "ZW=F", category: "Grains",
    body: "Black Sea export-corridor uncertainty keeping a risk premium in the price.\n\nNext catalyst: USDA WASDE report." },
  { name: "Corn", symbol: "ZC", quote: "ZC=F", category: "Grains",
    body: "Strong US planting progress and favourable weather. Ample supply weighing on price." },
  { name: "Gold", symbol: "GC", quote: "GC=F", category: "Metals",
    body: "Fed rate-cut expectations broadly supportive. Safe-haven bid ebbing and flowing with geopolitics." },
  { name: "Silver", symbol: "SI", quote: "SI=F", category: "Metals",
    body: "Tracking gold, but industrial demand from solar remains a firm floor." },
];

async function loadSamples() {
  if (!fb) return;
  try {
    let firstId = null;
    for (const s of SAMPLES) {
      const created = await fb.createMarket({
        name: s.name, symbol: s.symbol, quote: s.quote, category: s.category,
      });
      await fb.saveMarket({ ...created, body: s.body });
      if (!firstId) firstId = created.id;
    }
    pendingSelectId = firstId;
    refreshQuotes();
  } catch (err) {
    alert("Could not load sample data:\n" + err);
  }
}

// ---------- Live quotes (Yahoo via Rust, persisted to Firestore) ----------
let refreshing = false;

async function refreshQuotes() {
  if (refreshing || !fb) return;
  const requests = markets
    .map((m) => ({ id: m.id, symbol: (m.quote || m.symbol || "").trim() }))
    .filter((r) => r.symbol);
  if (!requests.length) {
    els.refreshStatus.textContent = "· no symbols";
    return;
  }

  refreshing = true;
  els.refreshBtn.classList.add("spinning");
  els.refreshStatus.textContent = "· fetching…";

  try {
    const quotes = await invoke("fetch_quotes", { requests });
    let failed = 0;
    const momHits = [];
    for (const q of quotes) {
      const m = markets.find((x) => x.id === q.id);
      if (!m) continue;
      if (q.error || q.price == null) { failed++; continue; }
      const updated = {
        ...m,
        price: String(q.price),
        changeDay: q.changeDay != null ? String(q.changeDay) : "",
        changeWeek: q.changeWeek != null ? String(q.changeWeek) : "",
        changeMonth: q.changeMonth != null ? String(q.changeMonth) : "",
        change3d: q.change3d != null ? String(q.change3d) : "",
      };
      await fb.saveMarket(updated);
      const reason = takeMomentumReason(q.id, q);
      if (reason) momHits.push({ name: m.name, reason });
    }
    sendMomentumNotification(momHits);
    els.refreshStatus.textContent =
      `· ${fmtTime(Date.now())}` + (failed ? ` (${failed} failed)` : "");
  } catch (err) {
    console.error(err);
    els.refreshStatus.textContent = "· failed";
  } finally {
    refreshing = false;
    els.refreshBtn.classList.remove("spinning");
  }
}

function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ---------- Target-price alerts ----------
async function checkTargetsAndNotify() {
  const hits = markets.filter(aboveTarget);
  if (!hits.length) return;

  const title = hits.length === 1
    ? `${hits[0].name} is above target`
    : `${hits.length} markets above target`;
  const body = hits
    .map((m) => `${m.name}: ${priceLabel(m.price)} (target ${m.target})`)
    .join("\n");

  try {
    await invoke("notify", { title, body });
  } catch (e) {
    console.error("notify failed", e);
  }
}

// ---------- Momentum alerts (fast risers) ----------
// Alert when a market rises >= 3% in one trading day, or >= 6% over the last
// 3 trading days. Deduped per day so a market above threshold doesn't re-alert
// on every 30-minute refresh.
const MOMENTUM_DAY_PCT = 3;
const MOMENTUM_3D_PCT = 6;
let momentumDay = "";
const momentumSeen = new Set();

// True when a market currently satisfies either momentum rule. Drives the green
// pulsing dot; derived from live fields so it clears itself once prices update.
function hasMomentum(m) {
  const day = parseFloat(m.changeDay);
  const d3 = parseFloat(m.change3d);
  return (!isNaN(day) && day >= MOMENTUM_DAY_PCT) || (!isNaN(d3) && d3 >= MOMENTUM_3D_PCT);
}

// Returns a reason for any momentum rule that NEWLY fired today for this market
// (marking it so it won't re-alert), or null. When a rule no longer holds its
// mark is cleared, so a genuine fresh spike later the same day alerts again.
function takeMomentumReason(id, q) {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (stamp !== momentumDay) { momentumDay = stamp; momentumSeen.clear(); }

  const day = Number(q?.changeDay);
  const d3 = Number(q?.change3d);
  const parts = [];

  if (Number.isFinite(day) && day >= MOMENTUM_DAY_PCT) {
    if (!momentumSeen.has(`${id}:day`)) {
      momentumSeen.add(`${id}:day`);
      parts.push(`up ${day}% today`);
    }
  } else {
    momentumSeen.delete(`${id}:day`); // re-arm once it drops back below threshold
  }

  if (Number.isFinite(d3) && d3 >= MOMENTUM_3D_PCT) {
    if (!momentumSeen.has(`${id}:3d`)) {
      momentumSeen.add(`${id}:3d`);
      parts.push(`up ${d3}% over 3 trading days`);
    }
  } else {
    momentumSeen.delete(`${id}:3d`);
  }

  return parts.length ? parts.join(" · ") : null;
}

async function sendMomentumNotification(hits) {
  if (!hits.length) return;
  const title = hits.length === 1
    ? `${hits[0].name} is moving`
    : `${hits.length} markets moving`;
  const body = hits.map((h) => `${h.name}: ${h.reason}`).join("\n");
  try {
    await invoke("notify", { title, body });
  } catch (e) {
    console.error("momentum notify failed", e);
  }
}

// ---------- Firestore subscription ----------
function onMarketsSnapshot(list) {
  markets = list;

  // Select a just-created market once it appears.
  if (pendingSelectId && markets.find((m) => m.id === pendingSelectId)) {
    const id = pendingSelectId;
    pendingSelectId = null;
    firstSnapshot = false;
    selectMarket(id);
    return;
  }

  renderSidebar();

  // Keep the open editor in sync with remote changes (prices, or edits from the
  // phone), without clobbering notes the user is actively typing.
  if (currentId) {
    const m = markets.find((x) => x.id === currentId);
    if (!m) {
      showEmpty();
    } else {
      els.name.textContent = m.name;
      renderMeta(m);
      els.saved.textContent = m.modifiedMs ? "Saved " + fmtDate(m.modifiedMs) : "";
      if (document.activeElement !== els.notes) {
        els.notes.value = m.body || "";
        updateCounts();
      }
    }
  }

  if (firstSnapshot) {
    firstSnapshot = false;
    if (markets.length) {
      const latest = [...markets].sort((a, b) => (b.modifiedMs || 0) - (a.modifiedMs || 0))[0];
      selectMarket(latest.id);
      refreshQuotes();       // pull live prices on launch
      checkTargetsAndNotify();
    } else {
      showEmpty();
    }
  }
}

// ---------- Init ----------
function wireEvents() {
  els.list.addEventListener("click", (e) => {
    const row = e.target.closest(".market-row");
    if (row) selectMarket(row.dataset.id);
  });

  els.notes.addEventListener("input", () => { updateCounts(); scheduleSave(); });
  els.notes.addEventListener("blur", flushSave);
  window.addEventListener("beforeunload", flushSave);

  $("add-market-btn").addEventListener("click", () => openModal("add"));
  $("empty-add-btn").addEventListener("click", () => openModal("add"));
  $("empty-sample-btn").addEventListener("click", loadSamples);
  els.mapBtn.addEventListener("click", toggleMapMode);
  $("edit-market-btn").addEventListener("click", () => {
    const m = markets.find((x) => x.id === currentId);
    if (m) openModal("edit", m);
  });
  $("delete-market-btn").addEventListener("click", deleteCurrent);
  els.refreshBtn.addEventListener("click", refreshQuotes);

  els.form.addEventListener("submit", handleSubmit);
  $("modal-cancel").addEventListener("click", closeModal);
  els.backdrop.addEventListener("click", (e) => {
    if (e.target === els.backdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.backdrop.classList.contains("hidden")) closeModal();
  });
}

// Reveals the app and boots it — only called after a successful login.
async function startApp() {
  $("login-screen").classList.add("hidden");
  $("app").classList.remove("hidden");
  wireEvents();

  els.refreshStatus.textContent = "· connecting…";
  try {
    fb = await import("./firebase.js"); // load Firebase only after login
    await fb.signInShared();
  } catch (e) {
    console.error(e);
    els.refreshStatus.textContent = "· offline";
    alert("Could not connect to the cloud:\n" + (e?.message || e));
    return;
  }

  unsub = fb.subscribeMarkets(onMarketsSnapshot);

  setInterval(refreshQuotes, 30 * 60 * 1000);          // live prices every 30 min
  setInterval(checkTargetsAndNotify, 4 * 60 * 60 * 1000); // target alerts every 4 h
}

function wireLogin() {
  const form = $("login-form");
  const err = $("login-error");
  const uname = $("login-username");
  const pass = $("login-password");
  const btn = form.querySelector("button[type=submit]");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    btn.disabled = true;
    try {
      const ok = await invoke("login", {
        username: uname.value.trim(),
        password: pass.value,
      });
      if (ok) {
        startApp();
      } else {
        err.textContent = "Incorrect username or password.";
        pass.value = "";
        pass.focus();
      }
    } catch (e2) {
      console.error(e2);
      err.textContent = "Login failed: " + e2;
    } finally {
      btn.disabled = false;
    }
  });

  uname.focus();
}

window.addEventListener("DOMContentLoaded", async () => {
  if (!invoke) {
    document.body.innerHTML =
      '<div style="padding:40px;color:#e5534b;font-family:sans-serif">' +
      "This app must be launched with <code>npm run tauri dev</code> " +
      "(the Tauri desktop runtime), not opened directly in a browser.</div>";
    return;
  }
  try {
    if (await invoke("is_authenticated")) {
      startApp();
      return;
    }
  } catch (e) {
    console.error(e);
  }
  wireLogin();
});
