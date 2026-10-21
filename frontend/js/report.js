// The before / after view: a plain headline, two synced maps, three summary cards, and the full numbers underneath.
/* global L */
import { el, clear, $, $$ } from "./dom.js";
import { createMap, createBasemap, createOverlay } from "./map.js";
import { fmt, fmtC, fmtPct } from "./scale.js";
import {
  canopyVerdict, TEMPERATURE_NOTE, crosscheckRows, disagreementHeadline, rangeSummary, reportHeadline,
  METRIC_TITLES, WINDOW_LABELS,
} from "./report-logic.js";

// Approximate legend colours for the two overlays (they are rendered with matplotlib YlGn and YlOrRd).
const GRADIENTS = {
  ndvi: "linear-gradient(to right, #ffffe5, #d9f0a3, #78c679, #238443, #004529)",
  lst: "linear-gradient(to right, #ffffb2, #fecc5c, #fd8d3c, #e31a1c, #800026)",
};
const LEGEND_WORDS = { ndvi: ["Less green", "More green"], lst: ["Cooler", "Hotter"] };

function link(a, b) {
  let busy = false;
  const follow = (from, to) => () => {
    if (busy) return;
    busy = true;
    to.setView(from.getCenter(), from.getZoom(), { animate: false });
    busy = false;
  };
  a.on("move", follow(a, b));
  b.on("move", follow(b, a));
}

const months = (iso) => iso.slice(0, 7);

/** Build the view once from the loaded data. Returns { show() } to call whenever the tab becomes visible. */
export function setupReport({ summary, series, crosscheck, overlays, osm, bounds }) {
  const maps = { baseline: createMap("map-baseline"), latest: createMap("map-latest") };
  link(maps.baseline, maps.latest);
  for (const m of Object.values(maps)) {
    createBasemap(osm)?.addTo(m);
    m.fitBounds(bounds, { padding: [10, 10] });
  }
  const byName = Object.fromEntries((overlays?.overlays ?? []).map((o) => [o.name, o]));
  const current = {};

  function showMetric(metric) {
    for (const period of ["baseline", "latest"]) {
      if (current[period]) maps[period].removeLayer(current[period]);
      const overlay = byName[`${metric}_${period}`];
      current[period] = overlay ? createOverlay(overlay, 0.85).addTo(maps[period]) : null;
    }
    const sample = byName[`${metric}_latest`];
    const legend = clear($("#report-legend"));
    if (sample) {
      legend.append(
        el("div", {}, el("strong", {}, METRIC_TITLES[metric])),
        el("div", { class: "gradient", style: { background: GRADIENTS[metric] } }),
        el("div", { class: "range" }, el("span", {}, LEGEND_WORDS[metric][0]), el("span", {}, LEGEND_WORDS[metric][1])),
        el("div", { class: "muted" }, metric === "lst"
          ? "Same colour scale on both maps. Ground heat is estimated and gap-filled from nearby pixels: it ranks areas, it is not an exact reading."
          : "Same colour scale on both maps."));
    }
    $("#report-missing").hidden = Boolean(sample);
  }
  for (const r of $$('input[name="metric"]')) r.addEventListener("change", () => showMetric(r.value));
  showMetric("ndvi");

  const periodText = (s, label) => `${label}: ${months(s.start)} to ${months(s.end)}`;
  $("#report-headline").textContent = reportHeadline(summary.delta_canopy_pct_points, series);
  $("#report-period").textContent =
    `Comparing the ${WINDOW_LABELS.baseline.toLowerCase()} with the ${WINDOW_LABELS.latest.toLowerCase()}. Each is two years of satellite images pooled together, so enough clear looks add up.`;
  $("#cap-baseline").textContent = periodText(summary.baseline, WINDOW_LABELS.baseline);
  $("#cap-latest").textContent = periodText(summary.latest, WINDOW_LABELS.latest);

  const verdict = canopyVerdict(summary.delta_canopy_pct_points, series);
  clear($("#card-canopy")).append(
    el("h3", {}, "Tree-cover estimate"),
    el("div", { class: "big" }, `${fmtPct(summary.baseline.canopy_pct)} → ${fmtPct(summary.latest.canopy_pct)}`),
    el("div", { class: "verdict" }, verdict.label), el("div", { class: "muted" }, verdict.detail),
    el("div", { class: "muted" }, "A satellite greenness estimate, not a tree count."));
  clear($("#card-lst")).append(
    el("h3", {}, "Ground heat"),
    el("div", { class: "big" }, `${fmtC(summary.baseline.mean_lst_c)} → ${fmtC(summary.latest.mean_lst_c)}`),
    el("div", { class: "verdict" }, "Indicative only"), el("div", { class: "muted" }, TEMPERATURE_NOTE));

  const rows = crosscheckRows(crosscheck, summary);
  const range = rangeSummary(rows);
  const sure = clear($("#card-sure"));
  sure.append(el("h3", {}, "How sure are we?"));
  if (range) {
    const first = rows.filter((r) => r.window === "baseline");
    const max = Math.max(1, ...first.map((r) => r.pct).filter(Number.isFinite));
    sure.append(
      el("div", { class: "big" }, range.text), el("div", { class: "verdict" }, "Independent maps disagree"),
      el("div", { class: "muted" }, "Same place, different methods. Earlier period shown:"),
      el("div", { class: "bars" }, first.map((r) => el("div", { class: "bar-row" },
        el("span", {}, r.method), el("span", { class: "bar", style: { width: `${(100 * r.pct) / max}%` } }), el("span", {}, fmtPct(r.pct, 0))))));
  } else {
    sure.append(el("div", { class: "muted" }, "No comparison with other maps in this data set."));
  }

  const tbody = clear($("#series-table tbody"));
  if (series?.points?.length) {
    for (const p of series.points) {
      tbody.append(el("tr", {}, el("td", {}, p.label),
        el("td", {}, `${fmtPct(p.canopy_pct)} (${fmtPct(p.canopy_pct_low)} to ${fmtPct(p.canopy_pct_high)})`),
        el("td", {}, fmtC(p.mean_lst_c)), el("td", {}, fmt(p.lst_clear_obs_per_pixel))));
    }
    $("#series-note").textContent = series.note ?? "";
  } else {
    tbody.append(el("tr", {}, el("td", { colspan: 4 }, "No yearly series in this data set.")));
  }

  const cc = clear($("#crosscheck-table tbody"));
  const maxAll = Math.max(1, ...rows.map((r) => r.pct).filter(Number.isFinite));
  for (const r of rows) {
    cc.append(el("tr", {}, el("td", {}, r.method), el("td", {}, WINDOW_LABELS[r.window] ?? r.window), el("td", {}, fmtPct(r.pct)),
      el("td", {}, el("span", { class: "bar", style: { width: `${(220 * r.pct) / maxAll}px` } }))));
  }
  $("#crosscheck-headline").textContent = disagreementHeadline(rows) ?? "No comparison available in this data set.";
  $("#crosscheck-note").textContent = crosscheck?.caveat
    ? `${crosscheck.caveat.charAt(0).toUpperCase()}${crosscheck.caveat.slice(1)}.` : "";

  return { show: () => { for (const m of Object.values(maps)) m.invalidateSize(); } };
}
