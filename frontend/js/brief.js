// The printable planting brief. It is built into #print-brief, which is invisible on screen and is the only thing shown
// when printing or saving as PDF (see the @media print rules in css/app.css). Everything is text nodes, never HTML.
import { el, clear, append } from "./dom.js";
import { briefRows } from "./export.js";
import { fmt } from "./scale.js";

/**
 * Fill the brief and return the number of sites in it.
 * options: { ctx, steadyOf, meta, weights, custom, n } where custom is true once a slider has moved.
 */
export function renderBrief(root, ranked, { ctx, steadyOf, meta, weights, custom, n = 10, planRows = [] }) {
  clear(root);
  const rows = briefRows(ranked, { n, ctx, steadyOf });
  const preview = meta.score_source !== "ml";
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const share = (k) => `${Math.round((100 * (weights[k] ?? 0)) / sum)}%`;     // slider values as a share of the total
  append(root,
    el("h1", {}, "Planting brief: where to plant first (pilot township: City of Elmina)"),
    el("p", { class: "brief-flag" }, "Example sites (simulated), not Sime Darby Property's list."
      + (preview ? " Preview scores: the scoring model is not connected yet." : "")),
    el("p", {}, "A screening tool: sites ranked by heat relief, green links and shade for walkers. Not a tree count or a carbon figure."),
    el("p", {}, `What mattered: heat relief ${share("cooling")}, links green areas ${share("connectivity")}, shade for walkers ${share("shade")}`
      + (custom ? " (set by the person who printed this)." : " (the defaults).")),
    el("table", { class: "brief-table" },
      el("thead", {}, el("tr", {}, ["Rank", "Site", "Score", "Why here", "Rank steadiness", "Where (lat, lon)"].map((h) => el("th", {}, h)))),
      el("tbody", {}, rows.map((r) => el("tr", {},
        el("td", {}, r.rank), el("td", {}, r.siteId, el("br"), el("span", { class: "brief-sub" }, r.origin)),
        el("td", {}, fmt(r.score, 1)), el("td", {}, r.reason), el("td", {}, r.steady || "Not available"), el("td", {}, r.place))))),
    planRows.length ? el("h2", {}, "Planting plan (the planner's own entries, not verified)") : null,
    planRows.length ? el("table", { class: "brief-table" },
      el("thead", {}, el("tr", {}, ["Site", "Status", "Note", "Rank now"].map((h) => el("th", {}, h)))),
      el("tbody", {}, planRows.map((r) => el("tr", {}, el("td", {}, r.site_id), el("td", {}, r.status), el("td", {}, r.note), el("td", {}, r.rank))))) : null,
    el("h2", {}, "Limits of this data"),
    el("ul", {}, (meta.caveats ?? []).map((c) => el("li", {}, c))),
    el("p", { class: "brief-sub" }, (meta.attribution ?? []).join("  ·  ")),
    el("p", { class: "brief-sub" }, `Data built ${(meta.generated_at ?? "").slice(0, 10) || "(date unknown)"}. Printed ${new Date().toISOString().slice(0, 10)}.`));
  return rows.length;
}
