// Entry point: loads the data from the API and connects the map, panels, sliders, site card and report view.
// Until a slider moves, the list shows the ranking the API served (the ML model's, once it is merged).
// Moving a slider re-ranks in the browser with the same formula as the API (js/weights.js, tested against Python).
import { api, ApiError, ignoredApiParam } from "./api.js";
import { el, clear, $, $$ } from "./dom.js";
import { createStore } from "./state.js";
import { KEYS, retotal, topChange } from "./weights.js";
import { buildContext } from "./drivers.js";
import { extent, fmt, legendBins } from "./scale.js";
import { toCsv, rankedRows } from "./csv.js";
import { toGeoJson } from "./export.js";
import { renderBrief } from "./brief.js";
import {
  createMap, createBasemap, createCorridor, createPathShade, createOverlay, createStreetTiles, createSitesLayer, createBadges,
} from "./map.js";
import { renderTopList, highlightRow, markPlan } from "./list.js";
import { renderCard } from "./panel.js";
import { setupSliders } from "./sliders.js";
import { setupReport } from "./report.js";
import { plantStats } from "./stats.js";
import { renderStrip } from "./strip.js";
import { renderScenario } from "./scenario.js";
import { renderImpact } from "./impact.js";
import { renderTradeoff } from "./tradeoff.js";
import { buildHash, parseHash } from "./hash.js";
import { startTour } from "./tour.js";
import { createPlan, planRows } from "./plan.js";
import { renderPlanPanel } from "./plan-ui.js";
import { steadiness, steadySummary, shortlistRows, shortlistNote } from "./ml-logic.js";

const OSM_NAMES = ["open_land", "parks", "buildings", "roads", "paths"];
const LIST_LIMIT = 5;       // rows shown before "See all"
const BADGES = 5;           // sites marked 1 to 5 on the map
const OUTLINED = 10;        // sites with a dark outline
const DEFAULT_NOTE = "The list and map update as you move these.";
const VIEW_NAMES = { prioritise: "Plant first", report: "Before and after" };
const store = createStore({ selectedId: null, filter: "all", query: "", usingServer: true, expanded: false, listMode: "ranked" });
let started = false;

// ---------- header, notices, dialogs ----------

function setChip(id, text, kind) {
  // the chip in the page header and its copy in the sidebar's Data status card
  for (const chip of [$(id), ...$$(`[data-mirror="${id.slice(1)}"]`)]) {
    chip.textContent = text;
    chip.classList.toggle("chip-ok", kind === "ok");
    chip.classList.toggle("chip-warn", kind === "warn");
    chip.classList.toggle("chip-bad", kind === "bad");
    chip.classList.toggle("chip-quiet", kind === "quiet");
  }
}

function showStatus(meta) {
  const mock = meta.data_mode === "mock";
  setChip("#chip-mode", mock ? "Data: MOCK (invented)" : "Data: cached real data", mock ? "bad" : "quiet");
  const scores = {
    ml: ["Scores: scoring model", "ok"],
    placeholder: ["Preview scores: scoring model not connected yet", "warn"],
    mock: ["Scores: mock data", "bad"],
  };
  setChip("#chip-scores", ...(scores[meta.score_source] ?? ["Scores: unknown", "warn"]));
  $("#preview-note").hidden = meta.score_source === "ml" || meta.score_source === "mock";   // the mock case has its own, louder notice below
  $("#honesty-text").textContent = meta.score_source === "ml"
    ? "Example sites, not Sime Darby Property's list."
    : "Example sites, not Sime Darby Property's list. Scores are previews until the scoring model is connected.";

  const notices = clear($("#notices"));
  const add = (text, bad) => notices.append(el("div", { class: bad ? "notice notice-bad" : "notice" }, text));
  if (mock) add("This is invented MOCK data for development. Do not present it as Elmina results.", true);
  if (meta.scores_error) add(meta.scores_error, true);
  if (meta.scores_stale) add("The scores were computed on older data. Ask the team to re-score.", true);

  clear($("#caveats")).append(...meta.caveats.map((c) => el("li", {}, c)));
  $("#attribution").textContent = (meta.attribution ?? []).join("  ·  ");
  $("#built-note").textContent = meta.generated_at ? `Data built ${meta.generated_at.slice(0, 10)}.` : "";
}

