// The shortlist on the Map and Sites pages: a small block in the site card (add, remove, open) and a slim "Your shortlist" bar under the map.
// Everything else about the plan (status, field checks, batches, notes, downloads) lives in the Pilot plan, so there is one place for it.
// Text and controls only, never markup built from data. Logic lives in plan.js.
import { el, clear } from "./dom.js";
import { PLAN_CAVEAT, STATUS_LABEL, feasibility } from "./plan.js";

const openTrackerPage = () => document.querySelector('#view-tabs [data-view="tracker"]')?.click();

/** The block in the site card: add the site to your shortlist, or see where it stands. Redraws itself and keeps focus on something sensible. */
export function planControls(plan, siteId) {
  const box = el("section", { class: "plan-controls", "aria-label": "Shortlist" });
  function draw(focusAfter) {
    clear(box);
    box.append(el("h3", {}, "Shortlist"));
    if (!plan.has(siteId)) {
      const add = el("button", { type: "button", class: "btn btn-primary btn-block", onclick: () => { plan.add(siteId, "card"); draw("open"); } }, "Add to shortlist");
      box.append(add, el("p", { class: "small-note" }, "Your own shortlist, saved on this device only. Each site is then followed in the Tracker, from visit to planted."));
      if (focusAfter === "add") add.focus({ preventScroll: true });
      return;
    }
    const entry = plan.get(siteId);
    const open = el("button", { type: "button", class: "btn btn-secondary btn-sm", onclick: openTrackerPage }, "Open in the tracker");
    const remove = el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { plan.remove(siteId, "card"); draw("add"); } }, "Remove from shortlist");
    box.append(el("p", { class: "plan-in" }, el("span", { class: "chip chip-ok" }, "In your shortlist"), ` ${STATUS_LABEL[entry.status]}`),
      el("div", { class: "plan-actions" }, open, remove),
      el("p", { class: "small-note" }, `Field checks: ${feasibility(entry).label}. A status only records what you set; this tool has not inspected the site.`));
    if (focusAfter === "open") open.focus({ preventScroll: true });
  }
  draw();
  return box;
}

/**
 * The slim bar under the map. options: { byId() -> Map of site id to feature as currently ranked, onSelect(id), topIds() -> ids to add in one go, openPilot() }.
 * Returns { redraw() } so the app can refresh the current ranks after a re-rank.
 */
export function renderPlanPanel(card, plan, { byId, onSelect, topIds, openPilot }) {
  const body = el("div", { class: "shortlist-body" });
  const say = el("p", { class: "plan-say", role: "status" });
  let clearArmed = null;
  const SHOW = 8;

  function drawRows() {
    clear(body);
    const entries = plan.list();
    const map = byId();
    if (!entries.length) {
      body.append(el("p", { class: "plan-empty" }, "Nothing picked yet. Click a site on the map and press Add to shortlist, or start with the first five in the list."));
      return;
    }
    const shown = entries.slice(0, SHOW);
    body.append(el("p", { class: "shortlist-count" }, `${entries.length} site${entries.length === 1 ? "" : "s"} picked`),
      el("ul", { class: "shortlist-sites" }, shown.map((e) => {
        const f = map.get(e.id);
        return el("li", {}, el("button", { type: "button", class: "link-button", onclick: () => onSelect(e.id) }, e.id), f ? el("span", { class: "muted" }, ` #${f.properties.rank}`) : null);
      }), entries.length > SHOW ? el("li", { class: "muted" }, `and ${entries.length - SHOW} more`) : null));
  }
  function drawActions() {
    const has = plan.list().length > 0;
    clear(actions);
    actions.append(...[
      has ? el("button", { type: "button", class: "btn btn-primary btn-sm", onclick: openPilot }, "Continue in the tracker") : null,
      el("button", { type: "button", class: `btn btn-${has ? "secondary" : "primary"} btn-sm`, onclick: () => {
        let added = 0;
        for (const id of topIds()) if (plan.add(id, "panel-rows")) added += 1;
        say.textContent = added ? `Added ${added} site${added === 1 ? "" : "s"}.` : "Those sites are already in your shortlist.";
      } }, "Add the first five in the list"),
      has ? el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => {
        if (clearArmed) { clearTimeout(clearArmed); clearArmed = null; plan.clear("panel-rows"); say.textContent = "Your shortlist is cleared."; return; }
        const btn = actions.lastChild;
        btn.textContent = "Click again to clear";
        clearArmed = setTimeout(() => { clearArmed = null; btn.textContent = "Clear the shortlist"; }, 4000);
      } }, "Clear the shortlist") : null].filter(Boolean));
  }

  const actions = el("div", { class: "plan-actions" });
  clear(card).append(
    el("div", { class: "card-head" }, el("h3", {}, "Your shortlist"),
      el("p", { class: "card-sub" }, "The sites you want to plant. The Tracker is where each one is visited, decided on and followed until it is planted.")),
    body, actions, say,
    el("p", { class: "caption" }, PLAN_CAVEAT));

  plan.subscribe(() => { drawRows(); drawActions(); });
  drawRows();
  drawActions();
  return { redraw() { if (!card.contains(document.activeElement)) drawRows(); } };
}
