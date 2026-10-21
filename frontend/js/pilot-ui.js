// The "Pilot plan" workspace: the bridge between the ranking and real work. Five steps, one screen:
// 1 Shortlist and field feasibility, 2 Inspect (batches, field sheet out, completed sheet in), 3 Review (keep or reject, find replacements),
// 4 Plan the work (phases, the planner's own capacity and costs, unique reach, work schedule), 5 Plant and maintain (tree records, survival report).
// Everything here is the planner's own entries, kept on this device. Nothing is inspected, approved or planted by this tool.
// Text and controls only; nothing is built from data as markup. Logic lives in plan.js, observations.js, pilot.js and trees.js.
import { el, clear, append } from "./dom.js";
import { toCsv, centroid } from "./csv.js";
import { renderStrip } from "./strip.js";
import {
  CHECKS, CHECK_VALUES, CONDITIONS, FIELD_SHEET_COLUMNS, NOTE_MAX, PHASES, PLAN_CAVEAT, PLAN_COLUMNS, STATUSES, feasibility, fieldSheetRows, planRows, warnings,
} from "./plan.js";
import { compareObservation, readFieldSheet, summariseImport } from "./observations.js";
import { SCHEDULE_COLUMNS, STEP_NAMES, blocksOf, inspectionPlan, nextStep, plantingPlan, suggestAlternatives, unionReach, workSchedule } from "./pilot.js";
import { STATE_LABEL, TREE_COLUMNS, maintenanceSchedule, survivalReport, treeRows } from "./trees.js";
import { exposurePanel } from "./exposure-ui.js";
import { conflictFor, conflictRows } from "./screening.js";
import { conflictBlock } from "./screening-ui.js";
import { appPageUrl } from "./api.js";

const LEAD = "Turn a shortlist into a work package: check the ground, inspect, decide, plan the work, then record what was planted. Everything here is your own record, saved on this device only. Nothing is inspected, approved or planted by this tool.";

const nf = (n) => Number(n).toLocaleString("en-GB");
const keepOpen = new Set();                       // <details> that were open, by key, so a redraw does not close them

function field(label, control) { return el("label", { class: "pp-field" }, el("span", {}, label), control); }
function select(options, value, key, label, onChange) {
  const s = el("select", { class: "select", "data-key": key, "aria-label": label, onchange: (e) => onChange(e.target.value) }, options.map((o) => el("option", { value: o.key }, o.label)));
  s.value = value;
  return s;
}
function input(value, key, label, onChange, { max = 40, placeholder = "", type = "text", width = null } = {}) {
  const i = el("input", { type, class: "input", "data-key": key, "aria-label": label, maxlength: type === "text" ? String(max) : null, placeholder, value: value ?? "", onchange: (e) => onChange(e.target.value) });
  if (width) i.style.maxWidth = width;
  return i;
}
const numInput = (value, key, label, onChange, placeholder = "") => input(value === null ? "" : String(value), key, label, onChange, { type: "number", placeholder });

