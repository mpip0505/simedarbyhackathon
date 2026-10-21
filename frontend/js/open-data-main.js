// This entry point needs only /screening/open-data. It can open even when the satellite app's required cache is absent.
import { api, appPageUrl } from "./api.js";
import { el, clear } from "./dom.js";
import { centroid, toCsv } from "./csv.js";
import { openDataRows } from "./screening.js";

const root = document.getElementById("fallback-root");
document.querySelector("[data-back-to-app]").href = appPageUrl("./");
const status = document.getElementById("fallback-status");
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function load() {
  try {
    const report = await api.openData();
    if (!report?.features?.length) throw new Error("No OSM-only screening list has been built.");
    const current = report.stale === false;
    status.className = current ? "notice notice-info" : "notice notice-bad";
    status.textContent = `${report.features.length} simulated candidates · OSM-only · version ${report.data_version}. `
      + (current ? "Input hashes match the cached OSM layers." : report.stale === true ? "Source layers changed: this list is stale. Rebuild before using it." : "Source files are unavailable for freshness checks. Treat this as an archived list.");
    const rows = openDataRows(report);
    const top = [...report.features].sort((a, b) => a.properties.rank - b.properties.rank).slice(0, 10);
    clear(root).append(
      el("section", { class: "card" }, el("h2", {}, "What this list uses"),
        el("p", {}, report.note),
        el("p", { class: "small-note" }, "Ranking: 60% footpath proximity + 40% park proximity. Each proximity score is 100 / (1 + distance / scale), with scales of 50 m for paths and 250 m for parks. These are prototype choices, without field calibration."),
        el("p", { class: "small-note" }, "Candidates come from mapped open land, excluding parks, roads buffered by 8 m from centre lines and buildings buffered by 3 m. Those buffers are screening choices, not legal setbacks. Full cells that touch those exclusions are left out. Water and other unmapped obstacles still need field review."),
        el("p", { class: "small-note" }, report.conflict_note),
        el("div", { class: "plan-actions" },
          el("button", { type: "button", class: "btn btn-secondary", onclick: () => download("elmina-osm-only.csv", toCsv(rows, Object.keys(rows[0]).map((key) => ({ key, label: key }))), "text/csv") }, "Download OSM-only list (CSV)"),
          el("button", { type: "button", class: "btn btn-secondary", onclick: () => download("elmina-osm-only.geojson", JSON.stringify(report), "application/geo+json") }, "Download OSM-only map (GeoJSON)"))),
      el("section", { class: "card" }, el("h2", {}, "First 10 OSM-only candidates"),
        el("p", { class: "small-note" }, "Scores describe proximity, not heat relief or existing shade. Every candidate still needs inspection."),
        el("div", { class: "table-scroll" }, el("table", { class: "plan-table" },
          el("caption", { class: "sr-only" }, "Simulated OSM-only candidates"),
          el("thead", {}, el("tr", {}, ["Rank", "Site", "Score", "Path distance", "Park distance", "Mapped triggers", "Location"].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, top.map((f) => {
            const p = f.properties, c = centroid(f.geometry);
            return el("tr", {}, el("td", {}, p.rank), el("th", { scope: "row" }, p.site_id), el("td", {}, p.screening_score),
              el("td", {}, `${p.path_distance_m} m`), el("td", {}, `${p.park_distance_m} m`),
              el("td", {}, p.conflicts?.flags?.map((x) => x.code).join(", ") || "No mapped trigger; inspect"),
              el("td", {}, c ? `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}` : "Unavailable"));
          }))))));
    const mapEl = document.getElementById("fallback-map");
    mapEl.hidden = false;
    const map = L.map(mapEl, { attributionControl: false });
    const layer = L.geoJSON(report, { style: (f) => ({ color: f.properties.rank <= 10 ? "#A62E04" : "#6A6A64", weight: 1, fillOpacity: 0.3 }),
      onEachFeature: (f, l) => {
        const tip = el("span", {}, `${f.properties.site_id} · rank ${f.properties.rank} · simulated OSM-only candidate`);
        l.bindTooltip(tip);
      } }).addTo(map);
    map.fitBounds(layer.getBounds(), { padding: [16, 16] });
    // Optional cached OSM context; never request a satellite layer or a remote tile server.
    const context = await Promise.all(["parks", "roads", "paths"].map(async (n) => [n, await api.osm(n).catch(() => null)]));
    for (const [name, data] of context) if (data) L.geoJSON(data, { style: { color: name === "parks" ? "#2F7D32" : "#6A6A64", weight: 1, fillOpacity: 0.08 }, interactive: false }).addTo(map);
  } catch (error) {
    status.className = "notice notice-bad";
    status.textContent = `The OSM-only list is unavailable: ${error.message} Build it with python -m backend.open_data, then reload this page.`;
  }
}
load();
