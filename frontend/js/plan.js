// The planting plan: the planner's own shortlist of sites with a status, a note, field-feasibility checks, an inspection batch and planting phase,
// imported field observations, and (once a planting is recorded) tree records with follow-up observations. All of it is the planner's own entries, kept in
// this browser only. Nothing here inspects, verifies, approves or plants anything, and nothing is sent anywhere. An unknown stays unknown.
// Pure logic plus a small store over an injected storage (localStorage in the app, a fake in tests). No DOM.
import { centroid } from "./csv.js";
import { INTERVENTION_LABEL, suggestIntervention } from "./intervention.js";
import { cleanSnapshot, makeSnapshot, dateOK, short, id as newId } from "./review.js";

export const STATUSES = [
  { key: "proposed", label: "Proposed" },
  { key: "needs-inspection", label: "Needs inspection" },
  { key: "inspected", label: "Inspected" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "planted", label: "Planted" },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.key, s.label]));

// Field-feasibility checks: what a person must confirm on the ground. Each is unknown until someone records it.
export const CHECKS = [
  { key: "access", label: "Land access confirmed" },
  { key: "utilities", label: "Utilities and setbacks checked" },
  { key: "space_soil", label: "Planting space, soil and drainage checked" },
  { key: "maintenance", label: "Maintenance access confirmed" },
  { key: "existing_trees", label: "Existing trees and roots checked" },
];
export const CHECK_VALUES = [{ key: "unknown", label: "Not checked" }, { key: "ok", label: "OK" }, { key: "issue", label: "Problem" }];
const CHECK_KEYS = new Set(CHECKS.map((c) => c.key));
const CHECK_VALUE_KEYS = new Set(CHECK_VALUES.map((c) => c.key));

export const CONDITIONS = [
  { key: "alive-good", label: "Alive, good condition" },
  { key: "alive-poor", label: "Alive, poor condition" },
  { key: "dead", label: "Dead" },
  { key: "not-found", label: "Not found" },
];
export const CONDITION_LABEL = Object.fromEntries(CONDITIONS.map((c) => [c.key, c.label]));

export const STORAGE_KEY = "elmina-planting-plan-v1";     // the key stays; the stored shape is versioned inside (v1 plans are upgraded when read)
export const MAX_ENTRIES = 300;
export const MAX_TREES = 500;
export const MAX_OBSERVATIONS = 50;
export const NOTE_MAX = 280;
export const PHASES = ["1", "2", "3", "4"];
const SITE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PLAN_COLUMNS = [
  { key: "site_id", label: "site_id" }, { key: "status", label: "status" }, { key: "note", label: "note" },
  { key: "reason", label: "reason" }, { key: "batch", label: "inspection_batch" }, { key: "phase", label: "planting_phase" }, { key: "team", label: "team" },
  { key: "feasibility", label: "field_feasibility" }, { key: "unresolved", label: "checks_not_ok" }, { key: "observation", label: "field_observation" },
  { key: "suggested", label: "suggested_intervention" }, { key: "intervention", label: "chosen_intervention" }, { key: "intervention_by", label: "intervention_reviewed_by" },
  { key: "readiness", label: "maintenance_readiness" }, { key: "species", label: "planned_species" }, { key: "watering", label: "watering" }, { key: "maintainer", label: "maintenance_responsibility" },
  { key: "establishment", label: "establishment_inspections" }, { key: "survival", label: "survival_observation" },
  { key: "rank", label: "current_rank" }, { key: "score_total", label: "current_score" }, { key: "origin", label: "origin" },
  { key: "lat", label: "lat" }, { key: "lon", label: "lon" }, { key: "source", label: "source" }, { key: "plan_note", label: "about_this_file" },
  ...["snapshot_id","data_version","original_rank","replaces_id","replacement_id","inspection_by","inspection_date","review_by","review_date","review_decision"].map(key=>({key,label:key})),
];

export const FIELD_SHEET_COLUMNS = ["site_id", "lat", "lon", "shade_on_path", "canopy_class", "path_in_use", "photo_id", "notes", "observer", "date"];

// Maintenance readiness: who keeps the trees alive. Each starts unknown and stays so until the planner records it; no survival rate is guessed.
export const WATERING = [{ key: "unknown", label: "Unknown" }, { key: "available", label: "Available" }, { key: "none", label: "Not available" }];
const WATERING_KEYS = new Set(WATERING.map((w) => w.key));
export const INTERVENTION_KEYS = new Set(["protect", "regenerate", "plant-shade", "inspect"]);   // the keys in intervention.js

