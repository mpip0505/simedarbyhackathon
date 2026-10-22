import { el } from "./dom.js";
import { toCsv } from "./csv.js";
import { EXPOSURE_FIELDS, EXPOSURE_NOTE, exposureScenario, exposureRows } from "./exposure.js";
import { WALK_COLUMNS, WALK_NOTE, MIN_ROUTES, MIN_WALKS, baselineBasis, blankWalkSheet, readWalkSheet, summariseWalks } from "./shade-walk.js";

// Where each exposure input would come from. Empty inputs are honest: nothing is guessed, and each missing one says what would fill it.
const SOURCES = {
  "Residents per mapped residential building": "a building-level survey or census (OpenStreetMap maps buildings, not households)",
  "Residents walking this route daily (%)": "route-use counts, which this tool does not measure",
  "Minutes on the route per walker per day": "a resident diary or timed walks (a walk's length is per walk, not per day)",
  "Current share of walking time in shade (%)": "timed shade walks: use the walk sheet below",
  "Scenario share of walking time in shade (%)": "your own assumption now; measure it later by walking the same routes after planting",
  "Scenario horizon": "your choice, for example Year 5",
  "Source or basis for the assumptions": "where each number came from",
};

/**
 * The resident shade-exposure panel. extras: { walks, routeNames } where walks is the timed-walk store (shade-walk.js createWalks) and routeNames
 * are places to walk (for the blank sheet). Without extras it behaves as before.
 */
