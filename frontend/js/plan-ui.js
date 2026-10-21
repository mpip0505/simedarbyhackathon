// The planting plan on screen: a small block in the site card (add, status, note, remove) and the "Planting plan" panel under the map
// (counts, one row per planned site, downloads). Text and controls only, never markup built from data. Logic lives in plan.js.
import { el, clear } from "./dom.js";
import { renderStrip } from "./strip.js";
import { toCsv } from "./csv.js";
import { FIELD_SHEET_COLUMNS, NOTE_MAX, PLAN_CAVEAT, PLAN_COLUMNS, STATUSES, fieldSheetRows, planRows, planTiles } from "./plan.js";

const statusSelect = (value, label, onChange) => {
  const select = el("select", { class: "select", "aria-label": label, onchange: (e) => onChange(e.target.value) },
    STATUSES.map((s) => el("option", { value: s.key }, s.label)));
  select.value = value;
  return select;
};

/** The block in the site card. Redraws itself when its own buttons are used, and keeps focus on something sensible. */
export function planControls(plan, siteId) {
  const box = el("section", { class: "plan-controls", "aria-label": "Planting plan" });
  function draw(focusAfter) {
    clear(box);
    box.append(el("h3", {}, "Planting plan"));
    if (!plan.has(siteId)) {
      const add = el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => { plan.add(siteId, "card"); draw("status"); } }, "Add to planting plan");
      box.append(add, el("p", { class: "small-note" }, "Your own shortlist, saved on this device only."));
      if (focusAfter === "add") add.focus({ preventScroll: true });
      return;
    }
    const entry = plan.get(siteId);
    const status = statusSelect(entry.status, `Status of ${siteId}`, (v) => plan.setStatus(siteId, v, "card"));
    const note = el("input", { type: "text", class: "input", maxlength: String(NOTE_MAX), value: entry.note, placeholder: "Note, for example: check access", "aria-label": `Note for ${siteId}`,
      onchange: (e) => plan.setNote(siteId, e.target.value, "card") });
    const remove = el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { plan.remove(siteId, "card"); draw("add"); } }, "Remove from plan");
    box.append(el("label", { class: "plan-field" }, el("span", {}, "Status"), status), el("label", { class: "plan-field" }, el("span", {}, "Note"), note), remove,
      el("p", { class: "small-note" }, "A status only records what you set. This tool has not inspected the site."));
    if (focusAfter === "status") status.focus({ preventScroll: true });
  }
  draw();
  return box;
}

/**
 * The panel under the map. options: { byId() -> Map of site id to feature as currently ranked, onSelect(id), topIds() -> ids to add in one go, download(filename, text, type) }.
 * Returns { redraw() } so the app can refresh the current ranks after a re-rank.
 */
export function renderPlanPanel(card, plan, { byId, onSelect, topIds, download }) {
  const tiles = el("div", { class: "stats", "aria-label": "The planting plan at a glance" });
  const body = el("div", { class: "plan-body" });
  let clearArmed = null;

  function drawRows() {
    clear(body);
    const entries = plan.list();
    const map = byId();
    if (!entries.length) {
      body.append(el("p", { class: "plan-empty" }, "No sites yet. Open a site card and press Add to planting plan, or start with the first five in the list."));
      return;
    }
    body.append(el("div", { class: "table-scroll" }, el("table", { class: "plan-table" },
      el("caption", { class: "sr-only" }, "Sites in the planting plan"),
      el("thead", {}, el("tr", {}, ["Site", "Rank now", "Status", "Note", ""].map((h, i) => el("th", { scope: "col", class: i === 1 ? "num" : null }, h)))),
      el("tbody", {}, entries.map((e) => {
        const f = map.get(e.id);
        return el("tr", {},
          el("th", { scope: "row" }, f ? el("button", { type: "button", class: "link-button", onclick: () => onSelect(e.id) }, e.id) : e.id),
          el("td", { class: "num" }, f ? `#${f.properties.rank}` : "not in data"),
          el("td", {}, statusSelect(e.status, `Status of ${e.id}`, (v) => plan.setStatus(e.id, v, "panel"))),
          el("td", {}, el("input", { type: "text", class: "input", maxlength: String(NOTE_MAX), value: e.note, "aria-label": `Note for ${e.id}`, onchange: (ev) => plan.setNote(e.id, ev.target.value, "panel") })),
          el("td", {}, el("button", { type: "button", class: "btn btn-ghost btn-sm", "aria-label": `Remove ${e.id} from the plan`, onclick: () => plan.remove(e.id, "panel-rows") }, "Remove")));
      })))));
  }
  const drawTiles = () => renderStrip(tiles, planTiles(plan.counts()));

  const say = el("p", { class: "plan-say", role: "status" });
  const addTop = el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => {
    let added = 0;
    for (const id of topIds()) if (plan.add(id, "panel-rows")) added += 1;
    say.textContent = added ? `Added ${added} site${added === 1 ? "" : "s"} as Proposed.` : "Those sites are already in the plan.";
  } }, "Add the first five in the list");
  const dlPlan = el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => {
    const rows = planRows(plan.list(), byId());
    if (!rows.length) { say.textContent = "The plan is empty."; return; }
    download("elmina-planting-plan.csv", toCsv(rows, PLAN_COLUMNS));
  } }, "Download plan (CSV)");
  const dlSheet = el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: () => {
    const rows = fieldSheetRows(plan.list(), byId());
    if (!rows.length) { say.textContent = "No site is marked Needs inspection yet."; return; }
    download("elmina-field-sheet.csv", toCsv(rows, FIELD_SHEET_COLUMNS.map((c) => ({ key: c, label: c }))));
    say.textContent = `Field sheet made for ${rows.length} site${rows.length === 1 ? "" : "s"}: place only, no rank or score.`;
  } }, "Download field sheet (CSV)");
  const clearBtn = el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => {
    if (!plan.list().length) return;
    if (clearArmed) { clearTimeout(clearArmed); clearArmed = null; clearBtn.textContent = "Clear the plan"; plan.clear("panel-rows"); say.textContent = "The plan is cleared."; return; }
    clearBtn.textContent = "Click again to clear";
    clearArmed = setTimeout(() => { clearArmed = null; clearBtn.textContent = "Clear the plan"; }, 4000);
  } }, "Clear the plan");

  clear(card).append(
    el("div", { class: "card-head" }, el("h3", {}, "Planting plan"),
      el("p", { class: "card-sub" }, "Pick sites, mark what needs inspecting, and keep your own notes")),
    el("div", { class: "card-chips" }, el("span", { class: "chip chip-warn" }, "Your notes, not verified"), el("span", { class: "chip chip-quiet" }, "Saved on this device only")),
    tiles, body,
    el("div", { class: "plan-actions" }, addTop, dlPlan, dlSheet, clearBtn), say,
    el("p", { class: "caption" }, PLAN_CAVEAT));

  plan.subscribe((source) => {
    drawTiles();
    if (source !== "panel") drawRows();            // an edit made inside the table must not rebuild it under the cursor
  });
  drawTiles();
  drawRows();
  return { redraw() { if (!card.contains(document.activeElement)) drawRows(); } };
}