export const PLAN_CAVEAT = "These are the planner's own entries, saved on this device only. Nothing here has been inspected by this tool, and a status such as Planted only records what was typed.";

const control = /[\u0000-\u001f\u007f]+/g;
const cleanText = (v, max) => String(v ?? "").replace(control, " ").trim().slice(0, max);
const cleanNote = (v) => cleanText(v, NOTE_MAX);
const validDate = (v) => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const cleanDate = (v) => (validDate(v) ? v : "");
const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));

const blankChecks = () => Object.fromEntries(CHECKS.map((c) => [c.key, "unknown"]));

function cleanChecks(raw) {
  const out = blankChecks();
  if (raw && typeof raw === "object") for (const k of Object.keys(out)) if (CHECK_VALUE_KEYS.has(raw[k])) out[k] = raw[k];
  return out;
}

const SHADE = ["none", "partial", "full"], CANOPY = ["none", "sparse", "moderate", "dense"], YESNO = ["yes", "no"];

/** An imported field observation, or null when it is not in the shape the importer writes. */
function cleanObserved(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!SHADE.includes(raw.shade_on_path) || !CANOPY.includes(raw.canopy_class) || !YESNO.includes(raw.path_in_use)) return null;
  if (!["agree", "disagree", "insufficient"].includes(raw.outcome)) return null;
  return {
    shade_on_path: raw.shade_on_path, canopy_class: raw.canopy_class, path_in_use: raw.path_in_use, outcome: raw.provenance?.trust==="versioned" ? raw.outcome : "insufficient",
    differences: Array.isArray(raw.differences) ? raw.differences.slice(0, 6).map((d) => cleanText(d, 160)) : [],
    photo_id: cleanText(raw.photo_id, 60), notes: cleanText(raw.notes, NOTE_MAX), observer: cleanText(raw.observer, 60), date: cleanDate(raw.date), imported_on: cleanDate(raw.imported_on),
    original_rank: Number.isInteger(raw.original_rank) ? raw.original_rank : null,
    provenance: raw.provenance && typeof raw.provenance === "object" ? {
      trust: raw.provenance.trust === "versioned" ? "versioned" : "unverified",
      ...Object.fromEntries(["filename","digest","data_version","snapshot_id","sheet_id","imported_at"].map(k=>[k,cleanText(raw.provenance[k],160)])),
    } : null,
  };
}

function cleanEntry(it) {
  return {
    id: it.id, status: it.status, note: cleanNote(it.note), checks: cleanChecks(it.checks), reason: cleanText(it.reason, NOTE_MAX),
    batch: cleanText(it.batch, 24), phase: PHASES.includes(String(it.phase)) ? String(it.phase) : "", team: cleanText(it.team, 40),
    observed: cleanObserved(it.observed), reviewed: ["", "kept", "rejected"].includes(it.reviewed) ? it.reviewed : "",
    intervention: INTERVENTION_KEYS.has(it.intervention) ? it.intervention : "", interventionBy: cleanText(it.interventionBy, 60), interventionOn: cleanDate(it.interventionOn),
    species: cleanText(it.species, 60), watering: WATERING_KEYS.has(it.watering) ? it.watering : "unknown", maintainer: cleanText(it.maintainer, 60), establishment: cleanText(it.establishment, 80),
    inspection: it.inspection && dateOK(it.inspection.date) && short(it.inspection.observer,60) && short(it.inspection.reference) ? {observer:short(it.inspection.observer,60),date:it.inspection.date,reference:short(it.inspection.reference)} : null,
    review: it.review && dateOK(it.review.date) && short(it.review.reviewer,60) && short(it.review.reason) ? {reviewer:short(it.review.reviewer,60),date:it.review.date,reason:short(it.review.reason),decision:it.review.decision,data_version:short(it.review.data_version,80),snapshot_id:short(it.review.snapshot_id,80)} : null,
    replaces_id: SITE_ID.test(it.replaces_id??"") ? it.replaces_id : "", replacement_id: SITE_ID.test(it.replacement_id??"") ? it.replacement_id : "",
  };
}

