import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlan, CHECKS, hasInspection, planRows, STORAGE_KEY } from "../js/plan.js";
import { makeSnapshot, versionedSheetRows, prepareFieldImport } from "../js/review.js";
import { toCsv } from "../js/csv.js";

const feature = (id, rank) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [[[101,3],[101.001,3],[101.001,3.001],[101,3.001],[101,3]]] }, properties: { site_id: id, rank, score_total: 100-rank, score_cooling: 80, score_connectivity: 60, score_shade: 70, path_length_within_50m: 100, path_canopy_frac_50m: 0.1, canopy_pct_baseline: 5, block_id: `B${rank}`, lst_mean_250m: 40+rank } });
const features = [feature("A",1),feature("B",2),feature("C",3)];
const spec = { features, selectedIds: ["A"], weights: { cooling:45,connectivity:30,shade:25 }, dataVersion:"v1", scoreSource:"ml", createdAt:"2026-10-22T00:00:00Z" };
function setup() { let saved; const storage = { getItem:()=>saved??null,setItem:(_,s)=>{saved=s;} }; const plan=createPlan(storage, { dataVersion:()=>"v1" }); plan.add("A"); assert.equal(plan.freeze(spec),true); return {plan,storage}; }
const review = { reviewer:"Test planner",date:"2026-10-22",reason:"Synthetic test review" };
function preview(plan, extra={}) {
  const sheet=plan.issueSheet(["A"]);
  const rows=versionedSheetRows(plan.snapshot(),["A"],sheet.id).map(r=>({...r,shade_on_path:"none",canopy_class:"sparse",path_in_use:"yes",observer:"Test walker",date:"2026-10-22"}));
  const text=toCsv(rows,Object.keys(rows[0]).map(key=>({key,label:key})));
  return prepareFieldImport(text,{snapshot:plan.snapshot(),currentVersion:"v1",planIds:plan.ids(),knownIds:new Set(["A","B","C"]),sheets:plan.sheets(),filename:"synthetic.csv",digest:"a".repeat(64),today:"2026-10-22",revision:plan.revision(),...extra});
}
test("snapshot is immutable across live reranking and reloads",()=>{
  const {plan,storage}=setup(); const s=plan.snapshot(); s.candidates[0].properties.rank=999;
  assert.equal(plan.snapshot().candidates[0].properties.rank,1);
  assert.equal(createPlan(storage).snapshot().data_version,"v1");
  assert.equal(plan.freeze(spec),false);
  assert.throws(()=>makeSnapshot({...spec,selectedIds:["missing"]}),/site/i);
});
test("versioned sheet is blind and imports compare frozen inputs atomically",()=>{
  const {plan}=setup(), p=preview(plan);
  assert.equal(p.ok,true); assert.equal(p.entries[0].outcome,"agree");
  assert.equal(plan.applyImport(p),true);
  assert.equal(plan.get("A").status,"inspected");
  assert.equal(plan.get("A").observed.provenance.filename,"synthetic.csv");
  assert.equal(plan.applyImport(p),false);
  assert.equal(plan.evidence().imports.length,1);
});
test("stale versions, duplicate content and races cannot change the plan",()=>{
  const {plan}=setup(); assert.equal(preview(plan,{currentVersion:"v2"}).ok,false);
  const p=preview(plan); plan.setNote("A","changed while reading");
  assert.equal(plan.applyImport(p),false); assert.equal(plan.get("A").observed,null);
});
test("status gates need attributed evidence and a human review; checks changing reopen it",()=>{
  const {plan}=setup(); assert.equal(plan.setStatus("A","approved"),false);
  assert.equal(plan.setStatus("A","inspected"),false);
  plan.setInspection("A",{observer:"Walker",date:"2026-10-22",reference:"Synthetic field note"});
  assert.equal(plan.reviewSite("A","kept",review),true);
  assert.equal(plan.setStatus("A","approved"),false);
  for(const c of CHECKS) plan.setCheck("A",c.key,"ok");
  plan.reviewSite("A","kept",review); assert.equal(plan.setStatus("A","approved"),true);
  plan.setCheck("A","utilities","issue"); assert.equal(plan.get("A").status,"inspected");
  assert.equal(plan.get("A").reviewed,"");
});
test("rejection and atomic replacement retain reasons, original IDs and inspection requirements",()=>{
  const {plan}=setup(); assert.equal(plan.reviewSite("A","rejected",{...review,reason:""}),false);
  assert.equal(plan.reviewSite("A","rejected",review),true);
  assert.equal(plan.replace("A","B",review),true);
  assert.equal(plan.get("A").replacement_id,"B");
  assert.equal(plan.get("B").replaces_id,"A");
  assert.equal(plan.get("B").status,"needs-inspection");
  assert.equal(plan.replace("A","C",review),false);
  plan.remove("A"); assert.equal(plan.add("A"),false);
  assert.ok(plan.evidence().events.some(e=>e.type==="replacement"));
});
test("old observations stay unverified and storage failures are visible without losing session records",()=>{
 const plan=createPlan({getItem:()=>null,setItem:()=>{throw new Error("quota");}});
 plan.add("A");plan.setObserved("A",{shade_on_path:"none",canopy_class:"sparse",path_in_use:"yes",outcome:"agree",differences:[]});
 assert.equal(plan.get("A").observed.outcome,"insufficient");
 assert.equal(plan.persisted(),false);assert.equal(plan.has("A"),true);
 assert.equal(plan.setStatus("A","__proto__"),false);
});

