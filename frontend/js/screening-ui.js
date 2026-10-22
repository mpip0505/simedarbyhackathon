import { el } from "./dom.js";
import { CONFLICT_CAVEAT } from "./screening.js";

export function conflictBlock(c) {
  const title = { review: "Siting screen: field review needed", unknown: "Siting screen: unknown", "no-trigger": "Siting screen: no mapped trigger; field checks still needed" }[c.state] ?? "Siting screen: unknown";
  return el("div", { class: "pp-conflicts", "data-map-conflict": c.state },
    el("p", {}, el("strong", {}, title)),
    c.flags.length ? el("ul", {}, c.flags.map((f) => el("li", {}, `${f.label} (${f.distance_m} m)`))) : null,
    c.note ? el("p", { class: "small-note" }, c.note) : null,
    c.unknown_layers.length ? el("p", { class: "small-note" }, `Unmapped or unavailable: ${c.unknown_layers.join(", ")}.`) : null,
    el("p", { class: "small-note" }, CONFLICT_CAVEAT));
}
