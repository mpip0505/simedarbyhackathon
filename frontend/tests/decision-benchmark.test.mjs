import { test } from "node:test";
import assert from "node:assert/strict";
import { decisionBenchmark } from "../js/decision-benchmark.js";

const candidates=Array.from({length:8},(_,i)=>({properties:{site_id:`S${i}`,rank:i+1,lst_mean_250m:30+i,canopy_pct_baseline:i*10,block_id:`B${Math.floor(i/2)}`}}));
const snapshot={id:"snap",data_version:"v1",selected_ids:["S0","S1"],candidates};
const reach={stale:false,data_version:"v1",sites:Object.fromEntries(candidates.map((f,i)=>[f.properties.site_id,[[i,i+1],[Math.floor(i/2)],[i%3]]])),totals:{footpath_samples:9,homes:4,gap_samples:3},sample_step_m:{footpath:10,gap:10}};
const conflicts={stale:false,data_version:"v1",sites:Object.fromEntries(candidates.map((f,i)=>[f.properties.site_id,{state:i%2?"review":"no-trigger",flags:[],unknown_layers:[],distances_m:{}}]))};
test("every method has equal size and excludes the same known rejections and field issues",()=>{
 const entries=[{id:"S0",status:"rejected",checks:{}},{id:"S1",status:"proposed",checks:{utilities:"issue"}}];
 const r=decisionBenchmark(snapshot,entries,reach,conflicts);
 assert.equal(r.state,"ready");assert.equal(r.random.draws,500);
 for(const row of r.methods){assert.equal(row.ids.length,2);assert.ok(!row.ids.includes("S0")&&!row.ids.includes("S1"));}
 assert.deepEqual(r.methods.find(r=>r.method==="heat-only").ids,["S7","S6"]);
 assert.deepEqual(r.methods.find(r=>r.method==="canopy-gap-only").ids,["S2","S3"]);
});
test("seeded random distributions reproduce exactly and unique reach is not summed",()=>{
 const r=decisionBenchmark(snapshot,[],reach,conflicts);
 assert.deepEqual(r,decisionBenchmark(snapshot,[],reach,conflicts));
 assert.equal(r.original.metrics.footpath_m,30);
 assert.ok(r.random.metrics.footpath_m.p05<=r.random.metrics.footpath_m.median);
 assert.ok(r.random.metrics.footpath_m.median<=r.random.metrics.footpath_m.p95);
 assert.equal(r.original.metrics.inspected,null);
});
test("missing/stale reach and insufficient eligible populations are explicit",()=>{
 assert.equal(decisionBenchmark(snapshot,[],{...reach,stale:true},conflicts).methods[0].metrics.footpath_m,null);
 assert.equal(decisionBenchmark(snapshot,[],{...reach,data_version:"v2"},conflicts).methods[0].metrics.footpath_m,null);
 assert.equal(decisionBenchmark(snapshot,[],reach,conflicts,{excluded:new Set(candidates.map(f=>f.properties.site_id))}).state,"insufficient");
 assert.equal(decisionBenchmark(null,[],reach,conflicts).state,"no-snapshot");
});
test("random field-evidence distributions include selections with zero inspections",()=>{
 const entries=[{id:"S0",status:"inspected",inspection:{observer:"Synthetic",date:"2026-10-22",reference:"Fixture"},checks:{}}];
 const r=decisionBenchmark(snapshot,entries,reach,conflicts);
 assert.equal(r.random.metrics.inspected.median,0);
 assert.equal(r.methods.find(r=>r.method==="heat-only").metrics.inspected,0);
});
