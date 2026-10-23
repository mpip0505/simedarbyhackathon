// The Tracker: every site you picked, as a card on a board of stages (Shortlisted, Visit planned, Visited, Approved, Planted), each with the one
// thing to do next. A card's button opens a page for that step (plan the visit, record the visit, decide, mark planted, record trees); the sidebar is
// hidden there, so each step is its own page. Moving a site on always goes through its step and its evidence, never by dragging.
// Everything here is the planner's own entries, kept on this device. Nothing is inspected, approved or planted by this tool.
// Text and controls only; nothing is built from data as markup. Logic lives in tracker-logic.js, plan.js and trees.js.
import { el, clear, append, icon } from "./dom.js";
import { toCsv } from "./csv.js";
import { CHECKS, CHECK_VALUES, FIELD_SHEET_COLUMNS, PLAN_CAVEAT, feasibility } from "./plan.js";
import { VERSION_COLUMNS, dateOK, versionedSheetRows } from "./review.js";
import { TREE_COLUMNS, maintenanceSchedule, survivalReport, treeRows } from "./trees.js";
import { NOT_SUITABLE, STAGES, approvalGaps, groupByStage, nextAction, stageOf, summaryLine } from "./tracker-logic.js";
import { dateInput, field, input, select, setError, errorNote } from "./form-ui.js";
import { createTreeUI } from "./trees-ui.js";
import { createReviewUI } from "./review-ui.js";
import { createSiteMap } from "./site-map.js";

const LEAD = "Follow each site you picked from shortlist to planted. Every card says what to do next.";
const DEFAULT_TRIP = "Visit round 1";
const QUESTIONS = {
  access: "Can the team and equipment get in?",
  utilities: "Are there pipes, cables or setbacks that would block planting?",
  space_soil: "Is there room to plant, and does the soil drain?",
  maintenance: "Can a crew reach it later to water and prune?",
  existing_trees: "Are there trees or roots that would clash?",
};
const TITLES = {
  visit: "Plan the visit", record: "Record the visit", decide: "Decide: plant here or not",
  plant: "Mark as planted", trees: "Trees", rejected: "Set aside",
};
const INTROS = {
  visit: "A person will go to this site and answer five questions about it. Nothing is planted or approved by this step.",
  record: "Fill this in after someone has visited the site. You can come back and edit it.",
  decide: "Look at what the visit found, then decide. Your decision is recorded with your name and the date.",
  plant: "This tool does not plant anything. Only mark a site planted after a person has planted trees there.",
  trees: "Record each tree that was planted, then check on it every few months.",
  rejected: "This site was set aside. The reason is kept so nobody repeats the check.",
};
const shortChecks = (fe) => (fe.state === "all-ok" ? "All 5 checks OK" : fe.state === "issue" ? `Problem in ${fe.issue} check${fe.issue === 1 ? "" : "s"}` : fe.state === "not-checked" ? "No checks yet" : `${fe.ok} of 5 checks OK`);

