// Source-level guard: text from the API must never reach an HTML sink. Strings given to Leaflet tooltips and popups
// are rendered as HTML, so only DOM nodes (or the empty placeholder) may be passed. A real-browser check of this
// lives in tools/smoke.mjs (a hostile API sends markup as a site id).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const files = readdirSync(new URL("../js/", import.meta.url)).filter((f) => f.endsWith(".js"))
  .map((f) => [f, readFileSync(new URL(`../js/${f}`, import.meta.url), "utf8")]);
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");  // ignore comments

test("no script uses an API for turning strings into HTML or running code", () => {
  const forbidden = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\b/, /\.html\s*\(/];
  for (const [name, text] of files) {
    for (const re of forbidden) assert.doesNotMatch(code(text), re, `${name} uses ${re}`);
  }
});

test("Leaflet tooltips and popups are only given DOM nodes or an empty string, never a template string", () => {
  for (const [name, text] of files) {
    for (const m of code(text).matchAll(/\b(setTooltipContent|setPopupContent|bindTooltip|bindPopup)\s*\(\s*([^,)]*)/g)) {
      const arg = m[2].trim();
      const safe = arg === '""' || arg === "''" || /^[A-Za-z_$][\w$]*$/.test(arg);   // empty string or a variable holding a node
      assert.ok(safe, `${name}: ${m[1]}(${arg}...) passes a string that Leaflet would render as HTML`);
    }
  }
});

test("divIcon html is only ever a DOM node held in a variable, never a string", () => {
  for (const [name, text] of files) {
    for (const m of code(text).matchAll(/divIcon\s*\(\s*\{[^}]*?html\s*:\s*([^,}]*)/g)) {
      assert.match(m[1].trim(), /^[A-Za-z_$][\w$]*$/, `${name}: divIcon html: ${m[1].trim()} is not a plain DOM node variable`);
    }
  }
});

test("the tooltip content is built as a text node in map.js", () => {
  const map = files.find(([n]) => n === "map.js")[1];
  assert.match(map, /createElement\("span"\)/);
  assert.match(map, /\.textContent\s*=/);
  assert.match(map, /setTooltipContent\(tip\)/);
});

test("dynamic text goes through el()/textContent: no template string is assigned into the DOM as HTML", () => {
  for (const [name, text] of files) assert.doesNotMatch(code(text), /\.(innerText|textContent)\s*=\s*[^;]*<[a-z]/i, `${name} writes markup as text`);
});
