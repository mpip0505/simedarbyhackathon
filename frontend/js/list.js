// The "Top sites" list: one button per site with its rank, a short reason and its score.
import { el, clear } from "./dom.js";
import { fmt } from "./scale.js";
import { mainReason } from "./drivers.js";

/**
 * Redraw the list for `rows` (already ranked and filtered).
 * options: { selectedId, onSelect, weights, ctx, limit } where limit caps how many rows are drawn.
 */
export function renderTopList(ol, rows, { selectedId, onSelect, weights, ctx, limit }) {
  clear(ol);
  for (const f of rows.slice(0, limit)) {
    const p = f.properties;
    const button = el("button", {
      type: "button", class: "site-row", "data-id": p.site_id, "aria-current": p.site_id === selectedId ? "true" : "false",
      onclick: () => onSelect(p.site_id),
    },
    el("span", { class: "rank" }, p.rank), el("span", { class: "site-name" }, p.site_id),
    el("span", { class: "site-why" }, mainReason(p, weights, ctx)), el("span", { class: "site-score" }, fmt(p.score_total, 0)));
    ol.append(el("li", {}, button));
  }
}

/** Mark one row as the selected site and make sure it is visible in the list. */
export function highlightRow(ol, id) {
  for (const b of ol.querySelectorAll(".site-row")) b.setAttribute("aria-current", b.dataset.id === id ? "true" : "false");
  ol.querySelector(`.site-row[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
}
