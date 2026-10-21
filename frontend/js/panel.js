// The site card: a one-sentence reason, three scores, why it ranks here, and the numbers behind it (collapsed).
import { el, clear, append } from "./dom.js";
import { SCORE_LABELS, contributions, driverNotes, siteHeadline } from "./drivers.js";
import { fmt, fmtC, fmtMetres, fmtPct } from "./scale.js";

const ORDER = ["cooling", "connectivity", "shade"]; // the order used in the brief

function scoreRow(key, value) {
  return el("div", { class: "score-row" },
    el("span", {}, SCORE_LABELS[key]), el("strong", {}, fmt(value, 0)),
    el("div", { class: "meter", "aria-hidden": "true" }, el("span", { style: { width: `${Math.max(0, Math.min(100, value))}%` } })));
}

const measure = (label, value) => el("tr", {}, el("td", {}, label), el("td", {}, value));

/**
 * Fill the site card body for one feature.
 * options: { weights, ctx, total, placeholder } where total is the number of sites and placeholder is true unless scores are from ML.
 */
export function renderCard(body, feature, { weights, ctx, total, placeholder }) {
  clear(body);
  const p = feature.properties;
  const parts = contributions(p, weights);
  const pointsTotal = parts.reduce((a, x) => a + x.points, 0);
  const { notes, warnings } = driverNotes(p, ctx);

  append(
    body,
    el("p", { class: "card-title" }, el("strong", {}, p.site_id), el("span", {}, `#${p.rank} of ${total}`)),
    el("div", { class: "tags" }, el("span", { class: "tag" }, "Example site"),
      el("span", { class: "tag tag-plain" }, p.origin === "corridor_edge" ? "Corridor edge" : "Open land")),
    el("p", { class: "card-headline" }, siteHeadline(p, ctx)),
    ORDER.map((k) => scoreRow(k, p[`score_${k}`])),
    el("h3", { class: "card-section" }, "Why it ranks here"),
    el("ul", { class: "card-list" }, notes.map((n) => el("li", {}, n))),
    warnings.length ? el("ul", { class: "card-list warn-text" }, warnings.map((w) => el("li", {}, w))) : null,
    el("details", {}, el("summary", {}, "The numbers"),
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
    el("p", { class: "small-note" }, "Ground heat is for ranking sites against each other, not for exact readings."),
    placeholder ? el("p", { class: "notice-inline" }, "Preview score: the ML model is not connected yet.") : null,
  );
}
