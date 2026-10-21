// Vertical bar charts drawn from plain DOM nodes (no chart library, so the demo stays offline and tiny).
// Ember bars, ink range whiskers, one dashed average, and a focusable column per bar whose tooltip lists its numbers.
// The geometry is pure (percentages of the plot box) so it can be tested without a browser. Styling: css/app.css (.chart*).
import { el } from "./dom.js";

/** A tidy axis: at most `maxTicks` ticks, a step of 1, 2, 2.5, 5 or 10 times a power of ten, and a maximum that is a multiple of it. */
export function niceScale(max, { maxTicks = 6 } = {}) {
  if (!(max > 0)) return { vmax: 1, step: 1, ticks: [0, 1] };
  const rough = max / (maxTicks - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough);
  const vmax = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(vmax / step) + 1 }, (_, i) => Number((i * step).toFixed(10)));
  return { vmax, step, ticks };
}

export const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Where everything goes, as percentages of the plot box.
 * values: one number per column; ranges: optional [low, high] per column; average: optional single value.
 */
export function chartGeometry({ values, ranges = null, vmax, ticks, average = null }) {
  const pct = (v) => Math.max(0, Math.min(100, (v / vmax) * 100));
  const n = values.length;
  return {
    ticks: ticks.map((value) => ({ value, bottom: pct(value) })),
    average: average === null || average === undefined ? null : pct(average),
    columns: values.map((v, i) => ({
      left: (i / n) * 100,
      width: 100 / n,
      center: ((i + 0.5) / n) * 100,
      bar: pct(v),
      range: ranges ? { low: pct(ranges[i][0]), high: pct(ranges[i][1]) } : null,
      top: Math.max(pct(v), ranges ? pct(ranges[i][1]) : 0),   // the tooltip sits above the highest mark in the column
    })),
  };
}

const px = (n) => `${n}%`;

/**
 * Build the chart. options:
 *   values, vmax, ticks, labels (x axis), ranges, average, highlight (index of the solid dark bar),
 *   tips ([{ title, lines }] per column), valueLabels (text above each bar), subLabels (bold line under each x label),
 *   tickFormat (number -> text), plotHeight (px), barWidth (px)
 * Every column is a real button: it takes keyboard focus, has an aria-label with its numbers, and shows its tooltip on hover or focus.
 */
export function barChart({ values, vmax, ticks, labels, ranges = null, average = null, highlight = null, tips = null, valueLabels = null,
  subLabels = null, tickFormat = String, plotHeight = 200, barWidth = 44 }) {
  const g = chartGeometry({ values, ranges, vmax, ticks, average });
  const parts = [];
  for (const t of g.ticks) {
    parts.push(el("div", { class: t.value === 0 ? "chart-rule chart-rule-base" : "chart-rule", style: { bottom: px(t.bottom) } }));
    parts.push(el("div", { class: "chart-tick", style: { bottom: px(t.bottom) } }, tickFormat(t.value)));
  }
  g.columns.forEach((c, i) => {
    const tip = tips?.[i];
    const kids = [el("div", { class: i === highlight ? "chart-bar chart-bar-hi" : "chart-bar", style: { height: px(c.bar), width: `${barWidth}px` } })];
    if (c.range) {
      kids.push(el("div", { class: "chart-whisker", style: { bottom: px(c.range.low), height: px(c.range.high - c.range.low) } }));
      kids.push(el("div", { class: "chart-cap", style: { bottom: px(c.range.low) } }), el("div", { class: "chart-cap", style: { bottom: px(c.range.high) } }));
    }
    if (valueLabels) kids.push(el("div", { class: "chart-value", style: { bottom: px(c.bar) } }, valueLabels[i]));
    if (tip) {
      kids.push(el("span", { class: "chart-tip", "aria-hidden": "true", style: { bottom: `calc(${px(c.top)} + ${valueLabels ? 30 : 10}px)` } },
        el("strong", {}, tip.title), tip.lines.map((line) => el("span", {}, line))));
    }
    parts.push(el("button", {
      type: "button", class: "chart-col", style: { left: px(c.left), width: px(c.width) },
      "aria-label": tip ? `${tip.title}: ${tip.lines.join(", ")}` : null,
    }, ...kids));
    parts.push(el("div", { class: "chart-x", style: { left: px(c.center) } }, el("span", {}, labels[i]), subLabels ? el("strong", {}, subLabels[i]) : null));
  });
  if (g.average !== null) parts.push(el("div", { class: "chart-avg", style: { bottom: px(g.average) } }));
  return el("div", { class: "chart" }, el("div", { class: "chart-plot", style: { height: `${plotHeight}px` } }, ...parts));
}

/** The legend under a chart: [[css class, text], ...]. Classes: "" (Ember bar), "lg-hi", "lg-ref", "lg-dash", "lg-range". */
export function chartLegend(items) {
  return el("div", { class: "chart-legend" }, items.map(([cls, text]) => el("span", { class: cls }, text)));
}