/** Fill the Tracker. ctx: { plan, byId(), ranked(), weights(), meta(), onSelect(id), download(name, text, type), today(), backToMap(), openAdvanced(tab), setPageLabel(text), setFlow(on), mapParts() }. Returns { show(), redraw() }. */
export function renderTracker(root, ctx) {
  const { plan } = ctx;
  const { treeForm, treeCard } = createTreeUI({ plan, today: ctx.today });
  const reviewUI = createReviewUI(plan, ctx, redraw);
  let page = { name: "board" };                        // { name: "board" } | { name: "act", id, action }
  let notice = "";                                     // one line after something was done: what moved where
  let siteMap = null;
  let mapJobs = [];
  let quiet = false;                                   // true while one step changes the plan several times, so the page redraws once at the end

  function open(next, message = "") {
    page = next;
    notice = message;
    draw();
    const main = root.closest("#main");
    if (main) main.scrollTop = 0;
    root.querySelector(".pp-h")?.focus({ preventScroll: true });
  }
  function redraw() {
    const active = document.activeElement?.dataset?.key;
    const scroll = root.closest("#main")?.scrollTop ?? 0;
    draw();
    if (active) root.querySelector(`[data-key="${CSS.escape(active)}"]`)?.focus({ preventScroll: true });
    const main = root.closest("#main");
    if (main) main.scrollTop = scroll;
  }
  function draw() {
    if (page.name === "act" && !plan.has(page.id)) page = { name: "board" };           // the site was removed
    const visible = !root.closest("[hidden]");
    if (visible) { ctx.setPageLabel?.(page.name === "act" ? `${page.id}` : ""); ctx.setFlow?.(page.name === "act"); }
    siteMap?.remove();
    siteMap = null;
    mapJobs = [];
    clear(root);
    append(root, page.name === "act" ? actPage() : boardPage(), el("p", { class: "caption pp-caption" }, PLAN_CAVEAT));
    if (visible) for (const job of mapJobs) job();
  }
  const change = (fn) => { quiet = true; try { return fn(); } finally { quiet = false; } };

  const entriesSorted = () => {
    const byId = ctx.byId();
    return plan.list().sort((a, b) => (byId.get(a.id)?.properties.rank ?? 1e9) - (byId.get(b.id)?.properties.rank ?? 1e9));
  };
  const treesOf = (id) => plan.trees().filter((t) => t.site_id === id);
  const noticeNode = () => (notice ? el("p", { class: "notice notice-info", role: "status" }, notice) : null);

  // ============================== the board ==============================
  function boardPage() {
    const entries = entriesSorted();
    if (!entries.length) return emptyBoard();
    const groups = groupByStage(entries);
    return el("div", { class: "tk" },
      el("div", { class: "page-head" },
        el("div", { class: "page-title" }, el("h1", { class: "pp-h", tabindex: "-1" }, "Tracker"), el("p", {}, LEAD),
          el("ul", { class: "chips", "aria-label": "About the tracker" }, el("li", { class: "chip chip-warn" }, "Your entries, not verified"), el("li", { class: "chip chip-quiet" }, "Saved on this device only"))),
        el("button", { type: "button", class: "btn btn-secondary", onclick: ctx.backToMap }, "Pick more sites")),
      noticeNode(),
      el("p", { class: "tk-summary", role: "status" }, summaryLine(entries)),
      el("div", { class: "tk-board" }, STAGES.map((stage) => column(stage, groups[stage.key]))),
      groups["not-suitable"].length ? el("section", { class: "tk-side", "aria-labelledby": "tk-h-not-suitable" },
        el("h2", { id: "tk-h-not-suitable", class: "tk-col-title" }, NOT_SUITABLE.name, el("span", { class: "tk-count" }, String(groups["not-suitable"].length))),
        el("p", { class: "tk-col-meaning" }, NOT_SUITABLE.meaning),
        el("div", { class: "tk-cards tk-cards-wide" }, groups["not-suitable"].map(card))) : null);
  }

  function emptyBoard() {
    const top = ctx.ranked().slice(0, 5).map((f) => f.properties.site_id);
    return el("div", { class: "tk" },
      el("div", { class: "page-head" }, el("div", { class: "page-title" }, el("h1", { class: "pp-h", tabindex: "-1" }, "Tracker"), el("p", {}, LEAD))),
      el("section", { class: "card pp-empty" },
        el("h2", { class: "pp-sec-h" }, "No sites to follow yet"),
        el("p", {}, "Pick the sites you want on the map. Each one then shows up here and moves along five stages:"),
        el("ol", { class: "pp-how" }, STAGES.map((s) => el("li", {}, el("strong", {}, `${s.name}. `), s.meaning + "."))),
        el("div", { class: "plan-actions" },
          el("button", { type: "button", class: "btn btn-primary", onclick: ctx.backToMap }, "Pick sites on the map"),
          el("button", { type: "button", class: "btn btn-secondary", onclick: () => { change(() => { for (const id of top) plan.add(id, "tracker"); }); redraw(); } }, "Add the first five ranked sites")),
        el("p", { class: "small-note" }, "Your choices are saved as you go, on this device only.")));
  }

  function column(stage, list) {
    const foot = [];
    if (stage.key === "shortlisted" && list.length > 1) {
      foot.push(el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => {
        change(() => { for (const e of list) { plan.setStatus(e.id, "needs-inspection", "tracker"); plan.setBatch(e.id, DEFAULT_TRIP, "tracker"); } });
        open({ name: "board" }, `${list.length} visits planned, all in "${DEFAULT_TRIP}".`);
      } }, `Plan all ${list.length} visits`));
    }
    if (stage.key === "visit-planned" && list.length) {
      foot.push(el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: downloadSheet }, "Download the field sheet"));
      foot.push(el("p", { class: "small-note" }, "Give it to the visitors: it has the places but no ranks or scores. Answers come back through each card, or as a file in ",
        el("button", { type: "button", class: "link-button", onclick: () => ctx.openAdvanced?.("results") }, "Advanced tools"), "."));
    }
    return el("section", { class: "tk-col", "aria-labelledby": `tk-h-${stage.key}` },
      el("header", {}, el("h2", { id: `tk-h-${stage.key}`, class: "tk-col-title" }, stage.name, el("span", { class: "tk-count" }, String(list.length))), el("p", { class: "tk-col-meaning" }, stage.meaning)),
      foot.length ? el("div", { class: "tk-col-foot" }, foot) : null,
      el("div", { class: "tk-cards" }, list.length ? list.map(card) : el("p", { class: "tk-none" }, "No sites here yet.")));
  }

  function card(e) {
    const f = ctx.byId().get(e.id);
    const stage = stageOf(e);
    const next = nextAction(e, treesOf(e.id));
    const fe = feasibility(e);
    const gaps = stage.key === "visited" ? approvalGaps(e) : [];
    return el("article", { class: `tk-card tk-${stage.key}` },
      el("div", { class: "tk-card-top" }, el("span", { class: "tk-id" }, e.id), el("span", { class: "tk-rank" }, f ? `#${f.properties.rank}` : "–")),
      ["visit-planned", "visited", "approved", "planted"].includes(stage.key) ? el("span", { class: `chip pp-feas pp-feas-${fe.state}` }, shortChecks(fe)) : null,
      el("p", { class: "tk-next" }, el("strong", {}, "Next: "), next.text),
      gaps.length ? el("p", { class: "tk-needs" }, `Missing: ${gaps.join("; ")}.`) : null,
      el("div", { class: "tk-card-actions" },
        el("button", { type: "button", class: next.action === "rejected" ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm", "data-key": `tk:${e.id}:go`, onclick: () => open({ name: "act", id: e.id, action: next.action }) }, next.label),
        el("button", { type: "button", class: "link-button", onclick: () => ctx.onSelect(e.id) }, "Show on map")));
  }

  // The field sheet for everyone whose visit is planned. It needs the original ranking frozen, so that is done first (and said).
  function downloadSheet() {
    if (!plan.snapshot()) {
      const meta = ctx.meta?.();
      if (!plan.freeze({ features: ctx.ranked(), weights: ctx.weights(), dataVersion: meta?.data_version, scoreSource: meta?.score_source })) { open({ name: "board" }, plan.problem() || "The sheet could not be made."); return; }
    }
    const ids = plan.list().filter((e) => e.status === "needs-inspection").map((e) => e.id);
    const sheet = plan.issueSheet(ids);
    const rows = sheet ? versionedSheetRows(plan.snapshot(), ids, sheet.id) : [];
    if (!rows.length) { open({ name: "board" }, "The sheet could not be made. Check that the data has not changed since the sites were picked."); return; }
    ctx.download("elmina-field-sheet.csv", toCsv(rows, [...FIELD_SHEET_COLUMNS, ...VERSION_COLUMNS].map((key) => ({ key, label: key }))));
    open({ name: "board" }, `Field sheet made for ${rows.length} site${rows.length === 1 ? "" : "s"}. A copy of today's ranking was kept, so the sheet could go out without scores.`);
  }

  // ============================== one step on its own page ==============================
  function actPage() {
    const id = page.id, action = page.action;
    const e = plan.get(id);
    const f = ctx.byId().get(id);
    const stage = stageOf(e);
    const say = el("p", { class: "plan-say pp-err-line", role: "alert" });
    const body = ({ visit: visitStep, record: recordStep, decide: decideStep, plant: plantStep, trees: treesStep, rejected: rejectedStep }[action] ?? visitStep)(e, f, say);
    return el("div", { class: "pp-site-page tk-act" },
      el("button", { type: "button", class: "link-button pp-back", "data-key": "tk:back", onclick: () => open({ name: "board" }) }, "‹ Tracker"),
      el("div", { class: "pp-site-top" },
        el("div", { class: "page-title pp-site-id" },
          el("h1", { class: "pp-h tk-act-title", tabindex: "-1" }, TITLES[action] ?? TITLES.visit),
          el("p", { class: "pp-prio" }, el("span", { class: "tk-id" }, id), f ? `  ·  ranked #${f.properties.rank}, score ${f.properties.score_total.toFixed(1)}` : "  ·  not in the current data"),
          el("p", { class: "pp-intro" }, INTROS[action] ?? INTROS.visit),
          stepper(stage)),
        siteMapBox(id, f)),
      noticeNode(),
      body);
  }

  // where this site is on its journey: numbered steps joined by a line (a row to read, not buttons to press)
  function stepper(stage) {
    const at = STAGES.findIndex((s) => s.key === stage.key);
    const out = stage.key === NOT_SUITABLE.key;
    return el("ol", { class: "tk-progress", "aria-label": "Where this site is" },
      STAGES.map((s, i) => el("li", { class: i === at ? "is-now" : i < at ? "is-done" : "is-todo", "aria-current": i === at ? "step" : null },
        el("span", { class: "pp-n" }, i < at ? icon("check", 12) : String(i + 1)), el("span", { class: "tk-step-label" }, s.name), i < at ? el("span", { class: "sr-only" }, " (done)") : null)),
      out ? el("li", { class: "is-now is-out", "aria-current": "step" }, el("span", { class: "pp-n" }, icon("x", 12)), el("span", { class: "tk-step-label" }, NOT_SUITABLE.name)) : null);
  }

  function siteMapBox(id, f) {
    if (!f) return el("p", { class: "plan-empty pp-site-map-none" }, "This site is not in the current data, so it cannot be shown on the map.");
    const box = el("div", { class: "pp-site-map", role: "img", "aria-label": `Map showing where ${id} is, with the other sites you picked and the approximate corridor` });
    mapJobs.push(() => {
      const others = plan.list().map((x) => ctx.byId().get(x.id)).filter(Boolean);
      siteMap = createSiteMap(box, f, others, ctx.mapParts?.() ?? {});
    });
    return el("figure", { class: "pp-site-fig" }, box,
      el("figcaption", { class: "small-note" }, "Orange outline: this site. Grey outlines: the other sites you picked. Dashed green: the approximate corridor."));
  }

  const card_ = (title, ...children) => el("section", { class: "card pp-section" }, title ? el("h2", { class: "pp-sec-h" }, title) : null, children);
  const actions = (...btns) => el("div", { class: "pp-wz-foot tk-foot" }, el("button", { type: "button", class: "btn btn-secondary", onclick: () => open({ name: "board" }) }, "Cancel"), el("span", { class: "grow" }), ...btns);

  // ---- 1. plan the visit ----
  function visitStep(e, f, say) {
    const st = { trip: e.batch || DEFAULT_TRIP };
    return el("div", { class: "pp-stack" },
      card_("What the visitor will answer",
        el("ol", { class: "pp-how" }, CHECKS.map((c) => el("li", {}, el("strong", {}, `${c.label}. `), QUESTIONS[c.key])))),
      card_("", field("Trip name (optional)", input(st.trip, "tk:trip", "Trip name", (v) => { st.trip = v; }, { max: 24, placeholder: DEFAULT_TRIP }), "Sites visited on the same trip share a name. It is used to make one field sheet per trip.")),
      say,
      actions(el("button", { type: "button", class: "btn btn-primary", onclick: () => {
        const trip = st.trip.trim() || DEFAULT_TRIP;
        const ok = change(() => {
          if (!plan.setStatus(e.id, "needs-inspection", "tracker")) return false;
          plan.setBatch(e.id, trip, "tracker");
          return true;
        });
        if (!ok) { say.textContent = plan.problem() || "That could not be saved."; return; }
        open({ name: "board" }, `${e.id} moved to Visit planned, in "${trip}".`);
      } }, "Plan the visit")));
  }

  // ---- 2. record the visit ----
  function recordStep(e, f, say) {
    const st = { observer: e.inspection?.observer ?? e.observed?.observer ?? "", date: e.inspection?.date ?? ctx.today(), reference: e.inspection?.reference ?? "", checks: { ...e.checks } };
    const observer = input(st.observer, "tk:observer", "Visited by", (v) => { st.observer = v; }, { max: 60, placeholder: "name of the person who went" });
    const date = dateInput(st.date, "tk:date", "Date of the visit", (v) => { st.date = v; }, { max: ctx.today() });
    const reference = input(st.reference, "tk:reference", "Evidence reference", (v) => { st.reference = v; }, { max: 120, placeholder: "for example photo 12 or report name" });
    const errs = [errorNote("err-tk-observer"), errorNote("err-tk-date"), errorNote("err-tk-reference")];
    return el("div", { class: "pp-stack" },
      card_("The visit",
        el("div", { class: "pp-grid" },
          field("Visited by (required)", [observer, errs[0]], "The person who went. Recorded with the visit."),
          field("Date of the visit (required)", [date, errs[1]], "When they went. It cannot be in the future."),
          field("Evidence (required)", [reference, errs[2]], "A photo ID, report or file name, so someone can find the proof later."))),
      card_("What they found",
        el("p", { class: "small-note" }, "Leave a check as Not checked if the visitor could not confirm it. Only all five OK allows approval."),
        el("div", { class: "pp-check-grid" }, CHECKS.map((c) => field(c.label, select(CHECK_VALUES, st.checks[c.key], `tk:check-${c.key}`, `${c.label} for ${e.id}`, (v) => { st.checks[c.key] = v; }), QUESTIONS[c.key])))),
      say,
      actions(el("button", { type: "button", class: "btn btn-primary", onclick: () => {
        const today = ctx.today();
        setError(observer, errs[0], st.observer.trim() ? "" : "Enter who visited.");
        setError(date, errs[1], !st.date ? "Enter the date of the visit." : !dateOK(st.date) ? "Use a real date." : st.date > today ? "The visit cannot be in the future." : "");
        setError(reference, errs[2], st.reference.trim() ? "" : "Enter where the evidence is kept.");
        const bad = [[observer, errs[0]], [date, errs[1]], [reference, errs[2]]].find(([, note]) => !note.hidden);
        if (bad) { bad[0].focus(); say.textContent = ""; return; }
        const saved = change(() => {
          if (!plan.setInspection(e.id, { observer: st.observer, date: st.date, reference: st.reference }, "tracker")) return false;
          for (const c of CHECKS) if (st.checks[c.key] !== plan.get(e.id).checks[c.key]) plan.setCheck(e.id, c.key, st.checks[c.key], "tracker");
          return true;
        });
        if (!saved) { say.textContent = "That visit could not be saved. Check the date and that every required field is filled in."; return; }
        const fe = feasibility(plan.get(e.id));
        open({ name: "board" }, `Visit saved for ${e.id}. ${fe.state === "all-ok" ? "All five checks are OK: you can decide now." : fe.state === "issue" ? "A check found a problem." : "Some checks are still missing."}`);
      } }, "Save the visit")));
  }

  // ---- 3. decide ----
  function decideStep(e, f, say) {
    const visitDate = e.inspection?.date ?? e.observed?.date ?? "";
    const gaps = approvalGaps(e);
    const st = { by: e.review?.reviewer ?? "", date: ctx.today(), reason: e.review?.reason ?? "" };
    const by = input(st.by, "tk:by", "Decided by", (v) => { st.by = v; }, { max: 60, placeholder: "your name" });
    const date = dateInput(st.date, "tk:decide-date", "Date of the decision", (v) => { st.date = v; }, { min: visitDate || null, max: ctx.today() });
    const reason = input(st.reason, "tk:reason", "Reason", (v) => { st.reason = v; }, { max: 200, placeholder: "for example: access confirmed and enough room" });
    const errs = [errorNote("err-tk-by"), errorNote("err-tk-decide-date"), errorNote("err-tk-reason")];
    const valid = () => {
      const today = ctx.today();
      setError(by, errs[0], st.by.trim() ? "" : "Enter who is deciding.");
      setError(date, errs[1], !st.date ? "Enter the date." : !dateOK(st.date) ? "Use a real date." : st.date > today ? "The decision cannot be in the future." : st.date < visitDate ? `The decision cannot be dated before the visit (${visitDate}).` : "");
      setError(reason, errs[2], st.reason.trim() ? "" : "Give a reason, so the record explains itself.");
      const bad = [[by, errs[0]], [date, errs[1]], [reason, errs[2]]].find(([, note]) => !note.hidden);
      if (bad) { bad[0].focus(); return false; }
      return true;
    };
    const evidence = () => ({ reviewer: st.by, date: st.date, reason: st.reason });
    return el("div", { class: "pp-stack" },
      card_("What the visit found",
        e.inspection ? el("p", { class: "small-note" }, `Visited by ${e.inspection.observer} on ${e.inspection.date}. Evidence: ${e.inspection.reference}.`)
          : e.observed ? el("p", { class: "small-note" }, `From an imported field sheet: ${e.observed.observer || "observer not named"}, ${e.observed.date || "no date"}.`) : null,
        el("ul", { class: "tk-checks" }, CHECKS.map((c) => {
          const v = e.checks[c.key];
          return el("li", {}, el("span", {}, c.label), el("span", { class: `chip ${v === "ok" ? "chip-ok" : v === "issue" ? "chip-bad" : "chip-quiet"}` }, v === "ok" ? "OK" : v === "issue" ? "Problem" : "Not checked"));
        })),
        gaps.length ? el("div", { class: "notice notice-bad", role: "note" }, el("div", {}, el("strong", {}, "You cannot approve this site yet."), el("ul", { class: "pp-err-list" }, gaps.map((g) => el("li", {}, g))),
          el("button", { type: "button", class: "link-button", onclick: () => open({ name: "act", id: e.id, action: "record" }) }, "Edit the visit record")))
          : el("div", { class: "notice notice-info", role: "note" }, "All five checks are OK. You can approve this site. This is your own record: this tool has not inspected the site.")),
      card_("Your decision",
        el("div", { class: "pp-grid" },
          field("Decided by (required)", [by, errs[0]], "Your name, kept with the decision."),
          field("Date (required)", [date, errs[1]], "When you decided."),
          field("Reason (required)", [reason, errs[2]], "One line for the record.")),
        el("p", { class: "small-note" }, "Choosing Not suitable sets the site aside and keeps your reason. You can plan a replacement from there.")),
      say,
      actions(
        el("button", { type: "button", class: "btn btn-secondary", onclick: () => {
          if (!valid()) return;
          const ok = change(() => plan.setReviewed(e.id, "rejected", "tracker", evidence()));
          if (!ok) { say.textContent = plan.problem() || "That could not be saved."; return; }
          open({ name: "board" }, `${e.id} set aside as not suitable.`);
        } }, "Not suitable"),
        el("button", { type: "button", class: "btn btn-primary", onclick: () => {
          if (!valid()) return;
          if (gaps.length) { say.textContent = `Approval is blocked: ${gaps.join("; ")}.`; return; }
          const ok = change(() => plan.setReviewed(e.id, "kept", "tracker", evidence()) && plan.setStatus(e.id, "approved", "tracker"));
          if (!ok) { say.textContent = plan.problem() || "That could not be saved."; return; }
          open({ name: "board" }, `${e.id} approved to plant. Plant it, then mark it as planted.`);
        } }, "Plant here")));
  }

  // ---- 4. mark planted ----
  function plantStep(e, f, say) {
    const sure = el("input", { type: "checkbox", class: "cb", "data-key": "tk:planted", id: "tk-planted-sure" });
    const err = errorNote("err-tk-planted");
    return el("div", { class: "pp-stack" },
      card_("Before you continue",
        el("div", { class: "check" }, sure, el("label", { for: "tk-planted-sure" }, `A person has planted trees at ${e.id}.`)), err,
        el("p", { class: "small-note" }, "This only records what you tell it. Afterwards you can record each tree and follow it up.")),
      say,
      actions(el("button", { type: "button", class: "btn btn-primary", onclick: () => {
        if (!sure.checked) { err.textContent = "Tick the box to confirm trees were planted."; err.hidden = false; sure.setAttribute("aria-invalid", "true"); sure.focus(); return; }
        if (!change(() => plan.setStatus(e.id, "planted", "tracker"))) { say.textContent = plan.problem() || "That could not be saved."; return; }
        open({ name: "act", id: e.id, action: "trees" }, `${e.id} marked as planted. Now record the trees.`);
      } }, "Mark as planted")));
  }

  // ---- 5. trees ----
  function treesStep(e) {
    const mine = treesOf(e.id);
    const schedule = maintenanceSchedule(mine, ctx.today());
    const report = survivalReport(mine);
    return el("div", { class: "pp-stack" },
      el("p", { class: report.state === "ok" ? "pp-result" : "plan-empty", role: "status" }, report.text),
      treeForm([e], ctx.byId()),
      mine.length ? el("div", { class: "pp-trees" }, schedule.map((s) => treeCard(mine.find((t) => t.id === s.id), s))) : null,
      card_("Tree register",
        el("p", { class: "small-note" }, "A spreadsheet of every tree you recorded: site, species, planting date, who maintains it, last inspection. Hand it to the maintenance team or keep a copy outside this browser, because the plan is saved on this device only."),
        el("div", { class: "plan-actions" }, el("button", { type: "button", class: "btn btn-secondary btn-sm", disabled: !plan.trees().length, onclick: () => ctx.download("elmina-tree-register.csv", toCsv(treeRows(plan.trees()), TREE_COLUMNS)) }, "Download tree register (CSV)"))),
      el("div", { class: "pp-wz-foot tk-foot" }, el("span", { class: "grow" }), el("button", { type: "button", class: "btn btn-primary", onclick: () => open({ name: "board" }) }, "Back to the tracker")));
  }

  // ---- a site set aside ----
  function rejectedStep(e, f, say) {
    return el("div", { class: "pp-stack" },
      card_("Why it was set aside",
        el("p", {}, e.reason || "No reason was recorded."),
        e.review ? el("p", { class: "small-note" }, `Decided by ${e.review.reviewer} on ${e.review.date}.`) : null),
      card_("A replacement", reviewUI.replacements(e)),
      say,
      el("div", { class: "pp-wz-foot tk-foot" },
        el("button", { type: "button", class: "btn btn-ghost", onclick: () => { change(() => plan.remove(e.id, "tracker")); open({ name: "board" }, `${e.id} removed from the tracker.`); } }, "Remove from the tracker"),
        el("span", { class: "grow" }),
        el("button", { type: "button", class: "btn btn-secondary", onclick: () => open({ name: "board" }) }, "Back to the tracker")));
  }

  plan.subscribe(() => { if (!quiet && !root.closest("[hidden]")) redraw(); });
  draw();
  return { show: () => open({ name: "board" }), redraw };
}
