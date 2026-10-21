import { el } from "./dom.js";
import { toCsv } from "./csv.js";
import { EXPOSURE_FIELDS, EXPOSURE_NOTE, exposureScenario, exposureRows } from "./exposure.js";

export function exposurePanel(store, reach, download) {
  const s = store.get(), r = exposureScenario(reach, s);
  const number = (v) => v.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  const field = (key, label, type = "text", min, max) => el("label", { class: "pp-field" }, el("span", {}, label),
    el("input", { type, class: "input", "data-key": `exposure:${key}`, "aria-label": label, value: s[key] ?? "", min, max,
      step: type === "number" ? "any" : null, maxlength: type === "text" ? key === "basis" ? "280" : "60" : null,
      onchange: (e) => store.set(key, e.target.value) }));
  const rows = exposureRows(reach, s);
  return el("section", { class: "pp-exposure", "aria-labelledby": "exposure-heading" },
    el("h3", { id: "exposure-heading" }, "Resident shade exposure: scenario"),
    el("p", { class: "small-note" }, `For the active shortlist (rejected sites excluded): ${reach ? `${reach.homes} unique mapped residential buildings within 250 m` : "reach unavailable"}. Enter your assumptions to translate proximity into daily walking time without shade.`),
    el("div", { class: "pp-grid" }, EXPOSURE_FIELDS.map((f) => field(f.key, f.label, "number", f.min, f.max)),
      field("horizon", "Scenario horizon (for example Year 5)"), field("basis", "Source or basis for the assumptions")),
    el("div", { class: "pp-result", role: "status", "data-exposure-result": r.state }, r.state === "ready"
      ? `${number(r.baseline)} current vs ${number(r.target)} scenario unshaded person-minutes per day; ${number(Math.abs(r.difference))} ${r.difference < 0 ? "more" : "fewer"} at ${r.settings.horizon}. Assumes ${number(r.walkers)} daily walkers.` : r.note),
    el("p", { class: "small-note" }, "Formula: unique buildings × residents per building × walking share × daily route minutes × (1 − shade share). The same population and walking time are held constant in both cases."),
    el("p", { class: "small-note" }, EXPOSURE_NOTE),
    el("button", { type: "button", class: "btn btn-secondary btn-sm", disabled: !rows.length,
      onclick: () => rows.length && download("elmina-exposure-scenario.csv", toCsv(rows, Object.keys(rows[0]).map((key) => ({ key, label: key })))) }, "Download exposure scenario (CSV)"));
}
