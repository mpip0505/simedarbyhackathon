// Entry point: loads the data from the API and connects the map, sheets, sliders, site card and report view.
// Until a slider moves, the list shows the ranking the API served (the ML model's, once it is merged).
// Moving a slider re-ranks in the browser with the same formula as the API (js/weights.js, tested against Python).
import { api, ApiError, ignoredApiParam } from "./api.js";
import { el, clear, $, $$ } from "./dom.js";
import { createStore } from "./state.js";
import { KEYS, retotal, topChange } from "./weights.js";
import { buildContext } from "./drivers.js";
import { extent, legendBins } from "./scale.js";
import { toCsv, rankedRows } from "./csv.js";
import {
  createMap, createBasemap, createCorridor, createOverlay, createStreetTiles, createSitesLayer, createBadges,
} from "./map.js";
import { renderTopList, highlightRow } from "./list.js";
import { renderCard } from "./panel.js";
import { setupSliders } from "./sliders.js";
import { setupReport } from "./report.js";

const OSM_NAMES = ["open_land", "parks", "buildings", "roads", "paths"];
const LIST_LIMIT = 8;       // rows shown before "See all"
const BADGES = 5;           // sites marked 1 to 5 on the map
const OUTLINED = 10;        // sites with a dark outline
const DEFAULT_NOTE = "The list and map update as you move these.";
const store = createStore({ selectedId: null, filter: "all", query: "", usingServer: true, expanded: false });
let started = false;

// ---------- header, notices, dialogs ----------

function setChip(id, text, kind) {
  const chip = $(id);
  chip.textContent = text;
  chip.classList.toggle("chip-warn", kind === "warn");
  chip.classList.toggle("chip-bad", kind === "bad");
  chip.classList.toggle("chip-quiet", kind === "quiet");
}

