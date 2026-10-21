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
| Field borders | `--border-input` Stone 500, `--border-search` Stone 300 | Stone 500 is 3.2:1 on white, the lightest grey that passes WCAG 1.4.11. Icon-led search fields keep the light edge: the magnifier and the placeholder identify them |

## Components
Classes carry the look; element ids are only hooks for the scripts and for placement. Each class below is shown in the style guide.

| Component | Classes | Rule |
|---|---|---|
| Buttons | `.btn` + `-primary`, `-secondary`, `-ghost`, `-ink`, `-danger`; `-sm`, `-lg`, `-icon`; `.link-button` | Buttons say what they do. Only the primary action gets colour |
| Chips | `.chip` + `-ok`, `-info`, `-bad`, `-warn`, `-plan`, `-quiet`, `-accent`, `-dot`, `-nodot` | A chip always carries a word. The dot repeats the tone, never carries it alone |
| Fields | `.field` (+ `-search`, `-error`, `-prefix`), `.select`, `.textarea`, `.field-label`, `.field-hint` | A visible label, except an icon-led search |
| Choice | `input.cb`, `input.rd`, `input.sw`, `input[type=range]` (script sets `--p`), `.seg` (+ `-sm`, `.pill`) | Accent only when on |
| Surfaces | `.card` (+ `-flat`, `-raised`), `.sheet`, `.table-card`, `.empty` | |
| Data | `.stats` > `.stat`, `table` (`th`, `td`, `.num`), `.kv`, `.progress` | Numbers are tabular; rows are 44px |
| Feedback | `.notice` (+ `-bad`, `-info`, `-ok`), `.toast`, `.tooltip`, `.menu`, `.coach`, `dialog` | Notices carry their own icon (CSS mask). None uses the accent |
| Charts | `.chart*` (vertical bars, built by `js/charts.js`), `.hbar*` (comparison bars), `.chart-legend` | Ember leads, blue compares, Stone is the reference. Every vertical bar is a focusable button with a tooltip |
| Map | `.legend`, `.rank-badge`, `.popover`, Leaflet's `.leaflet-bar`, `.leaflet-tooltip`, scale | Colours of the drawn layers live in `js/map.js` |
| Shell | `.sidebar`, `.nav-item`, `.side-status`, `.topbar`, `.crumbs`, `.page`, `.page-head`, `.work`, `.rail`, `.honesty` | See the layout below |

Icons are one stroke set on a 24 grid, drawn once as an inline `<svg>` sprite at the top of `index.html` and used with
`<use href="#i-name">`. Icons in scripts come from `icon()` in `js/dom.js`, built with `createElementNS`, never from a string.

## Layout
A sidebar and a column. The column is a top bar, notices, the scrolling page, and the honesty bar pinned at the bottom.

- **Sidebar** (248px): organisation, project, the two views (Plant first, Before and after), shortcuts (Sites and Layers jump
  to the list and the layer panel on Plant first; Methods and limits opens the limits dialog), Quick access (download, credits)
  and a Data status card that repeats the simulated and score-source chips.
- **Plant first**: page header with the honesty chips, a strip of four figures, then a work area: the map card (filter, Layers
  panel, download; legend, hint and source credit over the map) beside a rail with "What matters most?" and "Top sites". The
  map card stretches to the height of the rail. "Top sites" is a window exactly five rows tall, so nothing in it changes the
  layout. A pick on the map or in the list opens the site card as a panel on the left of the map: the rest of the map stays
  usable, the map moves to keep the picked site clear of the panel, and the legend steps to the right.
- **Before and after**: headline and the metric switch, a strip of five figures, two linked portrait maps with one legend, and
  a column of cards ("How sure are we?", the two verdicts), then "Year by year": two charts and a table, and the data credits.
- **Breakpoints**: below 1200px the rail and the cards drop under the map at full width; below 900px the sidebar becomes a
  strip along the top; below 640px every control grows to 44px, the top bar hides and the map is taller.

## Accessibility
- Text contrast is 4.5:1 or better everywhere. The one non-text exception is the light edge of an icon-led search field (see
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
item and user row are left out (there is no help page and there are no users). The canvas lists Sites and Layers as pages; in the
app they are shortcuts on Plant first. "See all" scrolls inside the same five-row window, and the Layers panel is a popover.
