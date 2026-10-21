// "If we plant the top sites": the ML planting scenario as a small line chart and a table. A scenario, never a forecast:
// the growth speeds are named assumptions and the ceiling is today's canopy inside Elmina's own parks.
// Drawn as SVG with createElementNS (no strings turned into markup). Styling: css/app.css (.scn-*).
import { el, clear } from "./dom.js";
import { fmt, fmtPct } from "./scale.js";
import { chartLegend, niceScale } from "./charts.js";
import { scenarioHeadline, scenarioSeries } from "./ml-logic.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const W = 640, H = 240, M = { top: 14, right: 16, bottom: 28, left: 40 };
const LEGEND_CLASS = { nothing: "lg-dash", slow: "lg-slow", default: "", fast: "lg-hi" };

function svg(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== null) node.textContent = text;
  return node;
}

/** Fill the scenario card. Hides the card when the data set has no scenario. */
export function renderScenario(card, scenario) {
  const data = scenarioSeries(scenario);
  card.hidden = !data;
  if (!data) return;
  const { years, lines, vmax: rawMax } = data;
  const { vmax, ticks } = niceScale(rawMax, { maxTicks: 5 });
  const x = (i) => M.left + (i / (years.length - 1)) * (W - M.left - M.right);
  const y = (v) => H - M.bottom - (v / vmax) * (H - M.top - M.bottom);
  const headline = scenarioHeadline(scenario);

  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "scn-chart", role: "img", "aria-label": headline });
  for (const t of ticks) {
    chart.append(svg("line", { x1: M.left, x2: W - M.right, y1: y(t), y2: y(t), class: t === 0 ? "scn-rule scn-base" : "scn-rule" }),
      svg("text", { x: M.left - 6, y: y(t) + 4, class: "scn-tick", "text-anchor": "end" }, `${t}%`));
  }
  years.forEach((yr, i) => {
    if (yr % 5 === 0) chart.append(svg("text", { x: x(i), y: H - 8, class: "scn-tick", "text-anchor": "middle" }, yr === 0 ? "Today" : `Year ${yr}`));
  });
  if (Number.isFinite(scenario.ceiling_pct)) {
    chart.append(svg("line", { x1: M.left, x2: W - M.right, y1: y(scenario.ceiling_pct), y2: y(scenario.ceiling_pct), class: "scn-ceiling" }),
      svg("text", { x: M.left + 6, y: y(scenario.ceiling_pct) - 6, class: "scn-note" }, `Tree cover in Elmina's parks today, ${fmtPct(scenario.ceiling_pct)}`));
  }
  for (const line of lines) {
    const d = line.values.map((v, i) => `${i ? "L" : "M"}${fmt(x(i), 1)},${fmt(y(v), 1)}`).join(" ");
    chart.append(svg("path", { d, class: `scn-line scn-${line.key}` }));
  }

  const marks = years.map((yr, i) => [yr, i]).filter(([yr]) => yr % 5 === 0);
  const table = el("table", { class: "scn-table" },
    el("thead", {}, el("tr", {}, el("th", {}, ""), marks.map(([yr]) => el("th", { class: "num" }, yr === 0 ? "Today" : `Yr ${yr}`)))),
    el("tbody", {}, lines.slice().reverse().map((l) => el("tr", {}, el("td", {}, l.label), marks.map(([, i]) => el("td", { class: "num" }, fmtPct(l.values[i])))))));

  clear(card).append(
    el("div", { class: "card-head" }, el("h3", {}, `If the top ${scenario.k} sites are planted`),
      el("p", { class: "card-sub" }, "Average tree cover across those sites (greenness 0.6 or above), from the team's scenario tool")),
    el("div", { class: "card-chips" }, el("span", { class: "chip chip-warn" }, "Scenario, not a forecast"),
      scenario.stale ? el("span", { class: "chip chip-bad" }, "Computed on older data") : null),
    el("p", { class: "card-lead" }, headline),
    chart,
    chartLegend(lines.slice().reverse().map((l) => [LEGEND_CLASS[l.key] ?? "", l.label])),
    el("details", { class: "scn-more" }, el("summary", {}, "The numbers"), el("div", { class: "table-scroll" }, table)),
    el("p", { class: "caption" }, "Growth speeds are assumptions, not fitted to field data. The ceiling is measured: today's tree cover in Elmina's mapped parks. "
      + "It says nothing about temperature or carbon."));
}
