// Synthetic, attributed evidence for tests that need later workflow states.
import { CHECKS } from "../js/plan.js";
export const TEST_REVIEW={reviewer:"Synthetic test planner",date:"2026-10-22",reason:"Synthetic test evidence"};
export function recordStatus(plan,id,status,source) {
  if(["inspected","approved","planted"].includes(status))plan.setInspection(id,{observer:"Synthetic test inspector",date:"2026-10-22",reference:"Synthetic fixture, not field data"},source);
  if(["approved","planted"].includes(status)) {
    for(const c of CHECKS)plan.setCheck(id,c.key,"ok",source);
    plan.reviewSite(id,"kept",TEST_REVIEW,source);plan.setStatus(id,"approved",source);
  }
  if(status==="rejected")return plan.reviewSite(id,"rejected",TEST_REVIEW,source);
  if(plan.get(id)?.status===status)return true;
  return plan.setStatus(id,status,source);
}
