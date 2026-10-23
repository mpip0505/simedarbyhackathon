# Canopy dashboard system

Written for: anyone who restyles, extends or reviews the web app. The tokens and components below are installed in
[`frontend/css/app.css`](../frontend/css/app.css), and every one of them is drawn on a live page,
[`frontend/styleguide.html`](../frontend/styleguide.html) (open `http://localhost:8000/app/styleguide.html` while the API runs).
The page uses the same stylesheet as the app, so it cannot drift from it. The visual design was explored on a design canvas
(12 boards: colour, type, shape, actions, fields, data, charts, overlays, the Canopy components and the two screens); this
folder is the copy that travels with the code.

## Look in one paragraph
Calm and dense, for data-heavy screens: flat white surfaces, hairline borders, 13px type, and **one hot accent, Ember**. Other
colour is reserved for meaning: status (ok, info, bad, warn) and data (the purple priority ramp, blue for comparison). The
honesty elements (simulated sites, preview scores, limits, credits) are components, not footnotes: they are chips, a notice,
a status card and an always-visible bar.

## Tokens
All are CSS custom properties on `:root` in `app.css`. Use a token, never a raw hex, in new CSS.

| Group | Tokens | Notes |
|---|---|---|
| Type | `--font-sans` Geist, `--font-mono` Geist Mono | Bundled in `vendor/fonts/geist/` (OFL 1.1), so the demo works offline. Atkinson Hyperlegible stays as the fallback face. Body is 13/20; page title 24/32 600; key figure 24/28 500 |
| Neutrals | `--stone-0` to `--stone-950` (14 steps), roles `--page`, `--surface`, `--sidebar`, `--hover`, `--selected`, `--border`, `--text`, `--text-2`, `--text-muted` | A barely warm grey. Stone does almost all the work |
| Accent | `--accent` #FF4D00 (marks, focus, chart bars), `--accent-fill` #D13C06 (buttons, rank pills), `--accent-hover`, `--accent-tint`, `--accent-line` | Two oranges on purpose: white on `--accent` is 3.3:1 (graphics only), white on `--accent-fill` is 4.8:1 (text) |
| Status | `--ok`, `--info`, `--bad`, `--warn`, `--plan`, each with `-bg`, `-line`, `-dot` | Text on its own tint is 6:1 or better in every set |
| Data | `--series` (= Ember), `--series-hi`, `--series-compare` (blue), `--priority` (purple, the score bars), `--corridor` | The map's seven-class ramp is `RAMP` in `js/scale.js` (colour-blind safe) |
| Shape | `--r-1` 4, `--r-2` 6 (controls), `--r-3` 8 (cards), `--r-4` 12 (dialogs); `--shadow-xs/sm/pop/modal`; `--ctl-sm/--ctl/--ctl-lg` 28/32/44; `--row-h` 50 (a row of the ranked list) | Shadows only for things that float |
| Field borders | `--border-input` Stone 300, `--border-check` Stone 500, `--border-search` Stone 300 | Text fields and selects use a soft grey, 1.5:1 on white: well below the 3:1 that WCAG 1.4.11 asks for, a choice the team made for looks (the label, placeholder and focus ring still identify a field). Checkboxes and radios keep Stone 500, 3.2:1. Icon-led search fields keep the light edge: the magnifier and the placeholder identify them |

## Components
Classes carry the look; element ids are only hooks for the scripts and for placement. Each class below is shown in the style guide.

| Component | Classes | Rule |
|---|---|---|
| Buttons | `.btn` + `-primary`, `-secondary`, `-ghost`, `-ink`, `-danger`; `-sm`, `-lg`, `-icon`; `.link-button` | Buttons say what they do. Only the primary action gets colour |
| Chips | `.chip` + `-ok`, `-info`, `-bad`, `-warn`, `-plan`, `-quiet`, `-accent`, `-dot`, `-nodot` | A chip always carries a word. The dot repeats the tone, never carries it alone |
| Fields | `.field` (+ `-search`, `-error`, `-prefix`), `.select`, `.textarea`, `.field-label`, `.field-hint` | A visible label, except an icon-led search |
| Choice | `input.cb`, `input.rd`, `input.sw`, `input[type=range]` (script sets `--p`), `.seg` (+ `-sm`, `.pill`) | Accent only when on |
| Surfaces | `.card` (+ `-flat`, `-raised`), `.sheet`, `.table-card`, `.empty` | |
| Data | `.stats` > `.stat`, `table` (`th`, `td`, `.num`), sortable headings (`.th-sort` with `aria-sort`), `.cell-warn`, `.kv`, `.progress` | Numbers are tabular; rows are 44px |
| Feedback | `.notice` (+ `-bad`, `-info`, `-ok`), `.toast`, `.tooltip`, `.menu`, `.coach`, `dialog` | Notices carry their own icon (CSS mask). None uses the accent |
| Charts | `.chart*` (vertical bars, built by `js/charts.js`), `.hbar*` (comparison bars), `.chart-legend` | Ember leads, blue compares, Stone is the reference. Every vertical bar is a focusable button with a tooltip |
| Map | `.legend`, `.rank-badge`, `.popover`, Leaflet's `.leaflet-bar`, `.leaflet-tooltip`, scale | Colours of the drawn layers live in `js/map.js` |
| Shell | `.sidebar`, `.nav-item`, `.topbar`, `.crumbs`, `.page`, `.page-head`, `.work`, `.rail`, `.honesty` | See the layout below |

