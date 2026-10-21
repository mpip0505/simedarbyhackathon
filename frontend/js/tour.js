// A short guided tour of the screen. A small card walks through the main parts, outlining each one. It never changes the data and can be closed
// at any time with Escape. Keyboard: arrow keys move between steps. Text only, no markup built from data.
import { $ } from "./dom.js";

export const TOUR_STEPS = [
  { target: "#map", title: "The map", text: "Numbered badges 1 to 5 mark the highest-priority example sites. Click a site or a badge to see why it ranks there." },
  { target: "#sheet-matters", title: "What matters most?", text: "Move the three sliders. The list and the map re-rank at once, with the same formula as the server." },
  { target: "#sheet-top", title: "Top sites", text: "Each row gives a one-sentence reason. Spread out picks a first round that covers more areas." },
  { target: "#card-impact", title: "What the top sites reach", text: "Footpath, mapped homes and corridor gaps near the first sites, each counted once. Reach, not benefit." },
  { target: "#card-tradeoff", title: "Compare ways to choose", text: "The same first sites chosen five ways. A trade-off, not a league table: the planner decides what matters." },
  { target: "#layers-button", title: "Map layers", text: "Switch on footpath greenness, greenness and ground heat from satellite, or the street map." },
  { target: "#open-limits", title: "Limits of this data", text: "What we checked and what we did not. There are no field data yet, so nothing here proves the ranking is right." },
];

/** Steps whose target exists and is on screen (a hidden card is skipped). */
export function visibleSteps(root = document) {
  return TOUR_STEPS.filter((s) => {
    const el = root.querySelector(s.target);
    return el && !el.closest("[hidden]") && el.getClientRects().length > 0;
  });
}

let active = false;

/** Start the tour; `opener` is the button to give focus back to. Returns false when there is nothing to show. */
export function startTour(opener) {
  if (active) return true;
  const steps = visibleSteps();
  if (!steps.length) return false;
  const box = $("#tour"), title = $("#tour-title"), text = $("#tour-text"), count = $("#tour-count");
  const back = $("#tour-back"), next = $("#tour-next"), close = $("#tour-close");
  let i = 0, outlined = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function show() {
    if (outlined) outlined.classList.remove("tour-focus");
    const step = steps[i];
    outlined = document.querySelector(step.target);
    outlined.classList.add("tour-focus");
    outlined.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    title.textContent = step.title;
    text.textContent = step.text;
    count.textContent = `Step ${i + 1} of ${steps.length}`;
    back.disabled = i === 0;
    next.textContent = i === steps.length - 1 ? "Finish" : "Next";
  }
  function end() {
    if (outlined) outlined.classList.remove("tour-focus");
    box.hidden = true;
    document.removeEventListener("keydown", onKey, true);
    back.onclick = next.onclick = close.onclick = null;
    active = false;
    opener?.focus?.({ preventScroll: true });
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(); }
    else if (e.key === "ArrowRight" && i < steps.length - 1) { i += 1; show(); }
    else if (e.key === "ArrowLeft" && i > 0) { i -= 1; show(); }
  }
  back.onclick = () => { if (i > 0) { i -= 1; show(); } };
  next.onclick = () => { if (i < steps.length - 1) { i += 1; show(); } else end(); };
  close.onclick = end;
  document.addEventListener("keydown", onKey, true);
  box.hidden = false;
  active = true;
  show();
  next.focus({ preventScroll: true });
  return true;
}
