// The "Pilot plan" workspace: the bridge between the ranking and real work. It has three kinds of page, one at a time:
//   home    a table of the sites in the plan, with tabs for Field results, Trees and Evidence, and a "Create pilot plan" button;
//   wizard  "Create pilot plan": five full pages in a fixed order (Back and Next only, no jumping ahead), each saved as you go;
//   site    one site on its own page: field checks, planning, treatment, readiness, siting screen, review.
// Nothing is folded away: what a page needs is on the page. Everything here is the planner's own entries, kept on this device.
// Nothing is inspected, approved or planted by this tool. Text and controls only; nothing is built from data as markup.
// Logic lives in plan.js, observations.js, pilot.js and trees.js.
import { el, clear, append, icon } from "./dom.js";
import { toCsv } from "./csv.js";
import { renderStrip } from "./strip.js";
import {
  CHECKS, CHECK_VALUES, NOTE_MAX, PHASES, PLAN_CAVEAT, PLAN_COLUMNS, STATUSES, feasibility, planRows, warnings, transitionProblem,
} from "./plan.js";
import { SCHEDULE_COLUMNS, blocksOf, inspectionPlan, nextStep, unionReach, workSchedule } from "./pilot.js";
import { TREE_COLUMNS, maintenanceSchedule, survivalReport, treeRows } from "./trees.js";
import { exposurePanel } from "./exposure-ui.js";
import { conflictFor, conflictRows } from "./screening.js";
import { conflictBlock } from "./screening-ui.js";
import { appPageUrl } from "./api.js";
import { createOptimizerPanel, interventionPlanBlock, readinessBlock } from "./decide-ui.js";
import { createReviewUI } from "./review-ui.js";
import { ORIGIN_LABELS } from "./sites-table.js";
import { fmt, fmtMetres } from "./scale.js";
import { createSiteMap } from "./site-map.js";
import { createTreeUI } from "./trees-ui.js";
import { field, flag, input, numInput, select, th } from "./form-ui.js";

const LEAD = "Planning tools for a real pilot: field sheets and imports, evidence, costs and scenarios. To follow your sites from shortlist to planted, use the Tracker.";
const TABS = [
  { key: "sites", label: "Shortlist" },
  { key: "results", label: "Inspections" },
  { key: "trees", label: "Trees" },                // shown once a site is marked Planted
  { key: "evidence", label: "Records" },
];
const TAB_INTRO = {
  sites: "The sites you picked and where each one stands. Open a site to see where it is, answer its five field checks and say who is responsible.",
  results: "Send a field sheet to the people who walk the sites, then bring their answers back here. Nothing is saved until you confirm the preview.",
  trees: "After a site is planted, record each tree here and follow up on it. This is how a pilot learns what survives; the tool never guesses survival.",
  evidence: "For a real pilot: a frozen copy of your original shortlist, what it reaches, scenarios and downloads. You can ignore this page while you are still choosing sites.",
};
const WIZARD = [
  { name: "Choose sites", intro: "Tick the sites you want in the pilot. The list follows the current ranking; the tool only suggests, you decide.", get: "A shortlist to work from." },
  { name: "Check coverage", optional: true, intro: "See what the chosen sites reach, then, if you like, let the tool suggest a better mix for the number of sites you can inspect.", get: "A view of what your shortlist covers. You can skip this: just press Next." },
  { name: "Plan inspections", intro: "Before anything is planted, a person visits each site. Say which sites need a visit and group them into trips (batches).", get: "One field sheet per trip, and a rough number of days." },
  { name: "Plan planting", intro: "Give each site a planting round (1 is first), so the team knows the order.", get: "A work schedule you can download for the landscape team." },
  { name: "Review and save", intro: "Check the plan. Freezing the original shortlist lets field sheets go out without scores, so visitors are not influenced.", get: "A finished shortlist you can follow here and in the Tracker." },
];
const CHOOSE_LIMIT = 30;

const nf = (n) => Number(n).toLocaleString("en-GB");