Icons are one stroke set on a 24 grid, drawn once as an inline `<svg>` sprite at the top of `index.html` and used with
`<use href="#i-name">`. Icons in scripts come from `icon()` in `js/dom.js`, built with `createElementNS`, never from a string.

## Information architecture
Three layers, each with one job, so a person always knows where to look:
1. **Sidebar: where am I going?** Only pages. A new page gets a sidebar item; a new action never does.
2. **Top bar: what can I do with what I am looking at?** Tour, share and export. They work on every page.
3. **The page: the work itself.** Controls that belong to one page (the map's Layers panel, the list's filters, the card's
   close button) stay on that page.
The honesty bar is information, not navigation, and stays on screen.

**Pages are named like places, with plain nouns.** The sidebar says Home, Map, Sites, Trends, Tracker, Methods and limits and
Advanced tools, grouped as Explore and More. A page title is a noun, not a question or an instruction, so the sidebar reads like
a menu. A first visit opens on Home: one sentence of purpose, three steps, one button each.

**The map is its own page, like a maps app.** The map fills the page and the controls float over it: what matters most and the top
sites in a panel on the left, filters, layers and the shortlist button at the top right, the legend at the bottom right. Opening a site
puts its card in the same place as the left panel and closing it brings the panel back. The data that would crowd the map lives on
Sites: the figures, the sortable table, the shortlist and the analysis cards. On a phone the panel goes under the map.

