// A strip of key figures (css .stats): each tile is a label, a big value with a small unit, and a note underneath.
import { el, clear } from "./dom.js";

/** tiles: [{ label, value, unit, note }] as made by stats.js (Plant first) and report-logic.js (Before and after). */
export function renderStrip(container, tiles) {
  clear(container).append(...tiles.map((t) => el("div", { class: "stat" },
    el("div", { class: "stat-label" }, t.label),
    el("div", { class: "stat-value" }, t.value, t.unit ? el("span", { class: "stat-unit" }, t.unit) : null),
    t.note ? el("div", { class: "stat-note" }, t.note) : null)));
}
