import { test } from "node:test";
import assert from "node:assert/strict";
import { NOT_SUITABLE, STAGES, approvalGaps, groupByStage, nextAction, stageOf, summaryLine } from "../js/tracker-logic.js";

const checks = (over = {}) => ({ access: "unknown", utilities: "unknown", space_soil: "unknown", maintenance: "unknown", existing_trees: "unknown", ...over });
const allOk = checks({ access: "ok", utilities: "ok", space_soil: "ok", maintenance: "ok", existing_trees: "ok" });
const site = (id, status, extra = {}) => ({ id, status, checks: checks(), inspection: null, observed: null, review: null, reason: "", ...extra });
const visit = { observer: "A. Tan", date: "2026-11-02", reference: "photo 12" };

test("each plan status lands in one stage, in order, with Not suitable on the side", () => {
  assert.deepEqual(STAGES.map((s) => s.status), ["proposed", "needs-inspection", "inspected", "approved", "planted"]);
  assert.equal(stageOf(site("a", "proposed")).key, "shortlisted");
  assert.equal(stageOf(site("a", "needs-inspection")).key, "visit-planned");
  assert.equal(stageOf(site("a", "inspected")).key, "visited");
  assert.equal(stageOf(site("a", "approved")).key, "approved");
  assert.equal(stageOf(site("a", "planted")).key, "planted");
  assert.equal(stageOf(site("a", "rejected")), NOT_SUITABLE);
  assert.equal(stageOf(site("a", "something-old")).key, "shortlisted");
});

test("grouping keeps every stage, even an empty one, and keeps the order given", () => {
  const groups = groupByStage([site("b", "approved"), site("a", "proposed"), site("c", "proposed"), site("d", "rejected")]);
  assert.deepEqual(Object.keys(groups), ["shortlisted", "visit-planned", "visited", "approved", "planted", "not-suitable"]);
  assert.deepEqual(groups.shortlisted.map((e) => e.id), ["a", "c"]);
  assert.deepEqual(groups["visit-planned"], []);
  assert.equal(groups["not-suitable"].length, 1);
});

test("the next action follows the stage and says what to do", () => {
  assert.equal(nextAction(site("a", "proposed")).action, "visit");
  assert.equal(nextAction(site("a", "needs-inspection")).action, "record");
  assert.equal(nextAction(site("a", "approved")).action, "plant");
  assert.equal(nextAction(site("a", "planted"), []).action, "trees");
  assert.match(nextAction(site("a", "planted"), []).text, /Record the trees/);
  assert.match(nextAction(site("a", "planted"), [{ id: "t1" }]).text, /Check the trees/);
  assert.match(nextAction(site("a", "rejected", { reason: "no access road" })).text, /no access road/);
});

test("a visited site asks for a decision only when the checks allow one; otherwise it asks for the missing checks", () => {
  assert.equal(nextAction(site("a", "inspected", { inspection: visit, checks: allOk })).action, "decide");
  assert.equal(nextAction(site("a", "inspected", { inspection: visit, checks: checks({ access: "ok" }) })).action, "record");
  const problem = nextAction(site("a", "inspected", { inspection: visit, checks: checks({ access: "issue" }) }));
  assert.equal(problem.action, "decide");
  assert.match(problem.text, /problem/);
});

test("approval gaps name what is missing and are empty when nothing stands in the way", () => {
  assert.deepEqual(approvalGaps(site("a", "inspected", { inspection: visit, checks: allOk })), []);
  assert.match(approvalGaps(site("a", "inspected"))[0], /No visit is recorded/);
  assert.match(approvalGaps(site("a", "inspected", { inspection: visit, checks: checks({ access: "ok", utilities: "ok" }) }))[0], /3 of 5 checks are not recorded/);
  assert.match(approvalGaps(site("a", "inspected", { inspection: visit, checks: checks({ access: "issue" }) })).join(" "), /1 check found a problem: land access confirmed/);
});

test("the summary line counts only the stages that have sites", () => {
  assert.equal(summaryLine([]), "No sites yet.");
  assert.equal(summaryLine([site("a", "proposed"), site("b", "proposed"), site("c", "planted"), site("d", "rejected")]),
    "4 sites: 2 shortlisted, 1 planted, 1 not suitable.");
  assert.equal(summaryLine([site("a", "approved")]), "1 site: 1 approved.");
});
