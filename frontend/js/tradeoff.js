// The "Compare ways to choose the first sites" card on Plant first: a Top 20 or 50 toggle and a table where each row is one way of choosing
// and each column is something it reaches, with a bar scaled to the largest in that column. Text only, no markup built from data.
import { el, clear } from "./dom.js";
import { MEASURES, TRADEOFF_CAPTION, TRADEOFF_LEAD, tradeoffRows, tradeoffSteps } from "./tradeoff-logic.js";

/** Fill the card; it stays hidden when there is no report. */
export function renderTradeoff(card, report) {
  const steps = tradeoffSteps(report);
  card.hidden = steps.length === 0;
  if (card.hidden) return;
  let k = steps[0];
  const body = el("div", { class: "table-scroll" });
  const buttons = steps.map((s) => el("button", { type: "button", "aria-pressed": String(s === k), onclick: () => { k = s; draw(); } }, `First ${s}`));
  function draw() {
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(steps[i] === k)));
    const rows = tradeoffRows(report, k);
    clear(body).append(el("table", { class: "tradeoff-table" },
      el("caption", { class: "sr-only" }, `What the first ${k} sites reach, by way of choosing them`),
      el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "How the sites are chosen"),
        MEASURES.map((m) => el("th", { scope: "col" }, m.label)),
        el("th", { scope: "col", class: "num" }, "Areas"), el("th", { scope: "col", class: "num" }, "Heat"))),
      el("tbody", {}, rows.map((r) => el("tr", { class: r.key === "ours" ? "is-ours" : null },
        el("th", { scope: "row" }, r.name),
        r.measures.map((m) => el("td", {}, el("span", { class: "tr-val" }, m.text), el("span", { class: "tr-pct" }, ` (${Math.round(m.pct)}%)`),
          el("span", { class: "tr-bar", "aria-hidden": "true" }, el("span", { style: { width: `${Math.round(m.share * 100)}%` } })))),
        el("td", { class: "num" }, String(r.areas)), el("td", { class: "num" }, `${r.heat}%`))))));
  }
  clear(card).append(
    el("div", { class: "card-head" }, el("h3", {}, "Compare ways to choose the first sites"),
      el("p", { class: "card-sub" }, "What each list reaches, counting every footpath, home and gap once")),
    el("div", { class: "card-chips" }, el("span", { class: "chip chip-warn" }, "Trade-off, not a league table"),
      report.stale ? el("span", { class: "chip chip-bad" }, "Computed on older data") : null),
    el("div", { class: "seg seg-sm", role: "group", "aria-label": "How many sites" }, buttons),
    el("p", { class: "card-lead" }, TRADEOFF_LEAD),
    body,
    el("p", { class: "caption" }, "Areas: how many 250 m blocks the sites fall in. Heat: how much hotter than other candidate sites the surroundings are, on average (ranking only, not a temperature)."),
    el("p", { class: "caption" }, TRADEOFF_CAPTION));
  draw();
}
