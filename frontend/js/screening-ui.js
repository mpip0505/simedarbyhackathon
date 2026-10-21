import { el } from "./dom.js";
import { CONFLICT_CAVEAT } from "./screening.js";

export function conflictBlock(c) {
  const title = { review: "Mapped conflict: field review needed", unknown: "Mapped conflicts: unknown", "no-trigger": "No mapped trigger; field checks still needed" }[c.state] ?? "Mapped conflicts: unknown";
  return el("div", { class: "pp-conflicts", "data-map-conflict": c.state },
    el("p", {}, el("strong", {}, title)),
    c.flags.length ? el("ul", {}, c.flags.map((f) => el("li", {}, `${f.label} (${f.distance_m} m)`))) : null,
    c.note ? el("p", { class: "small-note" }, c.note) : null,
    c.unknown_layers.length ? el("p", { class: "small-note" }, `Unmapped or unavailable: ${c.unknown_layers.join(", ")}.`) : null,
    el("p", { class: "small-note" }, CONFLICT_CAVEAT));
}