/** Fill the workspace. ctx: { plan, byId(), ranked(), onSelect(id), download(name, text, type), reachSets(), today(), backToMap(), setPageLabel(text) }. Returns { redraw() }. */
export function renderPilot(root, ctx) {
  const { plan } = ctx;
  const optimizer = createOptimizerPanel({
    plan, ranked: ctx.ranked, byId: ctx.byId, reachSets: ctx.reachSets,
    onAdd: (ids) => {
      let added = 0;
      for (const id of ids) {
        if (!plan.add(id, "pilot")) continue;
        added += 1;
        plan.setStatus(id, "needs-inspection", "pilot");
        plan.setBatch(id, "Coverage round", "pilot");
      }
      return added;
    },
  });
  const reviewUI = createReviewUI(plan, ctx, redraw);
  const { treeForm, treeCard } = createTreeUI({ plan, today: ctx.today });
  let siteMap = null;                                 // the Leaflet map on a site page; removed before every redraw
  let mapJobs = [];                                   // things to do once the page is on screen (the map needs a size)
  let page = { name: "home", tab: "sites" };          // { name: "home", tab } | { name: "wizard", step: 0 to 4 } | { name: "site", id }

  function open(next) {
    page = next;
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
    if (page.name === "site" && !plan.has(page.id)) page = { name: "home", tab: "sites" };       // the site was removed
    const label = page.name === "wizard" ? "Create" : page.name === "site" ? page.id : "";
    const visible = !root.closest("[hidden]");
    if (visible) { ctx.setPageLabel?.(label); ctx.setFlow?.(page.name !== "home"); }      // creating or opening a site is its own page: no sidebar
    siteMap?.remove();
    siteMap = null;
    mapJobs = [];
    clear(root);
    append(root,
      page.name === "wizard" ? wizardPage() : page.name === "site" ? sitePage(page.id) : homePage(),
      el("p", { class: "caption pp-caption" }, PLAN_CAVEAT));
    if (visible) for (const job of mapJobs) job();
  }

  const sortedEntries = () => {
    const byId = ctx.byId();
    return plan.list().sort((a, b) => (byId.get(a.id)?.properties.rank ?? 1e9) - (byId.get(b.id)?.properties.rank ?? 1e9));
  };
  const statusSelect = (e, key = `site:${e.id}:status`) => select(
    STATUSES.map((st) => ({ ...st, disabled: Boolean(transitionProblem(e, st.key)), title: transitionProblem(e, st.key) })),
    e.status, key, `Status of ${e.id}`, (v) => { if (!plan.setStatus(e.id, v, "pilot")) reviewUI.say(plan.problem()); });
  const rankText = (f) => (f ? `#${f.properties.rank}` : "n/a");
  const stats = (tiles, label) => { const box = el("div", { class: "stats", "aria-label": label }); renderStrip(box, tiles); return box; };

  // ============================== HOME: the table first ==============================
  function homePage() {
    const byId = ctx.byId();
    const entries = sortedEntries();
    const trees = plan.trees();
    const next = nextStep(entries, trees);
    if (!entries.length && !trees.length && !plan.snapshot()) return firstTimePage();
    const tabs = TABS.filter((t) => t.key !== "trees" || trees.length || entries.some((e) => e.status === "planted"));
    if (!tabs.some((t) => t.key === page.tab)) page.tab = "sites";
    return el("div", { class: "pp-home" },
      el("div", { class: "page-head" },
        el("div", { class: "page-title" }, el("h1", { class: "pp-h", tabindex: "-1" }, "Advanced tools"), el("p", {}, LEAD),
          el("ul", { class: "chips", "aria-label": "About the pilot plan" }, el("li", { class: "chip chip-warn" }, "Your entries, not verified"), el("li", { class: "chip chip-quiet" }, "Saved on this device only"))),
        entries.length ? el("button", { type: "button", class: "btn btn-primary", onclick: () => open({ name: "wizard", step: 0 }) }, "Edit pilot plan") : null),
      el("nav", { class: "pp-tabs", "aria-label": "Pilot plan sections" }, tabs.map((t) =>
        el("button", { type: "button", "aria-current": t.key === page.tab ? "page" : null, onclick: () => open({ name: "home", tab: t.key }) }, t.label))),
      el("p", { class: "pp-tab-intro" }, TAB_INTRO[page.tab]),
      page.tab === "results" ? resultsTab(entries) : page.tab === "trees" ? treesTab(entries, trees, byId) : page.tab === "evidence" ? evidenceTab(entries, byId) : sitesTab(entries, byId, next));
  }

  // Nothing started yet: say what a pilot plan is and what you get, with one button. The tabs appear once there is something in them.
  function firstTimePage() {
    return el("div", { class: "pp-home" },
      el("div", { class: "page-head" },
        el("div", { class: "page-title" }, el("h1", { class: "pp-h", tabindex: "-1" }, "Advanced tools"), el("p", {}, LEAD),
          el("ul", { class: "chips", "aria-label": "About the pilot plan" }, el("li", { class: "chip chip-warn" }, "Your entries, not verified"), el("li", { class: "chip chip-quiet" }, "Saved on this device only")))),
      el("section", { class: "card pp-empty" },
        el("h2", { class: "pp-sec-h" }, "You have not started a pilot plan yet"),
        el("p", {}, "A pilot plan is your shortlist of sites to plant, plus what has to happen to each one before a tree goes in the ground. Making one takes three steps:"),
        el("ol", { class: "pp-how" },
          el("li", {}, el("strong", {}, "Choose sites. "), "Pick from the ranking. You get a shortlist."),
          el("li", {}, el("strong", {}, "Plan the visits. "), "A person visits each site and answers five questions: access, utilities, space and soil, maintenance, existing trees. You get a clear answer to \"can we plant here?\" for each site."),
          el("li", {}, el("strong", {}, "Order the planting. "), "Choose which sites go first. You get a plan to download for the landscape team.")),
        el("div", { class: "plan-actions" },
          el("button", { type: "button", class: "btn btn-primary", onclick: () => open({ name: "wizard", step: 0 }) }, "Create pilot plan"),
          el("button", { type: "button", class: "btn btn-secondary", onclick: ctx.backToMap }, "Back to the map")),
        el("p", { class: "small-note" }, "Your choices are saved as you go, on this device only.")));
  }

  function sitesTab(entries, byId, next) {
    if (!entries.length) {
      return el("section", { class: "card pp-empty" },
        el("h2", { class: "pp-sec-h" }, "No pilot plan yet"),
        el("p", {}, "Pick sites from the ranking, plan the inspections and the planting phases, and this page becomes the table you follow from inspection to planting."),
        el("div", { class: "plan-actions" },
          el("button", { type: "button", class: "btn btn-primary", onclick: () => open({ name: "wizard", step: 0 }) }, "Create pilot plan"),
          el("button", { type: "button", class: "btn btn-secondary", onclick: ctx.backToMap }, "Go to the map")));
    }
    const count = (s) => entries.filter((e) => e.status === s).length;
    return el("div", { class: "pp-stack" },
      stats([
        { label: "Sites in the plan", value: String(entries.length), unit: "", note: "your shortlist" },
        { label: "Awaiting inspection", value: String(count("needs-inspection")), unit: "", note: "marked Needs inspection" },
        { label: "Approved", value: String(count("approved")), unit: "", note: "by a person, in your records" },
        { label: "Planted", value: String(count("planted")), unit: "", note: "recorded by a person" },
      ], "Plan at a glance"),
      el("p", { class: "pp-next", role: "status" }, el("strong", {}, "Next: "), next.text),
      el("p", { class: "pp-help", "data-feasibility-summary": "" }, feasibilitySummary(entries)),
      el("div", { class: "table-card" }, el("div", { class: "table-scroll" }, el("table", { class: "plan-table pp-sites" },
        el("caption", { class: "sr-only" }, "Sites in the pilot plan"),
        th([["Rank", "num"], ["Site"], ["Field feasibility"], ["Status"], ["Batch"], ["Phase"], [""]]),
        el("tbody", {}, entries.map((e) => {
          const f = byId.get(e.id), fe = feasibility(e), notes = [warnings(e).length ? `${warnings(e).length} to check` : null, e.observed ? "field visit in" : null].filter(Boolean).join(", ");
          return el("tr", {},
            el("td", { class: "num" }, rankText(f)),
            el("th", { scope: "row" }, el("button", { type: "button", class: "link-button pp-id", title: "Show on the map", onclick: () => ctx.onSelect(e.id) }, e.id), notes ? el("span", { class: "pp-row-note" }, notes) : null),
            el("td", {}, el("span", { class: `chip pp-feas pp-feas-${fe.state}` }, fe.label)),
            el("td", {}, statusSelect(e)),
            el("td", { class: e.batch ? null : "pp-unset" }, e.batch || "Not set"),
            el("td", { class: e.phase ? null : "pp-unset" }, e.phase ? `Phase ${e.phase}` : "Not set"),
            el("td", { class: "pp-row-end" }, el("button", { type: "button", class: "btn btn-secondary btn-sm", "data-key": `site:${e.id}:open`, "aria-label": `Open ${e.id}`, onclick: () => open({ name: "site", id: e.id }) }, "Open")));
        }))))));
  }

  // "Which sites are safe to plant?" Answered from what a person has entered; it never says safe, only how many checks are confirmed.
  function feasibilitySummary(entries) {
    const allOk = entries.filter((e) => feasibility(e).state === "all-ok").length;
    const problems = entries.filter((e) => feasibility(e).state === "issue").length;
    return `${allOk} of ${entries.length} sites have all five field checks marked OK${problems ? `; ${problems} with a problem found` : ""}. None is approved for planting: that needs a person on site and an ecologist where it is flagged.`;
  }

  // ---------- Field results: sheets out, answers back ----------
  function resultsTab(entries) {
    const ip = inspectionPlan(entries, plan.settings());
    return el("div", { class: "pp-stack" },
      stats([
        { label: "Awaiting inspection", value: String(ip.awaiting), unit: "sites", note: "marked Needs inspection" },
        { label: "Inspected", value: String(ip.inspected), unit: "", note: "findings to review" },
        { label: "Rejected", value: String(ip.rejected), unit: "", note: "need a replacement or none" },
        { label: "Days of inspection", value: ip.days === null ? "Not set" : String(ip.days), unit: ip.days === null ? "" : "days", note: ip.days === null ? "set it in Edit pilot plan" : "from your own capacity" },
      ], "Inspection workload"),
      el("section", { class: "card pp-section" },
        el("h2", { class: "pp-sec-h" }, "Send field sheets out"),
        batchTable(ip),
        ip.batches.length > 1 ? el("div", { class: "plan-actions" }, el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => reviewUI.downloadSheet(null) }, "Download one sheet for all")) : null),
      el("section", { class: "card pp-section" },
        el("h2", { class: "pp-sec-h" }, "Bring the answers back"),
        reviewUI.importControls(),
        el("p", { class: "small-note" }, "A preview comes first and nothing changes until you confirm. Incomplete answers stay unknown; a malformed or mismatched file is refused whole. New sheets include snapshot, data and sheet identifiers, but no ranks or scores.")));
  }

  function batchTable(ip) {
    if (!ip.batches.length) return el("p", { class: "plan-empty" }, "No sites are marked Needs inspection yet. Mark them in Edit pilot plan, then freeze the shortlist to issue a sheet.");
    return el("div", { class: "table-scroll" }, el("table", { class: "plan-table" },
      th([["Batch"], ["Sites", "num"], ["Days", "num"], [""]]),
      el("tbody", {}, ip.batches.map((b) => el("tr", {}, el("th", { scope: "row" }, b.name), el("td", { class: "num" }, String(b.count)), el("td", { class: "num" }, b.days === null ? "Not set" : String(b.days)),
        el("td", { class: "pp-row-end" }, el("button", { type: "button", class: "btn btn-secondary btn-sm", "aria-label": `Download the field sheet for ${b.name}`, onclick: () => reviewUI.downloadSheet(b.name === "No batch yet" ? "" : b.name) }, "Field sheet")))))));
  }

  // ---------- Trees: record what was planted, follow up ----------
  function treesTab(entries, trees, byId) {
    const planted = entries.filter((e) => e.status === "planted");
    const report = survivalReport(trees);
    const schedule = maintenanceSchedule(trees, ctx.today());
    return el("div", { class: "pp-stack" },
      el("p", { class: report.state === "ok" ? "pp-result" : "plan-empty", role: "status" }, report.text),
      planted.length ? treeForm(planted, byId) : howToRecord(),
      trees.length ? el("div", { class: "pp-trees" }, schedule.map((s) => treeCard(trees.find((t) => t.id === s.id), s))) : null,
      el("section", { class: "card pp-section" },
        el("h2", { class: "pp-sec-h" }, "Tree register"),
        el("p", { class: "small-note" }, "A spreadsheet (CSV) of every tree you recorded: site, species, planting date, who maintains it, last inspection and condition. Use it to hand over to the maintenance team or to keep a copy outside this browser, because the plan is saved on this device only."),
        el("div", { class: "plan-actions" }, el("button", { type: "button", class: "btn btn-secondary btn-sm", disabled: !trees.length, onclick: () => trees.length ? ctx.download("elmina-tree-register.csv", toCsv(treeRows(trees), TREE_COLUMNS)) : null }, "Download tree register (CSV)")),
        !trees.length ? el("p", { class: "small-note" }, "Nothing to download yet: no trees are recorded.") : null),
      el("p", { class: "small-note" }, "Survival here is recorded survival among inspected trees, at each tree's latest inspection. A tree with no inspection is never counted as surviving."));
  }

  // Shown until a site is marked Planted: how a tree gets recorded, in order.
  function howToRecord() {
    return el("section", { class: "card pp-section" },
      el("h2", { class: "pp-sec-h" }, "How to record planted trees"),
      el("ol", { class: "pp-how" },
        el("li", {}, el("strong", {}, "Plant first, outside this tool. "), "This tool does not plant or verify anything. A person plants, then records it here."),
        el("li", {}, el("strong", {}, "Mark the site Planted. "), "On the Sites tab, set the site's Status to Planted. That needs the site to be Approved first, which needs a recorded inspection, all five field checks OK and a named keep decision."),
        el("li", {}, el("strong", {}, "Record each tree. "), "Come back to this tab and fill in the form: which site, the species, the planting date, and who maintains it."),
        el("li", {}, el("strong", {}, "Follow up. "), "Add an inspection to each tree every few months. Survival is counted only from trees that were inspected.")),
      el("p", { class: "plan-empty" }, "No site is marked Planted yet, so the form is not shown."));
  }

  // ---------- Evidence: the frozen shortlist, reach, scenarios, exports ----------
  function evidenceTab(entries, byId) {
    const reach = ctx.reachSets();
    const active = entries.filter((e) => e.status !== "rejected").map((e) => e.id);
    return el("div", { class: "pp-stack" },
      reviewUI.snapshotPanel(),
      el("section", { class: "card pp-section" },
        el("h2", { class: "pp-sec-h" }, "What the shortlist reaches, counted once"),
        reachTable(entries, byId)),
      ctx.exposure ? exposurePanel(ctx.exposure, unionReach(reach, active), ctx.download,
        { walks: ctx.walks, routeNames: entries.filter((e) => e.status !== "rejected").map((e) => `near ${e.id}`) }) : null,
      reviewUI.benchmarkPanel(),
      el("section", { class: "card pp-section" },
        el("h2", { class: "pp-sec-h" }, "Downloads"),
        el("div", { class: "plan-actions" },
          el("button", { type: "button", class: "btn btn-secondary btn-sm", disabled: !entries.length, onclick: () => {
            const rows = conflictRows(entries.map((e) => byId.get(e.id)).filter(Boolean), ctx.conflicts?.());
            if (rows.length) ctx.download("elmina-plan-siting-screen.csv", toCsv(rows, Object.keys(rows[0]).map((key) => ({ key, label: key }))));
          } }, "Download siting screen (CSV)"),
          el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => entries.length ? ctx.download("elmina-work-schedule.csv", toCsv(workSchedule(entries), SCHEDULE_COLUMNS)) : null }, "Download work schedule (CSV)"),
          el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => entries.length ? ctx.download("elmina-planting-plan.csv", toCsv(planRows(entries, byId, plan.trees(), plan.snapshot()), PLAN_COLUMNS)) : null }, "Download plan (CSV)")),
        el("p", { class: "small-note" }, el("a", { href: appPageUrl("open-data.html") }, "Open the OSM-only fallback"), ": a separate screening list that runs without Earth Engine, using mapped open land, paths and parks.")));
  }

  function reachTable(entries, byId) {
    const reach = ctx.reachSets();
    const ids = entries.filter((e) => e.status !== "rejected").map((e) => e.id);
    const goIds = entries.filter((e) => e.status === "approved" || e.status === "planted").map((e) => e.id);
    const row = (label, list) => {
      const r = unionReach(reach, list);
      return el("tr", {}, el("th", { scope: "row" }, label), el("td", { class: "num" }, String(list.length)), el("td", { class: "num" }, String(blocksOf(list, byId))),
        r ? [el("td", { class: "num" }, `${nf(r.footpath_m)} m (${r.footpath_pct}%)`), el("td", { class: "num" }, `${nf(r.homes)} (${r.homes_pct}%)`), el("td", { class: "num" }, `${nf(r.gap_m)} m (${r.gap_pct}%)`)]
          : el("td", { class: "num", colspan: "3" }, "Reach data not loaded"));
    };
    return [
      el("div", { class: "table-scroll" }, el("table", { class: "plan-table" },
        el("caption", { class: "sr-only" }, "Unique reach of the shortlist"),
        th([["Sites"], ["Count", "num"], ["250 m areas", "num"], ["Footpath with little tree cover", "num"], ["Mapped homes", "num"], ["Corridor gap (approximate)", "num"]]),
        el("tbody", {}, row("Everything in the plan", ids), row("Approved and planted", goIds)))),
      el("p", { class: "small-note" }, "Reach counts what lies near the sites, every footpath sample, home and gap once. It is not a benefit. The footpath figure is satellite greenness along mapped footpaths; mapped homes are the ones OpenStreetMap shows."),
    ];
  }

  // ============================== SITE: one site on its own page ==============================
  function sitePage(id) {
    const e = plan.get(id);
    const f = ctx.byId().get(id);
    const fe = feasibility(e);
    const warns = warnings(e);
    const snap = plan.snapshot();
    const key = (k) => `site:${id}:${k}`;
    const showReason = e.status === "rejected" || fe.state === "issue" || e.reason;
    const block = (title, ...children) => el("section", { class: "card pp-section" }, el("h2", { class: "pp-sec-h" }, title), children);
    return el("div", { class: "pp-site-page" },
      el("button", { type: "button", class: "link-button pp-back", "data-key": "site:back", onclick: () => open({ name: "home", tab: "sites" }) }, "‹ Advanced tools"),
      el("div", { class: "pp-site-top" },
        el("div", { class: "page-title pp-site-id" },
          el("h1", { class: "pp-h pp-site-title", tabindex: "-1" }, id),
          el("p", { class: "pp-prio" }, f ? `The model ranks it #${f.properties.rank}, score ${f.properties.score_total.toFixed(1)}.` : "Not in the current data.",
            snap ? ` Original rank: #${snap.candidates.find((c) => c.properties.site_id === id)?.properties.rank ?? "not frozen"}${e.replaces_id ? `; replaces ${e.replaces_id}` : ""}.` : ""),
          el("div", { class: "card-chips" }, el("span", { class: `chip pp-feas pp-feas-${fe.state}` }, `Field feasibility: ${fe.label}`),
            el("button", { type: "button", class: "link-button", onclick: () => ctx.onSelect(id) }, "Show on the map"))),
        el("div", { class: "pp-site-status" }, field("Status", statusSelect(e, key("status")), "Where this site stands in your decision. Approved needs an inspection on record, all five checks OK and a named keep decision.")),
        siteMapBox(id, f)),
      warns.length ? el("ul", { class: "pp-warn" }, warns.map((w) => el("li", {}, w))) : null,
      block("Field checks",
        el("p", { class: "small-note" }, "A person visits the site and answers five questions. All five OK means the site can be considered for approval; a Problem means look elsewhere or fix it first. Only a person on site can confirm these, and setting them does not approve the site."),
        el("div", { class: "pp-check-grid" }, CHECKS.map((c) => field(c.label, select(CHECK_VALUES, e.checks[c.key], key(`check-${c.key}`), `${c.label} for ${id}`, (v) => plan.setCheck(id, c.key, v, "pilot"))))),
        observationBlock(e, f)),
      block("Planning",
        el("div", { class: "pp-grid" },
          field("Inspection batch", input(e.batch, key("batch"), `Inspection batch of ${id}`, (v) => plan.setBatch(id, v, "pilot"), { max: 24, placeholder: "for example Week 1" }), "Sites checked on the same trip. Each batch gets its own field sheet."),
          field("Planting phase", select([{ key: "", label: "Not set" }, ...PHASES.map((p) => ({ key: p, label: `Phase ${p}` }))], e.phase, key("phase"), `Planting phase of ${id}`, (v) => plan.setPhase(id, v, "pilot")), "Which planting round (1 is first). Orders the work schedule you download."),
          field("Responsible team", input(e.team, key("team"), `Responsible team for ${id}`, (v) => plan.setTeam(id, v, "pilot"), { max: 40, placeholder: "optional" }), "Who is responsible. Shown in the work schedule."),
          field("Note", input(e.note, key("note"), `Note for ${id}`, (v) => plan.setNote(id, v, "pilot"), { max: NOTE_MAX, placeholder: "for example: check access" }), "Anything the team should know. Shown in the downloads.")),
        showReason ? field(e.status === "rejected" ? "Reason for rejecting" : "What the problem is", input(e.reason, key("reason"), `Reason for ${id}`, (v) => plan.setReason(id, v, "pilot"), { max: NOTE_MAX, placeholder: "for example: no access road" })) : null),
      block("What might this place need?", interventionPlanBlock(plan, e, f?.properties ?? null, { field, select, input, key })),
      block("Establishment and maintenance readiness", readinessBlock(plan, e, plan.trees().filter((t) => t.site_id === id), { field, select, input, key })),
      block("Siting screen", conflictBlock(conflictFor(ctx.conflicts?.(), id))),
      block("Inspection and review", e.status === "rejected" ? reviewUI.replacements(e) : null, reviewUI.reviewForm(e)),
      el("div", { class: "pp-site-foot" }, el("button", { type: "button", class: "btn btn-ghost btn-sm", "data-key": key("remove"), "aria-label": `Remove ${id} from the plan`, onclick: () => plan.remove(id, "pilot") }, "Remove from plan")));
  }

  // A small map so you can see which place this is. It is drawn after the page is on screen, because Leaflet needs a size.
  function siteMapBox(id, f) {
    if (!f) return el("p", { class: "plan-empty pp-site-map-none" }, "This site is not in the current data, so it cannot be shown on the map.");
    const box = el("div", { class: "pp-site-map", role: "img", "aria-label": `Map showing where ${id} is, with the other sites in the plan and the approximate corridor` });
    mapJobs.push(() => {
      const others = plan.list().map((x) => ctx.byId().get(x.id)).filter(Boolean);
      siteMap = createSiteMap(box, f, others, ctx.mapParts?.() ?? {});
    });
    return el("figure", { class: "pp-site-fig" }, box,
      el("figcaption", { class: "small-note" }, "Orange outline: this site. Grey outlines: the other sites in your plan. Dashed green: the approximate corridor."));
  }

  function observationBlock(e, f) {
    if (!e.observed) return null;
    const o = e.observed;
    const agree = o.outcome === "agree";
    return el("div", { class: `pp-obs ${agree ? "pp-obs-agree" : "pp-obs-differ"}` },
      el("p", {}, el("strong", {}, agree ? "Field observation agrees with the frozen model proxies" : o.outcome === "insufficient" ? "Insufficient evidence for comparison" : "Field observation differs from the frozen model proxies"),
        ` (${o.date || "no date"}${o.observer ? `, ${o.observer}` : ""}${o.imported_on ? `, imported ${o.imported_on}` : ""})`),
      el("p", { class: "small-note" }, `Seen: shade on the path ${o.shade_on_path}, tree cover ${o.canopy_class}, path in use ${o.path_in_use}.${o.photo_id ? ` Photo ${o.photo_id}.` : ""}${o.notes ? ` Note: ${o.notes}` : ""}`),
      o.differences.length ? el("ul", { class: "small-note" }, o.differences.map((d) => el("li", {}, d))) : null,
      el("p", { class: "small-note" }, f ? "The model's side comes from satellite proxies, so this is one visit's comparison, not validation." : ""),
      o.provenance ? el("p", { class: "small-note" }, `Source ${o.provenance.filename}; ${o.provenance.trust}; data ${o.provenance.data_version}; original rank #${o.original_rank ?? "unknown"}.`) : el("p", { class: "small-note" }, "Legacy observation: source provenance is missing."),
      e.reviewed ? el("p", { class: "small-note" }, `Planner's decision: ${e.reviewed === "kept" ? "keep the site" : "site rejected"}.`) : null);
  }

  // ============================== WIZARD: Create pilot plan ==============================
  // Five pages in a fixed order. The rail is a list, not buttons: you move with Back and Next only, so no step is skipped.
  // What a step cannot do without is checked when you press Next; the problems are listed on top and marked on the fields.
  function stepProblems(step, entries) {
    const live = entries.filter((e) => e.status !== "rejected");
    if (step === 0) return entries.length ? [] : [{ key: "choose-table", message: "Choose at least one site to continue." }];
    if (step === 2) {
      const out = [];
      const started = live.some((e) => e.status !== "proposed");
      const firstProposed = live.find((e) => e.status === "proposed");
      if (!started && firstProposed) out.push({ key: `site:${firstProposed.id}:status`, message: "Mark at least one site as Needs inspection." });
      for (const e of live.filter((x) => x.status === "needs-inspection" && !x.batch)) out.push({ key: `site:${e.id}:batch`, message: `Give ${e.id} an inspection batch, so its field sheet can be issued.` });
      return out;
    }
    if (step === 3) return live.filter((e) => !e.phase).map((e) => ({ key: `site:${e.id}:phase`, message: `Pick a planting phase for ${e.id}.` }));
    return [];
  }

  function wizardPage() {
    const step = page.step;
    const entries = sortedEntries();
    const byId = ctx.byId();
    const last = step === WIZARD.length - 1;
    const problems = page.tried ? stepProblems(step, entries) : [];
    const bad = new Map(problems.map((x) => [x.key, x.message]));
    const body = [chooseStep, coverageStep, inspectStep, plantStep, reviewStep][step](entries, byId, bad);
    const goNext = () => {
      const found = stepProblems(step, sortedEntries());
      if (found.length) { open({ ...page, tried: true }); root.querySelector('[data-key="wz-errors"]')?.focus(); return; }
      open(last ? { name: "home", tab: "sites" } : { name: "wizard", step: step + 1 });
    };
    return el("div", { class: "pp-wizard" },
      el("div", { class: "pp-wz-top" },
        el("div", {}, el("h1", { class: "pp-wz-title" }, "Create pilot plan"), el("p", { class: "small-note" }, "Your choices are saved as you go, on this device only.")),
        el("button", { type: "button", class: "btn btn-ghost", onclick: () => open({ name: "home", tab: "sites" }) }, "Save and exit")),
      el("div", { class: "pp-wz-body" },
        el("ol", { class: "pp-rail", "aria-label": "Steps" }, WIZARD.map((s, i) =>
          el("li", { class: i === step ? "is-now" : i < step ? "is-done" : "is-todo", "aria-current": i === step ? "step" : null },
            el("span", { class: "pp-n" }, i < step ? icon("check", 14) : String(i + 1)), el("span", { class: "pp-step-label" }, s.name, s.optional ? el("small", {}, " (optional)") : null), i < step ? el("span", { class: "sr-only" }, " (done)") : null))),
        el("section", { class: "pp-wz-main", "aria-labelledby": "pp-wz-h" },
          el("p", { class: "pp-eyebrow" }, `Step ${step + 1} of ${WIZARD.length}`),
          el("h2", { id: "pp-wz-h", class: "pp-h", tabindex: "-1" }, WIZARD[step].name),
          el("p", { class: "pp-intro" }, WIZARD[step].intro),
          el("p", { class: "pp-get" }, el("strong", {}, "You get: "), WIZARD[step].get),
          problems.length ? el("div", { class: "notice notice-bad pp-errors", role: "alert", tabindex: "-1", "data-key": "wz-errors" },
            el("div", {}, el("strong", {}, `${problems.length} thing${problems.length === 1 ? "" : "s"} to fix before you continue`),
              el("ul", { class: "pp-err-list" }, problems.map((x) => el("li", {}, el("button", { type: "button", class: "link-button", onclick: () => root.querySelector(`[data-key="${CSS.escape(x.key)}"]`)?.focus() }, x.message)))))) : null,
          body,
          el("div", { class: "pp-wz-foot" },
            step > 0 ? el("button", { type: "button", class: "btn btn-secondary", onclick: () => open({ name: "wizard", step: step - 1 }) }, "Back") : el("button", { type: "button", class: "btn btn-secondary", onclick: () => open({ name: "home", tab: "sites" }) }, "Cancel"),
            el("span", { class: "grow" }),
            el("button", { type: "button", class: "btn btn-primary", onclick: goNext }, last ? "Finish" : "Next")))));
  }

  // ---- 1. choose sites: a ranked table with tick boxes ----
  function chooseStep(entries, byId, bad) {
    const ranked = ctx.ranked();
    const shown = ranked.slice(0, CHOOSE_LIMIT);
    const shownIds = new Set(shown.map((f) => f.properties.site_id));
    const extra = entries.filter((e) => !shownIds.has(e.id)).map((e) => byId.get(e.id)).filter(Boolean);
    const inPlan = plan.ids();
    const topFive = shown.slice(0, 5).map((f) => f.properties.site_id);
    const locked = (id) => { const e = plan.get(id); return Boolean(e) && e.status !== "proposed"; };
    return el("div", { class: "pp-stack" },
      el("div", { class: "pp-choose-bar" },
        el("p", { class: "pp-result", role: "status", "data-chosen-count": "" }, `${entries.length} site${entries.length === 1 ? "" : "s"} chosen`),
        el("button", { type: "button", class: "btn btn-secondary btn-sm", "data-key": "choose-table", disabled: topFive.every((id) => inPlan.has(id)), onclick: () => { for (const id of topFive) plan.add(id, "pilot"); } }, "Choose the top five")),
      bad.has("choose-table") ? el("p", { class: "pp-err", role: "alert" }, bad.get("choose-table")) : null,
      el("div", { class: `table-card${bad.has("choose-table") ? " is-invalid" : ""}` }, el("div", { class: "table-scroll" }, el("table", { class: "plan-table pp-choose" },
        el("caption", { class: "sr-only" }, "Ranked sites to choose from"),
        th([["Choose"], ["Rank", "num"], ["Site"], ["Score", "num"], ["Origin"], ["Corridor gap (approximate)", "num"]]),
        el("tbody", {}, [...shown, ...extra].map((f) => {
          const p = f.properties, id = p.site_id, chosen = inPlan.has(id), fixed = chosen && locked(id);
          return el("tr", { class: chosen ? "is-chosen" : null },
            el("td", {}, el("input", { type: "checkbox", class: "cb", checked: chosen, disabled: fixed, "data-key": `choose:${id}`, "aria-label": `Choose ${id}`, title: fixed ? "Already worked on. Remove it from its own page." : null,
              onchange: (ev) => { if (ev.target.checked) plan.add(id, "pilot"); else plan.remove(id, "pilot"); } })),
            el("td", { class: "num" }, `#${p.rank}`),
            el("th", { scope: "row" }, el("span", { class: "pp-id" }, id)),
            el("td", { class: "num" }, fmt(p.score_total)),
            el("td", {}, ORIGIN_LABELS[p.origin] ?? String(p.origin)),
            el("td", { class: "num" }, fmtMetres(p.corridor_gap_dist_m)));
        }))))),
      el("p", { class: "small-note" }, `Showing the top ${shown.length} by the current ranking; the Sites page lists all ${ranked.length}. Change the weights on the Map and this order follows.`));
  }

  // ---- 2. check coverage: what the chosen sites reach, and the suggested round ----
  function coverageStep(entries, byId) {
    optimizer.draw();
    return el("div", { class: "pp-stack" },
      el("section", { class: "card pp-section" }, el("h3", { class: "pp-sec-h" }, "What your chosen sites reach, counted once"), reachTable(entries, byId)),
      el("section", { class: "card pp-section" }, optimizer.node));
  }

  // ---- 3. plan inspections: status, batch, capacity ----
  function inspectStep(entries, byId, bad) {
    const settings = plan.settings();
    const ip = inspectionPlan(entries, settings);
    const waiting = entries.filter((e) => e.status === "proposed");
    const noBatch = entries.filter((e) => e.status === "needs-inspection" && !e.batch);
    return el("div", { class: "pp-stack" },
      el("p", { class: "pp-help" }, "Mark the sites a person should visit as Needs inspection, and give each trip a name. Sites checked on the same trip share a batch, and each batch gets its own field sheet."),
      el("div", { class: "table-card" }, el("div", { class: "table-scroll" }, el("table", { class: "plan-table" },
        el("caption", { class: "sr-only" }, "Inspection plan for each chosen site"),
        th([["Site"], ["Status"], ["Inspection batch (needed for Needs inspection)"]]),
        el("tbody", {}, entries.map((e) => el("tr", {},
          el("th", { scope: "row" }, el("span", { class: "pp-id" }, e.id)),
          el("td", {}, flag(statusSelect(e, `site:${e.id}:status`), `site:${e.id}:status`, bad)),
          el("td", {}, flag(input(e.batch, `site:${e.id}:batch`, `Inspection batch of ${e.id}`, (v) => plan.setBatch(e.id, v, "pilot"), { max: 24, placeholder: "for example Week 1" }), `site:${e.id}:batch`, bad)))))))),
      waiting.length || noBatch.length ? el("div", { class: "plan-actions" },
        waiting.length ? el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => { for (const e of waiting) plan.setStatus(e.id, "needs-inspection", "pilot"); } }, `Mark the ${waiting.length} proposed site${waiting.length === 1 ? "" : "s"} as Needs inspection`) : null,
        noBatch.length ? el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => { for (const e of noBatch) plan.setBatch(e.id, "Round 1", "pilot"); } }, `Put the ${noBatch.length} without a batch in "Round 1"`) : null) : null,
      el("section", { class: "card pp-section" },
        el("h3", { class: "pp-sec-h" }, "Your capacity and costs"),
        el("p", { class: "small-note" }, "Enter your own numbers. Nothing is assumed: with a field left empty, the answer says Not set."),
        el("div", { class: "pp-grid" },
          field("Inspections per day (optional)", numInput(settings.inspectionsPerDay, "set:inspectionsPerDay", "Inspections per day", (v) => plan.setSetting("inspectionsPerDay", v, "pilot"), "for example 6"), "How many sites your team can check in a day. Used to estimate how many days a round takes."),
          field("Cost per inspection (optional)", numInput(settings.costPerInspection, "set:costPerInspection", "Cost per inspection", (v) => plan.setSetting("costPerInspection", v, "pilot")), "Used to estimate the cost of a round (sites × this number). Leave empty to skip costs."),
          field("Currency or unit (optional)", input(settings.unit, "set:unit", "Currency or unit", (v) => plan.setSetting("unit", v, "pilot"), { max: 8, placeholder: "for example RM" }), "Shown next to costs.")),
        el("p", { class: "pp-result" }, ip.awaiting ? `${ip.awaiting} site${ip.awaiting === 1 ? "" : "s"} awaiting inspection: ${ip.days === null ? "days Not set" : `${ip.days} day${ip.days === 1 ? "" : "s"}`}${ip.cost !== null ? `, cost ${settings.unit ? settings.unit + " " : ""}${nf(ip.cost)} (your numbers)` : ""}.` : "No site is marked Needs inspection yet.")));
  }

  // ---- 4. plan planting: phase, team, numbers ----
  function plantStep(entries, byId, bad) {
    const settings = plan.settings();
    const live = entries.filter((e) => e.status !== "rejected");
    const phases = new Map();
    for (const e of live) phases.set(e.phase || "", (phases.get(e.phase || "") ?? 0) + 1);
    const rows = [...phases.entries()].sort((a, b) => (a[0] || "9").localeCompare(b[0] || "9"));
    const noPhase = live.filter((e) => !e.phase);
    const money = (v) => `${settings.unit ? settings.unit + " " : ""}${nf(v)}`;
    return el("div", { class: "pp-stack" },
      el("p", { class: "pp-help" }, "Choose which sites get planted first: Phase 1 is first. The team uses the order to schedule the work."),
      noPhase.length ? el("div", { class: "plan-actions" }, el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => { for (const e of noPhase) plan.setPhase(e.id, "1", "pilot"); } }, `Put the ${noPhase.length} without a phase in Phase 1`)) : null,
      el("div", { class: "table-card" }, el("div", { class: "table-scroll" }, el("table", { class: "plan-table" },
        el("caption", { class: "sr-only" }, "Planting plan for each chosen site"),
        th([["Site"], ["Planting phase (required)"], ["Responsible team (optional)"]]),
        el("tbody", {}, live.map((e) => el("tr", {},
          el("th", { scope: "row" }, el("span", { class: "pp-id" }, e.id)),
          el("td", {}, flag(select([{ key: "", label: "Not set" }, ...PHASES.map((p) => ({ key: p, label: `Phase ${p}` }))], e.phase, `site:${e.id}:phase`, `Planting phase of ${e.id}`, (v) => plan.setPhase(e.id, v, "pilot")), `site:${e.id}:phase`, bad)),
          el("td", {}, input(e.team, `site:${e.id}:team`, `Responsible team for ${e.id}`, (v) => plan.setTeam(e.id, v, "pilot"), { max: 40, placeholder: "optional" })))))))),
      el("section", { class: "card pp-section" },
        el("h3", { class: "pp-sec-h" }, "Your planting numbers"),
        el("p", { class: "small-note" }, "A 30 m site is not assumed to be one tree. Enter how many trees you plan per site and what one costs, or leave them empty."),
        el("div", { class: "pp-grid" },
          field("Trees planned per site (optional)", numInput(settings.treesPerSite, "set:treesPerSite", "Trees planned per site", (v) => plan.setSetting("treesPerSite", v, "pilot")), "How many trees you plan for one site. Used to estimate trees per phase."),
          field("Cost per tree (optional)", numInput(settings.costPerTree, "set:costPerTree", "Cost per tree", (v) => plan.setSetting("costPerTree", v, "pilot")), "Used to estimate the cost per phase. Leave empty to skip costs.")),
        rows.length ? el("table", { class: "plan-table" },
          el("caption", { class: "sr-only" }, "Planned sites per phase"),
          th([["Phase"], ["Sites", "num"], ["Trees", "num"], ["Cost", "num"]]),
          el("tbody", {}, rows.map(([phase, sites]) => {
            const trees = Number.isFinite(settings.treesPerSite) ? sites * settings.treesPerSite : null;
            return el("tr", {}, el("th", { scope: "row" }, phase ? `Phase ${phase}` : "No phase yet"), el("td", { class: "num" }, String(sites)),
              el("td", { class: "num" }, trees === null ? "Not set" : nf(trees)), el("td", { class: "num" }, trees !== null && Number.isFinite(settings.costPerTree) ? money(trees * settings.costPerTree) : "Not set"));
          }))) : null));
  }

  // ---- 5. review and save: the summary, then freeze ----
  function reviewStep(entries) {
    const settings = plan.settings();
    const ip = inspectionPlan(entries, settings);
    const live = entries.filter((e) => e.status !== "rejected");
    const noBatch = live.filter((e) => e.status === "needs-inspection" && !e.batch).length;
    const noPhase = live.filter((e) => !e.phase).length;
    const row = (label, value) => [el("dt", {}, label), el("dd", {}, value)];
    return el("div", { class: "pp-stack" },
      el("section", { class: "card pp-section" },
        el("h3", { class: "pp-sec-h" }, "Your plan"),
        el("dl", { class: "pp-summary" },
          row("Sites chosen", String(entries.length)),
          row("Awaiting inspection", `${ip.awaiting}${ip.batches.length ? ` in ${ip.batches.length} batch${ip.batches.length === 1 ? "" : "es"}` : ""}`),
          row("Inspection time", ip.days === null ? "Not set" : `${ip.days} day${ip.days === 1 ? "" : "s"}${ip.cost !== null ? `, cost ${settings.unit ? settings.unit + " " : ""}${nf(ip.cost)}` : ""}`),
          row("Planting phases", `${live.length - noPhase} of ${live.length} sites have a phase`)),
        noBatch || noPhase ? el("p", { class: "small-note" }, [noBatch ? `${noBatch} site${noBatch === 1 ? "" : "s"} awaiting inspection ${noBatch === 1 ? "has" : "have"} no batch. ` : "", noPhase ? `${noPhase} site${noPhase === 1 ? "" : "s"} ${noPhase === 1 ? "has" : "have"} no phase yet. ` : "", "You can still finish and fill these in later."].join("")) : null),
      reviewUI.snapshotPanel(),
      ip.awaiting ? el("div", { class: "plan-actions" }, el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => reviewUI.downloadSheet(null) }, "Download field sheet (all)")) : null,
      el("p", { class: "small-note" }, "After you finish, follow each site in the Tracker. Field answers can come back on the Inspections tab here, and planted trees are recorded from the Tracker."));
  }

  plan.subscribe(() => { if (!root.closest("[hidden]")) redraw(); });
  ctx.exposure?.subscribe(() => { if (!root.closest("[hidden]")) redraw(); });
  ctx.walks?.subscribe(() => { if (!root.closest("[hidden]")) redraw(); });
  draw();
  return { redraw, show: (tab = "sites") => open({ name: "home", tab }) };
}
