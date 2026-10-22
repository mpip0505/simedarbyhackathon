// "What might this place need?": a screening prompt in Sime Darby Property's Avoid, Regenerate and Conserve terms, kept apart from priority.
// Priority says where to look first; this says which kind of action to discuss there. It is a suggestion from satellite and map proxies only:
// they cannot see tree maturity, native species or habitat quality, so every suggestion needs a person (an ecologist for Protect and Regenerate)
// before anything is decided. The planner's own choice and who reviewed it are stored in the plan (plan.js). Pure functions, no DOM.
import { fmt, fmtMetres } from "./scale.js";
import { MOSTLY_ESTIMATED } from "./drivers.js";

export const CANOPY_NDVI = 0.6;   // same threshold as backend/config.py CANOPY_NDVI_THRESHOLD

export const INTERVENTIONS = [
  { key: "protect", label: "Protect existing vegetation", principle: "Conserve",
    sees: "Preserve valuable existing trees or habitat; field review required", reviewer: "ecologist" },
  { key: "regenerate", label: "Regenerate habitat", principle: "Regenerate",
    sees: "Consider restoration near a gap in the approximate corridor, with ecologist input", reviewer: "ecologist" },
  { key: "plant-shade", label: "Plant for pedestrian shade", principle: "Regenerate",
    sees: "Candidate planting near footpaths the satellite sees as poorly shaded", reviewer: "landscape" },
  { key: "inspect", label: "Inspect before deciding", principle: "Avoid",
    sees: "Priority is known, but what the place needs is unresolved", reviewer: "field" },
];
export const INTERVENTION_LABEL = Object.fromEntries(INTERVENTIONS.map((i) => [i.key, i.label]));
export const REVIEWER_LABEL = { ecologist: "an ecologist", landscape: "the landscape team", field: "a field visit" };

export const INTERVENTION_CAVEAT = "A screening suggestion from satellite and map proxies, not a prescription. They cannot tell tree maturity, native species or habitat quality, "
  + "so a person decides, and Protect or Regenerate needs an ecologist.";

/**
 * The suggested intervention for one site's measured properties: { key, label, principle, reasons, also, reviewer }.
 * Rules, first match wins: unreliable heat data -> inspect; already green (greenness at or above the canopy threshold) -> protect;
 * flagged near a corridor gap -> regenerate; footpath with little tree cover within 50 m -> plant-shade; otherwise inspect.
 * `also` lists the other rules the site meets, so a planner sees when a place could serve two purposes.
 */
export function suggestIntervention(p) {
  const green = Number.isFinite(p.ndvi_mean) && p.ndvi_mean >= CANOPY_NDVI;
  const gap = p.corridor_gap_flag === true;
  const shade = Number.isFinite(p.uncovered_path_length_50m) && p.uncovered_path_length_50m > 0;
  const unreliable = Number.isFinite(p.lst_valid_frac) && p.lst_valid_frac < MOSTLY_ESTIMATED;
  const met = [green && "protect", gap && "regenerate", shade && "plant-shade"].filter(Boolean);
  const why = {
    protect: `The satellite already sees dense greenery here (greenness ${fmt(p.ndvi_mean, 2)}, at or above ${CANOPY_NDVI}). Planting could disturb what is there; check what it is first.`,
    regenerate: `It lies ${fmtMetres(p.corridor_gap_dist_m)} from a gap in the approximate green corridor, where restoring habitat could help join green areas.`,
    "plant-shade": `About ${fmtMetres(p.uncovered_path_length_50m)} of footpath within 50 m has little tree cover by satellite greenness.`,
  };
  let key, reasons;
  if (unreliable) {
    key = "inspect";
    reasons = ["Most of the ground-heat reading here is filled in from neighbours, so the screening is less certain than usual."];
  } else if (met.length) {
    key = met[0];
    reasons = [why[key]];
  } else {
    key = "inspect";
    reasons = ["No gap in the approximate corridor or poorly shaded footpath is close by, and the satellite does not see dense greenery: a visit should decide what, if anything, fits."];
  }
  const meta = INTERVENTIONS.find((i) => i.key === key);
  return { key, label: meta.label, principle: meta.principle, reasons, also: met.filter((k) => k !== key).map((k) => ({ key: k, label: INTERVENTION_LABEL[k], reason: why[k] })), reviewer: meta.reviewer };
}

/** Count of suggestions across features: { protect, regenerate, "plant-shade", inspect }. */
export function interventionCounts(features) {
  const out = Object.fromEntries(INTERVENTIONS.map((i) => [i.key, 0]));
  for (const f of features) out[suggestIntervention(f.properties).key] += 1;
  return out;
}

/**
 * Where the planner's review stands for one plan entry: { state, text }.
 * state: "suggested" (nothing chosen), "chosen" (chosen, nobody named as reviewer), "reviewed" (chosen and a reviewer named),
 * "needs-ecologist" (Protect or Regenerate chosen without a named reviewer).
 */
export function interventionReview(entry, suggestion) {
  const chosen = entry.intervention || "";
  if (!chosen) return { state: "suggested", text: `Suggested: ${suggestion.label} (not reviewed)` };
  const needsEcologist = chosen === "protect" || chosen === "regenerate";
  if (!entry.interventionBy) return { state: needsEcologist ? "needs-ecologist" : "chosen", text: `Chosen: ${INTERVENTION_LABEL[chosen]}${needsEcologist ? ", needs an ecologist's review" : ", reviewer not named"}` };
  return { state: "reviewed", text: `Chosen: ${INTERVENTION_LABEL[chosen]}, reviewed by ${entry.interventionBy}${entry.interventionOn ? ` on ${entry.interventionOn}` : ""}` };
}
