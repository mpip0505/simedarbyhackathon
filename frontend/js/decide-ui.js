// On screen: "What might this place need?" (intervention.js) in the site card and the pilot plan, the maintenance-readiness block (plan.js readiness),
// and "Best combination for your inspection capacity" (optimizer.js). Text and controls only, never markup built from data.
import { el, clear } from "./dom.js";
import { fmt } from "./scale.js";
import { INTERVENTIONS, INTERVENTION_CAVEAT, REVIEWER_LABEL, interventionReview, suggestIntervention } from "./intervention.js";
import { WATERING, readiness } from "./plan.js";
import { CAPACITIES, OBJECTIVES, POOL, bestCoverage, meanScore, relativeGain, spreadOut, topRanked } from "./optimizer.js";
import { unionReach } from "./pilot.js";

const nf = (n) => Number(n).toLocaleString("en-GB");
const PRINCIPLE_CHIP = { Conserve: "chip chip-ok", Regenerate: "chip chip-plan", Avoid: "chip chip-warn" };

/** The read-only block in the site card: the suggestion, why, and who has to confirm it. */
export function interventionCardBlock(props) {
  const s = suggestIntervention(props);
  return el("section", { class: "iv", "aria-label": "What might this place need?" },
    el("div", { class: "steady-head" }, el("h3", {}, "What might this place need?"), el("span", { class: PRINCIPLE_CHIP[s.principle] }, `SDP: ${s.principle}`)),
    el("p", { class: "iv-label" }, el("strong", {}, s.label), el("span", { class: "chip chip-quiet" }, "Suggestion, not reviewed")),
    el("ul", { class: "card-list" }, s.reasons.map((r) => el("li", {}, r)), s.also.map((a) => el("li", {}, `Also fits ${a.label}: ${a.reason}`))),
    el("p", { class: "small-note" }, `Needs ${REVIEWER_LABEL[s.reviewer]} before anything is decided. ${INTERVENTION_CAVEAT}`));
}

/** The editable block in a pilot-plan site card: suggestion, the planner's choice, reviewer and date. */
export function interventionPlanBlock(plan, entry, props, { field, select, input, key }) {
  const dateInput = (value, k, label, onChange) => el("input", { type: "date", class: "input input-date", "data-key": k, "aria-label": label, value: value ?? "", onchange: (e) => onChange(e.target.value) });
  const s = props ? suggestIntervention(props) : null;
  const review = s ? interventionReview(entry, s) : null;
  const tone = { suggested: "chip chip-quiet", chosen: "chip chip-warn", "needs-ecologist": "chip chip-bad", reviewed: "chip chip-ok" }[review?.state] ?? "chip chip-quiet";
  return el("div", { class: "iv iv-plan" },
    el("div", { class: "pp-site-head" }, el("strong", {}, "Intervention (Avoid, Regenerate, Conserve)"), review ? el("span", { class: tone }, review.text) : null),
    s ? el("p", { class: "small-note" }, `Screening suggests ${s.label}. ${s.reasons[0]}`) : null,
    el("div", { class: "pp-grid" },
      field("Chosen intervention", select([{ key: "", label: s ? `Not chosen (suggested: ${s.label})` : "Not chosen" }, ...INTERVENTIONS.map((i) => ({ key: i.key, label: `${i.label} (${i.principle})` }))],
        entry.intervention, key("iv"), `Chosen intervention for ${entry.id}`, (v) => plan.setIntervention(entry.id, v, "pilot"))),
      field("Reviewed by", input(entry.interventionBy, key("iv-by"), `Who reviewed the intervention for ${entry.id}`, (v) => plan.setInterventionBy(entry.id, v, "pilot"), { max: 60, placeholder: "ecologist or landscape lead" })),
      field("Reviewed on", dateInput(entry.interventionOn, key("iv-on"), `Review date for ${entry.id}`, (v) => plan.setInterventionOn(entry.id, v, "pilot")))),
    el("p", { class: "small-note" }, INTERVENTION_CAVEAT));
}

/** The maintenance-readiness block in a pilot-plan site card: who keeps the trees alive. */
export function readinessBlock(plan, entry, trees, { field, select, input, key }) {
  const r = readiness(entry, trees);
  return el("div", { class: "iv" },
    el("p", { class: "pp-prio" }, `Where it stands: ${r.label}`),
    el("div", { class: "pp-grid" },
      field("Planned species", input(entry.species, key("ready-species"), `Planned species for ${entry.id}`, (v) => plan.setReadiness(entry.id, "species", v, "pilot"), { max: 60, placeholder: "Awaiting ecologist selection" })),
      field("Watering availability", select(WATERING, entry.watering, key("ready-water"), `Watering availability for ${entry.id}`, (v) => plan.setReadiness(entry.id, "watering", v, "pilot"))),
      field("Maintenance responsibility", input(entry.maintainer, key("ready-owner"), `Who maintains ${entry.id}`, (v) => plan.setReadiness(entry.id, "maintainer", v, "pilot"), { max: 60, placeholder: "Unassigned" })),
      field("Establishment inspections", input(entry.establishment, key("ready-est"), `Establishment inspection schedule for ${entry.id}`, (v) => plan.setReadiness(entry.id, "establishment", v, "pilot"), { max: 80, placeholder: "for example monthly for 24 months" }))),
    el("table", { class: "measure-table" }, el("tbody", {}, r.rows.map((row) => el("tr", {}, el("td", {}, row.label), el("td", { class: row.set ? null : "iv-unknown" }, row.value))))),
    el("p", { class: "small-note" }, "Soil and drainage come from the field checks above; survival only from recorded tree inspections on the Trees tab. No survival rate is estimated: the early years after planting are when most urban trees die, so these records are what a real pilot measures."));
}