function cleanTree(t, usedIds) {
  if (!t || typeof t !== "object" || !/^T\d{1,6}$/.test(String(t.id)) || usedIds.has(t.id) || !SITE_ID.test(String(t.site_id))) return null;
  const obs = (Array.isArray(t.observations) ? t.observations : []).filter((o) => o && validDate(o.date) && CONDITION_LABEL[o.condition]).slice(0, MAX_OBSERVATIONS)
    .map((o) => ({ date: o.date, condition: o.condition, note: cleanText(o.note, 200) }));
  const lat = Number(t.lat), lon = Number(t.lon);
  return {
    id: t.id, site_id: t.site_id, species: cleanText(t.species, 60), planted_on: cleanDate(t.planted_on), owner: cleanText(t.owner, 60),
    next_inspection: cleanDate(t.next_inspection), lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null, lon: Number.isFinite(lon) && Math.abs(lon) <= 180 ? lon : null,
    observations: obs,
  };
}

const cleanSettings = (s) => ({
  inspectionsPerDay: num(s?.inspectionsPerDay), costPerInspection: num(s?.costPerInspection), treesPerSite: num(s?.treesPerSite), costPerTree: num(s?.costPerTree),
  unit: cleanText(s?.unit, 8),
});

/** The stored shape made safe to trust: known site-id shape, known status, short text, no repeats, size limits. v1 plans are upgraded. */
export function sanitiseAll(raw) {
  const seen = new Set();
  const items = [];
  for (const it of Array.isArray(raw?.items) ? raw.items : []) {
    if (!it || typeof it !== "object" || !SITE_ID.test(String(it.id)) || seen.has(it.id) || !Object.hasOwn(STATUS_LABEL,it.status)) continue;
    seen.add(it.id);
    items.push(cleanEntry(it));
    if (items.length >= MAX_ENTRIES) break;
  }
  const usedTrees = new Set();
  const trees = [];
  for (const t of Array.isArray(raw?.trees) ? raw.trees : []) {
    const c = cleanTree(t, usedTrees);
    if (c) { usedTrees.add(c.id); trees.push(c); }
    if (trees.length >= MAX_TREES) break;
  }
  const fieldIssues = (Array.isArray(raw?.fieldIssues) ? raw.fieldIssues : []).filter(e=>e&&SITE_ID.test(e.id)).slice(0,5000).map(cleanEntry);
  for(const entry of items) if(Object.values(entry.checks).includes("issue")&&!fieldIssues.some(e=>e.id===entry.id))fieldIssues.push(cleanEntry(entry));
  return { items, trees, fieldIssues, settings: cleanSettings(raw?.settings), snapshot: cleanSnapshot(raw?.snapshot),
    events: Array.isArray(raw?.events) ? raw.events.slice(0,2000).map(e=>({type:short(e?.type,40),at:short(e?.at,40),site_id:short(e?.site_id,40),detail:short(e?.detail,1000)})) : [],
    imports: Array.isArray(raw?.imports) ? raw.imports.slice(0,30).filter(r=>r&&typeof r.digest==="string"&&Array.isArray(r.entries)).map(r=>({digest:short(r.digest,64),filename:short(r.filename,120),snapshot_id:short(r.snapshot_id,80),data_version:short(r.data_version,80),imported_at:short(r.imported_at,40),original_csv:typeof r.original_csv==="string"?r.original_csv.slice(0,1_000_000):"",entries:r.entries.slice(0,1000).map(o=>({site_id:short(o.site_id,40),...cleanObserved(o)}))})) : [],
    sheets: Array.isArray(raw?.sheets) ? raw.sheets.slice(0,100).filter(s=>s&&Array.isArray(s.ids)).map(s=>({id:short(s.id,80),ids:s.ids.filter(x=>SITE_ID.test(x)).slice(0,300)})) : [],
    excluded: Array.isArray(raw?.excluded) ? raw.excluded.filter(x=>SITE_ID.test(x)).slice(0,5000) : [] };
}
/** Just the entries (the original v1 helper, kept for callers and tests). */
export const sanitise = (raw) => sanitiseAll(raw).items;

/** How far the five field checks have got. An unknown never counts as OK, and all-ok is never an approval. */
export function feasibility(entry) {
  const vals = CHECKS.map((c) => entry.checks[c.key]);
  const ok = vals.filter((v) => v === "ok").length, issue = vals.filter((v) => v === "issue").length, unknown = vals.length - ok - issue;
  const state = issue ? "issue" : ok === vals.length ? "all-ok" : ok === 0 ? "not-checked" : "partial";
  const label = { issue: `Problem found (${issue})`, "all-ok": "All five checks OK (not an approval)", "not-checked": "Not checked", partial: `${ok} of ${vals.length} checks OK` }[state];
  return { state, ok, issue, unknown, label };
}