function showStatus(meta) {
  const mock = meta.data_mode === "mock";
  setChip("#chip-mode", mock ? "Data: MOCK (invented)" : "Data: cached real data", mock ? "bad" : "quiet");
  const scores = {
    ml: ["Scores: ML model", ""],
    placeholder: ["Preview scores: ML model not connected yet", "warn"],
    mock: ["Scores: mock data", "bad"],
  };
  setChip("#chip-scores", ...(scores[meta.score_source] ?? ["Scores: unknown", "warn"]));
  $("#honesty-text").textContent = meta.score_source === "ml"
    ? "Example sites, not Sime Darby Property's list."
    : "Example sites, not Sime Darby Property's list. Scores are previews until the ML model is connected.";

  const notices = clear($("#notices"));
  const add = (text, bad) => notices.append(el("div", { class: bad ? "notice notice-bad" : "notice" }, text));
  if (mock) add("This is invented MOCK data for development. Do not present it as Elmina results.", true);
  if (meta.scores_error) add(meta.scores_error, true);
  if (meta.scores_stale) add("The ML scores were computed on older data. Ask the ML developer to re-score.", true);

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

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
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
      button.textContent = open ? "+" : "−";
      button.title = open ? "Expand" : "Collapse";
    });
  }
}

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

  const optional = await Promise.all([api.spine(), api.overlays(), ...OSM_NAMES.map((n) => api.osm(n))].map((p) => p.catch(() => null)));
  const [spine, overlays, ...osmList] = optional;
  const osm = Object.fromEntries(OSM_NAMES.map((n, i) => [n, osmList[i]]));
  if (!osmList.some(Boolean)) $("#notices").append(el("div", { class: "notice" }, "No OpenStreetMap basemap in this data set; showing the sites only."));

  const features = sites.features;
  const ctx = buildContext(features);
  const placeholder = meta.score_source !== "ml";
  const defaults = Object.fromEntries(KEYS.map((k) => [k, Math.round(weightsResponse.default[k] * 100)]));
  store.set({ served: features, weights: defaults });

  // ----- map and layers -----
  const map = createMap("map");
  const sitesLayer = createSitesLayer(features, (id) => select(id, "map"));
  const badges = createBadges((id) => select(id, "map"), map);
  const find = (name) => overlays?.overlays.find((o) => o.name === name);
  const layers = {
    basemap: createBasemap(osm), corridor: createCorridor(corridor, spine), sites: sitesLayer.group,
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
    const { filter, query } = store.get();
    const q = query.trim().toLowerCase();
    return ranked.filter((f) => (filter === "all" || f.properties.origin === filter) && (!q || f.properties.site_id.toLowerCase().includes(q)));
  }

  function renderLegend([min, max]) {
    const legend = clear($("#legend"));
    legend.append(el("div", {}, el("strong", {}, "Higher priority = plant sooner")),
      el("div", { class: "swatches" }, legendBins(min, max).map((b) => el("span", { style: { background: b.color } }))),
      el("div", { class: "range" }, el("span", {}, "Lower"), el("span", {}, "Higher")),
      el("div", { class: "muted" }, meta.score_source === "mock" ? "Invented mock data" : placeholder ? "Example sites, preview scores" : "Example sites"));
  }

  function renderSelected() {
    const { selectedId, weights } = store.get();
    const feature = selectedId ? byId.get(selectedId) : null;
    $("#sheet-card").hidden = !feature;
    if (feature) renderCard($("#card-body"), feature, { weights, ctx, total: byId.size, placeholder });
  }

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
    renderTopList(list, rows, { selectedId: s.selectedId, onSelect: (id) => select(id, "list"), weights: s.weights, ctx, limit: expanded ? rows.length : LIST_LIMIT });
    const seeAll = $("#see-all");
    seeAll.hidden = rows.length <= LIST_LIMIT;
    seeAll.textContent = expanded ? `Show the top ${LIST_LIMIT} only` : `See all ${rows.length} sites`;
    $("#no-match").hidden = rows.length > 0;
    $("#count").textContent = rows.length === ranked.length ? `${ranked.length} in total` : `${rows.length} of ${ranked.length}`;
    renderLegend(range);
    renderSelected();
    if (s.selectedId) sitesLayer.select(s.selectedId);

    if (announce && lastRanked) {
      const { changed, n } = topChange(lastRanked, ranked, 10);
      note.textContent = `${changed === 0 ? `The top ${n} stayed the same.` : `${changed} of the top ${n} changed.`} Scores re-weighted in your browser, same formula as the API.`;
    }
    lastRanked = ranked;
  }

  function select(id, source) {
    store.set({ selectedId: id });
    $("#coach").hidden = true;
    refresh();
    highlightRow(list, id);
    if (source === "list") sitesLayer.focus(id, map);
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
  for (const r of $$('input[name="origin"]')) r.addEventListener("change", () => { store.set({ filter: r.value }); refresh(); });
  $("#search").addEventListener("input", (e) => { store.set({ query: e.target.value }); refresh(); });
  $("#clear-filters").addEventListener("click", () => {
    store.set({ filter: "all", query: "" });
    $('input[name="origin"][value="all"]').checked = true;
    $("#search").value = "";
    refresh();
  });
  $("#see-all").addEventListener("click", () => { store.set({ expanded: !store.get().expanded }); refresh(); });
  $("#download-csv").addEventListener("click", () => download("elmina-ranked-sites.csv", toCsv(rankedRows(currentRanked()))));
  $("#card-close").addEventListener("click", () => { store.set({ selectedId: null }); sitesLayer.select(null); refresh(); });
  $("#coach-dismiss").addEventListener("click", () => { $("#coach").hidden = true; });
  setupSheets();

  refresh();
  $("#loading").hidden = true;

  // ----- tabs -----
  let report = null;
  async function showView(name) {
    for (const b of $$("#view-tabs button")) b.setAttribute("aria-pressed", String(b.dataset.view === name));
    $("#view-prioritise").hidden = name !== "prioritise";
    $("#view-report").hidden = name !== "report";
    if (name === "prioritise") { map.invalidateSize(); return; }
    if (!report) {
      try {
        const [summary, series, crosscheck] = await Promise.all([api.summary(), api.series(), api.crosscheck()]);
        report = setupReport({ summary, series, crosscheck, overlays, osm, bounds: sitesLayer.bounds() });
      } catch (error) {
        $("#view-report").append(el("p", { class: "notice notice-bad" }, `The before and after view could not load: ${error.message}`));
        return;
      }
    }
    report.show();
  }
  for (const b of $$("#view-tabs button")) b.addEventListener("click", () => showView(b.dataset.view));
}

$("#open-limits").addEventListener("click", () => openDialog("#dlg-limits"));
$("#open-credits").addEventListener("click", () => openDialog("#dlg-credits"));
$("#fatal-retry").addEventListener("click", boot);
boot();
