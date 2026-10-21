// The "Top sites" list: one button per site with its rank, a short reason and its score.
import { el, clear } from "./dom.js";
import { fmt } from "./scale.js";
import { mainReason } from "./drivers.js";
import { rankColumnWidth } from "./badge.js";

/**
 * Redraw the list for `rows` (already ranked and filtered).
 * options: { selectedId, onSelect, weights, ctx, limit } where limit caps how many rows are drawn.
 */
export function renderTopList(ol, rows, { selectedId, onSelect, weights, ctx, limit }) {
  clear(ol);
  const shown = rows.slice(0, limit);
  ol.style.setProperty("--rank-w", `${rankColumnWidth(shown.map((f) => f.properties.rank))}px`);   // the rank column fits the longest rank on show
  for (const f of shown) {
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

/**
 * Mark one row as the selected site and, if the list is scrolled, bring that row into view. Only the list's own scrolling
 * window moves (its parent, a positioned box), never the page.
 */
export function highlightRow(ol, id, scroller = ol.parentElement) {
  for (const b of ol.querySelectorAll(".site-row")) b.setAttribute("aria-current", b.dataset.id === id ? "true" : "false");
  const row = ol.querySelector(`.site-row[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const top = row.offsetTop, bottom = top + row.offsetHeight;   // offsetTop is measured from the positioned scrolling window
  if (top < scroller.scrollTop) scroller.scrollTop = top;
  else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
}