/**
 * Establishment and maintenance readiness for one entry: six rows of { key, label, value, set } and how many are set. trees is that site's tree records.
 * Soil and drainage come from the field check; survival only from recorded inspections. An unknown is shown as unknown, never filled in.
 */
export function readiness(entry, trees = []) {
  const soil = entry.checks.space_soil;
  const inspected = trees.filter((t) => t.observations.length);
  const alive = inspected.filter((t) => ["alive-good", "alive-poor"].includes(t.observations[t.observations.length - 1].condition)).length;
  const rows = [
    { key: "species", label: "Species", value: entry.species || "Awaiting ecologist selection", set: Boolean(entry.species) },
    { key: "soil", label: "Soil and drainage", value: soil === "ok" ? "Checked, OK" : soil === "issue" ? "Checked, problem found" : "Not checked", set: soil !== "unknown" },
    { key: "watering", label: "Watering availability", value: WATERING.find((w) => w.key === entry.watering).label, set: entry.watering !== "unknown" },
    { key: "maintainer", label: "Maintenance responsibility", value: entry.maintainer || "Unassigned", set: Boolean(entry.maintainer) },
    { key: "establishment", label: "Establishment inspections", value: entry.establishment || "To be set by planner", set: Boolean(entry.establishment) },
    { key: "survival", label: "Survival observation", value: inspected.length ? `${alive} of ${inspected.length} inspected trees alive` : trees.length ? "Trees recorded, none inspected yet" : "No field data", set: inspected.length > 0 },
  ];
  const n = rows.filter((r) => r.set).length;
  return { rows, set: n, label: `${n} of ${rows.length} recorded` };
}

/** Plain warnings about one entry: things the planner may want to fix. Never blocks anything. */
export function warnings(entry) {
  const out = [];
  const f = feasibility(entry);
  if ((entry.status === "approved" || entry.status === "planted") && f.state !== "all-ok") out.push(f.state === "issue" ? "Marked as " + STATUS_LABEL[entry.status] + " although a check found a problem" : "Marked as " + STATUS_LABEL[entry.status] + " with checks not yet OK");
  if (entry.status === "rejected" && !entry.reason) out.push("Add a reason for rejecting this site");
  if (entry.observed?.outcome === "disagree" && !entry.reviewed) out.push("The field observation disagrees with the model: keep or reject this site");
  if ((entry.intervention === "protect" || entry.intervention === "regenerate") && !entry.interventionBy) out.push(`${entry.intervention === "protect" ? "Protect" : "Regenerate"} is chosen: name the ecologist who reviewed it`);
  if ((entry.status === "approved" || entry.status === "planted") && entry.intervention === "protect") out.push("Marked for planting although the chosen intervention is Protect existing vegetation");
  if ((entry.status === "approved" || entry.status === "planted") && !entry.maintainer) out.push("No one is named as responsible for maintenance");
  if ((entry.status === "approved" || entry.status === "planted") && (!entry.review || !hasInspection(entry))) out.push("Legacy status has no supporting attributed evidence. Review it in the Pilot plan; it is not an approval by this tool.");
  return out;
}

/** A plan over `storage` (anything with getItem and setItem; failures are swallowed, so the plan still works for the session). */
export function hasInspection(entry) {
  return Boolean(entry.inspection || (entry.observed?.observer && dateOK(entry.observed.date) && entry.observed.provenance?.trust === "versioned"));
}
export function transitionProblem(entry, status) {
  if(status==="inspected"&&!hasInspection(entry)) return "Record an inspector, date and evidence reference, or import an attributed versioned observation first.";
  if(status==="rejected"&&entry.review?.decision!=="rejected") return "Use the human review form: reviewer, date and rejection reason are required.";
  if(status==="approved"&&(!hasInspection(entry)||entry.review?.decision!=="kept"||feasibility(entry).state!=="all-ok")) return "Approval needs attributed inspection evidence, all five checks OK, and a named, dated keep decision with a reason.";
  if(status==="planted"&&(entry.status!=="approved"||transitionProblem(entry,"approved"))) return "Record approval evidence before marking the site Planted.";
  return "";
}

