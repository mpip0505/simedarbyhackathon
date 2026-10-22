// The Sites view: every site in one sortable, filterable table. Picking a row hands the site to Plant first (onPick).
// Rows are built with el(), so site ids from the API stay text. The filters here are this page's own; Plant first keeps its own.
import { el, clear, $, $$ } from "./dom.js";
import { COLUMNS, filterSites, sortSites, nextSort, mostlyEstimated } from "./sites-table.js";

export function setupSitesView({ onPick }) {
  const state = { origin: "all", query: "", sort: { key: "rank", dir: "asc" } };
  let last = null;                                   // the latest { ranked, placeholder, usingServer }, so a click can redraw
  const head = $("#sites-table thead");
  const body = $("#sites-table tbody");

  head.append(el("tr", {}, COLUMNS.map((c) => el("th", { scope: "col", class: c.num ? "num" : null, "data-key": c.key, "aria-sort": "none" },
    el("button", { type: "button", class: "th-sort", onclick: () => { state.sort = nextSort(state.sort, c.key); draw(); } }, c.label)))));

  function cell(c, p) {
    const text = c.text(c.value(p));
    if (c.key === "site") return el("td", {}, el("button", { type: "button", class: "link-button mono", title: "Show on the map" }, text));
    if (c.key === "origin") return el("td", {}, el("span", { class: "chip" }, text));
    if (c.key === "score") return el("td", { class: "num strong" }, text);
    if (c.key === "measured") return el("td", { class: mostlyEstimated(p) ? "num cell-warn" : "num", title: mostlyEstimated(p) ? "Mostly estimated from neighbouring pixels" : null }, text);
    return el("td", { class: c.num ? "num" : null }, text);
  }

  function draw() {
    if (!last) return;
    const { ranked, placeholder, usingServer } = last;
    const shown = sortSites(filterSites(ranked, state), state.sort.key, state.sort.dir);
    for (const th of $$("th", head)) {
      const sorted = th.dataset.key === state.sort.key;
      th.setAttribute("aria-sort", sorted ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none");
    }
    $('th[data-key="score"] button', head).textContent = placeholder ? "Preview score" : "Score";
    clear(body).append(...shown.map((f) => {
      const p = f.properties;
      return el("tr", { onclick: () => onPick(p.site_id) }, COLUMNS.map((c) => cell(c, p)));
    }));
    $("#sites-count").textContent = shown.length === ranked.length ? `${ranked.length} sites` : `${shown.length} of ${ranked.length} sites`;
    $("#sites-note").textContent = `Example sites (simulated), ranked by ${placeholder ? "preview score" : "score"}${usingServer ? "" : " with the weights you set on the Map"}. `
      + "Pick a row to see it on the map.";
    $("#sites-empty").hidden = shown.length > 0;
    $("#sites-table").hidden = shown.length === 0;
  }

  for (const r of $$('input[name="origin-sites"]')) r.addEventListener("change", () => { state.origin = r.value; draw(); });
  $("#sites-search").addEventListener("input", (e) => { state.query = e.target.value; draw(); });
  $("#sites-clear").addEventListener("click", () => {
    state.origin = "all";
    state.query = "";
    $('input[name="origin-sites"][value="all"]').checked = true;
    $("#sites-search").value = "";
    draw();
  });

  return { render(ranked, options) { last = { ranked, ...options }; draw(); } };
}

