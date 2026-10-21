// The four figures in the strip above the Plant first map. Pure functions, no DOM.
import { fmt } from "./scale.js";
import { MOSTLY_ESTIMATED } from "./drivers.js";

/**
 * Tiles for the strip, from the sites as currently ranked: [{ label, value, unit, note }].
 * options: { placeholder } is true unless the scores come from the ML model; { usingServer } is false once a slider has moved.
 */
export function plantStats(ranked, { placeholder, usingServer }) {
  const props = ranked.map((f) => f.properties);
  const n = props.length;
  const scores = props.map((p) => p.score_total).filter(Number.isFinite);
  const nearGap = props.filter((p) => p.corridor_gap_flag).length;
  const reliable = props.filter((p) => Number.isFinite(p.lst_valid_frac) && p.lst_valid_frac >= MOSTLY_ESTIMATED).length;
  return [
    { label: "Candidate sites", value: String(n), unit: "", note: "simulated" },
    {
      label: placeholder ? "Top preview score" : "Top score",
      value: scores.length ? fmt(Math.max(...scores)) : fmt(null),
      unit: "",
      note: !usingServer ? "your weights" : placeholder ? "placeholder weights" : "scoring model",
    },
    { label: "Near a corridor gap", value: String(nearGap), unit: "sites", note: "within 50 m" },   // the API flags sites within 50 m of a gap
    { label: "Reliable ground heat", value: String(reliable), unit: `of ${n}`, note: `${n - reliable} are estimated` },
  ];
}
