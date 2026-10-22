// Browser smoke test: drives a real (headless) Chrome or Edge through the app and checks what it does.
// No dependencies: it talks to the browser over the DevTools protocol using Node's built-in WebSocket.
//
//   1. start the API:   uvicorn backend.api.main:app --port 8000
//   2. run this:        node frontend/tools/smoke.mjs [baseUrl] [screenshotDir]
//
// Set CHROME_PATH if Chrome or Edge is installed somewhere unusual. Exit code 1 if any check fails.
import { spawn } from "node:child_process";
import http from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { parseCsv } from "../js/observations.js";
import { toCsv } from "../js/csv.js";

const BASE = process.argv[2] || "http://127.0.0.1:8000";
const SHOTS = process.argv[3] || join(tmpdir(), "elmina-ui-shots");
const PORT = 9300 + Math.floor(Math.random() * 500);
mkdirSync(SHOTS, { recursive: true });

// axe-core is a dev dependency (frontend/package.json); without `npm install` the accessibility scan is skipped.
const axePath = new URL("../node_modules/axe-core/axe.min.js", import.meta.url);
const axeSource = existsSync(axePath) ? readFileSync(axePath, "utf8") : null;

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
const chromePath = CANDIDATES.find((p) => existsSync(p));
if (!chromePath) { console.error("No Chrome or Edge found. Set CHROME_PATH."); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "elmina-chrome-"));
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* browser still starting */ }
    await sleep(250);
  }
  throw new Error("browser did not start");
}

const problems = [];       // console errors and uncaught exceptions
let nextId = 1;
const pending = new Map();
let socket;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

async function waitFor(expression, what, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await evaluate(expression)) return; } catch { /* page not ready yet */ }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = join(SHOTS, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  return file;
}

async function open(url, width = 1440, height = 900) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
}

