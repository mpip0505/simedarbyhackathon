// The "What the top sites reach" card on Plant first: an N toggle, three tiles and the caveat. Text only, no markup built from data.
import { el, clear } from "./dom.js";
import { renderStrip } from "./strip.js";
import { availableSteps, impactHeadline, impactTiles, IMPACT_CAPTION } from "./impact-logic.js";

/** Fill the card; it stays hidden when there is no report. */
export function renderImpact(card, report) {
  const steps = availableSteps(report);
  card.hidden = steps.length === 0;
  if (card.hidden) return;
  let n = steps.includes(50) ? 50 : steps[0];
  const lead = el("p", { class: "card-lead", "aria-live": "polite" });
  const tiles = el("div", { class: "stats", "aria-label": "What the first sites reach" });
  const buttons = steps.map((s) => el("button", { type: "button", "aria-pressed": String(s === n), onclick: () => { n = s; draw(); } }, `Top ${s}`));
  function draw() {
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(steps[i] === n)));
    lead.textContent = impactHeadline(report, n);
    renderStrip(tiles, impactTiles(report, n));
  }
  clear(card).append(
    el("div", { class: "card-head" }, el("h3", {}, "What the top sites reach"),
      el("p", { class: "card-sub" }, "Footpath, homes and corridor gaps near the first sites in the default ranking")),
    el("div", { class: "card-chips" }, el("span", { class: "chip chip-warn" }, "Reach, not benefit"),
      report.stale ? el("span", { class: "chip chip-bad" }, "Computed on older data") : null),
    el("div", { class: "seg seg-sm", role: "group", "aria-label": "How many sites" }, buttons),
    lead, tiles,
    el("p", { class: "caption" }, IMPACT_CAPTION));
  draw();
}
