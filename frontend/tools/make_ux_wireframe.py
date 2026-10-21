"""Draw the UX wireframe (map-first direction): docs/ux-wireframe.svg. Render the PNG with Chrome (see docs/ux-wireframe.md).

Run:  python frontend/tools/make_ux_wireframe.py
UX, not UI: greyscale boxes show structure, content, flow and wording. Colours, type and styling are the designer's.
Letters (A to H) match the parts table in docs/ux-wireframe.md.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "docs" / "ux-wireframe.svg"
W = 1260
parts = []


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def rect(x, y, w, h, fill="none", stroke="#555", dash=None, rx=0, sw=1):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')


def text(x, y, s, size=12, weight="normal", fill="#222", anchor="start", italic=False):
    st = ' font-style="italic"' if italic else ""
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{st}>{esc(s)}</text>')


def line(x1, y1, x2, y2, stroke="#888", dash=None, sw=1, arrow=False):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = ' marker-end="url(#arrow)"' if arrow else ""
    parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"{d}{m}/>')


def call(letter, x, y):
    parts.append(f'<circle cx="{x}" cy="{y}" r="11" fill="#1c1c1c"/>')
    text(x, y + 4, letter, 11, "bold", "#fff", "middle")


def chip(x, y, w, label, warn=False, h=22):
    rect(x, y, w, h, "#fff3cd" if warn else "#f4f4f4", "#b8860b" if warn else "#888", rx=11)
    text(x + w / 2, y + h / 2 + 4, label, 10.5, anchor="middle")


def panel(x, y, w, h, title, dash=None):
    rect(x, y, w, h, "#ffffff", "#444", dash=dash, rx=6, sw=1.3)
    text(x + 12, y + 22, title, 13, "bold")


def slider(x, y, w, label, hint, pct):
    text(x, y, label, 12, "bold")
    text(x, y + 14, hint, 10, fill="#666")
    rect(x, y + 22, w - 8, 5, "#ddd", "#bbb", rx=2)
    parts.append(f'<circle cx="{x + (w - 8) * pct / 100}" cy="{y + 24.5}" r="7" fill="#fff" stroke="#555"/>')


def wrap(x, y, s, width_chars, size=11, fill="#333", lh=15):
    words, cur, yy = s.split(), "", y
    for w in words:
        if len(cur) + len(w) + 1 > width_chars:
            text(x, yy, cur.strip(), size, fill=fill)
            yy += lh
            cur = ""
        cur += w + " "
    if cur.strip():
        text(x, yy, cur.strip(), size, fill=fill)
        yy += lh
    return yy


def top_strip(oy, active):
    rect(0, oy, 1180, 64, "#fafafa")
    text(16, oy + 27, "Where to plant first in City of Elmina", 18, "bold")
    text(16, oy + 47, "Sites ranked by heat relief, green links and shade for walkers", 11, fill="#666")
    chip(520, oy + 20, 160, "Example sites (simulated)", True, 24)
    chip(688, oy + 20, 262, "Preview scores: ML model not connected yet", True, 24)
    rect(972, oy + 16, 200, 32, "#fff", "#555", rx=16)
    rect(974 if active == 0 else 1072, oy + 18, 98, 28, "#222", "#222", rx=14)
    text(1023, oy + 37, "Plant first", 12, fill="#fff" if active == 0 else "#222", anchor="middle")
    text(1121, oy + 37, "Before and after", 11, fill="#fff" if active == 1 else "#222", anchor="middle")


def honesty_bar(y):
    rect(0, y, 1180, 34, "#fafafa", "#999")
    text(16, y + 21, "Example sites, not Sime Darby Property's list  ·  Preview scores until the ML model is connected  ·  Limits of this data ▸  ·  Data credits ▸", 11, fill="#444")


def map_bg(x, y, w, h):
    rect(x, y, w, h, "#ececea", "#666")
    rect(x + w * 0.38, y + h * 0.18, w * 0.14, h * 0.55, "#cfe3c2", "#8aa", dash="4 3")
    parts.append(f'<path d="M{x + w * 0.30},{y + h * 0.62} L{x + w * 0.44},{y + h * 0.40} L{x + w * 0.58},{y + h * 0.48} L{x + w * 0.66},{y + h * 0.70}" fill="none" stroke="#c2410c" stroke-width="2" stroke-dasharray="6 4"/>')
    for dx, dy, c in [(0.34, 0.50, "#edf8fb"), (0.37, 0.58, "#bfd3e6"), (0.62, 0.62, "#9ebcda"), (0.55, 0.30, "#bfd3e6"), (0.28, 0.38, "#edf8fb"), (0.70, 0.40, "#9ebcda")]:
        rect(x + w * dx, y + h * dy, 8, 8, c, "#fff")


# ---------------------------------------------------------------------------------------------
text(0, 30, "UX wireframe: Elmina Canopy Prioritiser, map-first direction", 22, "bold")
text(0, 52, "Structure, content, flow and wording only. Greyscale on purpose: colour, type and styling are the designer's. Letters match docs/ux-wireframe.md.", 12, fill="#555")

# ============ Screen 1: Plant first ============
oy = 92
text(0, oy - 8, "Screen 1: Plant first (the screen the client sees first)", 14, "bold")
parts.append(f'<g transform="translate(40,{oy})">')
rect(0, 0, 1180, 706, "#fff", "#222", sw=1.5)
top_strip(0, 0)
call("A", -16, 32)
map_bg(0, 64, 1180, 608)
call("B", 600, 84)
# emphasised top sites
for i, (dx, dy) in enumerate([(0.44, 0.47), (0.40, 0.55), (0.52, 0.44), (0.48, 0.60), (0.60, 0.52)]):
    cx, cy = 1180 * dx, 64 + 608 * dy
    rect(cx - 9, cy - 9, 18, 18, "#6e016b", "#111", sw=2)
    text(cx, cy + 4, str(i + 1), 10, "bold", "#fff", "middle")
# coach mark
rect(560, 250, 230, 40, "#222", "#222", rx=6)
text(675, 267, "Click a site to see why", 11, fill="#fff", anchor="middle")
text(675, 282, "it ranks here", 11, fill="#fff", anchor="middle")
call("H", 548, 252)

# C: what matters most
panel(16, 80, 280, 214, "What matters most?")
slider(28, 126, 256, "Heat relief", "Favours hot, bare areas", 60)
slider(28, 170, 256, "Links green areas", "Closes gaps in the green corridor", 50)
slider(28, 214, 256, "Shade for walkers", "Adds shade along footpaths", 35)
text(28, 274, "Reset", 11, "bold", "#1a4fd6"); text(100, 274, "The list and map update as you move these", 9.5, fill="#777")
call("C", 4, 92)

# D: top sites
panel(16, 306, 280, 356, "Top sites")
text(280, 328, "564 in total", 10, fill="#666", anchor="end")
for i, l in enumerate(["All", "Open land", "Corridor edge"]):
    chip(28 + i * 82, 336, 76 if i != 2 else 96, l, False, 20)
rect(28, 362, 256, 20, "#fff", "#aaa", rx=4); text(36, 376, "Find a site", 10, fill="#999")
rows = [("1", "ELM-3719-11715", "hot, no shade", "82"), ("2", "ELM-3766-11758", "next to corridor gap", "81"), ("3", "ELM-3766-11756", "hot, no shade", "81"),
        ("4", "ELM-3736-11743", "gap in corridor", "81"), ("5", "ELM-3763-11750", "hot surroundings", "80"), ("6", "ELM-3767-11758", "no shade", "80")]
for i, (r, n, why, s) in enumerate(rows):
    y = 390 + i * 34
    rect(28, y, 256, 30, "#e3d7ee" if i == 0 else "#fff", "#ccc", rx=3)
    text(36, y + 14, r, 11, "bold"); text(58, y + 13, n, 11); text(58, y + 25, why, 9.5, fill="#666"); text(276, y + 19, s, 12, "bold", anchor="end")
text(28, 614, "See all 564 sites ▸", 11, "bold", "#1a4fd6"); text(284, 614, "Download list", 11, "bold", "#1a4fd6", "end")
text(28, 646, "Collapse this panel to see more of the map", 9.5, fill="#777", italic=True)
call("D", 4, 320)

# E: site card
panel(884, 80, 280, 432, "Site card (appears when a site is selected)", dash="5 3")
text(896, 124, "ELM-3719-11715", 13, "bold"); text(1152, 124, "#1 of 564", 12, "bold", anchor="end")
chip(896, 132, 120, "Example site", True, 20); chip(1022, 132, 110, "Corridor edge", False, 20)
y = wrap(896, 176, "Hot surroundings, a footpath with no shade, and right next to a gap in the corridor.", 40, 12, "#222", 16)
for i, (lab, v) in enumerate([("Heat relief", 57), ("Links green areas", 99), ("Shade for walkers", 100)]):
    yy = 238 + i * 30
    text(896, yy, lab, 11); text(1152, yy, f"{v}", 11, "bold", anchor="end")
    rect(896, yy + 6, 256, 7, "#eee", sw=0); rect(896, yy + 6, 256 * v / 100, 7, "#8c6bb1", sw=0)
text(896, 346, "Why it ranks here", 12, "bold")
for i, t in enumerate(["Hotter than 76% of sites around it", "Less green than 54% of sites", "459 m of nearby path has no shade", "3 m from a gap in the corridor"]):
    text(902, 364 + i * 16, "• " + t, 10.5)
text(896, 444, "The numbers ▸", 11, "bold", "#1a4fd6")
text(896, 464, "Temperatures rank sites against each other;", 9.5, fill="#777"); text(896, 477, "they are not exact readings.", 9.5, fill="#777")
rect(896, 486, 256, 20, "#fff3cd", "#b8860b", rx=3); text(904, 500, "Preview score: model not connected yet", 9.5, fill="#6b5200")
call("E", 872, 92)

# F: legend + layers
rect(320, 620, 330, 40, "#fff", "#444", rx=6)
text(332, 638, "Higher priority = plant sooner", 10.5)
for i, c in enumerate(["#edf8fb", "#bfd3e6", "#9ebcda", "#8c96c6", "#8c6bb1", "#88419d", "#6e016b"]):
    rect(332 + i * 38, 644, 38, 10, c, "#fff", sw=0)
rect(884, 530, 280, 132, "#ffffff", "#444", rx=6, sw=1.3)
text(896, 550, "Map layers", 12, "bold")
for i, t in enumerate(["Example sites", "Green corridor (approximate)", "Greenness (satellite)", "Ground heat (satellite)"]):
    rect(896, 560 + i * 20, 11, 11, "#fff", "#555"); text(914, 570 + i * 20, t, 10.5)
    if i < 2:
        text(897, 570 + i * 20, "✓", 11, "bold", "#222")      # on by default
text(896, 654, "Street map (needs internet)", 10, fill="#888")
call("F", 304, 640)
honesty_bar(672)
call("G", -16, 690)
parts.append("</g>")

# ============ Screen 2: Before and after ============
oy2 = oy + 706 + 90
text(0, oy2 - 8, "Screen 2: Before and after", 14, "bold")
parts.append(f'<g transform="translate(40,{oy2})">')
rect(0, 0, 1180, 640, "#fff", "#222", sw=1.5)
top_strip(0, 1)
text(16, 100, "Has tree cover changed? Not detectably so far.", 17, "bold")
text(16, 120, "Compared with the earlier period, the difference is smaller than the normal swing from year to year.", 11, fill="#666")
text(16, 148, "Show:   (•) Greenness    ( ) Ground heat", 12)
for x, lab in [(16, "2021 to 2023"), (604, "2024 to 2026")]:
    text(x, 176, lab, 12, "bold")
    rect(x, 184, 560, 220, "#ececea", "#666")
    parts.append(f'<path d="M{x + 190},{198} L{x + 320},{222} L{x + 350},{310} L{x + 290},{392} L{x + 200},{360} Z" fill="#a9d28d" stroke="#6a8" stroke-dasharray="4 3"/>')
text(590, 300, "linked", 10, fill="#555", anchor="middle", italic=True); text(590, 313, "pan + zoom", 10, fill="#555", anchor="middle", italic=True)
text(16, 424, "Same colour scale on both maps. Ground heat is estimated and gap-filled: it ranks areas, it is not an exact reading.", 10, fill="#666")
for i, (ttl, big, verdict, note) in enumerate([
        ("Tree-cover estimate", "9.7% → 10.4%", "No detectable change", "A satellite greenness estimate, not a tree count."),
        ("Ground heat", "38.6 → 42.1 °C", "Indicative only", "Different clear days and seasons feed each period."),
        ("How sure are we?", "4% to 28%", "Independent maps disagree", "Same place, three methods: see the bars.")]):
    x = 16 + i * 388
    rect(x, 440, 372, 130, "#fff", "#888", rx=6); text(x + 12, 462, ttl, 12, "bold"); text(x + 12, 496, big, 22); text(x + 12, 518, verdict, 12, "bold"); text(x + 12, 536, note, 10, fill="#666")
    if i == 2:
        for j, (m, v) in enumerate([("WorldCover", 27.7), ("Dynamic World", 7.1), ("Our estimate", 9.7)]):
            text(x + 200, 470 + j * 18, m, 9.5); rect(x + 270, 462 + j * 18, v * 3, 8, "#6b8fb5", sw=0)
text(16, 596, "Year by year ▸     Limits of this data ▸", 11, "bold", "#1a4fd6")
honesty_bar(606)
parts.append("</g>")

# ============ User journey ============
oy3 = oy2 + 640 + 90
text(0, oy3 - 8, "The journey: what a client does in about a minute", 14, "bold")
parts.append(f'<g transform="translate(40,{oy3})">')
steps = [("1  See the answer", "The map opens with the top sites marked 1 to 5, and a plain headline: where to plant first."),
         ("2  Ask \"what if?\"", "Move a slider, e.g. care more about shade. List and map re-order at once; a short note says what changed."),
         ("3  Pick a site", "Click a marker or a list row. The site card says why in one sentence, then in four bullets."),
         ("4  Check time", "Switch to Before and after. Honest verdict: no detectable change; here is how sure we are."),
         ("5  Take it away", "Download the ranked list (CSV), clearly marked as example sites with preview scores.")]
for i, (t, d) in enumerate(steps):
    x = i * 238
    rect(x, 0, 222, 150, "#fafafa", "#666", rx=6); text(x + 12, 24, t, 13, "bold"); wrap(x + 12, 46, d, 33, 11, "#333", 15)
    if i < 4:
        line(x + 224, 75, x + 236, 75, "#555", sw=2, arrow=True)
parts.append("</g>")

# ============ States ============
oy4 = oy3 + 150 + 80
text(0, oy4 - 8, "States to design (wording matters more than looks)", 14, "bold")
parts.append(f'<g transform="translate(40,{oy4})">')
states = [("Loading", "\"Loading Elmina data...\" with the map frame visible, so the page never looks empty.", "#f4f4f4", "#888"),
          ("Nothing selected", "Site card shows: \"Click a site to see why it ranks here.\" A one-time hint points at the map.", "#f4f4f4", "#888"),
          ("No sites match", "\"No sites match these filters.\" with a Clear filters button. Never a blank list.", "#f4f4f4", "#888"),
          ("Data service unreachable", "Says what happened, gives the start command, offers Retry. No jargon, no apology.", "#f8d7da", "#c0392b"),
          ("Example data in use", "Unmissable banner: this is invented sample data, do not present as Elmina results.", "#f8d7da", "#c0392b"),
          ("Preview scores / score file problem", "Amber note until the ML model is connected; a clear notice if its file is rejected or out of date.", "#fff3cd", "#b8860b")]
for i, (t, d, fill, stroke) in enumerate(states):
    x, y = (i % 3) * 396, (i // 3) * 116
    rect(x, y, 380, 100, fill, stroke, dash="5 3", rx=6); text(x + 12, y + 24, t, 13, "bold"); wrap(x + 12, y + 46, d, 58, 11, "#333", 15)
parts.append("</g>")

H = oy4 + 232 + 40
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial, Helvetica, sans-serif">'
       '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
       '<path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>'
       '<title>UX wireframe: Elmina Canopy Prioritiser, map-first direction</title><rect width="100%" height="100%" fill="#ffffff"/>'
       '<g transform="translate(20,0)">' + "".join(parts) + "</g></svg>")
OUT.write_text(svg, encoding="utf-8")
print(f"wrote {OUT} ({W} x {H})")
