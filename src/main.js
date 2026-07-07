// Market Notes — frontend logic.
// Talks to the Rust backend through Tauri's global `invoke`.

const invoke = window.__TAURI__?.core?.invoke;

// ---------- State ----------
let markets = [];        // all markets, as returned by the backend
let currentId = null;    // id of the market shown in the editor
let editingId = null;    // id being edited in the modal (null = adding new)
let saveTimer = null;    // debounce handle for autosave

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
  // Group by category (blank -> "Other"), categories sorted alphabetically.
  const groups = {};
  for (const m of markets) {
    const key = (m.category || "Other").trim() || "Other";
    (groups[key] ||= []).push(m);
  }
  const catNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  els.list.innerHTML = "";
  for (const cat of catNames) {
    const rows = groups[cat].sort((a, b) => a.name.localeCompare(b.name));

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

      const marker = aboveTarget(m)
        ? `<span class="target-marker" title="Above target ${escapeHtml(m.target)}">●</span>`
        : "";
      row.innerHTML =
        marker +
        `<div class="row-name">${escapeHtml(m.name)}</div>` +
        `<div class="row-ticker">${ticker.join("")}</div>`;
      group.appendChild(row);
    }
    els.list.appendChild(group);
  }

  els.footTotal.textContent =
    `${markets.length} market${markets.length === 1 ? "" : "s"} tracked`;

  // Refresh category autocomplete suggestions.
  els.catSuggestions.innerHTML = catNames
    .filter((c) => c !== "Other")
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join("");
}

// ---------- Editor ----------
function showEmpty() {
  currentId = null;
  els.editor.classList.add("hidden");
  els.empty.classList.remove("hidden");
}

function selectMarket(id) {
  // Flush any pending save for the market we're leaving.
  flushSave();

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

  renderSidebar();
  els.notes.focus();
}

// Renders the symbol/category/price/changes line in the editor header.
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
  if (!m) return;
  if (m.body === els.notes.value) return; // nothing changed

  m.body = els.notes.value;
  try {
    const saved = await invoke("save_market", { market: m });
    Object.assign(m, saved);
    if (currentId === m.id) {
      els.saved.textContent = "Saved " + fmtDate(m.modifiedMs || Date.now());
    }
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
  if (!name) return;

  const fields = {
    name,
    symbol: els.fSymbol.value.trim(),
    quote: els.fQuote.value.trim(),
    category: els.fCategory.value.trim(),
    target: els.fTarget.value.trim().replace(/^\$/, ""),
  };

  try {
    if (editingId) {
      // Update an existing market, preserving its notes body and live prices.
      const m = markets.find((x) => x.id === editingId);
      const updated = { ...m, ...fields };
      const saved = await invoke("save_market", { market: updated });
      Object.assign(m, saved);
      closeModal();
      renderSidebar();
      if (currentId === m.id) selectMarket(m.id);
      refreshQuotes(); // symbol may have changed — pull fresh prices
    } else {
      let created = await invoke("create_market", {
        name: fields.name, symbol: fields.symbol, category: fields.category,
      });
      if (fields.quote || fields.target) {
        created = await invoke("save_market", {
          market: { ...created, quote: fields.quote, target: fields.target },
        });
      }
      markets.push(created);
      closeModal();
      selectMarket(created.id);
      refreshQuotes(); // fetch live price for the new market
    }
  } catch (err) {
    console.error(err);
    alert("Could not save market:\n" + err);
  }
}

async function deleteCurrent() {
  const m = markets.find((x) => x.id === currentId);
  if (!m) return;
  if (!confirm(`Delete "${m.name}" and its notes? This removes the .md file from disk.`)) return;
  try {
    await invoke("delete_market", { id: m.id });
    markets = markets.filter((x) => x.id !== m.id);
    renderSidebar();
    showEmpty();
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
  try {
    for (const s of SAMPLES) {
      const created = await invoke("create_market", {
        name: s.name, symbol: s.symbol, category: s.category,
      });
      const saved = await invoke("save_market", {
        market: { ...created, quote: s.quote, body: s.body },
      });
      markets.push(saved);
    }
    renderSidebar();
    selectMarket(markets[0].id);
    refreshQuotes(); // pull live prices right away
  } catch (err) {
    alert("Could not load sample data:\n" + err);
  }
}

// ---------- Live quotes ----------
let refreshing = false;

async function refreshQuotes() {
  if (refreshing) return;
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
    let ok = 0, failed = 0;
    for (const q of quotes) {
      const m = markets.find((x) => x.id === q.id);
      if (!m) continue;
      if (q.error || q.price == null) { failed++; continue; }
      m.price = String(q.price);
      m.changeDay = q.changeDay != null ? String(q.changeDay) : "";
      m.changeWeek = q.changeWeek != null ? String(q.changeWeek) : "";
      m.changeMonth = q.changeMonth != null ? String(q.changeMonth) : "";
      await invoke("save_market", { market: m });
      if (m.id === currentId) renderMeta(m);
      ok++;
    }
    renderSidebar();
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
// Sends one desktop notification summarising every market currently above its
// target. Called on launch and every 4 hours (see init).
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

// ---------- Init ----------
async function loadMarkets() {
  markets = await invoke("list_markets");
  renderSidebar();
  if (markets.length) {
    // Select the most recently modified market.
    const latest = [...markets].sort(
      (a, b) => (b.modifiedMs || 0) - (a.modifiedMs || 0))[0];
    selectMarket(latest.id);
    await refreshQuotes(); // pull live prices on launch
    checkTargetsAndNotify(); // alert about anything already above target
  } else {
    showEmpty();
  }
}

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
  $("edit-market-btn").addEventListener("click", () => {
    const m = markets.find((x) => x.id === currentId);
    if (m) openModal("edit", m);
  });
  $("delete-market-btn").addEventListener("click", deleteCurrent);
  els.refreshBtn.addEventListener("click", refreshQuotes);
  $("open-folder-btn").addEventListener("click", () =>
    invoke("reveal_data_dir").catch((e) => alert("Could not open folder:\n" + e)));

  els.form.addEventListener("submit", handleSubmit);
  $("modal-cancel").addEventListener("click", closeModal);
  els.backdrop.addEventListener("click", (e) => {
    if (e.target === els.backdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.backdrop.classList.contains("hidden")) closeModal();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  if (!invoke) {
    document.body.innerHTML =
      '<div style="padding:40px;color:#e5534b;font-family:sans-serif">' +
      "This app must be launched with <code>npm run tauri dev</code> " +
      "(the Tauri desktop runtime), not opened directly in a browser.</div>";
    return;
  }
  wireEvents();
  loadMarkets().catch((e) => {
    console.error(e);
    alert("Failed to load markets:\n" + e);
  });

  // Auto-refresh live prices every 30 minutes.
  const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(refreshQuotes, REFRESH_INTERVAL_MS);

  // Notify about markets above their target price every 4 hours.
  const NOTIFY_INTERVAL_MS = 4 * 60 * 60 * 1000;
  setInterval(checkTargetsAndNotify, NOTIFY_INTERVAL_MS);
});