export function createPlan(storage, context={}) {
  let state = sanitiseAll(null), revision=0, persisted=true, lastProblem="";
  try { state = sanitiseAll(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null")); } catch { /* start empty */ }
  const listeners = new Set();
  const save = (source) => {
    revision+=1;
    try { if(!storage?.setItem) persisted=false; else {storage.setItem(STORAGE_KEY, JSON.stringify({v:3,...state}));persisted=true;} } catch { persisted=false; }
    for (const fn of listeners) fn(source);
  };
  const find = (id) => state.items.find((x) => x.id === id);
  const tree = (id) => state.trees.find((x) => x.id === id);
  const copy = (x) => (x ? JSON.parse(JSON.stringify(x)) : null);
  const edit = (id, source, fn) => { const it = find(id); if (!it || fn(it) === false) return false; save(source); return true; };
  const event=(type,site_id,detail="")=>{state.events.push({type,site_id,detail:short(detail,1000),at:new Date().toISOString()});};
  const reopen=(it)=>{it.reviewed="";it.review=null;if(it.status==="approved")it.status="inspected";};
  const current=()=>typeof context.dataVersion==="function"?context.dataVersion():context.dataVersion??state.snapshot?.data_version;
  const today=()=>typeof context.today==="function"?context.today():context.today??new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Singapore"});
  const fresh=()=>!state.snapshot || (Boolean(current())&&state.snapshot.data_version===current());
  const reviewSite=(id,decision,evidence,source)=>edit(id,source,it=>{
    lastProblem="";
    if(state.events.length>=2000||!["kept","rejected"].includes(decision)||!short(evidence?.reviewer,60)||!dateOK(evidence?.date)||evidence.date>today()||evidence.date<(it.inspection?.date??it.observed?.date??"")||!short(evidence?.reason)||!fresh()||(decision==="kept"&&!hasInspection(it))) {lastProblem="Review needs a reviewer, valid date, reason, current data and inspection evidence for a keep decision.";return false;}
    it.review={reviewer:short(evidence.reviewer,60),date:evidence.date,reason:short(evidence.reason),decision,data_version:current()??"",snapshot_id:state.snapshot?.id??""};
    it.reviewed=decision;it.reason=short(evidence.reason);
    if(decision==="kept"&&feasibility(it).state==="all-ok")state.fieldIssues=state.fieldIssues.filter(e=>e.id!==id);
    if(decision==="rejected") {it.status="rejected";if(!state.excluded.includes(id))state.excluded.push(id);}
    else if(it.status!=="planted") it.status="inspected";
    event("review",id,JSON.stringify(it.review));
  });
  return {
    revision:()=>revision, persisted:()=>persisted, problem:()=>lastProblem,
    snapshot:()=>copy(state.snapshot),sheets:()=>copy(state.sheets),excluded:()=>new Set([...state.excluded,...state.fieldIssues.map(e=>e.id)]),
    evidence:()=>({format:"elmina-pilot-evidence-v3",exported_at:new Date().toISOString(),...copy(state),caveat:"Local planner records, editable on this device; not a shared, authenticated or tamper-proof audit trail. Simulated sites; no automatic planting approval."}),
    freeze(spec) {
      lastProblem="";
      if(state.snapshot||state.events.length>=2000) {lastProblem="An original snapshot is already frozen. Export the evidence package before clearing the plan for a new cycle.";return false;}
      try {state.snapshot=makeSnapshot({...spec,selectedIds:state.items.filter(e=>e.status!=="rejected").map(e=>e.id)});} catch(e) {lastProblem=e.message;return false;}
      if(current()&&current()!==state.snapshot.data_version) {state.snapshot=null;lastProblem="Snapshot data version is stale.";return false;}
      event("snapshot","",state.snapshot.id);save("snapshot");return true;
    },
    issueSheet(ids) {
      if(!state.snapshot||!fresh()||state.sheets.length>=100||!ids.length||ids.some(s=>!find(s)||!state.snapshot.candidates.some(f=>f.properties.site_id===s)))return null;
      const sheet={id:newId(),ids:[...new Set(ids)]};state.sheets.push(sheet);save("sheet");return copy(sheet);
    },
    applyImport(preview, {replace=false}={}) {
      lastProblem="";
      if(!preview.ok||preview.revision!==revision||!state.snapshot||preview.snapshot_id!==state.snapshot.id||preview.data_version!==current()||!fresh()||!Array.isArray(preview.entries)||!preview.entries.length||state.imports.length>=30||state.events.length>=2000||!/^\w{64}$/.test(preview.digest??"")||state.imports.some(r=>r.digest===preview.digest)) {lastProblem="Import refused: context changed, content was already imported, or provenance/history is invalid. Preview the file again.";return false;}
      const cleaned=preview.entries.map(o=>({site_id:o.site_id,observed:cleanObserved(o)}));
      if(new Set(cleaned.map(o=>o.site_id)).size!==cleaned.length||cleaned.some(o=>!find(o.site_id)||!o.observed||find(o.site_id).status==="planted"||(!replace&&find(o.site_id).observed))) {lastProblem="Import refused: unknown/repeated site, invalid observation, planted site, or existing observations. Enable replacement of previous observations explicitly for corrections.";return false;}
      for(const o of cleaned) {const it=find(o.site_id);it.observed=o.observed;reopen(it);if(it.status!=="rejected"&&hasInspection(it))it.status="inspected";}
      state.imports.push({digest:preview.digest,filename:short(preview.filename,120),snapshot_id:state.snapshot.id,data_version:current(),imported_at:new Date().toISOString(),original_csv:preview.original_csv.slice(0,1_000_000),entries:preview.entries.map(o=>({site_id:o.site_id,...cleanObserved(o)}))});
      event("import","",`${preview.filename}; SHA-256 ${preview.digest}; ${cleaned.length} rows`);save("import");return true;
    },
    setInspection:(id,evidence,source)=>edit(id,source,it=>{
      if(!short(evidence?.observer,60)||!dateOK(evidence?.date)||evidence.date>today()||!short(evidence?.reference)||state.events.length>=2000)return false;
      it.inspection={observer:short(evidence.observer,60),date:evidence.date,reference:short(evidence.reference)};reopen(it);if(!["planted","rejected"].includes(it.status))it.status="inspected";event("inspection",id,JSON.stringify(it.inspection));
    }),
    reviewSite,
    replace(rejectedId,candidateId,evidence) {
      const old=find(rejectedId),candidate=state.snapshot?.candidates.find(f=>f.properties.site_id===candidateId);
      if(!fresh()||!old||old.status!=="rejected"||old.replacement_id||!candidate||find(candidateId)||state.excluded.includes(candidateId)||state.fieldIssues.some(e=>e.id===candidateId)||state.items.length>=MAX_ENTRIES||state.events.length>=2000||!short(evidence?.reviewer,60)||!dateOK(evidence?.date)||!short(evidence?.reason))return false;
      const next=cleanEntry({id:candidateId,status:"needs-inspection",replaces_id:rejectedId,batch:old.batch,phase:old.phase,team:old.team});
      old.replacement_id=candidateId;state.items.push(next);event("replacement",rejectedId,JSON.stringify({replacement_id:candidateId,...evidence,original_rank:state.snapshot.candidates.find(f=>f.properties.site_id===rejectedId)?.properties.rank,replacement_rank:candidate.properties.rank}));save("replacement");return true;
    },
    has: (id) => Boolean(find(id)),
    get: (id) => copy(find(id)),
    list: () => state.items.map(copy),
    ids: () => new Set(state.items.map((x) => x.id)),
    /** Add a site as Proposed; false when the id is invalid, already there, or the plan is full. */
    add(id, source) {
      if (!SITE_ID.test(String(id)) || find(id) || state.excluded.includes(id) || state.items.length >= MAX_ENTRIES || !fresh() || (state.snapshot&&!state.snapshot.candidates.some(f=>f.properties.site_id===id))) return false;
      const archived=state.fieldIssues.find(e=>e.id===id);
      state.items.push(cleanEntry(archived?{...archived,status:"needs-inspection",review:null,reviewed:""}:{id,status:"proposed"}));
      save(source);
      return true;
    },
    remove(id, source) {
      const before = state.items.length;
      state.items = state.items.filter((x) => x.id !== id);
      if (state.items.length !== before) save(source);
    },
    setStatus: (id, status, source) => edit(id, source, (it) => {
      lastProblem=transitionProblem(it,status);
      if(!fresh()&&["approved","planted"].includes(status))lastProblem="The original snapshot is stale. Export this record and start a new cycle on current data.";
      if (!Object.hasOwn(STATUS_LABEL,status) || it.status === status || lastProblem || state.events.length>=2000) return false;
      it.status = status;event("status",id,status);
    }),
    setNote: (id, note, source) => edit(id, source, (it) => { const n = cleanNote(note); if (it.note === n) return false; it.note = n; }),
    setReason: (id, text, source) => edit(id, source, (it) => { const n = cleanText(text, NOTE_MAX); if (it.reason === n) return false; it.reason = n; }),
    setCheck: (id, key, value, source) => edit(id, source, (it) => { if (!CHECK_KEYS.has(key) || !CHECK_VALUE_KEYS.has(value) || it.checks[key] === value || state.events.length>=2000) return false; it.checks[key] = value;reopen(it);if(value==="issue"){state.fieldIssues=state.fieldIssues.filter(e=>e.id!==id);state.fieldIssues.push(copy(it));}event("field-check",id,`${key}: ${value}`); }),
    setBatch: (id, batch, source) => edit(id, source, (it) => { const n = cleanText(batch, 24); if (it.batch === n) return false; it.batch = n; }),
    setPhase: (id, phase, source) => edit(id, source, (it) => { const n = PHASES.includes(String(phase)) ? String(phase) : ""; if (it.phase === n) return false; it.phase = n; }),
    setTeam: (id, team, source) => edit(id, source, (it) => { const n = cleanText(team, 40); if (it.team === n) return false; it.team = n; }),
    /** The planner's chosen intervention (a key from intervention.js, or "" to go back to the suggestion), who reviewed it and when. */
    setIntervention: (id, key, source) => edit(id, source, (it) => { if (key !== "" && !INTERVENTION_KEYS.has(key)) return false; if (it.intervention === key) return false; it.intervention = key; }),
    setInterventionBy: (id, text, source) => edit(id, source, (it) => { const n = cleanText(text, 60); if (it.interventionBy === n) return false; it.interventionBy = n; }),
    setInterventionOn: (id, date, source) => edit(id, source, (it) => { const n = cleanDate(date); if (it.interventionOn === n) return false; it.interventionOn = n; }),
    /** One readiness field: species, maintainer or establishment (text), or watering (a WATERING key). */
    setReadiness: (id, field, value, source) => edit(id, source, (it) => {
      let n;
      if (field === "watering") { if (!WATERING_KEYS.has(value)) return false; n = value; }
      else if (field === "species" || field === "maintainer") n = cleanText(value, 60);
      else if (field === "establishment") n = cleanText(value, 80);
      else return false;
      if (it[field] === n) return false;
      it[field] = n;
    }),
    /** Store an imported field observation and move a Needs inspection site to Inspected (a person still decides to keep or reject it). */
    setObserved: (id, observed, source) => edit(id, source, (it) => {
      const o = cleanObserved(observed);
      if (!o) return false;
      it.observed = o; it.reviewed = "";
      reopen(it);
      if (hasInspection(it) && (it.status === "needs-inspection" || it.status === "proposed")) it.status = "inspected";
    }),
    setReviewed: (id, decision, source, evidence) => reviewSite(id,decision,evidence,source),
    clear(source) { if (state.items.length || state.trees.length || state.snapshot || state.events.length) { state = {...sanitiseAll(null),settings:state.settings}; save(source); } },
    counts() {
      const by = Object.fromEntries(STATUSES.map((s) => [s.key, 0]));
      for (const x of state.items) by[x.status] += 1;
      return { total: state.items.length, by };
    },
    settings: () => ({ ...state.settings }),
    setSetting(key, value, source) {
      if (!(key in state.settings)) return;
      const next = cleanSettings({ ...state.settings, [key]: value });
      if (next[key] === state.settings[key]) return;
      state.settings = next;
      save(source);
    },
    // tree records: only for a site recorded as Planted; observations are the planner's own entries
    trees: () => state.trees.map(copy),
    addTree({ site_id, species, planted_on, lat, lon, owner, next_inspection }, source) {
      const site = find(site_id);
      if (!site || site.status !== "planted" || state.trees.length >= MAX_TREES) return null;
      let n = 1; while (tree(`T${n}`)) n += 1;
      const t = cleanTree({ id: `T${n}`, site_id, species, planted_on, lat, lon, owner, next_inspection, observations: [] }, new Set());
      if (!t || !t.species || !t.planted_on) return null;
      state.trees.push(t);
      save(source);
      return t.id;
    },
    setTreeField(treeId, field, value, source) {
      const t = tree(treeId);
      if (!t || !["species", "owner", "next_inspection", "planted_on"].includes(field)) return;
      const next = cleanTree({ ...t, [field]: value }, new Set())?.[field];
      if (next === undefined || (field === "planted_on" && !next) || next === t[field]) return;
      t[field] = next;
      save(source);
    },
    addObservation(treeId, { date, condition, note }, source) {
      const t = tree(treeId);
      if (!t || !validDate(date) || !CONDITION_LABEL[condition] || t.observations.length >= MAX_OBSERVATIONS) return false;
      t.observations.push({ date, condition, note: cleanText(note, 200) });
      t.observations.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      save(source);
      return true;
    },
    removeTree(treeId, source) {
      const before = state.trees.length;
      state.trees = state.trees.filter((x) => x.id !== treeId);
      if (state.trees.length !== before) save(source);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/** A spreadsheet reads a cell starting with = + - @ as a formula; a leading apostrophe stops that. */
export const safeCell = (text) => (/^[=+\-@\t\r]/.test(String(text)) ? `'${text}` : text);

/** One row per planned site that the current data knows, in plan order, ready for toCsv(rows, PLAN_COLUMNS). trees: the plan's tree records. */
export function planRows(entries, byId, trees = [], snapshot = null) {
  const rows = [];
  for (const e of entries) {
    const f = byId.get(e.id);
    if (!f) continue;
    const c = centroid(f.geometry);
    const fe = feasibility(e);
    const ready = readiness(e, trees.filter((t) => t.site_id === e.id));
    const value = (k) => ready.rows.find((r) => r.key === k).value;
    rows.push({
      site_id: e.id, status: STATUS_LABEL[e.status], note: safeCell(e.note), reason: safeCell(e.reason), batch: safeCell(e.batch), phase: e.phase, team: safeCell(e.team),
      feasibility: fe.label, unresolved: CHECKS.length - fe.ok,
      snapshot_id: snapshot?.id??"",data_version:snapshot?.data_version??"",original_rank:snapshot?.candidates.find(f=>f.properties.site_id===e.id)?.properties.rank??"",
      replaces_id:e.replaces_id,replacement_id:e.replacement_id,inspection_by:safeCell(e.inspection?.observer??e.observed?.observer??""),inspection_date:e.inspection?.date??e.observed?.date??"",
      review_by:safeCell(e.review?.reviewer??""),review_date:e.review?.date??"",review_decision:e.review?.decision??"",
      observation: e.observed ? `${e.observed.outcome === "agree" ? "Agrees with model" : e.observed.outcome === "disagree" ? "Disagrees with model" : "Insufficient evidence"}${e.reviewed ? `; planner: ${e.reviewed}` : ""}` : "No field observation",
      suggested: suggestIntervention(f.properties).label, intervention: e.intervention ? INTERVENTION_LABEL[e.intervention] : "Not chosen",
      intervention_by: safeCell([e.interventionBy, e.interventionOn].filter(Boolean).join(", ")),
      readiness: ready.label, species: safeCell(value("species")), watering: value("watering"), maintainer: safeCell(value("maintainer")),
      establishment: safeCell(value("establishment")), survival: value("survival"),
      rank: f.properties.rank, score_total: f.properties.score_total,
      origin: f.properties.origin, lat: c ? Number(c.lat.toFixed(6)) : "", lon: c ? Number(c.lon.toFixed(6)) : "",
      source: f.properties.source ?? "simulated",
      plan_note: "Planner's own entries from a screening tool; example sites (simulated); not inspected or verified.",
    });
  }
  return rows;
}

/** Rows for the blind field sheet: sites marked Needs inspection (optionally one batch), place only (no rank or score), in the columns backend/field_checks.py reads back. */
export function fieldSheetRows(entries, byId, batch = null) {
  const rows = [];
  for (const e of entries) {
    if (e.status !== "needs-inspection" || (batch !== null && e.batch !== batch)) continue;
    const f = byId.get(e.id);
    const c = f ? centroid(f.geometry) : null;
    if (!c) continue;
    rows.push({ site_id: e.id, lat: Number(c.lat.toFixed(6)), lon: Number(c.lon.toFixed(6)), shade_on_path: "", canopy_class: "", path_in_use: "", photo_id: "", notes: "", observer: "", date: "" });
  }
  return rows;
}

/** The four tiles above the plan table: [{ label, value, unit, note }]. */
export function planTiles(counts) {
  return [
    { label: "In the plan", value: String(counts.total), unit: "sites", note: "your shortlist" },
    { label: "Needs inspection", value: String(counts.by["needs-inspection"]), unit: "", note: "to walk first" },
    { label: "Approved", value: String(counts.by.approved), unit: "", note: "recorded by you" },
    { label: "Planted", value: String(counts.by.planted), unit: "", note: "recorded by you" },
  ];
}
