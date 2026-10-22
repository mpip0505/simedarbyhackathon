// Small form helpers shared by the Pilot plan and the Tracker: a labelled field with a purpose line, selects and inputs that keep a data-key
// (so focus survives a redraw), and in-place error messages. Text and controls only; nothing is built from data as markup.
import { el } from "./dom.js";

export const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const errorNote = (id) => el("p", { class: "pp-err", id, hidden: true });

export function field(label, control, hint) { return el("label", { class: "pp-field" }, el("span", {}, label), control, hint ? el("small", { class: "pp-hint" }, hint) : null); }
export function select(options, value, key, label, onChange) {
  const s = el("select", { class: "select", "data-key": key, "aria-label": label, onchange: (e) => onChange(e.target.value) }, options.map((o) => el("option", { value: o.key, disabled: o.disabled, title: o.title }, o.label)));
  s.value = value;
  return s;
}
export function input(value, key, label, onChange, { max = 40, placeholder = "", type = "text", width = null } = {}) {
  const i = el("input", { type, class: "input", "data-key": key, "aria-label": label, maxlength: type === "text" ? String(max) : null, placeholder, value: value ?? "", onchange: (e) => onChange(e.target.value) });
  if (width) i.style.maxWidth = width;
  return i;
}
export const numInput = (value, key, label, onChange, placeholder = "") => input(value === null ? "" : String(value), key, label, onChange, { type: "number", placeholder });
/** Mark a control as invalid and put its message under it (for a message that exists now). Returns what to put in the cell. */
export function flag(control, key, bad) {
  const message = bad.get(key);
  if (!message) return control;
  const id = `err-${key.replace(/[^A-Za-z0-9]/g, "-")}`;
  control.setAttribute("aria-invalid", "true");
  control.setAttribute("aria-describedby", id);
  return [control, el("p", { class: "pp-err", id }, message)];
}
/** Show or clear an error on a control whose message appears after a submit (no redraw, so what was typed stays). */
export function setError(control, note, message) {
  control.setAttribute("aria-invalid", message ? "true" : "false");
  note.textContent = message ?? "";
  note.hidden = !message;
  if (message) control.setAttribute("aria-describedby", note.id);
}
export const th = (cols) => el("thead", {}, el("tr", {}, cols.map(([h, c]) => el("th", { scope: "col", class: c ?? null }, h))));

