// Planted-tree records on screen: the form that records one tree and the card that follows a tree up. Shared by the Tracker and the Pilot plan.
// Errors show next to the field without a redraw, so what was typed stays. Logic lives in plan.js and trees.js.
import { el } from "./dom.js";
import { centroid } from "./csv.js";
import { CONDITIONS } from "./plan.js";
import { STATE_LABEL } from "./trees.js";
import { YMD, dateInput, errorNote, field, input, select, setError } from "./form-ui.js";

/** ctx: { plan, today() }. Returns { treeForm(planted, byId), treeCard(tree, scheduleRow) }. */
export function createTreeUI({ plan, today }) {
  const ctx = { today };
  function treeForm(planted, byId) {
    const state = { site: planted[0].id, species: "", date: "", owner: "", next: "" };
    const say = el("p", { class: "plan-say", role: "status" });
    const species = input("", "tree:new:species", "Species", (v) => { state.species = v; }, { max: 60, placeholder: "as recorded by the landscape team" });
    const date = dateInput("", "tree:new:date", "Planting date", (v) => { state.date = v; }, { max: ctx.today() });
    const next = dateInput("", "tree:new:next", "Next inspection date", (v) => { state.next = v; }, { min: ctx.today() });
    const speciesErr = errorNote("err-tree-species"), dateErr = errorNote("err-tree-date"), nextErr = errorNote("err-tree-next");
    return el("form", { class: "pp-treeform card", novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      say.textContent = "";
      const missing = [];
      setError(species, speciesErr, state.species.trim() ? "" : "Enter the species.");
      setError(date, dateErr, !state.date ? "Pick the planting date." : !YMD.test(state.date) ? "Pick a real date." : state.date > ctx.today() ? "The planting date cannot be in the future." : "");
      setError(next, nextErr, !state.next || YMD.test(state.next) ? "" : "Pick a real date, or leave it empty.");
      for (const [control, note] of [[species, speciesErr], [date, dateErr], [next, nextErr]]) if (!note.hidden) missing.push(control);
      if (missing.length) { missing[0].focus(); return; }
      const f = byId.get(state.site);
      const c = f ? centroid(f.geometry) : null;
      const id = plan.addTree({ site_id: state.site, species: state.species, planted_on: state.date, owner: state.owner, next_inspection: state.next, lat: c?.lat, lon: c?.lon }, "pilot");
      if (!id) say.textContent = "That tree could not be saved: check that the site is marked Planted and the date is a real date.";
    } },
    el("h2", { class: "pp-sec-h" }, "Record a planted tree"),
    el("p", { class: "small-note" }, "Fields marked required must be filled in. Record one tree at a time, after a person has planted it."),
    el("div", { class: "pp-grid" },
      field("Site (marked Planted)", select(planted.map((e) => ({ key: e.id, label: e.id })), state.site, "tree:new:site", "Site of the tree", (v) => { state.site = v; })),
      field("Species (required)", [species, speciesErr], "Goes in the tree register so the maintenance team knows what was planted."),
      field("Planted on (required)", [date, dateErr], "Starts the clock for follow-up inspections."),
      field("Maintenance owner (optional)", input("", "tree:new:owner", "Maintenance owner", (v) => { state.owner = v; }, { max: 60, placeholder: "team or contractor" }), "Who looks after the tree. Shown in the register."),
      field("Next inspection (optional)", [next, nextErr], "Used to flag trees that are overdue for a check.")),
    el("div", { class: "plan-actions" }, el("button", { type: "submit", class: "btn btn-secondary btn-sm" }, "Add tree record")), say);
  }

  function treeCard(t, s) {
    const last = s.last;
    const obs = { date: ctx.today(), condition: "alive-good", note: "" };
    const say = el("span", { class: "plan-say", role: "status" });
    const date = dateInput(ctx.today(), `tree:${t.id}:obs-date`, `Inspection date for ${t.id}`, (v) => { obs.date = v; }, { min: t.planted_on, max: ctx.today() });
    const dateErr = errorNote(`err-tree-${t.id}-date`);
    return el("article", { class: `pp-tree pp-tree-${s.state}` },
      el("div", { class: "pp-site-head" },
        el("strong", { class: "pp-id" }, `${t.id} · ${t.species}`),
        el("span", { class: "pp-prio" }, `${t.site_id}, planted ${t.planted_on}${t.owner ? `, owner ${t.owner}` : ""}`),
        el("span", { class: `chip ${s.state === "overdue" ? "chip-bad" : "chip-quiet"}` }, `${STATE_LABEL[s.state]}${t.next_inspection ? `: ${t.next_inspection}` : ""}`)),
      el("p", { class: "small-note" }, last ? `Last inspection ${last.date}: ${CONDITIONS.find((c) => c.key === last.condition).label}${last.note ? `. ${last.note}` : ""}. ${t.observations.length} inspection${t.observations.length === 1 ? "" : "s"} recorded.` : "No inspection recorded yet."),
      el("form", { class: "pp-obsform", novalidate: true, onsubmit: (e) => {
        e.preventDefault();
        say.textContent = "";
        setError(date, dateErr, !obs.date ? "Pick the inspection date." : !YMD.test(obs.date) ? "Pick a real date." : obs.date > ctx.today() ? "The inspection cannot be in the future." : "");
        if (!dateErr.hidden) { date.focus(); return; }
        if (!plan.addObservation(t.id, obs, "pilot")) say.textContent = "That inspection could not be saved: check the date is a real date.";
      } },
      field("Inspection date (required)", [date, dateErr], "When someone looked at the tree."),
      field("Condition", select(CONDITIONS, "alive-good", `tree:${t.id}:obs-cond`, `Condition of ${t.id}`, (v) => { obs.condition = v; }), "Survival is counted from the latest condition of each inspected tree."),
      field("Note (optional)", input("", `tree:${t.id}:obs-note`, `Inspection note for ${t.id}`, (v) => { obs.note = v; }, { max: 200 })),
      el("button", { type: "submit", class: "btn btn-secondary btn-sm" }, "Record inspection"), say),
      field("Next inspection", dateInput(t.next_inspection, `tree:${t.id}:next`, `Next inspection date for ${t.id}`, (v) => plan.setTreeField(t.id, "next_inspection", v, "pilot")), "Used to flag the tree when a check is due."),
      el("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-label": `Remove tree record ${t.id}`, onclick: () => plan.removeTree(t.id, "pilot") }, "Remove record"));
  }
  return { treeForm, treeCard };
}
