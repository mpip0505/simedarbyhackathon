// The design system's select (a combobox): a button that shows the current choice and opens a list styled like our menus,
// instead of the browser's own dropdown. It enhances a native <select class="select">, which stays in the page (hidden) and keeps
// the value, so every change handler and every reader of .value keeps working. Keyboard: Enter, Space or an arrow opens it;
// the arrows, Home and End move; typing a letter jumps; Enter or Space picks; Escape or Tab closes. Text only, no markup from data.
import { el } from "./dom.js";

let current = null;                 // the one that is open (only one at a time)
let count = 0;

/** Wrap one select. Works before or after it is on the page. Returns the wrapper (a span holding the button, the list and the select). */
export function enhanceSelect(select) {
  if (select.closest(".cselect")) return select.closest(".cselect");
  const id = `cs-${++count}`;
  const hadFocus = document.activeElement === select;
  const wrap = el("span", { class: "cselect" });
  const value = el("span", { class: "cselect-value" });
  const btn = el("button", { type: "button", class: "select cselect-btn", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": `${id}-list`, "data-key": select.dataset.key ?? null }, value);
  const list = el("ul", { class: "menu cselect-list", role: "listbox", id: `${id}-list`, tabindex: "-1", hidden: true });
  if (select.parentNode) select.parentNode.insertBefore(wrap, select);
  wrap.append(btn, list, select);
  if (select.style.maxWidth) wrap.style.maxWidth = select.style.maxWidth;
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  const name = select.getAttribute("aria-label") ?? "";
  const options = () => [...select.options];
  let active = -1, typed = "", typedAt = 0;

  function sync() {
    value.textContent = select.selectedOptions[0]?.textContent ?? "";
    btn.setAttribute("aria-label", name ? `${name}: ${value.textContent}` : value.textContent);
    btn.disabled = select.disabled;
    for (const a of ["aria-invalid", "aria-describedby"]) {
      const v = select.getAttribute(a) ?? wrap.getAttribute(a);
      if (v) btn.setAttribute(a, v); else btn.removeAttribute(a);
    }
  }
  function render() {
    list.replaceChildren(...options().map((o, i) => {
      const li = el("li", { role: "option", id: `${id}-o${i}`, class: "menu-item cselect-option", "aria-selected": String(i === select.selectedIndex), "aria-disabled": o.disabled ? "true" : null, title: o.title || null },
        el("span", { class: "grow" }, o.textContent));
      li.addEventListener("mousedown", (e) => e.preventDefault());           // keep focus in the list while clicking
      li.addEventListener("click", () => choose(i));
      li.addEventListener("mousemove", () => { if (!o.disabled && active !== i) move(i); });
      return li;
    }));
  }
  function move(i) {
    active = i;
    [...list.children].forEach((li, k) => li.classList.toggle("is-active", k === i));
    if (i >= 0) { list.setAttribute("aria-activedescendant", `${id}-o${i}`); list.children[i]?.scrollIntoView({ block: "nearest" }); }
  }
  const step = (from, dir) => {
    const opts = options();
    for (let i = from + dir; i >= 0 && i < opts.length; i += dir) if (!opts[i].disabled) return i;
    return from;
  };
  // fixed to the screen, so a table that scrolls sideways cannot clip it; it opens upwards when there is no room below
  function place() {
    const r = btn.getBoundingClientRect();
    list.style.minWidth = `${r.width}px`;
    const below = innerHeight - r.bottom, height = Math.min(list.scrollHeight, 280);
    if (below < height + 12 && r.top > below) { list.style.top = ""; list.style.bottom = `${innerHeight - r.top + 4}px`; }
    else { list.style.bottom = ""; list.style.top = `${r.bottom + 4}px`; }
    list.style.left = `${Math.max(8, Math.min(r.left, innerWidth - list.offsetWidth - 8))}px`;
  }
  function show() {
    if (btn.disabled) return;
    current?.hide(false);
    render();
    list.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    place();
    move(select.selectedIndex >= 0 && !options()[select.selectedIndex]?.disabled ? select.selectedIndex : step(-1, 1));
    list.focus({ preventScroll: true });
    current = api;
  }
  function hide(focusButton = true) {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    list.removeAttribute("aria-activedescendant");
    if (current === api) current = null;
    if (focusButton) btn.focus({ preventScroll: true });
  }
  function choose(i) {
    const o = options()[i];
    if (!o || o.disabled) return;
    const changed = select.selectedIndex !== i;
    select.selectedIndex = i;
    hide();
    sync();
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  btn.addEventListener("click", () => (list.hidden ? show() : hide()));
  btn.addEventListener("keydown", (e) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); } });
  list.addEventListener("keydown", (e) => {
    const opts = options();
    if (e.key === "ArrowDown") { e.preventDefault(); move(step(active, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(step(active, -1)); }
    else if (e.key === "Home") { e.preventDefault(); move(step(-1, 1)); }
    else if (e.key === "End") { e.preventDefault(); move(step(opts.length, -1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }      // the page's own Escape (close the card) must not fire too
    else if (e.key === "Tab") hide(false);
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase();
      typedAt = now;
      const i = opts.findIndex((o) => !o.disabled && o.textContent.toLowerCase().startsWith(typed));
      if (i >= 0) move(i);
    }
  });
  list.addEventListener("blur", (e) => { if (!wrap.contains(e.relatedTarget)) hide(false); });
  select.addEventListener("change", sync);
  const api = { hide, wrap };
  sync();
  if (hadFocus) btn.focus({ preventScroll: true });          // moving a focused select into the wrapper loses focus: give it to the button
  return wrap;
}

/** Wrap every select.select under root now, and any added later (pages redraw often). */
export function enhanceSelects(root = document.body) {
  for (const s of root.querySelectorAll("select.select")) enhanceSelect(s);
  new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches("select.select")) enhanceSelect(node);
      else for (const s of node.querySelectorAll("select.select")) enhanceSelect(s);
    }
  }).observe(root, { childList: true, subtree: true });
}

document.addEventListener("pointerdown", (e) => { if (current && !current.wrap.contains(e.target)) current.hide(false); }, true);
document.addEventListener("scroll", (e) => { if (current && !current.wrap.contains(e.target)) current.hide(false); }, true);
addEventListener("resize", () => current?.hide(false));
