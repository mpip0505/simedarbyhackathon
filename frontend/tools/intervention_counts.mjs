// Prints how many example sites the intervention screen suggests Protect, Regenerate, Plant for shade or Inspect.
// Any pitch line about "protect before you plant" must quote only what this prints:  node frontend/tools/intervention_counts.mjs
import { readFileSync } from "node:fs";
import { interventionCounts, INTERVENTION_LABEL, INTERVENTION_CAVEAT } from "../js/intervention.js";

const path = new URL("../../backend/data/cache/sites.geojson", import.meta.url);
const features = JSON.parse(readFileSync(path, "utf8")).features;
const counts = interventionCounts(features);
console.log(`Sites screened: ${features.length}`);
for (const [key, n] of Object.entries(counts)) console.log(`${INTERVENTION_LABEL[key] ?? key}: ${n}`);
console.log(INTERVENTION_CAVEAT);
