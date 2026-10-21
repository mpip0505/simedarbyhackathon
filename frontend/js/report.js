// The before / after view: a plain headline and key figures, two synced maps, three summary cards, and the year-by-year numbers.
/* global L */
import { el, clear, $, $$ } from "./dom.js";
import { createMap, createBasemap, createCorridor, createOverlay } from "./map.js";
import { fmt, fmtC, fmtPct } from "./scale.js";
import { barChart, chartLegend, mean, niceScale } from "./charts.js";
import { renderStrip } from "./strip.js";
import {
  canopyVerdict, TEMPERATURE_NOTE, crosscheckRows, compareRows, disagreementHeadline, periodRange, reportHeadline, reportStats,
  METRIC_TITLES, METHOD_LABELS, WINDOW_LABELS, shortYear, yearTips,
} from "./report-logic.js";

// Approximate legend colours for the two overlays (they are rendered with matplotlib YlGn and YlOrRd).
const GRADIENTS = {
  ndvi: "linear-gradient(to right, #ffffe5, #d9f0a3, #78c679, #238443, #004529)",
  lst: "linear-gradient(to right, #ffffb2, #fecc5c, #fd8d3c, #e31a1c, #800026)",
};
const LEGEND_WORDS = { ndvi: ["less green", "more green"], lst: ["cooler", "hotter"] };

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

/** The two yearly bar charts (tree cover with its range, ground heat). Hidden when the data set has no yearly series. */
function renderYearCharts(series) {
  const points = series?.points ?? [];
  const box = $("#year-charts");
  box.hidden = points.length < 2;
  if (box.hidden) return;
  const tips = yearTips(points);
  const labels = points.map((p) => shortYear(p.label));
  const head = (title, sub) => el("div", { class: "card-head" }, el("h3", {}, title), el("p", { class: "card-sub" }, sub));

  const canopy = points.map((p) => p.canopy_pct);
  const ranges = points.every((p) => Number.isFinite(p.canopy_pct_low) && Number.isFinite(p.canopy_pct_high))
    ? points.map((p) => [p.canopy_pct_low, p.canopy_pct_high]) : null;
  const scaleC = niceScale(Math.max(...(ranges ? ranges.map((r) => r[1]) : canopy)));
  const averageC = mean(canopy);
  const [upper, lower] = series.canopy_band_thresholds ?? [];
  clear($("#chart-canopy")).append(
    head("Tree-cover estimate by year", `Share of the area counted as tree cover (greenness ${fmt(series.canopy_ndvi_threshold ?? 0.6, 1)} or above)`
      + (ranges && upper && lower ? `, with the range at the ${fmt(upper, 1)} and ${fmt(lower, 1)} cut-offs` : "")),
    barChart({ values: canopy, vmax: scaleC.vmax, ticks: scaleC.ticks, labels, ranges, average: averageC, tips: tips.canopy,
      subLabels: canopy.map((v) => fmtPct(v)), tickFormat: (t) => `${t}%` }),
    chartLegend([["", "Estimate"], ...(ranges ? [["lg-range", "Range at the other cut-offs"]] : []), ["lg-dash", `Average of the years ${fmtPct(averageC)}`]]));

  const heat = points.map((p) => p.mean_lst_c);
  const scaleH = niceScale(Math.max(...heat));
  const averageH = mean(heat);
  clear($("#chart-lst")).append(
    head("Ground heat by year", "Mean surface temperature from satellite images, indicative only: each year pools different clear days"),
    barChart({ values: heat, vmax: scaleH.vmax, ticks: scaleH.ticks, labels, highlight: tips.warmest, tips: tips.heat,
      valueLabels: heat.map((v) => fmt(v)), tickFormat: (t) => `${t}` }),
    chartLegend([["", "Mean ground heat, °C"], ["lg-hi", "Warmest year"], ["lg-dash", `Average of the years ${fmtC(averageH)}`]]));
}

/** "How sure are we?": every estimate of tree cover as a bar, reference maps in blue and ours in Ember. */
function renderCompare(rows) {
  const sure = clear($("#card-sure"));
  const bars = compareRows(rows);
  sure.append(el("div", { class: "card-head" }, el("h3", {}, "How sure are we?"),
    el("p", { class: "card-sub" }, "Do independent maps agree about tree cover? Blue = reference maps, Ember = ours.")));
  if (bars.length < 2) {
    sure.append(el("p", { class: "card-sub" }, "No comparison with other maps in this data set."));
    return;
  }
  const vmax = niceScale(Math.max(...bars.map((b) => b.pct))).vmax;
  sure.append(
    el("p", { class: "card-lead" }, disagreementHeadline(rows)),
    el("div", {}, el("span", { class: "chip chip-warn" }, "Independent maps disagree")),
    el("div", { class: "hbars" }, bars.map((b) => el("div", { class: "hbar" },
      el("span", { class: "hbar-label" }, b.label),
      el("div", { class: "hbar-track" }, el("div", { class: b.ours ? "hbar-fill hbar-fill-ours" : "hbar-fill", style: { width: `${(100 * b.pct) / vmax}%` } })),
      el("span", { class: "hbar-value" }, fmtPct(b.pct))))),
    el("div", { class: "card-foot" }, chartLegend([["lg-ref", "Reference maps"], ["", "Our estimate"]]),
      el("p", { class: "caption" }, "Reference maps are satellite-derived, not field truth.")));
}