/** Fill the workspace. ctx: { plan, byId(), ranked(), onSelect(id), download(name, text, type), reachSets(), today(), backToMap() }. Returns { redraw() }. */
export function renderPilot(root, ctx) {
  const { plan } = ctx;
  let importNote = null;                           // what the last import said, kept across redraws

  function redraw() {
    const active = document.activeElement?.dataset?.key;
    const scroll = root.closest("#main")?.scrollTop ?? 0;
    for (const d of root.querySelectorAll("details[data-key]")) { if (d.open) keepOpen.add(d.dataset.key); else keepOpen.delete(d.dataset.key); }
    draw();
    if (active) root.querySelector(`[data-key="${CSS.escape(active)}"]`)?.focus({ preventScroll: true });
    const main = root.closest("#main");
    if (main) main.scrollTop = scroll;
  }

  function draw() {
    const byId = ctx.byId();
    const entries = plan.list().sort((a, b) => (byId.get(a.id)?.properties.rank ?? 1e9) - (byId.get(b.id)?.properties.rank ?? 1e9));
    const trees = plan.trees();
    const settings = plan.settings();
    const step = nextStep(entries, trees);
    clear(root);
    append(root,
      el("div", { class: "page-head" }, el("div", { class: "page-title" }, el("h1", {}, "Pilot plan"), el("p", {}, LEAD)),
        el("ul", { class: "chips", "aria-label": "About the pilot plan" }, el("li", { class: "chip chip-warn" }, "Your entries, not verified"), el("li", { class: "chip chip-quiet" }, "Saved on this device only"))),
      guide(step),
      el("p", { class: "small-note" }, el("a", { href: appPageUrl("open-data.html") }, "Open the OSM-only fallback"), ": a separate screening list that runs without Earth Engine, using mapped open land, paths and parks."),
      sectionShortlist(entries, byId),
      sectionInspect(entries, byId, settings),
      sectionWork(entries, byId, settings),
      sectionTrees(entries, trees, byId),
      el("p", { class: "caption pp-caption" }, PLAN_CAVEAT));
  }

  // ---------- the guide ----------
  function guide(step) {
    return el("nav", { class: "pp-guide card", "aria-label": "Pilot steps" },
      el("ol", { class: "pp-steps" }, STEP_NAMES.map((name, i) => el("li", { "aria-current": step.step === i + 1 ? "step" : null, class: step.step === i + 1 ? "is-now" : step.step > i + 1 ? "is-done" : "" },
        el("span", { class: "pp-n" }, String(i + 1)), name))),
      el("p", { class: "pp-next", role: "status" }, el("strong", {}, "Next: "), step.text));
  }

  // ---------- 1. shortlist and field feasibility ----------
  function sectionShortlist(entries, byId) {
    const body = [];
    if (!entries.length) {
      body.push(el("p", { class: "plan-empty" }, "No sites yet. Add the first five from the ranking, or open a site card on Plant first and press Add to planting plan."),
        el("div", { class: "plan-actions" },
          el("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => { for (const f of ctx.ranked().slice(0, 5)) plan.add(f.properties.site_id, "pilot"); } }, "Add the first five ranked sites"),
          el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: ctx.backToMap }, "Go to the map")));
    } else {
      body.push(el("p", { class: "pp-help" }, "Priority is how the model ranks a site. Field feasibility is what a person has confirmed on the ground. They are separate: a top-ranked site can still be unsuitable, and a check nobody has made stays Not checked."),
        ...entries.map((e) => siteCard(e, byId)));
    }
    return section("1", "Shortlist and field feasibility", body);
  }

  function siteCard(e, byId) {
    const f = byId.get(e.id);
    const fe = feasibility(e);
    const warns = warnings(e);
    const key = (k) => `site:${e.id}:${k}`;
    const showReason = e.status === "rejected" || fe.state === "issue" || e.reason;
    return el("article", { class: "pp-site" },
      el("div", { class: "pp-site-head" },
        el("button", { type: "button", class: "link-button pp-id", onclick: () => ctx.onSelect(e.id) }, e.id),
        el("span", { class: "pp-prio" }, f ? `Priority: rank #${f.properties.rank}, score ${f.properties.score_total.toFixed(1)}` : "Priority: not in the current data"),
        el("span", { class: `chip pp-feas pp-feas-${fe.state}` }, `Field feasibility: ${fe.label}`)),
      el("div", { class: "pp-grid" },
        field("Status", select(STATUSES, e.status, key("status"), `Status of ${e.id}`, (v) => plan.setStatus(e.id, v, "pilot"))),
        field("Inspection batch", input(e.batch, key("batch"), `Inspection batch of ${e.id}`, (v) => plan.setBatch(e.id, v, "pilot"), { max: 24, placeholder: "for example Week 1" })),
        field("Planting phase", select([{ key: "", label: "Not set" }, ...PHASES.map((p) => ({ key: p, label: `Phase ${p}` }))], e.phase, key("phase"), `Planting phase of ${e.id}`, (v) => plan.setPhase(e.id, v, "pilot"))),
        field("Responsible team", input(e.team, key("team"), `Responsible team for ${e.id}`, (v) => plan.setTeam(e.id, v, "pilot"), { max: 40, placeholder: "optional" })),
        field("Note", input(e.note, key("note"), `Note for ${e.id}`, (v) => plan.setNote(e.id, v, "pilot"), { max: NOTE_MAX, placeholder: "for example: check access" }))),
      checksBlock(e, key),
      conflictBlock(conflictFor(ctx.conflicts?.(), e.id)),
      showReason ? field(e.status === "rejected" ? "Reason for rejecting" : "What the problem is", input(e.reason, key("reason"), `Reason for ${e.id}`, (v) => plan.setReason(e.id, v, "pilot"), { max: NOTE_MAX, placeholder: "for example: no access road" })) : null,
      observationBlock(e, f),
      warns.length ? el("ul", { class: "pp-warn" }, warns.map((w) => el("li", {}, w))) : null,
      e.status === "rejected" ? alternativesBlock(e) : null,
      el("div", { class: "pp-site-foot" }, el("button", { type: "button", class: "btn btn-ghost btn-sm", "data-key": key("remove"), "aria-label": `Remove ${e.id} from the plan`, onclick: () => plan.remove(e.id, "pilot") }, "Remove from plan")));
  }

  function checksBlock(e, key) {
    const fe = feasibility(e);
    const d = el("details", { class: "pp-checks", "data-key": key("checks") },
      el("summary", {}, `Field checks: ${fe.ok} of ${CHECKS.length} OK${fe.issue ? `, ${fe.issue} problem${fe.issue === 1 ? "" : "s"}` : ""}`),
      el("div", { class: "pp-check-grid" }, CHECKS.map((c) => field(c.label, select(CHECK_VALUES, e.checks[c.key], key(`check-${c.key}`), `${c.label} for ${e.id}`, (v) => plan.setCheck(e.id, c.key, v, "pilot"))))),
      el("p", { class: "small-note" }, "Only a person on site can confirm these. Setting them does not approve the site."));
    if (keepOpen.has(key("checks"))) d.open = true;
    return d;
  }

  function observationBlock(e, f) {
    if (!e.observed) return null;
    const o = e.observed;
    const agree = o.outcome === "agree";
    return el("div", { class: `pp-obs ${agree ? "pp-obs-agree" : "pp-obs-differ"}` },
      el("p", {}, el("strong", {}, agree ? "Field observation agrees with the model" : "Field observation differs from the model"),
        ` (${o.date || "no date"}${o.observer ? `, ${o.observer}` : ""}${o.imported_on ? `, imported ${o.imported_on}` : ""})`),
      el("p", { class: "small-note" }, `Seen: shade on the path ${o.shade_on_path}, tree cover ${o.canopy_class}, path in use ${o.path_in_use}.${o.photo_id ? ` Photo ${o.photo_id}.` : ""}${o.notes ? ` Note: ${o.notes}` : ""}`),
      o.differences.length ? el("ul", { class: "small-note" }, o.differences.map((d) => el("li", {}, d))) : null,
      el("p", { class: "small-note" }, f ? "The model's side comes from satellite proxies, so this is one visit's comparison, not validation." : ""),
      e.reviewed ? el("p", { class: "small-note" }, `Planner's decision: ${e.reviewed === "kept" ? "keep the site" : "site rejected"}.`)
        : el("div", { class: "plan-actions" },
          el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => plan.setReviewed(e.id, "kept", "pilot") }, "Keep the site"),
          el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => plan.setReviewed(e.id, "rejected", "pilot") }, "Reject the site")));
  }

  function alternativesBlock(e) {
    const alts = suggestAlternatives(e.id, ctx.ranked(), plan.ids(), 3);
    return el("div", { class: "pp-alts" }, el("p", { class: "small-note" }, el("strong", {}, "Next-ranked alternatives "), "(nearby sites first; not yet in your plan):"),
      alts.length ? el("ul", { class: "pp-alt-list" }, alts.map((a) => el("li", {},
        `${a.id}: rank #${a.rank}, score ${a.score.toFixed(1)}${a.sameBlock ? ", same 250 m area" : ""} `,
        el("button", { type: "button", class: "btn btn-secondary btn-sm", "aria-label": `Add ${a.id} to the plan`, onclick: () => { plan.add(a.id, "pilot"); plan.setStatus(a.id, "needs-inspection", "pilot"); } }, "Add and mark Needs inspection"))))
        : el("p", { class: "small-note" }, "Every ranked site is already in the plan."));
  }

  // ---------- 2. inspect ----------
  function sectionInspect(entries, byId, settings) {
    const ip = inspectionPlan(entries, settings);
    const tiles = el("div", { class: "stats", "aria-label": "Inspection workload" });
    renderStrip(tiles, [
      { label: "Awaiting inspection", value: String(ip.awaiting), unit: "sites", note: "marked Needs inspection" },
      { label: "Inspected", value: String(ip.inspected), unit: "", note: "findings to review" },
      { label: "Rejected", value: String(ip.rejected), unit: "", note: "need a replacement or none" },
      { label: "Days of inspection", value: ip.days === null ? "Not set" : String(ip.days), unit: ip.days === null ? "" : "days", note: ip.days === null ? "enter inspections per day" : "from your own capacity" },
    ]);
    const status = el("p", { class: "plan-say", role: "status" });
    if (importNote) status.append(...importNote);
    const fileInput = el("input", { type: "file", accept: ".csv,text/csv", class: "sr-only", id: "pilot-import-file", tabindex: "-1", onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      let text;
      try { text = await file.text(); } catch { importNote = [document.createTextNode("The file could not be read.")]; redraw(); return; }
      importFile(text);
    } });
    return section("2", "Inspect: send a field sheet out, bring the answers back", [
      tiles,
      el("div", { class: "pp-two" },
        el("div", {}, el("h3", {}, "Your capacity and costs"),
          el("p", { class: "small-note" }, "Enter your own numbers. Nothing is assumed: with a field left empty, the answer says Not set."),
          el("div", { class: "pp-grid" },
            field("Inspections per day", numInput(settings.inspectionsPerDay, "set:inspectionsPerDay", "Inspections per day", (v) => plan.setSetting("inspectionsPerDay", v, "pilot"), "for example 6")),
            field("Cost per inspection", numInput(settings.costPerInspection, "set:costPerInspection", "Cost per inspection", (v) => plan.setSetting("costPerInspection", v, "pilot"))),
            field("Currency or unit", input(settings.unit, "set:unit", "Currency or unit", (v) => plan.setSetting("unit", v, "pilot"), { max: 8, placeholder: "for example RM" }))),
          ip.cost !== null ? el("p", { class: "pp-result" }, `Inspection cost for ${ip.awaiting} site${ip.awaiting === 1 ? "" : "s"}: ${settings.unit ? settings.unit + " " : ""}${nf(ip.cost)} (your numbers)`) : null),
        el("div", {}, el("h3", {}, "Inspection batches"),
          ip.batches.length ? el("table", { class: "plan-table" },
            el("thead", {}, el("tr", {}, ["Batch", "Sites", "Days", ""].map((h, i) => el("th", { scope: "col", class: i === 1 || i === 2 ? "num" : null }, h)))),
            el("tbody", {}, ip.batches.map((b) => el("tr", {}, el("th", { scope: "row" }, b.name), el("td", { class: "num" }, String(b.count)), el("td", { class: "num" }, b.days === null ? "Not set" : String(b.days)),
              el("td", {}, el("button", { type: "button", class: "btn btn-secondary btn-sm", "aria-label": `Download the field sheet for ${b.name}`, onclick: () => downloadSheet(b.name === "No batch yet" ? "" : b.name) }, "Field sheet")))))) : el("p", { class: "plan-empty" }, "No sites are marked Needs inspection yet."))),
      el("div", { class: "plan-actions" },
        el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => downloadSheet(null) }, "Download field sheet (all)"),
        el("label", { class: "btn btn-primary btn-sm", for: "pilot-import-file" }, "Import completed field sheet"), fileInput),
      status,
      el("p", { class: "small-note" }, "The field sheet shows place only, never a rank or score. After the walk, import the completed CSV here: each row is checked (known site, in your plan, allowed answers, valid date) and a bad file is refused whole. Blank answers are left out, not guessed."),
    ]);
  }

  function downloadSheet(batch) {
    const rows = fieldSheetRows(plan.list(), ctx.byId(), batch);
    if (!rows.length) { importNote = [document.createTextNode("No site is marked Needs inspection" + (batch ? ` in batch ${batch}` : batch === "" ? " without a batch" : "") + ".")]; redraw(); return; }
    ctx.download(batch ? `elmina-field-sheet-${batch.replace(/[^A-Za-z0-9_-]+/g, "-")}.csv` : "elmina-field-sheet.csv", toCsv(rows, FIELD_SHEET_COLUMNS.map((c) => ({ key: c, label: c }))));
    importNote = [document.createTextNode(`Field sheet made for ${rows.length} site${rows.length === 1 ? "" : "s"}: place only, no rank or score.`)];
    redraw();
  }

  function importFile(text) {
    const byId = ctx.byId();
    const result = readFieldSheet(text, { knownIds: new Set(byId.keys()), planIds: plan.ids() });
    const note = [];
    if (!result.ok) {
      note.push(document.createTextNode("This file was not imported. Nothing in your plan changed."),
        el("ul", { class: "pp-problems" }, (result.problems.length ? result.problems : ["No row had all three answers."]).map((p) => el("li", {}, p))));
      if (result.insufficient.length) note.push(el("p", {}, `${result.insufficient.length} row${result.insufficient.length === 1 ? "" : "s"} had blank answers: ${result.insufficient.map((x) => x.site_id).join(", ")}.`));
      importNote = note;
      redraw();
      return;
    }
    const today = ctx.today();
    const outcomes = [];
    for (const entry of result.entries) {
      const cmp = compareObservation(entry, byId.get(entry.site_id).properties);
      plan.setObserved(entry.site_id, { ...entry, outcome: cmp.outcome, differences: cmp.differences, imported_on: today }, "pilot");
      outcomes.push(cmp);
    }
    const s = summariseImport(outcomes);
    note.push(document.createTextNode(`Imported ${s.total} observation${s.total === 1 ? "" : "s"}: ${s.agree} agree with the model, ${s.disagree} differ. Review each in step 1 and keep or reject the site.`));
    if (result.insufficient.length) note.push(el("p", {}, `Left out because an answer was blank (still Needs inspection): ${result.insufficient.map((x) => x.site_id).join(", ")}.`));
    if (result.ignored) note.push(el("p", {}, `${result.ignored} row${result.ignored === 1 ? "" : "s"} without a site id ignored.`));
    importNote = note;
    redraw();
  }

  // ---------- 4. plan the work ----------
  function sectionWork(entries, byId, settings) {
    const pp = plantingPlan(entries, settings);
    const reach = ctx.reachSets();
    const allIds = entries.map((e) => e.id);
    const goIds = entries.filter((e) => e.status === "approved" || e.status === "planted").map((e) => e.id);
    const reachRow = (label, ids) => {
      const r = unionReach(reach, ids);
      return el("tr", {}, el("th", { scope: "row" }, label), el("td", { class: "num" }, String(ids.length)), el("td", { class: "num" }, String(blocksOf(ids, byId))),
        r ? [el("td", { class: "num" }, `${nf(r.footpath_m)} m (${r.footpath_pct}%)`), el("td", { class: "num" }, `${nf(r.homes)} (${r.homes_pct}%)`), el("td", { class: "num" }, `${nf(r.gap_m)} m (${r.gap_pct}%)`)]
          : el("td", { class: "num", colspan: "3" }, "Reach data not loaded"));
    };
    return section("3", "Plan the work: phases, resources and reach", [
      el("div", { class: "pp-two" },
        el("div", {}, el("h3", {}, "Planting phases"),
          pp.rows.length ? el("table", { class: "plan-table" },
            el("thead", {}, el("tr", {}, ["Phase", "Sites", "Trees", "Cost"].map((h, i) => el("th", { scope: "col", class: i > 0 ? "num" : null }, h)))),
            el("tbody", {}, pp.rows.map((r) => el("tr", {}, el("th", { scope: "row" }, r.phase === "No phase yet" ? r.phase : `Phase ${r.phase}`), el("td", { class: "num" }, String(r.sites)),
              el("td", { class: "num" }, r.trees === null ? "Not set" : nf(r.trees)), el("td", { class: "num" }, r.cost === null ? "Not set" : `${settings.unit ? settings.unit + " " : ""}${nf(r.cost)}`)))))
            : el("p", { class: "plan-empty" }, "No site is Approved or Planted yet.")),
        el("div", {}, el("h3", {}, "Your planting numbers"),
          el("p", { class: "small-note" }, "A 30 m site is not assumed to be one tree. Enter how many trees you plan per site and what one costs, or leave them empty."),
          el("div", { class: "pp-grid" },
            field("Trees planned per site", numInput(settings.treesPerSite, "set:treesPerSite", "Trees planned per site", (v) => plan.setSetting("treesPerSite", v, "pilot"))),
            field("Cost per tree", numInput(settings.costPerTree, "set:costPerTree", "Cost per tree", (v) => plan.setSetting("costPerTree", v, "pilot")))))),
      el("h3", {}, "What the shortlist reaches, counted once"),
      el("div", { class: "table-scroll" }, el("table", { class: "plan-table" },
        el("caption", { class: "sr-only" }, "Unique reach of the shortlist"),
        el("thead", {}, el("tr", {}, ["Sites", "Count", "250 m areas", "Footpath with little tree cover", "Mapped homes", "Corridor gap"].map((h, i) => el("th", { scope: "col", class: i > 0 ? "num" : null }, h)))),
        el("tbody", {}, reachRow("Everything in the plan", allIds), reachRow("Approved and planted", goIds)))),
      el("p", { class: "small-note" }, "Reach counts what lies near the sites, every footpath sample, home and gap once. It is not a benefit. The footpath figure is satellite greenness along mapped footpaths; mapped homes are the ones OpenStreetMap shows."),
      ctx.exposure ? exposurePanel(ctx.exposure, unionReach(reach, entries.filter((e) => e.status !== "rejected").map((e) => e.id)), ctx.download) : null,
      el("div", { class: "plan-actions" },
        el("button", { type: "button", class: "btn btn-secondary btn-sm", disabled: !entries.length, onclick: () => {
          const rows = conflictRows(entries.map((e) => byId.get(e.id)).filter(Boolean), ctx.conflicts?.());
          if (rows.length) ctx.download("elmina-plan-conflicts.csv", toCsv(rows, Object.keys(rows[0]).map((key) => ({ key, label: key }))));
        } }, "Download mapped conflicts (CSV)"),
        el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => entries.length ? ctx.download("elmina-work-schedule.csv", toCsv(workSchedule(entries), SCHEDULE_COLUMNS)) : null }, "Download work schedule (CSV)"),
        el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => entries.length ? ctx.download("elmina-planting-plan.csv", toCsv(planRows(entries, byId), PLAN_COLUMNS)) : null }, "Download plan (CSV)")),
    ]);
  }

  // ---------- 5. plant and maintain ----------
  function sectionTrees(entries, trees, byId) {
    const planted = entries.filter((e) => e.status === "planted");
    const report = survivalReport(trees);
    const schedule = maintenanceSchedule(trees, ctx.today());
    const form = planted.length ? treeForm(planted, byId) : el("p", { class: "plan-empty" }, "Tree records can be added once a site is marked Planted in step 1. That is your own record of a real planting, made by a person.");
    return section("4", "Plant and maintain: tree records and survival", [
      el("p", { class: report.state === "ok" ? "pp-result" : "plan-empty", role: "status" }, report.text),
      form,
      trees.length ? el("div", { class: "pp-trees" }, schedule.map((s) => treeCard(trees.find((t) => t.id === s.id), s))) : null,
      el("div", { class: "plan-actions" }, el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => trees.length ? ctx.download("elmina-tree-register.csv", toCsv(treeRows(trees), TREE_COLUMNS)) : null }, "Download tree register (CSV)")),
      el("p", { class: "small-note" }, "Survival here is recorded survival among inspected trees, at each tree's latest inspection. A tree with no inspection is never counted as surviving."),
    ]);
  }

  function treeForm(planted, byId) {
    const state = { site: planted[0].id, species: "", date: "", owner: "", next: "" };
    const say = el("p", { class: "plan-say", role: "status" });
    return el("form", { class: "pp-treeform", onsubmit: (e) => {
      e.preventDefault();
      const f = byId.get(state.site);
      const c = f ? centroid(f.geometry) : null;
      const id = plan.addTree({ site_id: state.site, species: state.species, planted_on: state.date, owner: state.owner, next_inspection: state.next, lat: c?.lat, lon: c?.lon }, "pilot");
      if (!id) { say.textContent = "A tree needs a Planted site, a species and a valid planting date (year-month-day)."; return; }
    } },
    el("h3", {}, "Record a planted tree"),
    el("div", { class: "pp-grid" },
      field("Site (marked Planted)", select(planted.map((e) => ({ key: e.id, label: e.id })), state.site, "tree:new:site", "Site of the tree", (v) => { state.site = v; })),
      field("Species", input("", "tree:new:species", "Species", (v) => { state.species = v; }, { max: 60, placeholder: "as recorded by the landscape team" })),
      field("Planted on", input("", "tree:new:date", "Planting date, year-month-day", (v) => { state.date = v; }, { max: 10, placeholder: "2026-11-15" })),
      field("Maintenance owner", input("", "tree:new:owner", "Maintenance owner", (v) => { state.owner = v; }, { max: 60, placeholder: "team or contractor" })),
      field("Next inspection", input("", "tree:new:next", "Next inspection date, year-month-day", (v) => { state.next = v; }, { max: 10, placeholder: "2027-02-15" }))),
    el("button", { type: "submit", class: "btn btn-secondary btn-sm" }, "Add tree record"), say);
  }

  function treeCard(t, s) {
    const last = s.last;
    const obs = { date: "", condition: "alive-good", note: "" };
    const say = el("span", { class: "plan-say", role: "status" });
    return el("article", { class: `pp-tree pp-tree-${s.state}` },
      el("div", { class: "pp-site-head" },
        el("strong", { class: "pp-id" }, `${t.id} · ${t.species}`),
        el("span", { class: "pp-prio" }, `${t.site_id}, planted ${t.planted_on}${t.owner ? `, owner ${t.owner}` : ""}`),
        el("span", { class: `chip ${s.state === "overdue" ? "chip-bad" : "chip-quiet"}` }, `${STATE_LABEL[s.state]}${t.next_inspection ? `: ${t.next_inspection}` : ""}`)),
      el("p", { class: "small-note" }, last ? `Last inspection ${last.date}: ${CONDITIONS.find((c) => c.key === last.condition).label}${last.note ? `. ${last.note}` : ""}. ${t.observations.length} inspection${t.observations.length === 1 ? "" : "s"} recorded.` : "No inspection recorded yet."),
      el("form", { class: "pp-obsform", onsubmit: (e) => {
        e.preventDefault();
        if (!plan.addObservation(t.id, obs, "pilot")) say.textContent = "Enter a valid date (year-month-day) and a condition.";
      } },
      field("Inspection date", input("", `tree:${t.id}:obs-date`, `Inspection date for ${t.id}`, (v) => { obs.date = v; }, { max: 10, placeholder: ctx.today() })),
      field("Condition", select(CONDITIONS, "alive-good", `tree:${t.id}:obs-cond`, `Condition of ${t.id}`, (v) => { obs.condition = v; })),
      field("Note", input("", `tree:${t.id}:obs-note`, `Inspection note for ${t.id}`, (v) => { obs.note = v; }, { max: 200 })),
      el("button", { type: "submit", class: "btn btn-secondary btn-sm" }, "Record inspection"), say),
      field("Next inspection", input(t.next_inspection, `tree:${t.id}:next`, `Next inspection date for ${t.id}`, (v) => plan.setTreeField(t.id, "next_inspection", v, "pilot"), { max: 10, placeholder: "2027-02-15" })),
      el("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-label": `Remove tree record ${t.id}`, onclick: () => plan.removeTree(t.id, "pilot") }, "Remove record"));
  }

  function section(n, title, children) {
    return el("section", { class: "card pp-section", "aria-labelledby": `pp-h-${n}` }, el("h2", { id: `pp-h-${n}`, class: "pp-h" }, el("span", { class: "pp-n" }, n), title), children);
  }

  plan.subscribe(() => { if (!root.closest("[hidden]")) redraw(); });
  ctx.exposure?.subscribe(() => { if (!root.closest("[hidden]")) redraw(); });
  draw();
  return { redraw };
}
