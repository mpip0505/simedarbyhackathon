// Evidence workflow UI. Source text is always rendered as text; CSV files are previewed before any plan mutation.
import { el } from "./dom.js";
import { toCsv } from "./csv.js";
import { prepareFieldImport, versionedSheetRows, VERSION_COLUMNS } from "./review.js";
import { FIELD_SHEET_COLUMNS, safeCell } from "./plan.js";
import { suggestAlternatives, unionReach } from "./pilot.js";
import { conflictFor } from "./screening.js";
import { decisionBenchmark } from "./decision-benchmark.js";

const number=v=>v===null||v===undefined?"Unavailable":Number(v).toLocaleString("en-GB",{maximumFractionDigits:1});
const columns=rows=>Object.keys(rows[0]).map(key=>({key,label:key}));
export function createReviewUI(plan,ctx,redraw) {
  let pending=null,notice="",allowLegacy=false,replacePrevious=false,busy=false;
  const drafts=new Map();
  const draft=(e)=>{if(!drafts.has(e.id))drafts.set(e.id,{observer:"",date:ctx.today(),reference:"",reviewer:"",reviewDate:ctx.today(),reason:e.reason||""});return drafts.get(e.id);};
  const field=(state,key,label,type="text",max=280)=>el("label",{class:"pp-field"},el("span",{},label),el("input",{class:"input",type,value:state[key],maxlength:String(max),"data-key":`${state.id??"review"}:${key}`,onchange:e=>{state[key]=e.target.value;}}));
  const say=(message)=>{notice=message;redraw();};
  function snapshotPanel() {
    if(!plan.list().length){drafts.clear();pending=null;}
    const s=plan.snapshot(),meta=ctx.meta?.();
    return el("section",{class:"card pp-section","aria-labelledby":"review-snapshot-heading"},el("h2",{id:"review-snapshot-heading"},"Original shortlist and evidence"),
      el("p",{class:"small-note"},s?`Frozen ${s.created_at}: ${s.selected_ids.length} original sites; data ${s.data_version}; source ${s.score_source}. Weights: heat ${Math.round(s.weights.cooling*100)}%, corridor ${Math.round(s.weights.connectivity*100)}%, shade ${Math.round(s.weights.shade*100)}%. Live slider changes do not alter this record.`:"Freeze the active shortlist before sending a blind field sheet. Original ranks, weights, measured inputs and the full candidate population will be saved for comparison."),
      s&&s.data_version!==meta?.data_version?el("p",{class:"notice notice-bad"},"The frozen snapshot is from another data version. Export it for reference; start a new cycle on current data before importing or reviewing."):null,
      el("div",{class:"plan-actions"},
        el("button",{type:"button",class:"btn btn-primary btn-sm",disabled:Boolean(s)||!plan.list().length,onclick:()=>{const ok=plan.freeze({features:ctx.ranked(),weights:ctx.weights(),dataVersion:meta?.data_version,scoreSource:meta?.score_source});say(ok?"Original shortlist frozen. Export the blind field sheet next.":plan.problem());}},"Freeze original shortlist"),
        el("button",{type:"button",class:"btn btn-secondary btn-sm",disabled:!s,onclick:exportEvidence},"Download evidence package (JSON)")),
      el("p",{class:"small-note"},"Local planner records, editable on this device; this is not a shared or tamper-proof audit log. Keep downloaded evidence packages before clearing the plan."),
      !plan.persisted()?el("p",{class:"notice notice-bad",role:"alert"},"Browser saving is unavailable or full. Changes exist only in this session. Download the evidence package before leaving."):null,
      el("p",{role:"status",class:"plan-say","data-review-notice":true},notice));
  }
  function reviewForm(e) {
    const d=draft(e);d.id=e.id;
    return el("details",{class:"pp-checks","data-key":`review:${e.id}`},el("summary",{},"Record inspection and human review"),
      el("p",{class:"small-note"},"Mapped triggers and imported shade observations do not confirm land permission or planting suitability. All five field checks remain separate. Keeping a site is not planting approval."),
      el("div",{class:"pp-grid"},field(d,"observer",`Inspector for ${e.id}`,"text",60),field(d,"date",`Inspection date for site ${e.id}`,"date",10),field(d,"reference",`Evidence reference for ${e.id}`)),
      el("button",{type:"button",class:"btn btn-secondary btn-sm",onclick:()=>say(plan.setInspection(e.id,{observer:d.observer,date:d.date,reference:d.reference},"pilot")?"Attributed inspection recorded; review is required.":"Enter an inspector, valid date and evidence reference.")},"Record inspection evidence"),
      e.inspection?el("p",{class:"small-note"},`Inspection: ${e.inspection.observer}, ${e.inspection.date}; ${e.inspection.reference}`):null,
      el("div",{class:"pp-grid"},field(d,"reviewer",`Reviewer for ${e.id}`,"text",60),field(d,"reviewDate",`Review date for ${e.id}`,"date",10),field(d,"reason",`Review reason for ${e.id}`)),
      el("div",{class:"plan-actions"},[ ["kept","Keep the site"],["rejected","Reject and find replacement"] ].map(([decision,label])=>el("button",{type:"button",class:"btn btn-secondary btn-sm",onclick:()=>say(plan.reviewSite(e.id,decision,{reviewer:d.reviewer,date:d.reviewDate,reason:d.reason},"pilot")?`Human decision recorded: ${decision}. ${decision==="kept"?"Approval still needs all five checks OK.":"Review replacement options below."}`:plan.problem())},label))),
      e.review?el("p",{class:"small-note"},`Decision: ${e.review.decision}, ${e.review.reviewer}, ${e.review.date}; ${e.review.reason}`):null);
  }
  function replacements(e) {
    const s=plan.snapshot();
    if(e.replacement_id)return el("p",{class:"small-note"},`Replaced by ${e.replacement_id}. The rejected original remains in the evidence trail.`);
    if(!s)return el("p",{class:"small-note"},"Freeze the original candidate population before choosing a traceable replacement.");
    const excluded=new Set([...plan.ids(),...plan.excluded(),...plan.list().filter(x=>Object.values(x.checks).includes("issue")).map(x=>x.id)]);
    const alts=suggestAlternatives(e.id,s.candidates.slice().sort((a,b)=>a.properties.rank-b.properties.rank),excluded,3);
    const reach=ctx.reachSets()?.data_version===s.data_version&&ctx.reachSets()?.stale===false?ctx.reachSets():null;
    const active=plan.list().filter(x=>x.status!=="rejected").map(x=>x.id),before=unionReach(reach,active);
    return el("div",{class:"pp-alts"},el("p",{class:"small-note"},"Eligible frozen alternatives (known rejected sites and field issues excluded; mapped triggers remain unresolved):"),
      alts.length?el("ul",{class:"pp-alt-list"},alts.map(a=>{
        const map=conflictFor(ctx.conflicts?.(),a.id),after=unionReach(reach,[...active,a.id]);
        return el("li",{},`${a.id}: original rank #${a.rank}; mapped screen ${map.state}. `,
          before&&after?`Adding it changes unique reach by ${after.footpath_m-before.footpath_m} m footpath, ${after.homes-before.homes} mapped buildings, ${after.gap_m-before.gap_m} m corridor gap. `:"Reach comparison unavailable. ",
          el("button",{type:"button",class:"btn btn-secondary btn-sm",onclick:()=>say(plan.replace(e.id,a.id,{reviewer:e.review?.reviewer,date:ctx.today(),reason:`Replacement for ${e.id}: ${e.reason}`})?`${a.id} added as Needs inspection; replacement link recorded.`:"Replacement was not applied. Check current data, eligibility and the original rejection review.")},"Replace and mark Needs inspection"));
      })):el("p",{class:"small-note"},"No eligible frozen alternative remains."));
  }
  function downloadSheet(batch=null) {
    const ids=plan.list().filter(e=>e.status==="needs-inspection"&&(batch===null||e.batch===batch)).map(e=>e.id);
    const sheet=plan.issueSheet(ids);
    if(!sheet){say("Freeze a current shortlist and mark sites Needs inspection before downloading a versioned sheet.");return;}
    const rows=versionedSheetRows(plan.snapshot(),ids,sheet.id);
    ctx.download("elmina-field-sheet.csv",toCsv(rows,[...FIELD_SHEET_COLUMNS,...VERSION_COLUMNS].map(key=>({key,label:key}))));
    say(`Field sheet made for ${rows.length} sites: place and opaque provenance only, no rank or score.`);
  }
  function importControls() {
    return el("div",{},
      el("p",{class:"plan-say",role:"status"},notice),
      el("label",{class:"conflict-filter"},el("input",{type:"checkbox",checked:allowLegacy,onchange:e=>{allowLegacy=e.target.checked;pending=null;redraw();}}),"Allow unversioned legacy preview (unverified; cannot support approval)"),
      el("label",{class:"conflict-filter"},el("input",{type:"checkbox",checked:replacePrevious,onchange:e=>{replacePrevious=e.target.checked;}}),"Replace previous observations for corrections (reopens review)"),
      el("label",{class:"pp-field"},el("span",{},"Import completed field sheet"),el("input",{id:"pilot-import-file",type:"file",accept:".csv,text/csv",disabled:busy,onchange:async e=>{
        const file=e.target.files?.[0];e.target.value="";if(!file)return;
        if(file.size>1_000_000){say("File exceeds the 1 MB limit. Nothing changed.");return;}
        const revision=plan.revision();busy=true;pending=null;redraw();
        try {
          const text=await file.text(),bytes=new TextEncoder().encode(text),hash=await crypto.subtle.digest("SHA-256",bytes);
          const digest=[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,"0")).join("");
          pending=prepareFieldImport(text,{snapshot:plan.snapshot(),currentVersion:ctx.meta?.()?.data_version,knownIds:new Set(ctx.byId().keys()),planIds:plan.ids(),sheets:plan.sheets(),revision,filename:file.name,digest,today:ctx.today(),allowLegacy});
          notice=pending.ok?"Preview ready. No observation has been saved yet.":"This file was not imported. Nothing in your plan changed.";
        } catch(error){notice=`File could not be previewed: ${error.message}. Nothing changed.`;}finally{busy=false;redraw();}
      }})),
      pending?el("div",{class:"pp-import-preview","data-import-preview":pending.ok?"ready":"invalid"},
        el("p",{},`Source: ${pending.filename}; SHA-256 ${pending.digest}. ${pending.entries.length} complete rows; ${pending.insufficient.length} incomplete rows left out.`),
        el("ul",{class:"pp-problems"},pending.problems.map(p=>el("li",{},p))),
        el("ul",{class:"small-note"},pending.entries.map(o=>el("li",{},`${o.site_id}: ${o.outcome}; original rank #${o.original_rank}; ${o.observer||"observer missing"}, ${o.date||"date missing"}. ${(o.differences??[]).join(" ")}`))),
        el("button",{type:"button",class:"btn btn-primary btn-sm",disabled:!pending.ok,onclick:()=>{
          if(plan.applyImport(pending,{replace:replacePrevious})){const counts={agree:0,disagree:0,insufficient:0};for(const o of pending.entries)counts[o.outcome]++;notice=`Imported ${pending.entries.length} observations: ${counts.agree} agree, ${counts.disagree} differ, ${counts.insufficient} insufficient. Review each site.`;pending=null;redraw();}else say(plan.problem());
        }},"Confirm field import"),
        el("button",{type:"button",class:"btn btn-ghost btn-sm",onclick:()=>{pending=null;say("Preview discarded. No observations changed.");}},"Discard preview")):null);
  }
  function benchmark() {return decisionBenchmark(plan.snapshot(),plan.list(),ctx.reachSets(),ctx.conflicts?.(),{excluded:plan.excluded()});}
  function exportEvidence() {const packet=plan.evidence();packet.benchmark=benchmark();packet.current_data_version=ctx.meta?.()?.data_version;ctx.download("elmina-pilot-evidence.json",JSON.stringify(packet,null,2),"application/json");}
  function benchmarkPanel() {
    const report=benchmark(),s=plan.snapshot();
    const labels={"multi-objective":"Multi-objective (frozen weights)","heat-only":"Heat only","canopy-gap-only":"Canopy gap only","constraint-aware":"Constraint aware (unresolved flags last)"};
    const cells=m=>[m.footpath_m,m.homes,m.gap_m,m.blocks,m.mapped_review,m.map_unknown,m.inspected,m.reviewed].map(v=>el("td",{class:"num"},number(v)));
    const row=(label,ids,m)=>el("tr",{},el("th",{scope:"row"},label),el("td",{class:"num"},String(ids.length)),cells(m));
    const random=report.random;
    return el("section",{class:"card pp-section","aria-labelledby":"decision-benchmark-heading"},el("h2",{id:"decision-benchmark-heading"},"Original, revised and baseline shortlists"),
      !s?el("p",{},report.note):[
        el("p",{class:"small-note"},`Frozen data ${s.data_version}; ${report.eligible_count} of ${report.population_count} candidates eligible; compared count ${report.n}. Exclude recorded rejections/field issues from every method. The comparison pool also requires both heat and baseline canopy inputs.`),
        el("div",{class:"table-scroll"},el("table",{class:"plan-table"},el("caption",{class:"sr-only"},"Unique reach and evidence coverage of original, revised and equal-size baseline selections"),el("thead",{},el("tr",{},["Selection","Sites","Footpath (m)","Buildings","Gap (m)","Areas","Map review","Map unknown","Inspected","Reviewed"].map(h=>el("th",{scope:"col"},h)))),
          el("tbody",{},row("Original (reference)",report.original.ids,report.original.metrics),row("Revised active (reference)",report.revised.ids,report.revised.metrics),...(report.methods??[]).map(r=>row(labels[r.method],r.ids,r.metrics)),
            random?el("tr",{},el("th",{scope:"row"},"Random: median [p05–p95]"),el("td",{},String(report.n)),["footpath_m","homes","gap_m","blocks","mapped_review","map_unknown","inspected","reviewed"].map(key=>{const d=random.metrics[key];return el("td",{class:"num"},d?`${number(d.median)} [${number(d.p05)}–${number(d.p95)}]`:"Unavailable");})):null))),
        el("p",{class:"small-note"},report.note),
        report.original.metrics.footpath_m!==null&&report.revised.metrics.footpath_m!==null?el("p",{class:"small-note"},`Revised minus original unique reach: ${number(report.revised.metrics.footpath_m-report.original.metrics.footpath_m)} m footpath; ${number(report.revised.metrics.homes-report.original.metrics.homes)} mapped buildings; ${number(report.revised.metrics.gap_m-report.original.metrics.gap_m)} m corridor gap. Reference counts may differ; compare the equal-size methods for a controlled comparison.`):null,
        random?el("p",{class:"small-note"},`${random.draws} random draws, seed ${random.seed}; sampled without replacement. ${random.algorithm}. Heat/canopy reach metrics overlap the model's inputs and are not independent evidence of benefit.`):null,
        el("button",{type:"button",class:"btn btn-secondary btn-sm",onclick:()=>{
          const rows=[{selection:"original-reference",site_count:report.original.ids.length,site_ids:report.original.ids.join(";"),...report.original.metrics},{selection:"revised-reference",site_count:report.revised.ids.length,site_ids:report.revised.ids.join(";"),...report.revised.metrics},...(report.methods??[]).map(r=>({selection:r.method,site_count:r.ids.length,site_ids:r.ids.join(";"),...r.metrics}))].map(r=>({...r,snapshot_id:s.id,data_version:s.data_version,random_seed:random?.seed??"",random_draws:random?.draws??"",random_distribution:JSON.stringify(random?.metrics??{}),caveat:safeCell(report.note)}));
          ctx.download("elmina-decision-benchmark.csv",toCsv(rows,columns(rows)));
        }},"Download decision benchmark (CSV)")]);
  }
  return {snapshotPanel,reviewForm,replacements,downloadSheet,importControls,benchmarkPanel,exportEvidence,say};
}
