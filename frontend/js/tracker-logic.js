// The Tracker's logic: which stage a site is in, what to do next, and what is still missing before it can be approved.
// It only reads the plan's entries; it never changes one and never approves anything. Pure functions, no DOM.
import { CHECKS, feasibility, hasInspection } from "./plan.js";

/** The five stages of a site's journey, in order, with the plan status each one stands for. "Not suitable" is a side stage. */
export const STAGES = [
  { key: "shortlisted", status: "proposed", name: "Shortlisted", meaning: "Picked from the ranking" },
  { key: "visit-planned", status: "needs-inspection", name: "Visit planned", meaning: "A person will go and look" },
  { key: "visited", status: "inspected", name: "Visited", meaning: "Results are in: decide" },
  { key: "approved", status: "approved", name: "Approved", meaning: "OK to plant" },
  { key: "planted", status: "planted", name: "Planted", meaning: "Trees are in the ground" },
];
export const NOT_SUITABLE = { key: "not-suitable", status: "rejected", name: "Not suitable", meaning: "Set aside, with a reason" };

const BY_STATUS = Object.fromEntries([...STAGES, NOT_SUITABLE].map((s) => [s.status, s]));

/** The stage an entry is in (an unknown legacy status counts as shortlisted). */
export const stageOf = (entry) => (BY_STATUS[entry.status] ?? STAGES[0]);

/** Entries grouped by stage key, in the order given. Every stage key is present, even when empty. */
export function groupByStage(entries) {
  const groups = Object.fromEntries([...STAGES, NOT_SUITABLE].map((s) => [s.key, []]));
  for (const e of entries) groups[stageOf(e).key].push(e);
  return groups;
}

/** What is still missing before a visited site can be approved, in plain words. An empty list means nothing stands in the way. */
export function approvalGaps(entry) {
  const gaps = [];
  if (!hasInspection(entry)) gaps.push("No visit is recorded yet");
  const f = feasibility(entry);
  if (f.issue) gaps.push(`${f.issue} check${f.issue === 1 ? "" : "s"} found a problem: ${CHECKS.filter((c) => entry.checks[c.key] === "issue").map((c) => c.label.toLowerCase()).join(", ")}`);
  else if (f.unknown) gaps.push(`${f.unknown} of ${CHECKS.length} checks ${f.unknown === 1 ? "is" : "are"} not recorded`);
  return gaps;
}

/**
 * The one thing to do next for a site, and the page that does it: { text, action, label }.
 * action is one of visit, record, decide, plant, trees, or null (nothing to do here); trees is that site's tree records.
 */
export function nextAction(entry, trees = []) {
  switch (entry.status) {
    case "needs-inspection":
      return { text: "Once someone has visited, record what they found.", action: "record", label: "Record the visit" };
    case "inspected": {
      const f = feasibility(entry);
      if (f.state === "all-ok") return { text: "All five checks are OK. Decide: plant here or not.", action: "decide", label: "Decide" };
      if (f.state === "issue") return { text: "A check found a problem. Set the site aside, or correct the visit record.", action: "decide", label: "Decide" };
      return { text: "Some checks are still missing. Complete them, then decide.", action: "record", label: "Edit the visit" };
    }
    case "approved":
      return { text: "Plant it, then mark the site as planted.", action: "plant", label: "Mark as planted" };
    case "planted":
      return trees.length
        ? { text: "Check the trees every few months and record how they are doing.", action: "trees", label: "Trees" }
        : { text: "Record the trees you planted here.", action: "trees", label: "Record trees" };
    case "rejected":
      return { text: entry.reason ? `Set aside: ${entry.reason}` : "Set aside. Add a reason.", action: "rejected", label: "Open" };
    default:
      return { text: "Send someone to visit this site.", action: "visit", label: "Plan the visit" };
  }
}

/** One line over the board: how many sites are in each stage that has any, then how many need a decision from you. */
export function summaryLine(entries) {
  if (!entries.length) return "No sites yet.";
  const groups = groupByStage(entries);
  const parts = STAGES.filter((s) => groups[s.key].length).map((s) => `${groups[s.key].length} ${s.name.toLowerCase()}`);
  if (groups["not-suitable"].length) parts.push(`${groups["not-suitable"].length} not suitable`);
  return `${entries.length} site${entries.length === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}