test("invalid partial imports have safe preview rows and incomplete rows still need provenance",()=>{
 const {plan}=setup(); plan.add("B");const sheet=plan.issueSheet(["A","B"]);
 const rows=versionedSheetRows(plan.snapshot(),["A","B"],sheet.id).map(r=>({...r,shade_on_path:"none",canopy_class:"sparse",path_in_use:"yes",observer:"Synthetic walker",date:"2026-10-22"}));
 const run=()=>prepareFieldImport(toCsv(rows,Object.keys(rows[0]).map(key=>({key,label:key}))),{snapshot:plan.snapshot(),currentVersion:"v1",planIds:plan.ids(),knownIds:new Set(["A","B"]),sheets:plan.sheets(),revision:plan.revision(),digest:"b".repeat(64),today:"2026-10-22"});
 rows[1].shade_on_path="invalid";let result=run();assert.equal(result.ok,false);assert.ok(result.entries.every(e=>Array.isArray(e.differences)));
 rows[1].shade_on_path="";rows[1].snapshot_id="wrong";result=run();assert.equal(result.ok,false);assert.match(result.problems.join(" "),/snapshot/);
});
test("unverified imports never advance inspection and exports preserve insufficient outcome",()=>{
 const {plan}=setup();const csv="site_id,lat,lon,shade_on_path,canopy_class,path_in_use,photo_id,notes,observer,date\nA,3,101,none,sparse,yes,,,,";
 const result=prepareFieldImport(csv,{snapshot:plan.snapshot(),currentVersion:"v1",planIds:plan.ids(),knownIds:new Set(["A"]),allowLegacy:true,revision:plan.revision(),digest:"c".repeat(64)});
 assert.equal(result.ok,true);assert.equal(plan.applyImport(result),true);assert.equal(hasInspection(plan.get("A")),false);assert.equal(plan.get("A").status,"proposed");
 assert.match(planRows(plan.list(),new Map(features.map(f=>[f.properties.site_id,f])))[0].observation,/insufficient/i);
});
test("removed field issues survive reload and re-add until attributed resolution",()=>{
 const {plan,storage}=setup();plan.add("B");plan.setCheck("B","utilities","issue");plan.remove("B");
 const restored=createPlan(storage,{dataVersion:()=>"v1"});assert.equal(restored.excluded().has("B"),true);assert.equal(restored.add("B"),true);assert.equal(restored.get("B").checks.utilities,"issue");
 restored.setInspection("B",{observer:"Synthetic inspector",date:"2026-10-22",reference:"Synthetic resolution"});for(const c of CHECKS)restored.setCheck("B",c.key,"ok");assert.equal(restored.excluded().has("B"),true);
 restored.reviewSite("B","kept",review);assert.equal(restored.excluded().has("B"),false);
});

test("legacy approval cannot advance to planted without supporting approval evidence",()=>{
 const plan=createPlan({getItem:()=>JSON.stringify({v:2,items:[{id:"A",status:"approved"}]}),setItem(){}});
 assert.equal(plan.get("A").status,"approved");assert.equal(plan.setStatus("A","planted"),false);
});
test("inspection and review dates cannot be future-dated or review an inspection before it happened",()=>{
 const plan=createPlan(null,{today:()=>"2026-10-22"});plan.add("A");
 assert.equal(plan.setInspection("A",{observer:"Synthetic",date:"2026-10-23",reference:"Synthetic"}),false);
 plan.setInspection("A",{observer:"Synthetic",date:"2026-10-22",reference:"Synthetic"});
 assert.equal(plan.reviewSite("A","kept",{...review,date:"2026-10-21"}),false);
 assert.equal(plan.reviewSite("A","rejected",{...review,date:"2026-10-23"}),false);
});