Every field says why it is asked and what it gives ("Used to estimate how many days a round takes"); a field whose payoff cannot be
written in one line should be optional, or removed. Where a step needs the same value for many rows, offer a one-click default ("Put
them all in Round 1") so nobody types it five times. A page with nothing in it yet shows what it is, what you get, and one button.

**Tracking is a board of stages, not a form.** Every site the person picked is one card on the Tracker, in the column for its stage:
Shortlisted, Visit planned, Visited, Approved, Planted, with Not suitable set to the side. A card says one thing to do next and has one
button; the button opens that step on its own page (plan the visit, record the visit, decide, mark planted, record trees) with a map of the
site and a row showing where it is on its journey. Cards are never dragged: a site only moves on through its step and its evidence, so the
honesty rules hold (approval needs a recorded visit, all five checks OK and a named, dated decision). What blocks a step is said on the
card ("Missing: ..."). Tools for a real pilot that the journey does not need (field sheet imports, evidence, costs, scenarios) are under
More > Advanced tools.

**One place for each thing.** The map page only picks sites: the site card has "Add to shortlist", and a slim "Your shortlist" bar
under the map lists what was picked and leads to the Pilot plan. Status, field checks, notes and downloads exist only in the Pilot plan,
so a person never has two plans to keep in step. Controls that repeat one another are hidden (the origin filter in the list follows
the one above the map), warnings show only when there is something to warn about (the data-source chip shows only for mock data),
and extra analysis sits under a "Go deeper" heading marked optional.

**A flow with ordered steps** (Create pilot plan) is its own page, opened from a table: the table comes first, with a "Create pilot plan"
button at the top right (Supabase, ElevenLabs), and the flow takes over the page (Stripe, AWS Amplify, Xero, Klaviyo). It has a step
rail that is a list, not buttons, so no step can be skipped: you move with Back and Next only, the step you are on is orange and
finished steps are ticked. One step is one page with a "Step n of N" heading, a one-line intro, the controls, and Back and Next in a
bar that stays at the foot. Finished steps show a check icon. The flow and a single site open as their own page: the sidebar is
hidden and only "Save and exit" or Back lead out, and the page sits centred. The last step is a review. "Save and exit" is always
there because choices are saved as you go. Nothing is folded away: no accordions, so what a step needs is on the page. On a phone the
rail becomes a thin progress bar.

**Required fields and errors.** Next is never greyed out. Pressing it with something missing lists the problems in a red notice at
the top of the step (each one a link to its field) and marks the fields themselves: a red border (`aria-invalid`) and a one-line
message with an alert icon under the field. They disappear as soon as the field is fixed. Optional fields say "(optional)", required
ones say "(required)". A form that submits in place (recording a tree) shows the same field messages without redrawing, so what was
typed stays. Checkboxes use the design system's `cb` class and file pickers
use the `file` component (a secondary button plus the chosen name); the browser's own controls are never shown. Dates use the date picker (`dateInput` in `form-ui.js`): the
browser's own calendar inside a normal field with our calendar icon, the whole field opens it, and `min`/`max` stop a visit or a planting
being dated in the future. Selects use the combobox (`select-ui.js`): a button styled like a field that opens a list styled
like our menus, with a tick on the current choice and greyed-out options that cannot be picked (their tooltip says why). The native
`<select class="select">` stays inside, hidden, holding the value, so change handlers keep working; every `select.select` on the
page is enhanced, including ones drawn later. Keyboard: Enter, Space or an arrow opens it; arrows, Home, End and a typed letter move;
Enter picks; Escape closes without closing anything else.

After the flow, the table page is where the work happens: tabs (Sites, Field results, Trees, Evidence), and one site opens on its own
page rather than unfolding inside the table.

## Layout
A sidebar and a column. The column is a top bar, notices, the scrolling page, and the honesty bar pinned at the bottom.

- **Sidebar** (248px): organisation, a project switcher (a button with a menu of the projects, a tick on the current one and "Add a
  city"; the projects are listed in `js/projects.js`), then Home, then pages only, in two groups: Explore (Map, Sites, Trends, Tracker)
  and More (Methods and limits, Advanced tools). It ends at the last page: the simulated and score-source chips are on Sites, and the honesty bar is always on screen. Nothing in it is an action.
- **Top bar**: the breadcrumb, and the tools for the page you are on: Take the tour, Share (copies
  a link that keeps the sliders and the selected site) and Export (a menu: ranked list as CSV, map file for GIS, planting brief
  to print). On a phone the breadcrumb goes and the tools shrink to icons.
- **Plant first**: page header with the honesty chips, a strip of four figures, then a work area: the map card (filter, Layers
  panel, download; legend, hint and source credit over the map) beside a rail with "What matters most?" and "Top sites". The
  map card stretches to the height of the rail. "Top sites" is a window exactly five rows tall, so nothing in it changes the
  layout. A pick on the map or in the list opens the site card as a panel on the left of the map: the rest of the map stays
  usable, the map moves to keep the picked site clear of the panel, and the legend steps to the right.
- **Trends**: headline and the metric switch, a strip of five figures, two linked portrait maps with one legend, and
  a column of cards ("How sure are we?", the two verdicts), then "Year by year": two charts and a table, and the data credits.
- **Breakpoints**: below 1200px the rail and the cards drop under the map at full width; below 900px the sidebar becomes a
  strip along the top; below 640px every control grows to 44px, the top bar hides and the map is taller.

## Accessibility
- Text contrast is 4.5:1 or better everywhere. The non-text exceptions are the soft edges of text fields, selects and icon-led search fields (see
  Tokens). The focus ring is a 2px Ember outline. Targets are 22 to 32px on desktop (the small segmented control is the 22px
  one) and 44px below 640px.
- The active view is marked with `aria-current="page"`. Escape closes the layer panel and the site card, and focus goes back to
  where the card was opened from. Chart columns, rank badges, list rows and every control are reachable by keyboard; `prefers-reduced-motion` turns off transitions and smooth scrolling.
- Colour never carries meaning alone: statuses are words first, ranks are numbers, the corridor is dashed.

## Extending it
1. Reach for an existing component first. If you need a new one, add it to `app.css` with tokens only and to `styleguide.html`.
2. Keep the honesty rules in [frontend.md](frontend.md): every element marked `data-required="honesty"` stays, and
   `frontend/tests/copy.test.mjs` fails if one goes.
3. Build DOM with `el()` and text nodes. `tests/safety.test.mjs` forbids HTML sinks.
4. Run `node --test "frontend/tests/*.test.mjs"`, then `node frontend/tools/smoke.mjs` with the API running.

## Where the app differs from the canvas
The canvas shows Plant first with a site already selected and the site card under the map; the app opens with nothing selected
(a one-time hint says what to click) and shows the card as a panel on the left of the map, on the team's request. The canvas's Help
item and user row are left out (there is no help page and there are no users). The canvas lists Layers as a page; in the
app Layers is a button on the map card. Sites, Pilot plan and Methods and limits are real pages (the canvas does not draw them), and the
canvas's Quick access list became the top bar's tools. "See all" scrolls inside the same five-row window, and the Layers panel is a popover.