/** Build the view once from the loaded data. Returns { show() } to call whenever the tab becomes visible. */
export function setupReport({ summary, series, crosscheck, overlays, osm, corridor, spine, attribution, bounds }) {
  const maps = { baseline: createMap("map-baseline"), latest: createMap("map-latest") };
  link(maps.baseline, maps.latest);
  for (const m of Object.values(maps)) {
    createBasemap(osm)?.addTo(m);
    createCorridor(corridor, spine)?.addTo(m);
    m.fitBounds(bounds, { padding: [10, 10] });
  }
  if (typeof ResizeObserver === "function") {   // the maps keep a fixed shape, so they change size with the window
    for (const [name, m] of Object.entries(maps)) {
      new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0 && entry.contentRect.height > 0) m.invalidateSize(); }).observe($(`#map-${name}`));
    }
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
      const [low, high] = LEGEND_WORDS[metric];
      const unit = metric === "lst" ? " °C" : "";
      const digits = metric === "lst" ? 0 : 1;
      const ends = Number.isFinite(sample.vmin) && Number.isFinite(sample.vmax)
        ? [`${fmt(sample.vmin, digits)}${unit} · ${low}`, `${high} · ${fmt(sample.vmax, digits)}${unit}`] : [low, high];
      legend.append(
        el("strong", {}, METRIC_TITLES[metric]),
        el("div", { class: "gradient", style: { background: GRADIENTS[metric] } }),
        el("div", { class: "range" }, el("span", {}, ends[0]), el("span", {}, ends[1])),
        el("span", { class: "note" }, `${metric === "lst"
          ? "Same colour scale on both maps. Ground heat is estimated and gap-filled from nearby pixels: it ranks areas, it is not an exact reading."
          : "Same colour scale on both maps."}${corridor || spine ? " Dashed line: approximate corridor." : ""}`));
    }
    $("#report-missing").hidden = Boolean(sample);
  }
  for (const r of $$('input[name="metric"]')) r.addEventListener("change", () => showMetric(r.value));
  showMetric("ndvi");

  $("#report-headline").textContent = reportHeadline(summary.delta_canopy_pct_points, series);
  $("#report-period").textContent = `${WINDOW_LABELS.baseline}: ${periodRange(summary.baseline)}. ${WINDOW_LABELS.latest}: ${periodRange(summary.latest)}. `
    + "Each is two years of satellite images pooled together, so enough clear looks add up.";
  const caption = (node, name, window) => clear(node).append(el("b", {}, WINDOW_LABELS[name]), el("span", {}, periodRange(window)));
  caption($("#cap-baseline"), "baseline", summary.baseline);
  caption($("#cap-latest"), "latest", summary.latest);
  renderStrip($("#stats-report"), reportStats(summary, series));

  const verdict = canopyVerdict(summary.delta_canopy_pct_points, series);
  clear($("#card-canopy")).append(el("div", { class: "verdict" },
    el("h3", {}, "Tree-cover estimate"),
    el("div", { class: "big" }, `${fmtPct(summary.baseline.canopy_pct)} to ${fmtPct(summary.latest.canopy_pct)}`),
    el("span", { class: verdict.withinNoise ? "chip chip-dot" : "chip chip-info" }, verdict.label),
    el("p", {}, verdict.detail), el("p", {}, "A satellite greenness estimate, not a tree count.")));
  clear($("#card-lst")).append(el("div", { class: "verdict" },
    el("h3", {}, "Ground heat"),
    el("div", { class: "big" }, `${fmtC(summary.baseline.mean_lst_c)} to ${fmtC(summary.latest.mean_lst_c)}`),
    el("span", { class: "chip chip-warn" }, "Indicative only"), el("p", {}, TEMPERATURE_NOTE)));

  renderYearCharts(series);

  const rows = crosscheckRows(crosscheck, summary);
  renderCompare(rows);

  const tbody = clear($("#series-table tbody"));
  if (series?.points?.length) {
    for (const p of series.points) {
      tbody.append(el("tr", {}, el("td", {}, shortYear(p.label)),
        el("td", {}, `${fmtPct(p.canopy_pct)} (${fmtPct(p.canopy_pct_low)} to ${fmtPct(p.canopy_pct_high)})`),
        el("td", { class: "num" }, fmtC(p.mean_lst_c)), el("td", { class: "num" }, fmt(p.lst_clear_obs_per_pixel))));
    }
    $("#series-note").textContent = series.note ?? "";
  } else {
    tbody.append(el("tr", {}, el("td", { colspan: 4 }, "No yearly series in this data set.")));
  }
  $("#series-note").hidden = !$("#series-note").textContent;

  const cc = clear($("#crosscheck-table tbody"));
  const maxAll = Math.max(1, ...rows.map((r) => r.pct).filter(Number.isFinite));
  for (const r of rows) {
    cc.append(el("tr", {}, el("td", {}, r.method), el("td", {}, WINDOW_LABELS[r.window] ?? r.window), el("td", { class: "num" }, fmtPct(r.pct)),
      el("td", {}, el("span", { class: r.method === METHOD_LABELS.ours ? "bar bar-ours" : "bar", style: { width: `${(220 * r.pct) / maxAll}px` } }))));
  }
  $("#crosscheck-headline").textContent = disagreementHeadline(rows) ?? "No comparison available in this data set.";
  $("#crosscheck-note").textContent = crosscheck?.caveat
    ? `${crosscheck.caveat.charAt(0).toUpperCase()}${crosscheck.caveat.slice(1)}.` : "";
  $("#crosscheck-note").hidden = !$("#crosscheck-note").textContent;

  $("#report-credits").textContent = (attribution ?? []).join("  ·  ");

  return { show: () => { for (const m of Object.values(maps)) m.invalidateSize(); } };
}