// Text that means a rendering bug: arrays or null turned into strings, or missing numbers printed as words.
const BAD_TEXT = /\[object |\bundefined\b|\bNaN\b|\bnull\b/;
const assertCleanText = async (where) => {
  const text = await evaluate(`document.body.innerText`);
  const hit = text.match(BAD_TEXT);
  assert.ok(!hit, `${where}: stray text "${hit?.[0]}" on screen`);
};

const ROWS = "#top-list .site-row";
const rows = () => evaluate(`[...document.querySelectorAll('${ROWS}')].map(b => ['.rank', '.site-name', '.site-why', '.site-score'].map(s => b.querySelector(s).textContent.trim()))`);
const setSlider = (key, value) => evaluate(`(() => { const i = document.querySelector('#w-${key}'); i.value = ${value}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const DEFAULT_NOTE = "The list and map update as you move these.";
const results = [];
async function check(name, fn) {
  if(process.env.SMOKE_MATCH && !name.includes(process.env.SMOKE_MATCH))return;
  try { await fn(); results.push([true, name]); console.log(`  ok   ${name}`); }
  catch (error) { results.push([false, name]); console.log(`  FAIL ${name}\n       ${error.message.split("\n")[0]}`); if(process.env.SMOKE_MATCH)console.log(JSON.stringify(problems)); }
}

try {
  socket = new WebSocket(await connect());
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      problems.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
      problems.push(`log: ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`);
    }
  };
  for (const domain of ["Page", "Runtime", "Log"]) await send(`${domain}.enable`);

  console.log(`Browser: ${chromePath}\nApp:     ${BASE}/app/\nShots:   ${SHOTS}\n`);
  await open(`${BASE}/app/`);
  await waitFor(`document.querySelectorAll('${ROWS}').length > 0 && document.querySelector('#loading').hidden`, "the list to fill");
  await sleep(800); // let map tiles and canvases draw

  let initialTop;
  await check("loads: headline, top sites, count, honesty labels, loading overlay gone", async () => {
    const r = await rows();
    initialTop = r[0];
    assert.equal(r.length, 5, `expected the top 5, got ${r.length}`);
    assert.equal(await evaluate(`document.querySelector('h1').textContent`), "Where to plant first");
    assert.match(await evaluate(`document.querySelector('#chip-pilot').textContent`), /Pilot township: City of Elmina/);
    assert.match(await evaluate(`document.querySelector('#count').textContent`), /^\d+ in total$/);
    assert.match(await evaluate(`document.querySelector('#chip-simulated').textContent`), /simulated/i);
    assert.match(await evaluate(`document.querySelector('#chip-scores').textContent`), /Preview scores|scoring model|mock/i);
    assert.match(await evaluate(`document.querySelector('#honesty-text').textContent`), /not Sime Darby Property's list/);
    assert.ok(r.every((row) => row[2].length > 3), "every row gives a short reason");
    assert.equal(await evaluate(`document.querySelectorAll('#stats-plant .stat').length`), 4, "four figures above the map");
    assert.match(await evaluate(`document.querySelector('#stats-plant').textContent`), /Candidate sites.*Top (preview )?score.*Near a corridor gap.*Reliable ground heat/s);
    assert.match(await evaluate(`document.querySelector('[data-mirror="chip-simulated"]').textContent`), /simulated/i, "the sidebar repeats the simulated label");
    assert.match(await evaluate(`document.querySelector('#crumb-view').textContent`), /Plant first/);
    await assertCleanText("opening screen");
  });
  await check("map: drawing layers, legend, rank badges 1 to 5, first-visit hint", async () => {
    assert.ok((await evaluate(`document.querySelectorAll('#map canvas').length`)) >= 3);
    assert.equal(await evaluate(`document.querySelectorAll('#legend .swatches span').length`), 7);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.rank-badge')].map(b => b.textContent)`), ["1", "2", "3", "4", "5"]);
    assert.equal(await evaluate(`document.querySelector('#coach').hidden`), false, "the hint should show on arrival");
    // no badge may hide another: every pair of badge centres is at least 24 px apart
    const gap = await evaluate(`(() => { const c = [...document.querySelectorAll('.rank-badge')].map(b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      let min = Infinity; for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) min = Math.min(min, Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1])); return min; })()`);
    assert.ok(gap >= 24, `two rank badges overlap (closest centres ${gap.toFixed(1)} px apart)`);
  });
  await shot("1-plant-first");

  await check("Limits and Data credits open as sheets with the caveats and the attribution", async () => {
    await evaluate(`document.querySelector('#open-limits').click()`);
    await waitFor(`document.querySelector('#dlg-limits').open`, "the limits sheet");
    assert.ok((await evaluate(`document.querySelectorAll('#caveats li').length`)) >= 5);
    assert.match(await evaluate(`document.querySelector('#dlg-limits').innerText`), /SIMULATED|simulated/);
    await evaluate(`document.querySelector('#dlg-limits').close()`);
    await evaluate(`document.querySelector('#open-credits').click()`);
    await waitFor(`document.querySelector('#dlg-credits').open`, "the credits sheet");
    assert.match(await evaluate(`document.querySelector('#attribution').textContent`), /OpenStreetMap/);
    await evaluate(`document.querySelector('#dlg-credits').close()`);
  });

  await check("clicking a site in the list opens the site card and hides the hint", async () => {
    await evaluate(`document.querySelector('${ROWS}').click()`);
    await waitFor(`!document.querySelector('#sheet-card').hidden`, "the site card");
    const text = await evaluate(`document.querySelector('#sheet-card').innerText`);
    assert.match(text, /#1 of \d+/);
    assert.match(text, /Why it ranks here/);
    for (const label of ["Heat relief", "Links green areas", "Shade for walkers", "Example site"]) assert.match(text, new RegExp(label));
    assert.ok((await evaluate(`document.querySelector('.card-headline').textContent`)).endsWith("."), "a one-sentence reason");
    assert.equal(await evaluate(`document.querySelector('${ROWS}').getAttribute('aria-current')`), "true");
    assert.equal(await evaluate(`document.querySelector('.rank-badge.selected')?.textContent`), "1");
    assert.equal(await evaluate(`document.querySelector('#coach').hidden`), true);
    if (await evaluate(`document.querySelector('#chip-scores').textContent.includes('Preview')`)) assert.match(text, /Preview score/);
    const g = await evaluate(`(() => { const box = document.querySelector('.map-box').getBoundingClientRect(), card = document.querySelector('#sheet-card').getBoundingClientRect();
      return { inBox: document.querySelector('.map-box').contains(document.querySelector('#sheet-card')), left: card.left - box.left, share: card.width / box.width }; })()`);
    assert.ok(g.inBox && g.left < 24 && g.share < 0.6, `the site card should be a panel on the left of the map, not cover it: ${JSON.stringify(g)}`);
    await assertCleanText("site card");
  });
  await shot("2-site-card");

  await check("heat-relief-only weights re-rank the list and say how much changed", async () => {
    await setSlider("cooling", 100); await setSlider("connectivity", 0); await setSlider("shade", 0);
    await waitFor(`document.querySelector('#weights-note').textContent.includes('re-weighted')`, "re-ranking");
    const note = await evaluate(`document.querySelector('#weights-note').textContent`);
    assert.match(note, /(\d+ of the top 10 changed|The top 10 stayed the same)/);
    const r = await rows();
    const scores = r.map((row) => Number(row[3]));
    assert.ok(scores.every((s, i) => i === 0 || s <= scores[i - 1]), "scores are not descending");
    assert.ok(r.every((row) => /hot|bare/.test(row[2])), `with only heat relief the reasons should be about heat: ${r.map((x) => x[2])}`);
    assert.equal(await evaluate(`document.querySelector('#o-cooling').textContent`), "100%");
    assert.equal(await evaluate(`document.querySelectorAll('.rank-badge').length`), 5);
  });
  await check("all-zero weights are refused with a message and keep the previous ranking", async () => {
    const before = (await rows())[0][1];
    await setSlider("cooling", 0);
    assert.match(await evaluate(`document.querySelector('#weights-note').textContent`), /at least one weight/);
    assert.equal((await rows())[0][1], before);
  });
  await check("reset restores the API's ranking and the default note", async () => {
    await evaluate(`document.querySelector('#weights-reset').click()`);
    await waitFor(`document.querySelector('#weights-note').textContent === ${JSON.stringify(DEFAULT_NOTE)}`, "reset");
    assert.deepEqual((await rows())[0], initialTop);
  });
  await check("filters, search and the empty state", async () => {
    await evaluate(`document.querySelector('input[name="origin"][value="corridor_edge"]').click()`);
    await waitFor(`/^\\d+ of \\d+$/.test(document.querySelector('#count').textContent)`, "the filtered count");
    const [shown, total] = (await evaluate(`document.querySelector('#count').textContent`)).split(" of ").map(Number);
    assert.ok(shown > 0 && shown < total, `filter left ${shown} of ${total}`);
    await evaluate(`document.querySelector('input[name="origin"][value="all"]').click()`);
    await evaluate(`(() => { const s = document.querySelector('#search'); s.value = 'ELM-37'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const found = await rows();
    assert.ok(found.length > 0 && found.every((row) => row[1].toLowerCase().includes('elm-37')));
    await evaluate(`(() => { const s = document.querySelector('#search'); s.value = 'zzzz'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    assert.equal(await evaluate(`document.querySelector('#no-match').hidden`), false);
    assert.match(await evaluate(`document.querySelector('#no-match').textContent`), /No sites match these filters/);
    assert.equal((await rows()).length, 0);
    await evaluate(`document.querySelector('#clear-filters').click()`);
    assert.equal(await evaluate(`document.querySelector('#no-match').hidden`), true);
    assert.match(await evaluate(`document.querySelector('#count').textContent`), /in total/);
  });
  await check("See all expands the list and Show the top 5 only collapses it", async () => {
    await evaluate(`document.querySelector('#see-all').click()`);
    assert.ok((await rows()).length > 100);
    assert.match(await evaluate(`document.querySelector('#see-all').textContent`), /Show the top 5 only/);
    await evaluate(`document.querySelector('#see-all').click()`);
    assert.equal((await rows()).length, 5);
  });
  await check("ML evidence: steady marks, rank range on the site card, and the spread-out shortlist", async () => {
    if (!(await evaluate(`document.querySelector('#chip-scores').textContent.includes('scoring model')`))) return;   // previews carry no ML evidence
    await evaluate(`document.querySelector('#weights-reset').click()`);
    await waitFor(`document.querySelectorAll('#top-list .steady-mark').length > 0`, "steady marks in the list");
    assert.match(await evaluate(`document.querySelector('#list-note').textContent`), /of the top 20 stay there/);
    await evaluate(`document.querySelector('${ROWS}').click()`);
    await waitFor(`document.querySelector('#sheet-card .steady')`, "the steadiness block on the site card");
    const steady = await evaluate(`document.querySelector('#sheet-card .steady').innerText`);
    assert.match(steady, /How steady is this rank\?/);
    assert.match(steady, /Steady top-20 pick/);
    assert.match(steady, /plausible weightings/);
    await shot("2b-site-card-steadiness");
    const before = (await rows()).map((r) => r[1]).join();
    await evaluate(`document.querySelector('input[name="list-mode"][value="shortlist"]').click()`);
    await waitFor(`document.querySelector('#count').textContent.includes('spread out')`, "the spread-out list");
    assert.match(await evaluate(`document.querySelector('#list-note').textContent`), /per 250 m block/);
    assert.match(await evaluate(`document.querySelector('#count').textContent`), /^20 spread out$/);
    await evaluate(`document.querySelector('#see-all').click()`);
    const spread = (await rows()).map((r) => r[1]);
    assert.equal(spread.length, 20);
    assert.notEqual(spread.join(), before, "the shortlist differs from the strict ranking");
    await shot("2c-spread-out-shortlist");
    await evaluate(`document.querySelector('#see-all').click()`);
    await evaluate(`document.querySelector('input[name="list-mode"][value="ranked"]').click()`);
    await evaluate(`document.querySelector('#card-close').click()`);
    await assertCleanText("ML evidence");
  });
  await check("the list window stays the same height whether it shows five rows, all of them or none", async () => {
    const height = () => evaluate(`Math.round(document.querySelector('.list-window').getBoundingClientRect().height)`);
    const five = await height();
    await evaluate(`document.querySelector('#see-all').click()`);
    assert.equal(await height(), five, "See all must scroll inside the window, not grow it");
    await evaluate(`document.querySelector('#see-all').click()`);
    await evaluate(`(() => { const s = document.querySelector('#search'); s.value = 'zzzz'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    assert.equal(await height(), five, "an empty result must keep the window's height");
    await evaluate(`document.querySelector('#clear-filters').click()`);
    const [card, rail] = await evaluate(`[document.querySelector('.map-card'), document.querySelector('.rail')].map((e) => Math.round(e.getBoundingClientRect().bottom))`);
    if (await evaluate(`innerWidth > 1200`)) assert.ok(Math.abs(card - rail) <= 1, `the map card (bottom ${card}) should end where the right-hand column ends (${rail})`);
  });
  await check("a rank of 100 or more fits its label on the map and in the list", async () => {
    await evaluate(`document.querySelector('#see-all').click()`);
    const pill = await evaluate(`(() => { const p = [...document.querySelectorAll('${ROWS} .rank')].find((e) => e.textContent.length >= 3);
      return p ? { id: p.closest('.site-row').querySelector('.site-name').textContent, fits: p.scrollWidth <= p.clientWidth, width: p.getBoundingClientRect().width } : null; })()`);
    assert.ok(pill, "the full list should reach a rank of 100 or more");
    assert.ok(pill.fits && pill.width >= 36, `the list's rank pill is too narrow for three digits (${pill.width}px)`);
    await evaluate(`(() => { const s = document.querySelector('#search'); s.value = ${JSON.stringify(pill.id)}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await sleep(400);
    const badge = await evaluate(`(() => { const b = document.querySelector('.rank-badge'); const r = b.getBoundingClientRect(); return { text: b.textContent, fits: b.scrollWidth <= b.clientWidth, w: r.width, h: r.height }; })()`);
    assert.ok(badge.text.length >= 3 && badge.fits && badge.w > badge.h, `the map badge for ${badge.text} should be a pill that holds its number (${badge.w} x ${badge.h})`);
    await evaluate(`(() => { const s = document.querySelector('#search'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await evaluate(`document.querySelector('#see-all').click()`);
  });
  await check("sheets collapse and expand, and the site card can be closed", async () => {
    await evaluate(`document.querySelector('#sheet-matters .sheet-toggle').click()`);
    assert.equal(await evaluate(`document.querySelector('#matters-body').hidden`), true);
    assert.equal(await evaluate(`document.querySelector('#sheet-matters .sheet-toggle').getAttribute('aria-expanded')`), "false");
    await evaluate(`document.querySelector('#sheet-matters .sheet-toggle').click()`);
    assert.equal(await evaluate(`document.querySelector('#matters-body').hidden`), false);
    await evaluate(`document.querySelector('#card-close').click()`);
    assert.equal(await evaluate(`document.querySelector('#sheet-card').hidden`), true);
  });
  await check("Escape closes the site card, and a pick on the map swaps it in place", async () => {
    await evaluate(`document.querySelector('${ROWS}').click()`);
    await waitFor(`!document.querySelector('#sheet-card').hidden`, "the site card");
    assert.equal(await evaluate(`document.querySelector('.map-box').classList.contains('has-card')`), true);
    const first = await evaluate(`document.querySelector('#card-body .card-title strong').textContent`);
    const second = await evaluate(`document.querySelectorAll('.leaflet-marker-icon')[1].textContent`);     // the second numbered badge
    await evaluate(`document.querySelectorAll('.leaflet-marker-icon')[1].click()`);
    await waitFor(`document.querySelector('#card-body .card-rank').textContent === ${JSON.stringify(second)}`, "the card of the badge that was picked");
    assert.notEqual(await evaluate(`document.querySelector('#card-body .card-title strong').textContent`), first);
    assert.equal(await evaluate(`document.querySelector('#sheet-card').hidden`), false, "picking on the map keeps the card open");
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    assert.equal(await evaluate(`document.querySelector('#sheet-card').hidden`), true);
    assert.equal(await evaluate(`document.querySelector('.map-box').classList.contains('has-card')`), false);
  });
  await check("the Layers button opens the layer panel, and Escape closes it", async () => {
    assert.equal(await evaluate(`document.querySelector('#layer-toggles').hidden`), true);
    await evaluate(`document.querySelector('#layers-button').click()`);
    assert.equal(await evaluate(`document.querySelector('#layer-toggles').hidden`), false);
    assert.equal(await evaluate(`document.querySelector('#layers-button').getAttribute('aria-expanded')`), "true");
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    assert.equal(await evaluate(`document.querySelector('#layer-toggles').hidden`), true);
  });
  await check("the filter above the map and the one in Top sites show the same choice", async () => {
    await evaluate(`document.querySelector('input[name="origin-map"][value="open_land"]').click()`);
    assert.equal(await evaluate(`document.querySelector('input[name="origin"][value="open_land"]').checked`), true);
    await waitFor(`/^\\d+ of \\d+$/.test(document.querySelector('#count').textContent)`, "the filtered count");
    await evaluate(`document.querySelector('input[name="origin"][value="all"]').click()`);
    assert.equal(await evaluate(`document.querySelector('input[name="origin-map"][value="all"]').checked`), true);
  });
  await check("layer toggles add and remove layers", async () => {
    await evaluate(`document.querySelector('input[data-layer="ndvi"]').click()`);
    await waitFor(`document.querySelectorAll('#map img.leaflet-image-layer').length === 1`, "the greenness overlay");
    await evaluate(`document.querySelector('input[data-layer="ndvi"]').click()`);
    await waitFor(`document.querySelectorAll('#map img.leaflet-image-layer').length === 0`, "the overlay to be removed");
  });

  await check("Before and after: plain headline, maps, three cards, the full numbers underneath", async () => {
    await evaluate(`document.querySelector('#view-tabs button[data-view="report"]').click()`);
    await waitFor(`document.querySelector('#report-headline').textContent.length > 0`, "the report view");
    await sleep(800);
    assert.match(await evaluate(`document.querySelector('#report-headline').textContent`), /^Has tree cover changed\?/);
    const canopy = await evaluate(`document.querySelector('#card-canopy').textContent`);
    assert.match(canopy, /No detectable change/);
    assert.match(canopy, /not a tree count/);
    assert.match(await evaluate(`document.querySelector('#card-lst').textContent`), /Indicative only/);
    const sure = await evaluate(`document.querySelector('#card-sure').textContent`);
    assert.match(sure, /from \d+(\.\d+)?% to \d+(\.\d+)?%/);
    assert.match(sure, /Independent maps disagree/);
    assert.equal(await evaluate(`document.querySelectorAll('#card-sure .hbar').length`), 5, "ESA WorldCover once, Dynamic World and our estimate for both periods");
    assert.equal(await evaluate(`document.querySelectorAll('#stats-report .stat').length`), 5, "five figures above the maps");
    assert.match(await evaluate(`document.querySelector('#crumb-view').textContent`), /Before and after/);
    assert.equal(await evaluate(`document.querySelector('#view-tabs button[data-view="report"]').getAttribute('aria-current')`), "page");
    assert.ok((await evaluate(`document.querySelector('#report-credits').textContent`)).includes("OpenStreetMap"), "the credits line is shown under the numbers");
    assert.equal(await evaluate(`document.querySelectorAll('#series-table tbody tr').length`), 5);
    assert.equal(await evaluate(`document.querySelectorAll('#crosscheck-table tbody tr').length`), 6);
    assert.equal(await evaluate(`document.querySelectorAll('.report-map img.leaflet-image-layer').length`), 2);
    assert.equal(await evaluate(`document.querySelector('#view-prioritise').hidden`), true);
    assert.match(await evaluate(`document.querySelector('#cap-baseline').textContent`), /Earlier period/);
    await assertCleanText("before and after view");
  });
  await shot("3-before-after-greenness");
  await check("Before and after: the ML planting scenario is labelled as a scenario, with four lines and its numbers", async () => {
    if (!(await evaluate(`document.querySelector('#chip-scores').textContent.includes('scoring model')`))) return;
    assert.equal(await evaluate(`document.querySelector('#card-scenario').hidden`), false);
    const text = await evaluate(`document.querySelector('#card-scenario').textContent`);
    assert.match(text, /Scenario, not a forecast/);
    assert.match(text, /If the top \d+ sites are planted/);
    assert.equal(await evaluate(`document.querySelectorAll('#card-scenario path.scn-line').length`), 4);
    assert.equal(await evaluate(`document.querySelectorAll('#card-scenario .scn-table tbody tr').length`), 4);
    await evaluate(`document.querySelector('#card-scenario').scrollIntoView()`);
    await shot("3b-scenario");
    await assertCleanText("scenario");
  });
  await check("switching to ground heat swaps both overlays and says it is estimated", async () => {
    await evaluate(`document.querySelector('input[name="metric"][value="lst"]').click()`);
    await waitFor(`[...document.querySelectorAll('.report-map img.leaflet-image-layer')].every(i => i.src.includes('lst_'))`, "ground heat overlays");
    assert.match(await evaluate(`document.querySelector('#report-legend').textContent`), /gap-filled|estimated/);
    assert.match(await evaluate(`document.querySelector('#report-legend').textContent`), /Ground heat/);
  });
  await shot("4-before-after-ground-heat");
  await check("back to Plant first keeps the map", async () => {
    await evaluate(`document.querySelector('#view-tabs button[data-view="prioritise"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#view-report').hidden`), true);
    assert.ok(await evaluate(`document.querySelector('#map canvas') !== null`));
  });

  // --- planning team exports and print ---------------------------------------------------------------------
  await check("the impact card shows what the top sites reach, with the township share, a toggle and the not-a-benefit caveat", async () => {
    const card = `document.querySelector('#card-impact')`;
    assert.equal(await evaluate(`${card}.hidden`), false, "the card should show with ML scores");
    const text = await evaluate(`${card}.innerText`);
    assert.match(text, /What the top sites reach/);
    assert.match(text, /Reach, not benefit/);
    assert.match(text, /first 50 sites/);
    assert.match(text, /does not show that planting there would cool/);
    assert.equal(await evaluate(`${card}.querySelectorAll('.stat').length`), 3);
    await evaluate(`${card}.querySelector('button[aria-pressed="false"]').click()`);
    assert.doesNotMatch(await evaluate(`${card}.innerText`), /first 50 sites/, "the toggle should change the numbers");
  });
  await check("the footpath greenness layer draws coloured paths, shows its legend, and hides again", async () => {
    const box = `document.querySelector('#layer-toggles input[data-layer="pathshade"]')`;
    assert.equal(await evaluate(`${box}.disabled`), false, "the layer should be available");
    assert.equal(await evaluate(`document.querySelector('#path-legend').hidden`), true);
    await evaluate(`${box}.click()`);
    assert.equal(await evaluate(`document.querySelector('#path-legend').hidden`), false);
    assert.match(await evaluate(`document.querySelector('#path-legend').innerText`), /Least green third[\s\S]*Not a shade survey/);
    await evaluate(`${box}.click()`);
    assert.equal(await evaluate(`document.querySelector('#path-legend').hidden`), true);
  });
  await check("the guided tour walks through the screen, outlines each part, and closes with Escape", async () => {
    await evaluate(`document.querySelector('[data-action="tour"]').click()`);
    await sleep(500);
    assert.equal(await evaluate(`document.querySelector('#tour').hidden`), false, "the tour card should open");
    assert.match(await evaluate(`document.querySelector('#tour-count').textContent`), /^Step 1 of \d+$/);
    assert.equal(await evaluate(`document.querySelectorAll('.tour-focus').length`), 1);
    await evaluate(`document.querySelector('#tour-next').click()`);
    assert.match(await evaluate(`document.querySelector('#tour-count').textContent`), /^Step 2 of/);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(`document.querySelector('#tour').hidden`), true, "Escape should close the tour");
    assert.equal(await evaluate(`document.querySelectorAll('.tour-focus').length`), 0);
  });
  await check("high contrast switches on and off and is announced to assistive technology", async () => {
    const btn = `document.querySelector('#contrast-toggle')`;
    await evaluate(`${btn}.click()`);
    assert.equal(await evaluate(`document.documentElement.dataset.contrast`), "high");
    assert.equal(await evaluate(`${btn}.getAttribute('aria-pressed')`), "true");
    await evaluate(`${btn}.click()`);
    assert.equal(await evaluate(`document.documentElement.dataset.contrast`), "normal");
  });
  await check("the address keeps slider weights and the selected site, and a shared link restores them", async () => {
    await setSlider("cooling", 100);
    await setSlider("connectivity", 0);
    await setSlider("shade", 0);
    await sleep(200);
    const hash = await evaluate(`location.hash`);
    assert.match(hash, /^#w=100,0,0/);
    const id = await evaluate(`document.querySelector('${ROWS} .site-name').textContent.trim()`);
    await evaluate(`document.querySelector('${ROWS}').click()`);
    await sleep(300);
    assert.match(await evaluate(`location.hash`), new RegExp(`site=${id}`));
    const full = await evaluate(`location.href`);
    await send("Page.navigate", { url: "about:blank" });
    await send("Page.navigate", { url: full });
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0 && document.querySelector('#loading').hidden`, "the shared link to load");
    await sleep(500);
    assert.equal(await evaluate(`document.querySelector('#w-cooling').value`), "100");
    assert.equal(await evaluate(`document.querySelector('#w-shade').value`), "0");
    assert.equal(await evaluate(`document.querySelector('#sheet-card').hidden`), false, "the shared site should open its card");
    assert.match(await evaluate(`document.querySelector('#card-body').innerText`), new RegExp(id));
    await evaluate(`document.querySelector('#weights-reset').click()`);   // leave the page at the default weights for what follows
  });
  await check("a mangled shared link is ignored without breaking the page", async () => {
    await send("Page.navigate", { url: "about:blank" });                       // a hash-only change would not reload the page
    await send("Page.navigate", { url: `${BASE}/app/#w=999,x&site=%3Cimg%20src=x%3E` });
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0 && document.querySelector('#loading').hidden`, "the page to load with a bad hash");
    assert.equal(await evaluate(`document.querySelector('#w-cooling').value`), "45");
    assert.equal(await evaluate(`document.querySelector('#sheet-card').hidden`), true);
  });
  await check("Read aloud on the site card speaks the site, the rank and the scores", async () => {
    await evaluate(`window.__spoken = []; speechSynthesis.speak = (u) => { window.__spoken.push(u.text); }; speechSynthesis.cancel = () => {};`);
    await evaluate(`document.querySelector('${ROWS}').click()`);
    await sleep(300);
    await evaluate(`document.querySelector('.card-speak').click()`);
    const said = await evaluate(`window.__spoken[0] || ''`);
    assert.match(said, /an example site, simulated\. Ranked \d+ of \d+\./);
    assert.match(said, /heat relief \d+, links green areas \d+, shade for walkers \d+/);
  });
  await check("the planting plan: add from the site card, set a status and a note, see it counted, downloaded, and remembered after a reload", async () => {
    const planCard = `document.querySelector('#card-plan')`;
    await evaluate(`window.__blobs = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return make(b); };`);
    const textOf = (i) => evaluate(`window.__blobs[${i}].text()`);
    assert.match(await evaluate(`${planCard}.innerText`), /No sites yet/);
    assert.match(await evaluate(`${planCard}.innerText`), /Your notes, not verified/);
    await evaluate(`document.querySelector('${ROWS}').click()`);
    await sleep(300);
    const id = await evaluate(`document.querySelector('#card-body .card-title strong').textContent.trim()`);
    await evaluate(`[...document.querySelectorAll('#card-body .plan-controls button')].find(b => b.textContent === 'Add to planting plan').click()`);
    assert.equal(await evaluate(`document.querySelectorAll('#card-body .plan-controls select').length`), 1, "a status choice should appear");
    await evaluate(`(() => { const s = document.querySelector('#card-body .plan-controls select'); s.value = 'needs-inspection'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const tiles = await evaluate(`${planCard}.querySelector('.stats').innerText`);
    assert.match(tiles, /IN THE PLAN[\s\S]*1[\s\S]*NEEDS INSPECTION[\s\S]*1/i, `tiles read: ${JSON.stringify(tiles)}`);
    assert.equal(await evaluate(`${planCard}.querySelectorAll('tbody tr').length`), 1);
    assert.match(await evaluate(`document.querySelector('${ROWS} .site-name').innerText`), /In plan/);
    await evaluate(`(() => { const i = ${planCard}.querySelector('tbody input'); i.value = '=2+2 check access'; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await evaluate(`[...${planCard}.querySelectorAll('button')].find(b => b.textContent === 'Download plan (CSV)').click()`);
    const planCsv = await textOf(0);
    assert.ok(planCsv.includes(`${id},Needs inspection,'=2+2 check access`), `plan csv read: ${JSON.stringify(planCsv.slice(0, 400))}`);
    assert.match(planCsv, /not inspected or verified/);
    await evaluate(`[...${planCard}.querySelectorAll('button')].find(b => b.textContent === 'Download field sheet (CSV)').click()`);
    const sheet = await textOf(1);
    assert.match(sheet, /^site_id,lat,lon,shade_on_path,canopy_class,path_in_use,photo_id,notes,observer,date/);
    assert.match(sheet, new RegExp(id));
    assert.doesNotMatch(sheet, /rank|score/i);
    await evaluate(`window.print = () => {}; document.querySelector('[data-action="brief"]').click()`);
    assert.match(await evaluate(`document.querySelector('#print-brief').innerText || document.querySelector('#print-brief').textContent`), /Planting plan \(the planner's own entries, not verified\)/);
    await send("Page.navigate", { url: "about:blank" });
    await send("Page.navigate", { url: `${BASE}/app/` });
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0 && document.querySelector('#loading').hidden`, "the page to reload");
    await sleep(500);
    assert.equal(await evaluate(`${planCard}.querySelectorAll('tbody tr').length`), 1, "the plan should be remembered");
    assert.match(await evaluate(`${planCard}.querySelector('tbody input').value`), /check access/);
    assert.equal(await evaluate(`${planCard}.querySelector('tbody select').value`), "needs-inspection");
    await evaluate(`[...${planCard}.querySelectorAll('button')].find(b => b.textContent === 'Add the first five in the list').click()`);
    assert.equal(await evaluate(`${planCard}.querySelectorAll('tbody tr').length`), 5, "the first five join the one already there");
    const clear = `[...${planCard}.querySelectorAll('button')].find(b => /^Clear the plan|^Click again/.test(b.textContent))`;
    await evaluate(`${clear}.click()`);
    assert.match(await evaluate(`${clear}.textContent`), /Click again to clear/);
    await evaluate(`${clear}.click()`);
    assert.match(await evaluate(`${planCard}.innerText`), /No sites yet/);
  });
  await check("the pilot plan: shortlist, field checks, batches, field sheet out and answers back, keep or reject, replacements, phases, reach, trees and survival", async () => {
    const root = `document.querySelector('#pilot-root')`;
    const setVal = (key, value) => evaluate(`(() => { const e = ${root}.querySelector('[data-key="${key}"]'); if (!e) throw new Error('no control ${key}'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const clickText = (text, scope = root) => evaluate(`(() => { const b = [...${scope}.querySelectorAll('button, label.btn')].find(x => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw new Error('no button ${text}'); b.click(); })()`);
    const text = () => evaluate(`${root}.innerText`);
    const ids = () => evaluate(`[...${root}.querySelectorAll('.pp-site .pp-id')].map(b => b.textContent.trim())`);
    const inSite = (id, label) => evaluate(`(() => { const art = [...${root}.querySelectorAll('.pp-site')].find(x => x.querySelector('.pp-id').textContent.trim() === '${id}'); [...art.querySelectorAll('button')].find(x => x.textContent === ${JSON.stringify(label)}).click(); })()`);
    await evaluate(`window.__blobs = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return make(b); };`);
    const blobText = (i) => evaluate(`window.__blobs[${i}].text()`);
    const HEAD = "site_id,lat,lon,shade_on_path,canopy_class,path_in_use,photo_id,notes,observer,date";
    const importCsv = async (csv) => {
      await evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(csv)}], 'done.csv', { type: 'text/csv' })); const i = document.querySelector('#pilot-import-file'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await sleep(400);
    };

    await evaluate(`document.querySelector('#view-tabs button[data-view="pilot"]').click()`);
    await sleep(300);
    assert.equal(await evaluate(`document.querySelector('#view-pilot').hidden`), false);
    assert.match(await text(), /Pilot plan[\s\S]*Your entries, not verified[\s\S]*Saved on this device only/);
    assert.match(await text(), /Next: Add sites to the plan/);
    assert.match(await evaluate(`${root}.querySelector('.pp-steps [aria-current="step"]').innerText`), /Shortlist and decide/);

    // 1 shortlist: field feasibility is separate from priority and starts unknown
    await clickText("Add the first five ranked sites");
    const [a, b, c] = await ids();
    await clickText("Freeze original shortlist");
    assert.match(await text(), /Original shortlist frozen/);
    assert.equal((await ids()).length, 5);
    assert.match(await text(), new RegExp(`${a}[\\s\\S]*Priority: rank #1, score[\\s\\S]*Field feasibility: Not checked`));
    await setVal(`site:${a}:check-access`, "ok");
    assert.match(await text(), /Field feasibility: 1 of 5 checks OK/);
    await setVal(`site:${a}:check-utilities`, "issue");
    assert.match(await text(), /Field feasibility: Problem found \(1\)/);
    assert.match(await text(), /What the problem is/);
    await setVal(`site:${a}:check-utilities`, "unknown");

    // 2 inspect: batches, workload from the planner's own numbers, a blind field sheet
    for (const id of [a, b, c]) await setVal(`site:${id}:status`, "needs-inspection");
    await setVal(`site:${a}:batch`, "Week 1");
    await setVal(`site:${b}:batch`, "Week 1");
    assert.match(await text(), /Week 1\s+2\s+Not set/);
    await setVal("set:inspectionsPerDay", "2");
    await setVal("set:costPerInspection", "50");
    await setVal("set:unit", "RM");
    assert.match(await text(), /Week 1\s+2\s+1/);
    assert.match(await text(), /Inspection cost for 3 sites: RM 150 \(your numbers\)/);
    await clickText("Download field sheet (all)");
    const sheet = await blobText(0);
    assert.ok(sheet.startsWith(HEAD), "the field sheet header");
    assert.ok(sheet.includes(a) && sheet.includes(b) && sheet.includes(c));
    assert.doesNotMatch(sheet, /rank|score/i);

    // a bad file is refused whole
    await importCsv(`${HEAD}\r\n${a},3,101,none,sparse,yes,,,,\r\nNOT-A-SITE,3,101,none,sparse,yes,,,,\r\n${b},3,101,maybe,sparse,yes,,,,`);
    assert.match(await text(), /This file was not imported\. Nothing in your plan changed\./);
    assert.match(await text(), /unknown site NOT-A-SITE/);
    assert.match(await text(), /shade_on_path 'maybe' must be one of none, partial, full/);
    assert.equal(await evaluate(`${root}.querySelectorAll('.pp-obs').length`), 0);

    // a good file: two observations, one blank row left out and not guessed
    const raw = parseCsv(sheet), headers=raw[0];
    const filled=raw.slice(1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]]))).map(row=>({...row,shade_on_path:row.site_id===c?"":row.site_id===b?"full":"none",canopy_class:row.site_id===b?"dense":"sparse",path_in_use:"yes",observer:"Synthetic walker",date:"2026-10-22",notes:"SYNTHETIC browser test"}));
    await importCsv(toCsv(filled,headers.map(key=>({key,label:key}))));
    assert.match(await text(), /Preview ready/);
    assert.equal(await evaluate(`${root}.querySelectorAll('.pp-obs').length`), 0,"preview must not mutate observations");
    await send("Emulation.setDeviceMetricsOverride", { width:390,height:844,deviceScaleFactor:1,mobile:false });
    await evaluate(`document.querySelector('[data-import-preview]').scrollIntoView({block:'center'})`);
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= 400`),"field-import preview overflows on a phone");
    await shot("pilot-import-preview-mobile");
    await send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
    await clickText("Confirm field import");
    assert.match(await text(), /Imported 2 observations: \d+ agree, \d+ differ, \d+ insufficient/);
    assert.match(await text(), /incomplete rows left out|Imported 2 observations/);
    assert.equal(await evaluate(`${root}.querySelectorAll('.pp-obs').length`), 2);
    assert.match(await text(), /one visit's comparison, not validation/);
    assert.equal(await evaluate(`${root}.querySelector('[data-key="site:${c}:status"]').value`), "needs-inspection");
    assert.equal(await evaluate(`${root}.querySelector('[data-key="site:${a}:status"]').value`), "inspected");

    // 3 review: keep one, reject one; a rejection asks for a reason and offers next-ranked alternatives
    for(const id of [a,b]) {
      await setVal(`${id}:reviewer`,"Synthetic planner");
      await setVal(`${id}:reviewDate`,"2026-10-22");
      await setVal(`${id}:reason`,id===b?"no access road":"Synthetic inspection reviewed");
    }
    await inSite(a, "Keep the site");
    await inSite(b, "Reject and find replacement");
    assert.equal(await evaluate(`${root}.querySelector('[data-key="site:${b}:status"]').value`), "rejected");
    assert.match(await text(), /Eligible frozen alternatives/);
    const before = (await ids()).length;
    await evaluate(`[...${root}.querySelectorAll('.pp-alt-list button')][0].click()`);
    assert.equal((await ids()).length, before + 1, "the replacement joins the plan");
    assert.match(await text(), /Planner's decision: keep the site\./);

    // 4 plan the work: unresolved checks prevent approval; completing them reopens human review.
    assert.equal(await evaluate(`${root}.querySelector('[data-key="site:${a}:status"] option[value="approved"]').disabled`),true);
    for(const key of ["access","utilities","space_soil","maintenance","existing_trees"])await setVal(`site:${a}:check-${key}`,"ok");
    await inSite(a,"Keep the site");
    await setVal(`site:${a}:status`, "approved");
    assert.equal(await evaluate(`${root}.querySelector('[data-key="site:${a}:status"]').value`),"approved");
    await setVal(`site:${a}:phase`, "1");
    await setVal("set:treesPerSite", "3");
    await setVal("set:costPerTree", "10");
    assert.match(await text(), /Phase 1\s+1\s+3\s+RM 30/);
    assert.doesNotMatch(await text(), /Reach data not loaded/);
    assert.match(await text(), /Everything in the plan[\s\S]*\d+ m \(\d/);
    await clickText("Download work schedule (CSV)");
    const schedule = await blobText(1);
    assert.ok(schedule.startsWith("site_id,inspection_batch,planting_phase,team,status,next_action,checks_not_ok,reason"), "the schedule header");
    assert.match(schedule, new RegExp(`${b},.*Rejected.*Replace with the next-ranked alternative.*no access road`));

    // 5 plant and maintain: only a Planted site can have a tree; survival counts only inspected trees
    assert.match(await text(), /No field data: no planted trees have been recorded\./);
    await setVal(`site:${a}:status`, "planted");
    await setVal("tree:new:species", "Shorea leprosula");
    await setVal("tree:new:date", "2025-11-15");
    await setVal("tree:new:next", "2026-01-15");
    await evaluate(`${root}.querySelector('.pp-treeform button[type="submit"]').click()`);
    assert.match(await text(), /No field data on survival yet: 1 planted tree recorded, none inspected\./);
    assert.match(await text(), /T1 · Shorea leprosula[\s\S]*Overdue: 2026-01-15/);
    await setVal("tree:T1:obs-date", "2026-02-10");
    await setVal("tree:T1:obs-cond", "alive-good");
    await evaluate(`${root}.querySelector('.pp-obsform button[type="submit"]').click()`);
    assert.match(await text(), /Recorded survival among inspected trees: 1 of 1 \(100%\)/);
    await clickText("Download tree register (CSV)");
    assert.match(await blobText(2), /T1,.*Shorea leprosula,2025-11-15/);
    await clickText("Download evidence package (JSON)");
    const evidence=JSON.parse(await blobText(3));
    assert.equal(evidence.snapshot.selected_ids.length,5);
    assert.equal(evidence.imports.length,1);
    assert.ok(evidence.events.some(e=>e.type==="replacement"));
    assert.equal(evidence.benchmark.random.draws,500);
    assert.equal(evidence.benchmark.original.ids.length,5);
    assert.equal(evidence.items.find(e=>e.id===b).replacement_id.length>0,true);
    await evaluate(`document.querySelector('#decision-benchmark-heading').scrollIntoView({block:'start'})`);
    await shot("pilot-decision-benchmark");
    await clickText("Download decision benchmark (CSV)");
    assert.match(await blobText(4),/random_distribution/);

    // remembered after a reload
    await send("Page.navigate", { url: "about:blank" });
    await send("Page.navigate", { url: `${BASE}/app/` });
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0 && document.querySelector('#loading').hidden`, "the page to reload");
    await evaluate(`document.querySelector('#view-tabs button[data-view="pilot"]').click()`);
    await sleep(500);
    assert.match(await text(), /Recorded survival among inspected trees: 1 of 1/);
    assert.equal((await ids()).length, before + 1);

    // clean up so later checks start from an empty plan
    await evaluate(`document.querySelector('#view-tabs button[data-view="prioritise"]').click()`);
    const clear = `[...document.querySelector('#card-plan').querySelectorAll('button')].find(b => /^Clear the plan|^Click again/.test(b.textContent))`;
    await evaluate(`${clear}.click()`);
    await evaluate(`${clear}.click()`);
    assert.match(await evaluate(`document.querySelector('#card-plan').innerText`), /No sites yet/);
  });
  await check("siting-flag filter opens a flagged card without changing field checks or scores", async () => {
    const before = await rows();
    const mapped = await (await fetch(BASE + "/screening/conflicts")).json();
    const flaggedCount = Object.values(mapped.sites).filter((s) => s.state === "review").length;
    await evaluate(`document.querySelector('#conflict-only').click()`);
    assert.match(await evaluate(`document.querySelector('#count').textContent`), new RegExp(`^${flaggedCount} of `));
    await evaluate(`document.querySelector('${ROWS}').click()`);
    assert.equal(await evaluate(`document.querySelector('#card-body [data-map-conflict]').dataset.mapConflict`), "review");
    assert.match(await evaluate(`document.querySelector('#card-body').innerText`), /not an approval or legal setback check/);
    await evaluate(`document.querySelector('#card-close').click(); document.querySelector('#conflict-only').click()`);
    assert.deepEqual(await rows(), before);
  });
  await check("resident exposure uses explicit inputs, exports its assumptions, and remembers them on reload", async () => {
    await evaluate(`document.querySelector('#view-tabs button[data-view="pilot"]').click()`);
    await evaluate(`[...document.querySelectorAll('#pilot-root button')].find(b => b.textContent.trim() === 'Add the first five ranked sites').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-exposure-result]').dataset.exposureResult`), "needs-inputs");
    const values = { residentsPerBuilding: "3", walkersPct: "25", minutesPerDay: "10", baselineShadePct: "20", targetShadePct: "60", horizon: "Year 5", basis: "Synthetic browser-test assumptions" };
    for (const [key, value] of Object.entries(values)) await evaluate(`(() => { const e = document.querySelector('[data-key="exposure:${key}"]'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    assert.equal(await evaluate(`document.querySelector('[data-exposure-result]').dataset.exposureResult`), "ready");
    assert.match(await evaluate(`document.querySelector('[data-exposure-result]').textContent`), /unshaded person-minutes per day.*Year 5/);
    await evaluate(`window.__exposureBlob = null; const create = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__exposureBlob = b; return create(b); }; [...document.querySelectorAll('#pilot-root button')].find(b => b.textContent === 'Download exposure scenario (CSV)').click()`);
    const csv = await evaluate(`window.__exposureBlob.text()`);
    assert.match(csv, /Synthetic browser-test assumptions/);
    assert.match(csv, /not a measured benefit/);
    assert.match(csv, /baseline_person_minutes_per_day/);
    await evaluate(`document.querySelector('.pp-exposure').scrollIntoView({block:'center'})`);
    await shot("pilot-exposure");
    await open(`${BASE}/app/`);
    await waitFor(`document.querySelector('#loading').hidden`, "exposure reload");
    await evaluate(`document.querySelector('#view-tabs button[data-view="pilot"]').click()`);
    assert.equal(await evaluate(`document.querySelector('[data-key="exposure:horizon"]').value`), "Year 5");
    assert.equal(await evaluate(`document.querySelector('[data-exposure-result]').dataset.exposureResult`), "ready");
    await evaluate(`document.querySelector('#view-tabs button[data-view="prioritise"]').click()`);
    const clear = `[...document.querySelector('#card-plan').querySelectorAll('button')].find(b => /^Clear the plan|^Click again/.test(b.textContent))`;
    await evaluate(`${clear}.click()`); await evaluate(`${clear}.click()`);
  });
  await check("timed shade walks: a bad sheet is refused, a good one fills only the current shade share with its basis, and it is remembered", async () => {
    const WALK_HEAD = "walk_id,route_id,date,start_time,weather,participant_type,walking_minutes,shaded_minutes,notes";
    const good = [WALK_HEAD,
      "W01,route A,2026-11-02,09:30,sunny,resident,12,3,t", "W02,route A,2026-11-02,16:15,sunny,resident,12,5,t", "W03,route B,2026-11-02,09:50,cloudy,proxy,8,2,t",
      "W04,route B,2026-11-03,16:30,sunny,proxy,9,4,t", "W05,route C,2026-11-03,09:40,sunny,team,15,6,t", "W06,route C,2026-11-04,16:20,overcast,team,14,7,t",
      "W07,route A,2026-11-04,09:35,sunny,resident,11,2,t", "W08,route B,2026-11-04,16:10,sunny,proxy,10,3,t"].join("\r\n");
    const bad = `${WALK_HEAD}\r\nW01,route A,2026-11-02,09:30,sunny,resident,10,12,t`;
    const pilot = `document.querySelector('#pilot-root')`;
    const importWalks = async (csv) => {
      await evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(csv)}], 'walks.csv', { type: 'text/csv' })); const i = document.querySelector('#walk-import-file'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await sleep(500);
    };
    await evaluate(`localStorage.removeItem('elmina-exposure-scenario-v1'); localStorage.removeItem('elmina-shade-walks-v1');`);
    await send("Page.navigate", { url: "about:blank" });
    await send("Page.navigate", { url: `${BASE}/app/` });
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0 && document.querySelector('#loading').hidden`, "the page to reload");
    await evaluate(`document.querySelector('#view-tabs button[data-view="pilot"]').click()`);
    await evaluate(`[...${pilot}.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add the first five ranked sites')?.click()`);
    await sleep(400);
    assert.equal(await evaluate(`${pilot}.querySelector('[data-walk-summary]').dataset.walkSummary`), "none");
    assert.match(await evaluate(`${pilot}.querySelector('.pp-exposure').innerText`), /What needs no assumption: the active shortlist[\s\S]*unique mapped residential buildings/);
    assert.match(await evaluate(`${pilot}.querySelector('[data-exposure-missing]').innerText`), /Current share of walking time in shade \(%\): timed shade walks/);
    await importWalks(bad);
    assert.match(await evaluate(`${pilot}.querySelector('.pp-walks').innerText`), /Not imported; nothing changed\. row 2: shaded_minutes \(12\) is more than walking_minutes \(10\)/);
    assert.equal(await evaluate(`${pilot}.querySelector('[data-walk-summary]').dataset.walkSummary`), "none");
    await importWalks(good);
    assert.equal(await evaluate(`${pilot}.querySelector('[data-walk-summary]').dataset.walkSummary`), "enough");
    assert.match(await evaluate(`${pilot}.querySelector('.pp-walks').innerText`), /8 walks on 3 routes, 2026-11-02 to 2026-11-04: 35\.2% of 91 walking minutes in shade/);
    assert.match(await evaluate(`${pilot}.querySelector('.pp-walks').innerText`), /route A: 3 walks/);
    await evaluate(`[...${pilot}.querySelectorAll('.pp-walks button')].find(b => b.textContent.trim() === 'Use as the current shade share').click()`);
    assert.equal(await evaluate(`${pilot}.querySelector('[data-key="exposure:baselineShadePct"]').value`), "35.2");
    assert.match(await evaluate(`${pilot}.querySelector('[data-key="exposure:basis"]').value`), /^Timed shade walks: 8 walks on 3 routes, 2026-11-02 to 2026-11-04;/);
    assert.equal(await evaluate(`${pilot}.querySelector('[data-key="exposure:targetShadePct"]').value`), "", "the scenario share stays the planner's assumption");
    assert.equal(await evaluate(`${pilot}.querySelector('[data-exposure-result]').dataset.exposureResult`), "needs-inputs");
    assert.doesNotMatch(await evaluate(`${pilot}.querySelector('[data-exposure-missing]').innerText`), /Current share of walking time in shade/);
    await importWalks(bad);
    assert.equal(await evaluate(`${pilot}.querySelector('[data-walk-summary]').dataset.walkSummary`), "enough", "a refused file must not touch the walks already imported");
    await send("Page.navigate", { url: "about:blank" });
    await send("Page.navigate", { url: `${BASE}/app/` });
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0 && document.querySelector('#loading').hidden`, "the page to reload");
    await evaluate(`document.querySelector('#view-tabs button[data-view="pilot"]').click()`);
    await sleep(400);
    assert.equal(await evaluate(`${pilot}.querySelector('[data-walk-summary]').dataset.walkSummary`), "enough");
    assert.equal(await evaluate(`${pilot}.querySelector('[data-key="exposure:baselineShadePct"]').value`), "35.2");
    await evaluate(`[...${pilot}.querySelectorAll('.pp-walks button')].find(b => b.textContent.trim() === 'Clear walks').click()`);
    assert.equal(await evaluate(`${pilot}.querySelector('[data-walk-summary]').dataset.walkSummary`), "none");
    await evaluate(`localStorage.removeItem('elmina-exposure-scenario-v1')`);
    await evaluate(`document.querySelector('#view-tabs button[data-view="prioritise"]').click()`);
    const clearPlan = `[...document.querySelector('#card-plan').querySelectorAll('button')].find(b => /^Clear the plan|^Click again/.test(b.textContent))`;
    await evaluate(`${clearPlan}.click()`);
    await evaluate(`${clearPlan}.click()`);
  });
  await check("the trade-off card compares five ways of choosing, as a trade-off with no winner", async () => {
    const card = `document.querySelector('#card-tradeoff')`;
    assert.equal(await evaluate(`${card}.hidden`), false, "the card should show with scores from the scoring model");
    const text = await evaluate(`${card}.innerText`);
    assert.match(text, /Compare ways to choose the first sites/);
    assert.match(text, /Trade-off, not a league table/);
    assert.match(text, /not proof that it is better/);
    assert.equal(await evaluate(`${card}.querySelectorAll('tbody tr').length`), 5);
    assert.equal(await evaluate(`${card}.querySelectorAll('tr.is-ours').length`), 1);
    const before = await evaluate(`${card}.querySelector('tbody tr:nth-child(4)').innerText`);
    await evaluate(`${card}.querySelector('button[aria-pressed="false"]').click()`);
    assert.notEqual(await evaluate(`${card}.querySelector('tbody tr:nth-child(4)').innerText`), before, "the toggle should change the numbers");
  });
  await check("the planting brief fills with the top sites, the simulated label and the limits, and asks the browser to print", async () => {
    await evaluate(`window.__printed = 0; window.print = () => { window.__printed++; }`);
    await evaluate(`document.querySelector('[data-action="brief"]').click()`);
    assert.equal(await evaluate(`window.__printed`), 1, "print was not requested");
    const text = await evaluate(`document.querySelector('#print-brief').innerText || document.querySelector('#print-brief').textContent`);
    assert.match(text, /Example sites \(simulated\)/);
    assert.match(text, /Limits of this data/);
    assert.equal(await evaluate(`document.querySelectorAll('#print-brief table')[0].querySelectorAll('tbody tr').length`), 10);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#print-brief')).display`), "none", "the brief must not show on screen");
  });
  await check("a second skip link jumps to the ranked list, and the small segmented controls are at least 24 px tall", async () => {
    await evaluate(`document.querySelectorAll('.skip-link')[1].click()`);
    assert.equal(await evaluate(`document.activeElement.id`), "top-list");
    const short = await evaluate(`[...document.querySelectorAll('.seg-sm > button')].filter((b) => b.offsetHeight > 0 && b.offsetHeight < 24).length`);
    assert.equal(short, 0, `${short} small segmented buttons are under 24 px`);
  });

  await check("the skip link is the first thing Tab reaches and it moves focus to the main content", async () => {
    await evaluate(`document.activeElement.blur(); document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute('tabindex')`);   // Tab now starts from the top of the page
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    const first = await evaluate(`document.activeElement.className + " | " + document.activeElement.tagName + " " + (document.activeElement.textContent || "").slice(0, 30)`);
    assert.ok(first.startsWith("skip-link"), `Tab reached "${first}" first, not the skip link`);
    await evaluate(`document.activeElement.click()`);
    assert.equal(await evaluate(`document.activeElement.id`), "main");
  });
  await check("accessibility scan (axe-core, WCAG 2 A and AA rules) finds no violations on either view", async () => {
    if (!axeSource) { console.log("       (skipped: run `npm install` in frontend/ to enable the axe-core scan)"); return; }
    await evaluate(axeSource);
    const scan = () => evaluate(`axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })
      .then(r => r.violations.map(v => v.id + ": " + v.help + " (" + v.nodes.length + " nodes, e.g. " + v.nodes[0].target.join(" ") + "; " + v.nodes[0].any.map(a => a.message).join(" / ").slice(0, 200) + ")"))`);
    const found = [];
    for (const view of ["prioritise", "report", "pilot"]) {
      await evaluate(`document.querySelector('#view-tabs button[data-view="${view}"]').click()`);
      if (view === "pilot") {
        // scan the busy version of the workspace: five sites, one needing inspection, every details block open
        await evaluate(`[...document.querySelectorAll('#pilot-root button')].find(b => b.textContent.trim() === 'Add the first five ranked sites')?.click()`);
        await evaluate(`(() => { const s = document.querySelector('#pilot-root select[data-key$=":status"]'); s.value = 'needs-inspection'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        await evaluate(`document.querySelectorAll('#pilot-root details').forEach(d => { d.open = true; })`);
      }
      await evaluate(`document.querySelector('#main').scrollTop = 0; (document.querySelector('#map') || document.body).scrollIntoView({ block: 'center' })`);   // badges near the map's lower edge sit under the footer until scrolled into view
      await sleep(600);
      found.push(...(await scan()).map((v) => `${view}: ${v}`));
    }
    await evaluate(`document.querySelector('#view-tabs button[data-view="prioritise"]').click()`);
    const clearPlan = `[...document.querySelector('#card-plan').querySelectorAll('button')].find(b => /^Clear the plan|^Click again/.test(b.textContent))`;
    await evaluate(`${clearPlan}.click()`);
    await evaluate(`${clearPlan}.click()`);
    assert.deepEqual(found, [], found.join("\n"));
  });

  // --- security: data from the API must never run as code ---------------------------------------------------
  await check("best-coverage round beats the ranked top 10 on reach, and plan sites carry an intervention review and maintenance readiness", async () => {
    await open(`${BASE}/app/`);
    await waitFor(`document.querySelector('#loading').hidden`, "the app");
    await evaluate(`localStorage.clear()`);
    await open(`${BASE}/app/`);
    await waitFor(`document.querySelector('#loading').hidden`, "the app after clearing the plan");
    // the site card suggests an intervention in SDP's terms and says who must confirm it
    await evaluate(`document.querySelector('${ROWS}').click()`);
    await waitFor(`!document.querySelector('#sheet-card').hidden`, "the site card");
    const card = await evaluate(`document.querySelector('#card-body').innerText`);
    assert.match(card, /What might this place need\?[\s\S]*SDP: (Conserve|Regenerate|Avoid)[\s\S]*Suggestion, not reviewed[\s\S]*Needs (an ecologist|the landscape team|a field visit)/);
    await evaluate(`document.querySelector('#card-body .iv').scrollIntoView({ block: 'start' })`);
    await shot("card-intervention");
    await evaluate(`document.querySelector('#card-close').click()`);
    // the optimizer compares three ways to choose 10 sites and adds the best-coverage ones as Needs inspection
    await evaluate(`document.querySelector('#view-tabs button[data-view="pilot"]').click()`);
    await sleep(300);
    const root = `document.querySelector('#pilot-root')`;
    const text = () => evaluate(`${root}.innerText`);
    assert.match(await text(), /Best combination for your inspection capacity[\s\S]*Ranked: the top 10[\s\S]*Spread out[\s\S]*Best coverage/);
    const cells = await evaluate(`[...${root}.querySelectorAll('.opt-table tbody tr')].map(r => [...r.cells].map(c => c.textContent))`);
    const metres = (s) => Number(s.split(" ")[0].replace(/,/g, ""));
    assert.equal(cells.length, 3);
    assert.ok(metres(cells[2][1]) >= metres(cells[0][1]), `best coverage footpath ${cells[2][1]} should not be below ranked ${cells[0][1]}`);
    assert.match(await text(), /Best is only against this proxy objective/);
    await evaluate(`${root}.querySelector('.opt-card').scrollIntoView({ block: 'start' })`);
    await shot("pilot-optimizer");
    await evaluate(`[...${root}.querySelectorAll('button')].find(b => /^Add these \\d+ as Needs inspection$/.test(b.textContent)).click()`);
    assert.match(await text(), /Added 10 sites as Needs inspection, batch "Coverage round"/);
    assert.equal(await evaluate(`${root}.querySelectorAll('.pp-site').length`), 10);
    // each plan site: an intervention choice with reviewer, and six readiness fields that start unknown
    const first = await evaluate(`${root}.querySelector('.pp-site .pp-id').textContent.trim()`);
    assert.match(await text(), /Intervention \(Avoid, Regenerate, Conserve\)[\s\S]*Suggested: /);
    assert.match(await text(), /Establishment and maintenance readiness: 0 of 6 recorded/);
    const setVal = (key, value) => evaluate(`(() => { const e = ${root}.querySelector('[data-key="${key}"]'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await setVal(`site:${first}:iv`, "regenerate");
    assert.match(await text(), /Chosen: Regenerate habitat, needs an ecologist's review/);
    assert.match(await text(), /Regenerate is chosen: name the ecologist who reviewed it/);
    await setVal(`site:${first}:iv-by`, "Test ecologist");
    assert.match(await text(), /Chosen: Regenerate habitat, reviewed by Test ecologist/);
    await setVal(`site:${first}:ready-owner`, "Township landscape team");
    assert.match(await text(), /Establishment and maintenance readiness: 1 of 6 recorded/);
    await evaluate(`${root}.querySelector('.pp-site details[data-key$=":ready"]').open = true; ${root}.querySelector('.pp-site .iv-plan').scrollIntoView({ block: 'start' })`);
    await shot("pilot-intervention-readiness");
    await evaluate(`localStorage.clear()`);
    await evaluate(`document.querySelector('#view-tabs button[data-view="prioritise"]').click()`);
  });

  // A hostile API rewrites every site id into an HTML payload. The page is pointed at it (localhost is allowed by
  // ?api=). If any text reached an HTML sink, the onerror handler would set window.__pwned.
  const PAYLOAD = '<img src=x onerror="window.__pwned=1">';
  const hostile = http.createServer(async (req, res) => {
    try {
      const upstream = await fetch(BASE + req.url);
      let body = Buffer.from(await upstream.arrayBuffer());
      if (req.url.startsWith("/sites") && upstream.ok) {
        const fc = JSON.parse(body.toString("utf8"));
        fc.features.forEach((f, i) => { f.properties.site_id = `${PAYLOAD}#${i}`; });
        body = Buffer.from(JSON.stringify(fc));
      }
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Access-Control-Allow-Origin": "*" });
      res.end(body);
    } catch (error) { res.writeHead(502); res.end(String(error)); }
  });
  await new Promise((resolve) => hostile.listen(0, "127.0.0.1", resolve));
  const hostilePort = hostile.address().port;

  await check("hostile site ids are shown as plain text: no script runs in the list, site card, badges or map tooltip", async () => {
    await open(`${BASE}/app/?api=http://127.0.0.1:${hostilePort}`);
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0 && document.querySelector('#loading').hidden`, "the list from the hostile API");
    await sleep(800);
    assert.ok((await rows())[0][1].includes("<img src=x"), "the payload should appear as literal text in the list");
    assert.equal(await evaluate(`document.querySelectorAll('#top-list img, .rank-badge img, #legend img').length`), 0);
    // pick the 8th site (the list shows five, so open it up first): it has no rank badge on top of it, so the hover reaches its polygon
    await evaluate(`document.querySelector('#see-all').click()`);
    await evaluate(`document.querySelectorAll('${ROWS}')[7].click()`);
    await waitFor(`!document.querySelector('#sheet-card').hidden`, "the site card");
    assert.ok((await evaluate(`document.querySelector('#card-body').textContent`)).includes("<img src=x"));
    assert.equal(await evaluate(`document.querySelectorAll('#card-body img').length`), 0);
    await sleep(1500); // let the map finish moving the picked site into the free part beside the card
    // the card covers the left of the map, so the site sits in the middle of the rest: zoom in around that spot with the wheel,
    // then sweep the pointer over it until a tooltip opens
    await evaluate(`document.querySelector('.map-box').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(300);
    const spot = await evaluate(`(() => { const box = document.querySelector('.map-box').getBoundingClientRect(), card = document.querySelector('#sheet-card').getBoundingClientRect();
      return { x: (card.right + 12 + box.right) / 2, y: box.top + box.height / 2 }; })()`);
    for (let i = 0; i < 3; i++) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: spot.x, y: spot.y, deltaX: 0, deltaY: -120 }); await sleep(700); }
    await sleep(800);
    sweep: for (let dy = -48; dy <= 48; dy += 12) {
      for (let dx = -48; dx <= 48; dx += 12) {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: spot.x + dx, y: spot.y + dy, button: "none" });
        await sleep(40);
        if (await evaluate(`document.querySelector('.leaflet-tooltip') !== null`)) break sweep;
      }
    }
    await waitFor(`document.querySelector('.leaflet-tooltip') !== null`, "a map tooltip to open");
    const tip = await evaluate(`document.querySelector('.leaflet-tooltip').textContent`);
    assert.ok(tip.includes("<img src=x"), `the tooltip should show the markup as text, got: ${tip}`);
    assert.equal(await evaluate(`document.querySelectorAll('.leaflet-tooltip img').length`), 0, "markup became a real element");
    await sleep(500);
    assert.equal(await evaluate(`window.__pwned === undefined`), true, "the injected script ran");
  });
  hostile.close();
  await shot("5a-hostile-api");

  await check("an ?api= address on someone else's server is ignored, with a visible notice", async () => {
    await open(`${BASE}/app/?api=https://evil.example`);
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0`, "the page to load from its own API");
    const notice = await evaluate(`document.querySelector('#notices').textContent`);
    assert.match(notice, /\?api= address in the link was ignored/);
    assert.equal(await evaluate(`document.querySelector('#fatal').hidden`), true);
  });

  await check("a narrow screen turns the sidebar into a strip and stacks everything without breaking, and the hint can be dismissed", async () => {
    await open(`${BASE}/app/`, 390, 844);
    await waitFor(`document.querySelectorAll('${ROWS}').length > 0`, "the list on a narrow screen");
    await sleep(600);
    assert.ok((await evaluate(`document.documentElement.scrollWidth`)) <= 400, "page scrolls sideways on a phone");
    assert.equal(await evaluate(`document.querySelector('#coach').hidden`), false);
    await evaluate(`document.querySelector('#coach-dismiss').click()`);
    assert.equal(await evaluate(`document.querySelector('#coach').hidden`), true);
  });
  await shot("5-narrow");

  await check("OSM-only page renders and exports its separate method, map and source provenance", async () => {
    const osmReport = await (await fetch(BASE + "/screening/open-data")).json();
    await open(`${BASE}/app/open-data.html`, 1440, 900);
    await waitFor(`document.querySelector('#fallback-root table') && !document.querySelector('#fallback-map').hidden`, "OSM-only fallback");
    assert.match(await evaluate(`document.querySelector('#fallback-status').textContent`), new RegExp(`${osmReport.features.length} simulated candidates.*OSM-only.*Input hashes match`));
    assert.equal(await evaluate(`document.querySelectorAll('#fallback-root tbody tr').length`), 10);
    const fallbackText = await evaluate(`document.body.innerText`);
    assert.match(fallbackText, /OSM-only licence fallback/);
    assert.match(fallbackText, /not a second model/);
    assert.match(fallbackText, /cannot see heat, tree cover, actual shade or species/);
    await evaluate(`window.__fallbackBlobs = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__fallbackBlobs.push(b); return make(b); }; [...document.querySelectorAll('#fallback-root button')].forEach(b => b.click())`);
    const csv = await evaluate(`window.__fallbackBlobs[0].text()`);
    const geo = JSON.parse(await evaluate(`window.__fallbackBlobs[1].text()`));
    assert.match(csv, /osm-only/); assert.match(csv, /input_hashes/);
    assert.equal(geo.features.length, osmReport.features.length); assert.equal(geo.source_mode, "osm-only");
    assert.equal(geo.stale, false);
    assert.equal(geo.features[0].properties.score_cooling, undefined);
    await assertCleanText("OSM-only fallback");
    if (axeSource) {
      await evaluate(axeSource);
      const violations = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }).then(r => r.violations.map(v => v.id + ': ' + v.help))`);
      assert.deepEqual(violations, []);
    }
    await shot("osm-only-desktop");
    await open(`${BASE}/app/open-data.html`, 390, 844);
    await waitFor(`document.querySelector('#fallback-root table')`, "narrow OSM-only fallback");
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= 400`), "fallback overflows the mobile viewport");
    await shot("osm-only-mobile");
  });
  await check("missing optional reports stay unknown and the configured API survives navigation to the independent fallback", async () => {
    let blockCore = false;
    const requests = [];
    const proxy = http.createServer(async (req, res) => {
      requests.push(req.url);
      if (["/screening/conflicts", "/ml/reach-sets"].includes(req.url)) {
        res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ detail: "Optional report missing" })); return;
      }
      if (blockCore && ["/meta", "/sites", "/summary", "/weights"].includes(req.url)) {
        res.writeHead(503, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ detail: "Satellite cache unavailable" })); return;
      }
      try {
        const upstream = await fetch(BASE + req.url);
        let body = Buffer.from(await upstream.arrayBuffer());
        if (req.url === "/screening/open-data") {
          const report = JSON.parse(body.toString()); report.stale = null; body = Buffer.from(JSON.stringify(report));
        }
        res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(body);
      } catch { res.writeHead(502); res.end(); }
    });
    await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const proxyBase = `http://127.0.0.1:${proxy.address().port}`;
    try {
      await open(`${BASE}/app/?api=${encodeURIComponent(proxyBase)}`);
      await waitFor(`document.querySelector('#loading').hidden && document.querySelectorAll('${ROWS}').length > 0`, "app without optional screening reports");
      assert.equal(await evaluate(`document.querySelector('#conflict-only').disabled`), true);
      await evaluate(`document.querySelector('#view-tabs button[data-view="pilot"]').click()`);
      await evaluate(`[...document.querySelectorAll('#pilot-root button')].find(b => b.textContent === 'Add the first five ranked sites')?.click()`);
      assert.equal(await evaluate(`document.querySelector('[data-exposure-result]').dataset.exposureResult`), "no-reach");
      assert.equal(await evaluate(`document.querySelector('#pilot-root [data-map-conflict]').dataset.mapConflict`), "unknown");
      assert.equal(await evaluate(`new URL(document.querySelector('#pilot-root a').href).searchParams.get('api')`), proxyBase);
      blockCore = true; requests.length = 0;
      await evaluate(`document.querySelector('#pilot-root a').click()`);
      await waitFor(`document.querySelector('#fallback-root table')`, "fallback without core satellite endpoints");
      assert.match(await evaluate(`document.querySelector('#fallback-status').textContent`), /Source files are unavailable.*archived list/);
      assert.equal(await evaluate(`new URL(document.querySelector('[data-back-to-app]').href).searchParams.get('api')`), proxyBase);
      assert.ok(!requests.some((p) => ["/meta", "/sites", "/summary", "/weights"].includes(p)), "fallback requested a core satellite endpoint");
    } finally { proxy.close(); }
  });
  await check("when the API cannot be reached the page explains how to start it", async () => {
    await open(`${BASE}/app/?api=http://127.0.0.1:9`);
    await waitFor(`document.querySelector('#fatal') && !document.querySelector('#fatal').hidden`, "the error message", 30000);
    const text = await evaluate(`document.querySelector('#fatal').textContent`);
    assert.match(text, /could not reach the API/);
    assert.match(text, /uvicorn backend\.api\.main:app/);
    assert.equal(await evaluate(`document.querySelector('#main').hidden`), true);
    assert.equal(await evaluate(`document.querySelector('#loading').hidden`), true);
  });
  await shot("6-api-down");

  await check("no console errors or uncaught exceptions in the whole run (the unreachable-API case is expected)", async () => {
    const unexpected = problems.filter((p) => !/127\.0\.0\.1:9|Failed to load resource|ERR_|net::/i.test(p));
    assert.deepEqual(unexpected, []);
  });
} catch (error) {
  console.error(`\nsmoke test could not run: ${error.stack || error.message}`);
  results.push([false, "setup"]);
} finally {
  try { socket?.close(); } catch { /* already closed */ }
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold a file */ }
}

const failed = results.filter(([ok]) => !ok).length;
console.log(`\n${results.length - failed} of ${results.length} checks passed. Screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
