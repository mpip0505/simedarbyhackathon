// The site card, shown in a modal over the map: a one-sentence reason, the total and three scores on the left; why it ranks
// here and the numbers behind it on the right. The modal's frame and close button are in index.html; this fills its body.
import { el, clear, append } from "./dom.js";
import { SCORE_LABELS, contributions, driverNotes, siteHeadline } from "./drivers.js";
import { fmt, fmtC, fmtMetres, fmtPct } from "./scale.js";
import { canSpeak, siteSpeech } from "./speech.js";
import { planControls } from "./plan-ui.js";
import { conflictBlock } from "./screening-ui.js";
import { interventionCardBlock } from "./decide-ui.js";

const ORDER = ["cooling", "connectivity", "shade"]; // the order used in the brief

/** Speak the text with the browser's own voice; pressing the button again while it speaks stops it. */
function speak(text) {
  const synth = window.speechSynthesis;
  if (synth.speaking) { synth.cancel(); return; }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-GB";
  synth.speak(utterance);
}

function scoreRow(key, value) {
  return el("div", { class: "score-row" },
    el("span", {}, SCORE_LABELS[key]), el("strong", {}, fmt(value)),
    el("div", { class: "meter", "aria-hidden": "true" }, el("span", { style: { width: `${Math.max(0, Math.min(100, value))}%` } })));
}

const measure = (label, value) => el("tr", {}, el("td", {}, label), el("td", {}, value));

/**
 * Fill the site card body for one feature.
 * options: { weights, ctx, total, placeholder, steady, custom } where total is the number of sites, placeholder is true unless scores
 * are from ML, steady is ml-logic.steadiness() for this site (or null) and custom is true once a slider has moved.
 */
export function renderCard(body, feature, { weights, ctx, total, placeholder, steady = null, custom = false, plan = null, conflict = null }) {
  clear(body);
  const p = feature.properties;
  const parts = contributions(p, weights);
  const pointsTotal = parts.reduce((a, x) => a + x.points, 0);
  const { notes, warnings } = driverNotes(p, ctx);

  const left = el("div", { class: "card-col" },
    el("div", { class: "card-title" }, el("span", { class: "card-rank" }, p.rank), el("strong", {}, p.site_id)),
    el("div", { class: "card-chips" },
      el("span", { class: "chip chip-warn" }, "Example site (simulated)"),
      el("span", { class: "chip" }, p.origin === "corridor_edge" ? "Corridor edge" : "Open land"),
      placeholder ? el("span", { class: "chip chip-warn chip-nodot" }, "Preview score") : null),
    el("p", { class: "card-headline" }, siteHeadline(p, ctx)),
    canSpeak() ? el("button", { type: "button", class: "btn btn-secondary btn-sm card-speak", onclick: () => speak(siteSpeech(p, siteHeadline(p, ctx), total)) }, "Read aloud") : null,
    el("div", { class: "card-total" }, el("strong", {}, fmt(p.score_total)),
      el("span", {}, `${placeholder ? "Preview score" : "Score"}, out of 100 · ranked #${p.rank} of ${total}`)),
    el("div", { class: "score-rows" }, ORDER.map((k) => scoreRow(k, p[`score_${k}`]))),
    steady ? el("section", { class: "steady", "aria-label": "How steady is this rank?" },
      el("div", { class: "steady-head" }, el("h3", {}, "How steady is this rank?"), el("span", { class: steady.chip }, steady.label)),
      el("p", { class: "small-note" }, steady.detail),
      custom ? el("p", { class: "small-note" }, "These ranges were worked out around the default weights, not the ones you have set.") : null) : null,
    plan ? planControls(plan, p.site_id) : null);

  const right = el("div", { class: "card-col" },
    interventionCardBlock(p),
    conflict ? conflictBlock(conflict) : null,
    el("h3", {}, "Why it ranks here"),
    el("ul", { class: "card-list" }, notes.map((n) => el("li", {}, n))),
    warnings.map((w) => el("p", { class: "notice" }, w)),
    el("details", {}, el("summary", {}, "The numbers behind it"),
      el("p", { class: "small-note" }, `Total ${fmt(p.score_total)} out of 100, built from each score times its weight:`),
      el("table", { class: "measure-table" }, el("tbody", {},
        parts.map((c) => measure(`${c.label} (weight ${Math.round(c.share * 100)}%)`,
          `${fmt(c.points)} points (${fmt(pointsTotal > 0 ? (100 * c.points) / pointsTotal : 0, 0)}%)`)))),
      el("table", { class: "measure-table" }, el("tbody", {},
        measure("Ground heat at the site (ranking only)", fmtC(p.lst_c_mean)),
        measure("Ground heat within 250 m", fmtC(p.lst_mean_250m)),
        measure("Greenness at the site", fmt(p.ndvi_mean, 2)),
        measure("Greenness within 250 m", fmt(p.ndvi_mean_250m, 2)),
        measure("Footpath within 50 m", fmtMetres(p.path_length_within_50m)),
        measure("...of which without shade", fmtMetres(p.uncovered_path_length_50m)),
        measure("Distance to a corridor gap", fmtMetres(p.corridor_gap_dist_m)),
        measure("Distance to the nearest park", fmtMetres(p.dist_to_nearest_park_m)),
        measure("Buildings within 250 m", p.buildings_within_250m ?? fmt(null)),
        measure("Ground heat measured, not estimated", fmtPct(100 * p.lst_valid_frac, 0)),
        measure("Site size", `${fmt(p.area_m2, 0)} m²`)))),
    el("p", { class: "notice notice-info" }, "Temperatures rank sites. They are not exact readings."));

  append(body, el("div", { class: "card-cols" }, left, right));
}
