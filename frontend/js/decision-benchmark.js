// Equal-size selection comparisons over one frozen eligible population. Proxy reach is not independent outcome evidence.
import { unionReach } from "./pilot.js";
import { conflictFor } from "./screening.js";
import { hasInspection } from "./plan.js";

const quantile=(values,p)=>{const v=[...values].sort((a,b)=>a-b),i=(v.length-1)*p,l=Math.floor(i);return v[l]+(v[Math.ceil(i)]-v[l])*(i-l);};
function generator(seed) {
  let n=seed>>>0;
  return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
const finite=(v)=>typeof v==="number"&&Number.isFinite(v);

export function decisionBenchmark(snapshot,entries,reachSets,conflicts,{draws=500,seed=20261022,excluded=new Set()}={}) {
  if(!snapshot)return {state:"no-snapshot",note:"Freeze an original shortlist before benchmarking."};
  if(!Number.isInteger(draws)||draws<100||draws>2000||!Number.isInteger(seed))throw new Error("Use 100–2000 draws and an integer seed.");
  const n=snapshot.selected_ids.length,byId=new Map(snapshot.candidates.map(f=>[f.properties.site_id,f]));
  const records=new Map(entries.map(e=>[e.id,e]));
  const hasFieldEvidence=entries.some(e=>hasInspection(e));
  const rejected=new Set([...excluded,...entries.filter(e=>e.status==="rejected"||Object.values(e.checks??{}).includes("issue")).map(e=>e.id)]);
  const eligible=snapshot.candidates.filter(f=>!rejected.has(f.properties.site_id)&&finite(f.properties.lst_mean_250m)&&finite(f.properties.canopy_pct_baseline));
  const reach=reachSets?.stale===false&&reachSets.data_version===snapshot.data_version?reachSets:null;
  const maps=conflicts?.data_version===snapshot.data_version?conflicts:null;
  const metrics=(ids)=>{
    const r=unionReach(reach,ids),observed=ids.map(s=>records.get(s)).filter(e=>e&&hasInspection(e));
    return {footpath_m:r?.footpath_m??null,homes:r?.homes??null,gap_m:r?.gap_m??null,blocks:new Set(ids.map(s=>byId.get(s)?.properties.block_id).filter(Boolean)).size,
      mapped_review:ids.filter(s=>conflictFor(maps,s).state==="review").length,map_unknown:ids.filter(s=>conflictFor(maps,s).state==="unknown").length,
      inspected:hasFieldEvidence?observed.length:null,reviewed:hasFieldEvidence?observed.filter(e=>e.review).length:null,
      field_disagreements:hasFieldEvidence?observed.filter(e=>e.observed?.outcome==="disagree").length:null};
  };
  const original={ids:[...snapshot.selected_ids],metrics:metrics(snapshot.selected_ids)};
  const revisedIds=entries.filter(e=>e.status!=="rejected"&&byId.has(e.id)).map(e=>e.id);
  const revised={ids:revisedIds,metrics:metrics(revisedIds)};
  const common={n,eligible_count:eligible.length,population_count:snapshot.candidates.length,excluded_ids:[...rejected].sort(),original,revised,
    snapshot_id:snapshot.id,data_version:snapshot.data_version,
    note:"Proxy comparisons, not independent proof of effectiveness. All compared methods use the same eligible pool and site count; the original/revised plans are reference rows. A mapped trigger is unresolved, not a confirmed rejection. Null field-evidence counts mean no attributed inspection has been recorded anywhere in this plan; zero means none in that selection."};
  if(eligible.length<n)return {...common,state:"insufficient",methods:[],note:`Only ${eligible.length} eligible sites for a ${n}-site comparison. No smaller sample is substituted.`};
  const tie=(a,b)=>a.properties.site_id.localeCompare(b.properties.site_id);
  const byRank=(a,b)=>a.properties.rank-b.properties.rank||tie(a,b);
  const conflictOrder=(f)=>({"no-trigger":0,review:1,unknown:2}[conflictFor(maps,f.properties.site_id).state]??2);
  const specs=[
    ["multi-objective",byRank],
    ["heat-only",(a,b)=>b.properties.lst_mean_250m-a.properties.lst_mean_250m||tie(a,b)],
    ["canopy-gap-only",(a,b)=>a.properties.canopy_pct_baseline-b.properties.canopy_pct_baseline||tie(a,b)],
    ["constraint-aware",(a,b)=>conflictOrder(a)-conflictOrder(b)||byRank(a,b)],
  ];
  const methods=specs.map(([method,sort])=>{const ids=[...eligible].sort(sort).slice(0,n).map(f=>f.properties.site_id);return {method,ids,metrics:metrics(ids)};});
  const random=generator(seed),samples=[];
  const pool=[...eligible].sort(tie).map(f=>f.properties.site_id);
  for(let draw=0;draw<draws;draw++){
    const shuffled=[...pool];
    for(let i=0;i<n;i++){const j=i+Math.floor(random()*(shuffled.length-i));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
    samples.push(metrics(shuffled.slice(0,n)));
  }
  const distribution=Object.fromEntries(Object.keys(samples[0]).map(key=>{
    const values=samples.map(m=>m[key]).filter(finite);
    return [key,values.length?{p05:quantile(values,0.05),median:quantile(values,0.5),p95:quantile(values,0.95)}:null];
  }));
  return {...common,state:"ready",methods,random:{seed,draws,algorithm:"mulberry32 + partial Fisher-Yates without replacement; linearly interpolated quantiles",metrics:distribution},eligible_ids:pool};
}