function openDialog(id) {
  const dlg = $(id);
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}

function showFatal(error) {
  const reason = error instanceof ApiError && error.status === 0
    ? "The page could not reach the API. It may not be running."
    : `The API answered with a problem: ${error.message}`;
  $("#fatal-reason").textContent = reason;
  $("#fatal").hidden = false;
  $("#main").hidden = true;
  $("#loading").hidden = true;
}

function download(filename, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupSheets() {
  for (const button of $$(".sheet-toggle[aria-controls]")) {
    button.addEventListener("click", () => {
      const body = document.getElementById(button.getAttribute("aria-controls"));
      const open = button.getAttribute("aria-expanded") === "true";
      body.hidden = open;
      button.setAttribute("aria-expanded", String(!open));
      button.title = open ? "Expand" : "Collapse";
      button.setAttribute("aria-label", button.title);
    });
  }
}

/** The Layers button opens a small panel of checkboxes; a click elsewhere closes it (so does Escape, see boot). Returns set(open). */
function setupLayersMenu() {
  const button = $("#layers-button");
  const menu = $("#layer-toggles");
  const set = (open) => { menu.hidden = !open; button.setAttribute("aria-expanded", String(open)); };
  button.addEventListener("click", () => set(menu.hidden));
  document.addEventListener("click", (e) => {
    const inside = menu.contains(e.target) || button.contains(e.target) || e.target.closest?.('[data-action="layers"]');   // the sidebar's Layers opens it too
    if (!menu.hidden && !inside) set(false);
  });
  return set;
}

/** Buttons marked data-action (sidebar, top bar, map card, list, honesty bar) all go through one handler. */
const actions = {
  limits: () => openDialog("#dlg-limits"),
  credits: () => openDialog("#dlg-credits"),
  geojson: () => {},
  tour: () => {},
  contrast: () => {},
  share: async () => {
    const say = (text) => { const note = el("div", { class: "notice" }, text); $("#notices").append(note); setTimeout(() => note.remove(), 5000); };
    try {
      await navigator.clipboard.writeText(location.href);
      say("Link copied. It keeps your slider settings and the selected site.");
    } catch {
      say("Copy the address from the browser's address bar: it already holds your slider settings and the selected site.");
    }
  },
  brief: () => {},
  download: () => {},                       // these need the loaded data, so boot() fills them in
  sites: () => {},
  layers: () => {},
};
const scrollBehavior = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
document.addEventListener("click", (e) => actions[e.target.closest?.("[data-action]")?.dataset.action]?.());

// High-contrast mode: a toggle in the sidebar, remembered in this browser only.
function setContrast(on) {
  document.documentElement.dataset.contrast = on ? "high" : "normal";
  $("#contrast-toggle").setAttribute("aria-pressed", String(on));
  try { localStorage.setItem("elmina-contrast", on ? "high" : "normal"); } catch { /* the setting just will not be remembered */ }
}
actions.contrast = () => setContrast(document.documentElement.dataset.contrast !== "high");
try { setContrast(localStorage.getItem("elmina-contrast") === "high"); } catch { setContrast(false); }

// ---------- the app ----------

async function boot() {
  $("#fatal").hidden = true;
  $("#main").hidden = false;
  let meta, weightsResponse, sites, corridor;
  try {
    [meta, weightsResponse, sites, corridor] = await Promise.all([api.meta(), api.weights(), api.sites(), api.corridor()]);
  } catch (error) {
    showFatal(error);
    return;
  }
  if (started) return;
  started = true;
  showStatus(meta);
  if (ignoredApiParam) {
    $("#notices").append(el("div", { class: "notice notice-bad" },
      "The ?api= address in the link was ignored: only a localhost address or this site's own address is accepted."));
  }

  const optional = await Promise.all([api.spine(), api.pathShade(), api.overlays(), api.uncertainty(), api.shortlist(), api.impact(), api.tradeoff(), ...OSM_NAMES.map((n) => api.osm(n))]
    .map((p) => p.catch(() => null)));
  const [spine, pathShade, overlays, uncertainty, shortlist, impact, tradeoff, ...osmList] = optional;
  const osm = Object.fromEntries(OSM_NAMES.map((n, i) => [n, osmList[i]]));
  if (!osmList.some(Boolean)) $("#notices").append(el("div", { class: "notice" }, "No OpenStreetMap basemap in this data set; showing the sites only."));

  const features = sites.features;
  const ctx = buildContext(features);
  const placeholder = meta.score_source !== "ml";
  // the ML team's extra evidence describes the ML scores only, so it is left out while scores are previews
  const steadyOf = (id) => (placeholder ? null : steadiness(uncertainty, id));
  const hasShortlist = !placeholder && shortlist?.diversified_sites?.length > 0;
  $("#list-mode").hidden = !hasShortlist;
  if (!placeholder && (uncertainty?.stale || shortlist?.stale)) {
    $("#notices").append(el("div", { class: "notice" }, "The rank ranges or shortlist were worked out on older data. Ask the team to re-run them."));
  }
  renderTradeoff($("#card-tradeoff"), placeholder ? null : tradeoff);
  renderImpact($("#card-impact"), placeholder ? null : impact);   // describes the ML ranking, so it waits for ML scores
  const defaults = Object.fromEntries(KEYS.map((k) => [k, Math.round(weightsResponse.default[k] * 100)]));
  store.set({ served: features, weights: defaults });

  // ----- map and layers -----
  const map = createMap("map");
  if (typeof ResizeObserver === "function") {   // the map card changes size with the window and the sidebar
    new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0 && entry.contentRect.height > 0) map.invalidateSize(); }).observe($("#map"));
  }
  const sitesLayer = createSitesLayer(features, (id) => select(id, "map"));
  const badges = createBadges((id) => select(id, "map"), map);
  const find = (name) => overlays?.overlays.find((o) => o.name === name);
  const layers = {
    basemap: createBasemap(osm), corridor: createCorridor(corridor, spine), sites: sitesLayer.group,
    pathshade: createPathShade(pathShade),
    ndvi: find("ndvi_latest") ? createOverlay(find("ndvi_latest")) : null,
    lst: find("lst_latest") ? createOverlay(find("lst_latest")) : null,
    tiles: createStreetTiles(),
  };
  badges.group.addTo(map);
  let tileNotice = false;
  layers.tiles.on("tileerror", () => {
    if (tileNotice) return;
    tileNotice = true;
    $("#notices").append(el("div", { class: "notice" }, "Street map tiles could not load (no internet?). The offline map detail still works."));
  });
  for (const box of $$("#layer-toggles input[data-layer]")) {
    const layer = layers[box.dataset.layer];
    if (!layer) { box.disabled = true; box.parentElement.title = "Not in this data set"; box.checked = false; continue; }
    if (box.checked) layer.addTo(map);
    box.addEventListener("change", () => {
      if (box.checked) layer.addTo(map); else map.removeLayer(layer);
      if (box.dataset.layer === "pathshade") $("#path-legend").hidden = !box.checked;
      if (box.dataset.layer === "sites") (box.checked ? badges.group.addTo(map) : map.removeLayer(badges.group));
    });
  }
  map.fitBounds(sitesLayer.bounds(), { padding: [30, 30] });
  // hide the first-visit hint on the person's own first move on the map (not on the opening animation)
  for (const type of ["pointerdown", "wheel", "keydown"]) {
    map.getContainer().addEventListener(type, () => { $("#coach").hidden = true; }, { once: true });
  }

  // ----- ranking, list, legend, card -----
  const list = $("#top-list");
  const note = $("#weights-note");
  let byId = new Map();
  let lastRanked = null;

  const currentRanked = () => {
    const s = store.get();
    return s.usingServer ? s.served : retotal(s.served, s.weights);
  };

  function visibleRows(ranked) {
    const { filter, query, listMode } = store.get();
    const q = query.trim().toLowerCase();
    const pool = listMode === "shortlist" && hasShortlist ? shortlistRows(shortlist, new Map(ranked.map((f) => [f.properties.site_id, f]))) : ranked;
    return pool.filter((f) => (filter === "all" || f.properties.origin === filter) && (!q || f.properties.site_id.toLowerCase().includes(q)));
  }

  function renderLegend([min, max]) {
    const legend = clear($("#legend"));
    legend.append(el("strong", {}, "Higher priority = plant sooner"),
      el("div", { class: "swatches" }, legendBins(min, max).map((b) => el("span", { style: { background: b.color } }))),
      el("div", { class: "range" }, el("span", {}, fmt(min, 0)), el("span", {}, placeholder ? "Preview score" : "Score"), el("span", {}, fmt(max, 0))),
      el("div", { class: "note" }, meta.score_source === "mock" ? "Invented mock data" : placeholder ? "Example sites, preview scores" : "Example sites"));
  }

  // The site card is a panel on the left of the map. The rest of the map stays visible and usable, and so do the list and the
  // sliders beside it: picking another site anywhere swaps the card in place. Escape or the close button closes it.
  let openedFrom = "map";                // where the card was opened, so closing it can hand focus back

  function renderSelected() {
    const { selectedId, weights } = store.get();
    const feature = selectedId ? byId.get(selectedId) : null;
    $("#sheet-card").hidden = !feature;
    $(".map-box").classList.toggle("has-card", Boolean(feature));
    if (feature) renderCard($("#card-body"), feature, { weights, ctx, total: byId.size, placeholder, steady: steadyOf(selectedId), custom: !store.get().usingServer, plan });
  }

  /** The part of the map the card leaves free, in map pixels: to its right as a side panel, above it when it spans the map (phones). */
  function freeArea() {
    const box = $(".map-box").getBoundingClientRect();
    const card = $("#sheet-card").getBoundingClientRect();
    if (card.width < box.width * 0.7) return { x: card.right - box.left + 12, y: 0, w: box.right - card.right - 12, h: box.height };
    return { x: 0, y: 0, w: box.width, h: card.top - box.top - 12 };
  }

  function closeCard() {
    const { selectedId } = store.get();
    store.set({ selectedId: null });
    sitesLayer.select(null);
    refresh();
    // focus goes back to the row it was opened from, or to the map
    const row = openedFrom === "list" && selectedId ? list.querySelector(`.site-row[data-id="${CSS.escape(selectedId)}"]`) : null;
    (row ?? map.getContainer()).focus({ preventScroll: true });
  }

  /** Bring the whole card into view: the least scrolling that shows it (none when the map is already on screen). */
  function revealCard() {
    $("#sheet-card").scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }

  // The planting plan: the planner's own shortlist, kept in this browser only (see plan.js)
  let storage = null;
  try { storage = window.localStorage; } catch { /* blocked storage: the plan still works for this visit */ }
  const plan = createPlan(storage);
  let planPanel = null;

  const syncHash = () => {
    try {
      const s = store.get();
      history.replaceState(null, "", buildHash({ weights: s.weights, defaults, site: s.selectedId }) || location.pathname + location.search);
    } catch { /* the address bar is a convenience, not needed */ }
  };

  function refresh({ announce = false } = {}) {
    const s = store.get();
    const ranked = currentRanked();
    byId = new Map(ranked.map((f) => [f.properties.site_id, f]));
    const rows = visibleRows(ranked);
    const range = extent(ranked.map((f) => f.properties.score_total));
    const shown = new Set(rows.map((f) => f.properties.site_id));
    sitesLayer.update(ranked, range, shown, new Set(rows.slice(0, OUTLINED).map((f) => f.properties.site_id)));
    badges.update(rows.slice(0, BADGES), (id) => sitesLayer.center(id), s.selectedId);

    const expanded = s.expanded || (s.selectedId && rows.findIndex((f) => f.properties.site_id === s.selectedId) >= LIST_LIMIT);
    renderTopList(list, rows, { selectedId: s.selectedId, onSelect: (id) => select(id, "list"), weights: s.weights, ctx, limit: expanded ? rows.length : LIST_LIMIT, steadyOf, inPlan: plan.ids() });
    const spread = s.listMode === "shortlist" && hasShortlist;
    $("#list-note").hidden = !spread && placeholder;
    $("#list-note").textContent = spread
      ? `${shortlistNote(shortlist)}${s.usingServer ? "" : " Chosen with the default weights; the ranks shown are yours."}`
      : (steadySummary(uncertainty) ?? "");
    if (!$("#list-note").textContent) $("#list-note").hidden = true;
    const seeAll = $("#see-all");
    seeAll.hidden = rows.length <= LIST_LIMIT;
    seeAll.textContent = expanded ? `Show the top ${LIST_LIMIT} only` : `See all ${rows.length} sites`;
    $("#no-match").hidden = rows.length > 0;
    $("#count").textContent = spread ? `${rows.length} spread out` : rows.length === ranked.length ? `${ranked.length} in total` : `${rows.length} of ${ranked.length}`;
    renderLegend(range);
    renderStrip($("#stats-plant"), plantStats(ranked, { placeholder, usingServer: s.usingServer }));
    renderSelected();
    if (s.selectedId) sitesLayer.select(s.selectedId);

    if (announce && lastRanked) {
      const { changed, n } = topChange(lastRanked, ranked, 10);
      note.textContent = `${changed === 0 ? `The top ${n} stayed the same.` : `${changed} of the top ${n} changed.`} Scores re-weighted in your browser, same formula as the API.`;
    }
    lastRanked = ranked;
    syncHash();
    planPanel?.redraw();
  }

  function select(id, source) {
    const wasOpen = !$("#sheet-card").hidden;
    if (!wasOpen) openedFrom = source;
    store.set({ selectedId: id });
    $("#coach").hidden = true;
    refresh();
    highlightRow(list, id);
    // keep the picked site clear of the card: centred in the free part of the map for a pick from the list, nudged into it for a pick on the map
    sitesLayer.focus(id, map, { free: freeArea(), center: source === "list" });
    if (!wasOpen) $("#sheet-card").focus({ preventScroll: true });
    revealCard();
  }

  // ----- sliders, filters, search, download -----
  const sliders = setupSliders($("#weights-form"), defaults, (weights) => {
    if (KEYS.every((k) => weights[k] === 0)) { note.textContent = "Set at least one weight above zero."; return; }
    store.set({ weights, usingServer: false });
    refresh({ announce: true });
  });
  $("#weights-reset").addEventListener("click", () => {
    sliders.set(defaults);
    store.set({ weights: defaults, usingServer: true });
    note.textContent = DEFAULT_NOTE;
    refresh();
  });
  // the origin filter appears twice (above the map and in Top sites); both groups show the same choice
  const filterRadios = $$('input[name="origin"], input[name="origin-map"]');
  const showFilter = (value) => { for (const r of filterRadios) r.checked = r.value === value; };
  for (const r of filterRadios) r.addEventListener("change", () => { store.set({ filter: r.value }); showFilter(r.value); refresh(); });
  for (const r of $$('input[name="list-mode"]')) r.addEventListener("change", () => { store.set({ listMode: r.value, expanded: false }); refresh(); });
  $("#search").addEventListener("input", (e) => { store.set({ query: e.target.value }); refresh(); });
  $("#clear-filters").addEventListener("click", () => {
    store.set({ filter: "all", query: "" });
    showFilter("all");
    $("#search").value = "";
    refresh();
  });
  $("#see-all").addEventListener("click", () => { store.set({ expanded: !store.get().expanded }); refresh(); });
  actions.download = () => download("elmina-ranked-sites.csv", toCsv(rankedRows(currentRanked())));
  actions.geojson = () => download("elmina-ranked-sites.geojson",
    JSON.stringify(toGeoJson(currentRanked(), { scoreSource: meta.score_source, dataVersion: meta.data_version ?? null, plan })), "application/geo+json");
  actions.brief = () => {
    const s = store.get();
    renderBrief($("#print-brief"), currentRanked(), { ctx, steadyOf, meta, weights: s.weights, custom: !s.usingServer, planRows: planRows(plan.list(), byId) });
    window.print();
  };
  $("#coach-dismiss").addEventListener("click", () => { $("#coach").hidden = true; });
  $("#card-close").addEventListener("click", closeCard);
  setupSheets();
  const setLayersOpen = setupLayersMenu();
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;        // an open dialog handles its own Escape
    if (!$("#layer-toggles").hidden) { setLayersOpen(false); $("#layers-button").focus(); }
    else if (!$("#sheet-card").hidden) closeCard();
  });

  planPanel = renderPlanPanel($("#card-plan"), plan, {
    byId: () => byId, onSelect: (id) => select(id, "list"),
    topIds: () => visibleRows(currentRanked()).slice(0, 5).map((f) => f.properties.site_id), download,
  });
  plan.subscribe(() => markPlan(list, plan.ids()));
  const start = parseHash(location.hash);              // a shared link: weights and site in the address
  if (start.weights) {
    sliders.set(start.weights);
    store.set({ weights: start.weights, usingServer: KEYS.every((k) => start.weights[k] === defaults[k]) });
  }
  refresh();
  if (start.site && byId.has(start.site)) select(start.site, "list");
  $("#loading").hidden = true;

  // ----- tabs -----
  let report = null;
  let currentView = "prioritise";
  async function showView(name) {
    for (const b of $$("#view-tabs button")) {
      if (b.dataset.view === name) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    }
    $("#crumb-view").textContent = VIEW_NAMES[name];
    $("#view-prioritise").hidden = name !== "prioritise";
    $("#view-report").hidden = name !== "report";
    if (name !== currentView) $("#main").scrollTop = 0;
    currentView = name;
    if (name === "prioritise") { map.invalidateSize(); return; }
    if (!report) {
      try {
        const [summary, series, crosscheck, scenario] = await Promise.all([api.summary(), api.series(), api.crosscheck(), api.scenario().catch(() => null)]);
        renderScenario($("#card-scenario"), placeholder ? null : scenario);
        $("#card-scenario").closest("section").hidden = $("#card-scenario").hidden;
        report = setupReport({ summary, series, crosscheck, overlays, osm, corridor, spine, attribution: meta.attribution ?? [], bounds: sitesLayer.bounds() });
      } catch (error) {
        $("#view-report").append(el("p", { class: "notice notice-bad" }, `The before and after view could not load: ${error.message}`));
        return;
      }
    }
    report.show();
  }
  for (const b of $$("#view-tabs button")) b.addEventListener("click", () => showView(b.dataset.view));

  // sidebar shortcuts: both live on Plant first, so they switch to it, bring the right part into view and open it
  actions.sites = async () => {
    await showView("prioritise");
    $("#sheet-top").scrollIntoView({ block: "start", behavior: scrollBehavior() });
    $("#search").focus({ preventScroll: true });
  };
  actions.tour = async () => {
    await showView("prioritise");
    startTour($('[data-action="tour"]'));
  };
  actions.layers = async () => {
    await showView("prioritise");
    $(".map-card").scrollIntoView({ block: "start", behavior: scrollBehavior() });
    setLayersOpen(true);
    $("#layer-toggles input:not(:disabled)").focus({ preventScroll: true });
  };
}

$("#fatal-retry").addEventListener("click", boot);
boot();