export function exposurePanel(store, reach, download, extras = {}) {
  const s = store.get(), r = exposureScenario(reach, s);
  const number = (v) => v.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  const field = (key, label, type = "text", min, max) => el("label", { class: "pp-field" }, el("span", {}, label),
    el("input", { type, class: "input", "data-key": `exposure:${key}`, "aria-label": label, value: s[key] ?? "", min, max,
      step: type === "number" ? "any" : null, maxlength: type === "text" ? key === "basis" ? "280" : "60" : null,
      onchange: (e) => store.set(key, e.target.value) }));
  const rows = exposureRows(reach, s);
  const homes = Number.isInteger(reach?.homes) ? reach.homes : null;
  const needs = r.state === "needs-inputs" ? r.missing : [];
  return el("section", { class: "pp-exposure", "aria-labelledby": "exposure-heading" },
    el("h3", { id: "exposure-heading" }, "Resident shade exposure: scenario"),
    el("p", { class: "small-note" }, homes !== null
      ? `What needs no assumption: the active shortlist (rejected sites excluded) lies within 250 m of ${homes} unique mapped residential buildings. That is reach, not residents or walking. Enter your assumptions below to translate it into daily walking time without shade.`
      : "Current unique reach data is unavailable, so nothing can be calculated."),
    walkSection(store, extras, number),
    el("div", { class: "pp-grid" }, EXPOSURE_FIELDS.map((f) => field(f.key, f.label, "number", f.min, f.max)),
      field("horizon", "Scenario horizon (for example Year 5)"), field("basis", "Source or basis for the assumptions")),
    el("div", { class: "pp-result", role: "status", "data-exposure-result": r.state }, r.state === "ready"
      ? `${number(r.baseline)} current vs ${number(r.target)} scenario unshaded person-minutes per day; ${number(Math.abs(r.difference))} ${r.difference < 0 ? "more" : "fewer"} at ${r.settings.horizon}. Assumes ${number(r.walkers)} daily walkers.` : r.note),
    needs.length ? el("div", { class: "pp-missing", "data-exposure-missing": String(needs.length) }, el("p", { class: "small-note" }, el("strong", {}, "Still missing, and what would fill it:")),
      el("ul", { class: "small-note" }, needs.map((m) => el("li", {}, `${m}: ${SOURCES[m] ?? "your entry"}`)))) : null,
    el("p", { class: "small-note" }, "Formula: unique buildings × residents per building × walking share × daily route minutes × (1 − shade share). The same population and walking time are held constant in both cases."),
    el("p", { class: "small-note" }, EXPOSURE_NOTE),
    el("button", { type: "button", class: "btn btn-secondary btn-sm", disabled: !rows.length,
      onclick: () => rows.length && download("elmina-exposure-scenario.csv", toCsv(rows, Object.keys(rows[0]).map((key) => ({ key, label: key })))) }, "Download exposure scenario (CSV)"));

  function walkSection(exposureStore, { walks, routeNames = [] }, fmt) {
    if (!walks) return null;
    const state = walks.get();
    const sum = summariseWalks(state.walks);
    const routes = routeNames.length ? routeNames : ["Route 1", "Route 2", "Route 3"];
    const input = el("input", { type: "file", accept: ".csv,text/csv", class: "sr-only", id: "walk-import-file", tabindex: "-1", onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      let text;
      try { text = await file.text(); } catch { walks.set(state.walks, "The file could not be read."); return; }
      const res = readWalkSheet(text);
      if (!res.ok) { walks.set(state.walks, `Not imported; nothing changed. ${res.problems.slice(0, 4).join("; ")}`); return; }
      walks.set(res.walks, `Imported ${res.walks.length} walk${res.walks.length === 1 ? "" : "s"}${res.blank ? `; ${res.blank} empty row${res.blank === 1 ? "" : "s"} left out` : ""}.`);
    } });
    return el("div", { class: "pp-walks", "data-walk-summary": sum.n ? (sum.enough ? "enough" : "too-few") : "none" },
      el("h4", {}, "Timed shade walks: measure the current shade share"),
      el("p", { class: "small-note" }, "Walk a route with a stopwatch and record the minutes in shade. Pooled over several walks on at least two routes, that is a measured baseline for the first shade input. "
        + `It needs at least ${MIN_WALKS} walks on ${MIN_ROUTES} routes. ${WALK_NOTE}`),
      el("div", { class: "plan-actions" },
        el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => download("elmina-shade-walk-sheet.csv", toCsv(blankWalkSheet(routes), WALK_COLUMNS.map((c) => ({ key: c, label: c })))) }, "Download blank walk sheet (CSV)"),
        el("label", { class: "btn btn-primary btn-sm", for: "walk-import-file" }, "Import completed walk sheet"), input),
      state.note ? el("p", { class: "plan-say", role: "status" }, state.note) : null,
      sum.n ? el("div", { class: "pp-walk-sum" },
        el("p", { class: "pp-result" }, `${sum.n} walk${sum.n === 1 ? "" : "s"} on ${sum.routes} route${sum.routes === 1 ? "" : "s"}, ${sum.from}${sum.to !== sum.from ? ` to ${sum.to}` : ""}: ${fmt(sum.pooledShadePct)}% of ${fmt(sum.walkingMinutes)} walking minutes in shade (single walks ${fmt(sum.minShadePct)} to ${fmt(sum.maxShadePct)}%).`),
        el("ul", { class: "small-note" }, sum.byRoute.map((x) => el("li", {}, `${x.route}: ${x.n} walk${x.n === 1 ? "" : "s"}, ${fmt(x.shadePct)}% in shade`))),
        sum.enough ? null : el("p", { class: "pp-warn-line" }, sum.why),
        el("div", { class: "plan-actions" },
          el("button", { type: "button", class: "btn btn-secondary btn-sm", disabled: !sum.enough, onclick: () => {
            exposureStore.set("baselineShadePct", sum.pooledShadePct);
            const basis = baselineBasis(sum), have = String(exposureStore.get().basis || "");
            exposureStore.set("basis", have && !have.includes("Timed shade walks") ? `${have}; ${basis}` : basis);
          } }, "Use as the current shade share"),
          el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => walks.clear() }, "Clear walks")),
        el("p", { class: "small-note" }, "This fills only the current shade share. The scenario share after planting stays your assumption.")) : null);
  }
}
