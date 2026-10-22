// Frozen evidence and blind-sheet provenance. These are local planning records, not an authenticated audit log.
import { centroid } from "./csv.js";
import { FIELD_SHEET_COLUMNS } from "./plan.js";
import { compareObservation, parseCsv, readFieldSheet } from "./observations.js";

export const VERSION_COLUMNS = ["data_version", "snapshot_id", "sheet_id"];
export const id = () => globalThis.crypto.randomUUID();
export const dateOK = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v;
export const short = (v, max=280) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max) : "";
const FIELDS = ["site_id","rank","source","origin","score_total","score_cooling","score_connectivity","score_shade","path_length_within_50m","path_canopy_frac_50m","canopy_pct_baseline","block_id","lst_mean_250m","lst_c_mean","ndvi_mean"];
const safeId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v);

export function makeSnapshot({features,selectedIds,weights,dataVersion,scoreSource,createdAt=new Date().toISOString()}) {
  if (!short(dataVersion,80) || !Array.isArray(features) || !features.length || features.length>5000 || !Array.isArray(selectedIds) || !selectedIds.length || selectedIds.length>300 || new Set(selectedIds).size!==selectedIds.length) throw new Error("A data version and a nonempty, unique shortlist are required.");
  const candidates=features.map(f=>({type:"Feature",geometry:JSON.parse(JSON.stringify(f.geometry)),properties:Object.fromEntries(FIELDS.filter(k=>Object.hasOwn(f.properties,k)).map(k=>[k,f.properties[k]]))}));
  const ids=new Set(candidates.map(f=>f.properties.site_id));
  if(ids.size!==candidates.length || candidates.some(f=>!safeId(f.properties.site_id)||!Number.isInteger(f.properties.rank)||f.properties.rank<1||!centroid(f.geometry)) || selectedIds.some(s=>!ids.has(s))) throw new Error("Snapshot site IDs, ranks or geometry are invalid.");
  const keys=["cooling","connectivity","shade"], values=keys.map(k=>weights?.[k]);
  if(values.some(v=>!Number.isFinite(v)||v<0)||values.reduce((a,b)=>a+b,0)<=0) throw new Error("Snapshot weights must be nonnegative and not all zero.");
  const sum=values.reduce((a,b)=>a+b,0);
  return {id:id(),created_at:createdAt,data_version:short(dataVersion,80),score_source:short(scoreSource,30),weights:Object.fromEntries(keys.map((k,i)=>[k,values[i]/sum])),selected_ids:[...selectedIds],candidates};
}

export function cleanSnapshot(raw) {
  if(!raw||!short(raw.id,80)) return null;
  try {
    const s=makeSnapshot({features:raw.candidates,selectedIds:raw.selected_ids,weights:raw.weights,dataVersion:raw.data_version,scoreSource:raw.score_source,createdAt:raw.created_at});
    return {...s,id:short(raw.id,80)};
  } catch { return null; }
}

export function versionedSheetRows(snapshot, ids, sheetId) {
  if(!snapshot) return [];
  const byId=new Map(snapshot.candidates.map(f=>[f.properties.site_id,f]));
  return [...new Set(ids)].map(sid=>{
    const f=byId.get(sid),c=f?centroid(f.geometry):null;
    if(!c) return null;
    return {site_id:sid,lat:Number(c.lat.toFixed(6)),lon:Number(c.lon.toFixed(6)),...Object.fromEntries(FIELD_SHEET_COLUMNS.slice(3).map(k=>[k,""])),data_version:snapshot.data_version,snapshot_id:snapshot.id,sheet_id:sheetId};
  }).filter(Boolean);
}

/** Preview only. The plan store checks revision, source context and all rows again before committing. */
export function prepareFieldImport(text, ctx) {
  const base={ok:false,problems:[],entries:[],insufficient:[],revision:ctx.revision,snapshot_id:ctx.snapshot?.id,data_version:ctx.currentVersion,filename:short(ctx.filename,120),digest:ctx.digest,original_csv:text};
  if(!ctx.snapshot || !ctx.currentVersion || ctx.snapshot.data_version!==ctx.currentVersion) return {...base,problems:["Freeze a shortlist on the current data version before importing. The original snapshot may be stale."]};
  const result=readFieldSheet(text,ctx);
  if(!result.ok) return {...base,problems:result.problems,insufficient:result.insufficient,ignored:result.ignored};
  const rows=parseCsv(text),head=rows[0].map(s=>s.trim().toLowerCase());
  const meta=VERSION_COLUMNS.every(k=>head.includes(k));
  if(!meta&&!ctx.allowLegacy) return {...base,problems:["This legacy sheet has no snapshot/data/sheet identifiers. Enable legacy preview explicitly; it cannot support approval."]};
  const byId=new Map(ctx.snapshot.candidates.map(f=>[f.properties.site_id,f]));
  const entries=[],problems=[];
  for(const row of [...result.entries,...result.insufficient]) {
    const raw=rows[row.line-1],get=k=>String(raw[head.indexOf(k)]??"").trim();
    const sheet=ctx.sheets?.find(s=>s.id===get("sheet_id"));
    if(meta&&(get("data_version")!==ctx.currentVersion||get("snapshot_id")!==ctx.snapshot.id||!sheet?.ids.includes(row.site_id))) {problems.push(`row ${row.line}: wrong version, snapshot or issued field sheet`);continue;}
    const f=byId.get(row.site_id),c=f?centroid(f.geometry):null;
    if(!f) {problems.push(`row ${row.line}: site absent from the frozen candidate population`);continue;}
    const lat=Number(get("lat")),lon=Number(get("lon"));
    if(meta&&(!get("lat")||!get("lon")||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat-c.lat)>0.00001||Math.abs(lon-c.lon)>0.00001)) {problems.push(`row ${row.line}: location differs from the issued sheet`);continue;}
    if(get("date")&&ctx.today&&get("date")>ctx.today) {problems.push(`row ${row.line}: inspection date is in the future`);continue;}
    if(row.missing) continue;
    const trusted=meta&&Boolean(row.observer)&&dateOK(row.date);
    const cmp=trusted?compareObservation(row,f.properties):{outcome:"insufficient",differences:["Legacy or unattributed observation: observer, date and issued-sheet provenance are required."]};
    entries.push({...row,...cmp,provenance:{trust:trusted?"versioned":"unverified",filename:base.filename,digest:ctx.digest,data_version:ctx.currentVersion,snapshot_id:ctx.snapshot.id,sheet_id:meta?get("sheet_id"):"",imported_at:new Date().toISOString()},original_rank:f.properties.rank});
  }
  return {...base,ok:!problems.length&&entries.length>0,entries,problems,insufficient:result.insufficient,ignored:result.ignored};
}