/**
 * "Best combination for your inspection capacity". ctx: { plan, ranked(), byId(), reachSets(), onAdd(ids) }.
 * Keeps its own choices (capacity, objective) across redraws.
 */
export function createOptimizerPanel(ctx) {
  const state = { k: 10, objective: "balanced" };
  const box = el("div", { class: "opt" });
  const say = el("p", { class: "plan-say", role: "status" });

  function draw() {
    clear(box);
    const reach = ctx.reachSets();
    const ranked = ctx.ranked();
    const byId = ctx.byId();
    const rejected = new Set([...(ctx.plan.excluded?.()??[]),...ctx.plan.list().filter((e) => e.status === "rejected" || Object.values(e.checks??{}).includes("issue")).map((e) => e.id)]);
    const controls = el("div", { class: "pp-grid" },
      el("label", { class: "pp-field" }, el("span", {}, "Sites you can inspect this round"),
        el("select", { class: "select", "data-key": "opt:k", onchange: (e) => { state.k = Number(e.target.value); draw(); } }, CAPACITIES.map((k) => el("option", { value: String(k), selected: k === state.k ? "" : null }, String(k))))),
      el("label", { class: "pp-field" }, el("span", {}, "What should the round reach?"),
        el("select", { class: "select", "data-key": "opt:obj", onchange: (e) => { state.objective = e.target.value; draw(); } }, OBJECTIVES.map((o) => el("option", { value: o.key, selected: o.key === state.objective ? "" : null }, o.label)))));
    box.append(el("h3", {}, "Best combination for your inspection capacity"),
      el("p", { class: "pp-help" }, `The top ${state.k} scores can sit side by side and reach the same footpath, homes and gaps in the approximate corridor. This picks, one at a time, the site that adds the most not yet reached, from the ${POOL} highest-priority sites, leaving out sites you rejected. The ranking itself does not change.`),
      controls);
    const best = bestCoverage(reach, ranked, state.k, state.objective, { exclude: rejected });
    if (!best || !best.ids.length) {
      box.append(el("p", { class: "plan-empty" }, "Reach data is not loaded, was built on older data, or does not cover these sites, so no combination is offered."));
      return;
    }
    const options = [
      { label: `Ranked: the top ${state.k}`, ids: topRanked(ranked, state.k, rejected) },
      { label: "Spread out: at most 3 per 250 m area", ids: spreadOut(ranked, state.k, rejected) },
      { label: "Best coverage", ids: best.ids, best: true },
    ].map((o) => ({ ...o, reach: unionReach(reach, o.ids), mean: meanScore(o.ids, byId) }));
    const base = options[0].reach;
    const delta = (v, b) => { const g = relativeGain(v, b); return g === null || g === 0 ? "" : ` (${g > 0 ? "+" : "−"}${Math.abs(g)}%)`; };
    const cell = (o, k, unit) => el("td", { class: "num" }, o.reach ? `${nf(o.reach[k])}${unit}${o.best && base ? delta(o.reach[k], base[k]) : ""}` : "–");
    box.append(el("div", { class: "table-scroll" }, el("table", { class: "plan-table opt-table" },
      el("caption", { class: "sr-only" }, "Three ways to choose the round, compared"),
      el("thead", {}, el("tr", {}, ["Way to choose", "Footpath with little tree cover", "Mapped homes", "Corridor gap (approximate)", "Average score"].map((h, i) => el("th", { scope: "col", class: i ? "num" : null }, h)))),
      el("tbody", {}, options.map((o) => el("tr", { class: o.best ? "opt-best" : null },
        el("th", { scope: "row" }, o.label),
        cell(o, "footpath_m", " m"), cell(o, "homes", ""), cell(o, "gap_m", " m"),
        el("td", { class: "num" }, o.mean === null ? "–" : fmt(o.mean))))))),
      el("p", { class: "small-note" }, `Best-coverage picks, in the order chosen: ${best.ids.join(", ")}.${best.short ? ` Only ${best.ids.length} sites were available.` : ""}${best.gains.some((g) => g === 0) ? " Later picks added nothing new and follow rank order." : ""}`),
      el("div", { class: "plan-actions" },
        el("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => {
          const added = ctx.onAdd(best.ids);
          say.textContent = added ? `Added ${added} site${added === 1 ? "" : "s"} as Needs inspection, batch "Coverage round".` : "Those sites are already in your plan.";
        } }, `Add these ${best.ids.length} as Needs inspection`)),
      say,
      el("p", { class: "caption" }, "Best is only against this proxy objective: reach counts what lies near the sites, not shade delivered, survival or habitat value. Greedy choice is within a known bound of the best possible set for this kind of objective. The sites are simulated."));
  }
  return { node: box, draw };
}
