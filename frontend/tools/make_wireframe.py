"""Draw the wireframe diagram for the designer: docs/wireframe.svg (a screenshot-ready PNG is made from it).

Run:  python frontend/tools/make_wireframe.py
Numbered callouts match the table in docs/frontend.md (component, data source, what must be kept).
Greyscale on purpose: it shows structure and content, not the visual design, which is the designer's job.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "docs" / "wireframe.svg"
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


def line(x1, y1, x2, y2, stroke="#888", dash=None, sw=1):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"{d}/>')


def call(n, x, y):
    parts.append(f'<circle cx="{x}" cy="{y}" r="11" fill="#1c1c1c"/>')
    text(x, y + 4, n, 11, "bold", "#fff", "middle")


def chip(x, y, w, label, warn=False):
    rect(x, y, w, 24, "#fff3cd" if warn else "#f4f4f4", "#b8860b" if warn else "#888", rx=12)
    text(x + w / 2, y + 16, label, 11, anchor="middle")


def button(x, y, w, label, dark=False, h=26):
    rect(x, y, w, h, "#222" if dark else "#fff", "#555")
    text(x + w / 2, y + h / 2 + 4, label, 12, fill="#fff" if dark else "#222", anchor="middle")


def slider(x, y, w, label, pct):
    text(x, y, label, 12)
    rect(x, y + 10, w - 50, 5, "#ddd", "#bbb", rx=2)
    parts.append(f'<circle cx="{x + (w - 50) * pct / 100}" cy="{y + 12.5}" r="7" fill="#fff" stroke="#555"/>')
    text(x + w, y + 16, f"{pct}%", 12, anchor="end")


def header(oy, title_note=True):
    rect(0, oy, 1180, 70, "#fafafa")
    text(16, oy + 28, "Elmina Canopy Prioritiser", 20, "bold")
    text(16, oy + 50, "Screening tool: ranks where to look first. Candidate sites are simulated. Not a tree count or a carbon figure.", 11, fill="#555")
    chip(560, oy + 20, 120, "Simulated sites", True)
    chip(688, oy + 20, 150, "Data: cached real data")
    chip(846, oy + 20, 200, "Scores: placeholder, ML not merged", True)
    chip(1054, oy + 6, 118, "Built 2026-10-20")
    button(980, oy + 40, 90, "Prioritise", dark=True, h=24)
    button(1076, oy + 40, 96, "Before / after", h=24)


def footer(y):
    rect(0, y, 1180, 56, "#fafafa")
    text(16, y + 20, "Limits of this data (list from /meta caveats): simulated sites, approximate corridor, ranking-grade temperature,", 11, fill="#444")
    text(16, y + 36, "canopy is a proxy and independent maps disagree, no ground truth...", 11, fill="#444")
    text(16, y + 52, "Attribution (from /meta): Map data © OpenStreetMap contributors · Copernicus Sentinel-2 · Landsat (USGS) · Google Earth Engine", 11, fill="#444")


def map_block(x, y, w, h, label, legend=True, toggles=True):
    rect(x, y, w, h, "#ececea", "#666")
    rect(x + 8, y + 8, 26, 52, "#fff", "#888")
    text(x + 21, y + 29, "+", 16, anchor="middle")
    text(x + 21, y + 52, "−", 16, anchor="middle")
    rect(x + w * 0.30, y + h * 0.22, w * 0.22, h * 0.50, "#cfe3c2", "#8aa", dash="4 3")      # park
    parts.append(f'<path d="M{x + w * 0.28},{y + h * 0.5} L{x + w * 0.45},{y + h * 0.35} L{x + w * 0.62},{y + h * 0.42} L{x + w * 0.70},{y + h * 0.62}" fill="none" stroke="#c2410c" stroke-width="2" stroke-dasharray="6 4"/>')
    for i, (dx, dy, c) in enumerate([(0.34, 0.45, "#6e016b"), (0.38, 0.41, "#88419d"), (0.42, 0.38, "#8c6bb1"), (0.50, 0.40, "#9ebcda"),
                                     (0.55, 0.44, "#bfd3e6"), (0.47, 0.58, "#88419d"), (0.60, 0.55, "#8c96c6"), (0.25, 0.30, "#edf8fb")]):
        rect(x + w * dx, y + h * dy, 9, 9, c, "#fff")
    text(x + w - 12, y + h - 10, label, 11, anchor="end", fill="#555", italic=True)
    if toggles:
        rect(x + w - 150, y + 8, 142, 104, "#fff", "#888")
        text(x + w - 142, y + 24, "Layers", 11, "bold")
        for i, t in enumerate(["Sites", "Corridor (approximate)", "Map detail", "Vegetation (NDVI)", "Surface temperature", "Street map (online)"]):
            rect(x + w - 142, y + 31 + i * 13, 8, 8, "#fff", "#555")
            text(x + w - 129, y + 39 + i * 13, t, 10)
    if legend:
        rect(x + 8, y + h - 66, 190, 54, "#fff", "#888")
        text(x + 14, y + h - 51, "Priority score (higher = plant sooner)", 10)
        for i, c in enumerate(["#edf8fb", "#bfd3e6", "#9ebcda", "#8c96c6", "#8c6bb1", "#88419d", "#6e016b"]):
            rect(x + 14 + i * 22, y + h - 44, 22, 10, c, "#fff", sw=0)
        text(x + 14, y + h - 22, "5", 10)
        text(x + 168, y + h - 22, "83", 10)


oy1 = 70
text(0, 30, "Wireframe: Elmina Canopy Prioritiser (barebones build)", 22, "bold")
text(0, 52, "Structure and content only. Callout numbers are explained in docs/frontend.md. Grey = layout; dashed = shown only when relevant; example values only.", 12, fill="#555")

# ===================== Screen 1: Prioritise =====================
text(0, oy1 - 6, "Screen 1: Prioritise", 14, "bold", "#1c1c1c")
parts.append(f'<g transform="translate(40,{oy1 + 6})">')
rect(0, 0, 1180, 790, "#fff", "#222", sw=1.5)
header(0)
call(1, -16, 20); call(2, 540, 32); call(3, 954, 52)
rect(0, 76, 1180, 26, "#fff3cd", "#b8860b", dash="5 3")
text(14, 93, "Notice strip (only when needed): MOCK data banner · scores.geojson problem · ML scores out of date · street tiles offline", 11, fill="#6b5200")
call(4, -16, 89)

# left column
line(300, 108, 300, 730); line(880, 108, 880, 730)
text(14, 128, "Weights", 13, "bold")
slider(14, 146, 270, "Cooling benefit", 40); slider(14, 182, 270, "Habitat connectivity", 35); slider(14, 218, 270, "Shade on walking routes", 25)
button(14, 244, 130, "Reset to default")
call(5, -16, 160)
text(14, 292, "Ranked sites (564 of 564)", 13, "bold")
for i, l in enumerate(["( ) All", "( ) Open land", "( ) Corridor edge"]):
    text(14 + i * 92, 312, l, 11)
rect(14, 320, 270, 22, "#fff", "#888"); text(20, 335, "Find site  e.g. ELM-3672", 11, fill="#888")
call(6, -16, 318)
rect(14, 350, 272, 24, "#eee", "#888")
for x, t in [(20, "#"), (44, "Site"), (140, "Total"), (186, "Cool"), (224, "Conn"), (258, "Shade")]:
    text(x, 366, t, 10, "bold")
for r in range(10):
    y = 374 + r * 21
    rect(14, y, 272, 21, "#e3d7ee" if r == 0 else "#fff", "#ddd")
    text(20, y + 14, str(r + 1), 10); text(44, y + 14, f"ELM-37xx-117{50 - r}", 10)
    for x in (146, 190, 228, 262):
        rect(x, y + 6, 18, 8, "#ddd", "#ccc", rx=1)
call(7, -16, 366)
button(14, 592, 190, "Download ranked list (CSV)")
call(8, -16, 604)
text(150, 640, "Table order = API ranking (ML model when merged).", 10, fill="#777", anchor="middle")
text(150, 654, "Moving a slider re-ranks in the browser", 10, fill="#777", anchor="middle")
text(150, 667, "using the same formula as the API.", 10, fill="#777", anchor="middle")

# map
map_block(300, 108, 580, 622, "Offline OSM basemap + corridor (dashed orange) + sites coloured by score")
call(9, 316, 128); call(10, 316, 662); call(11, 714, 128)

# detail panel
text(894, 128, "Site detail", 13, "bold")
text(894, 150, "ELM-3719-11715", 12, "bold")
chip(986, 134, 76, "Simulated", True); chip(1066, 134, 100, "Corridor edge", True)
text(894, 174, "Rank 1 of 564, total score 82.5 / 100", 11)
rect(894, 182, 276, 30, "#fff3cd", "#b8860b", dash="5 3")
text(900, 201, "Placeholder score: the ML model has not been merged yet.", 10, fill="#6b5200")
text(894, 232, "Scores", 12, "bold")
for i, (lab, v) in enumerate([("Cooling benefit", 57), ("Habitat connectivity", 99), ("Shade on walking routes", 100)]):
    y = 246 + i * 30
    text(894, y + 10, lab, 11); text(1170, y + 10, f"{v} / 100", 11, "bold", anchor="end")
    rect(894, y + 15, 276, 7, "#eee", sw=0); rect(894, y + 15, 276 * v / 100, 7, "#8c6bb1", sw=0)
text(894, 352, "What drives the rank", 12, "bold")
text(894, 368, "Each score times its weight, in points of the total:", 10, fill="#666")
for i, (lab, v) in enumerate([("Habitat connectivity (35%)", 35), ("Shade on walking routes (25%)", 25), ("Cooling benefit (40%)", 23)]):
    y = 376 + i * 28
    text(894, y + 10, lab, 11); text(1170, y + 10, f"{v} pts", 11, "bold", anchor="end")
    rect(894, y + 14, 276, 6, "#eee", sw=0); rect(894, y + 14, 276 * v / 40, 6, "#6e016b", sw=0)
for i, t in enumerate(["Surroundings hotter than 76% of candidate sites", "Surroundings less green than 54% of sites",
                       "310 m of the 469 m of nearby path has no canopy", "Next to a gap in the approximate corridor (3 m)",
                       "26 residential buildings within 250 m"]):
    text(902, 474 + i * 15, "• " + t, 10)
text(894, 568, "Measurements", 12, "bold")
for i, t in enumerate(["Surface temperature, site (ranking only)", "Surface temperature, 250 m around", "Vegetation (NDVI), site / 250 m around",
                       "Walking path within 50 m / without canopy", "Distance to nearest corridor gap / park", "Real (not gap-filled) temperature pixels"]):
    line(894, 576 + i * 17, 1170, 576 + i * 17, "#ddd"); text(896, 589 + i * 17, t, 10, fill="#444"); text(1170, 589 + i * 17, "–", 10, anchor="end")
text(894, 692, "Temperatures are for ranking sites against each", 10, fill="#777"); text(894, 705, "other, not exact values.", 10, fill="#777")
call(12, 1160, 128)
footer(734); call(13, -16, 760)
parts.append("</g>")

# ===================== Screen 2: Before / after =====================
oy2 = oy1 + 790 + 80
text(0, oy2 - 6, "Screen 2: Before / after", 14, "bold", "#1c1c1c")
parts.append(f'<g transform="translate(40,{oy2 + 6})">')
rect(0, 0, 1180, 1010, "#fff", "#222", sw=1.5)
header(0)
text(16, 100, "Before / after", 15, "bold")
text(16, 118, "Baseline 2021-10 to 2023-09 compared with Latest 2024-10 to 2026-09. Two-year windows.", 11, fill="#666")
text(16, 144, "Show:  (•) Vegetation (NDVI)   ( ) Surface temperature", 12); call(14, -16, 140)
text(16, 170, "Baseline 2021-10 to 2023-09", 12, "bold"); text(604, 170, "Latest 2024-10 to 2026-09", 12, "bold")
for x in (16, 604):
    rect(x, 178, 560, 300, "#ececea", "#666")
    parts.append(f'<path d="M{x + 200},{x * 0 + 200} L{x + 330},{x * 0 + 230} L{x + 360},{x * 0 + 340} L{x + 300},{x * 0 + 440} L{x + 210},{x * 0 + 400} Z" fill="#a9d28d" stroke="#6a8" stroke-dasharray="4 3"/>')
    text(x + 280, 470, "synced map with NDVI or temperature overlay", 10, anchor="middle", fill="#555", italic=True)
call(15, 0, 190)
text(16, 500, "Vegetation (NDVI)", 11, "bold")
for i, c in enumerate(["#ffffe5", "#d9f0a3", "#78c679", "#238443", "#004529"]):
    rect(16 + i * 52, 506, 52, 10, c, "#999")
text(16, 530, "-0.1 NDVI", 10); text(276, 530, "0.8 NDVI", 10, anchor="end"); text(16, 544, "Same colour scale on both maps. (Temperature: gap-filled, ranking-grade.)", 10, fill="#666")
call(16, 0, 510)
for i, (ttl, big, verdict, note) in enumerate([
        ("Canopy proxy (vegetation index)", "9.7% → 10.4%", "No detectable change", "Within the year-to-year swing of about 6 points. A vegetation proxy, not a tree count."),
        ("Mean surface temperature", "38.6 °C → 42.1 °C", "Indicative only", "Different clear days and seasons; ranking, not exact values.")]):
    x = 16 + i * 588
    rect(x, 566, 572, 108, "#fff", "#888"); text(x + 12, 588, ttl, 12, "bold"); text(x + 12, 618, big, 22); text(x + 12, 640, verdict, 12, "bold"); text(x + 12, 658, note, 10, fill="#666")
call(17, 0, 578)
text(16, 702, "Year by year", 13, "bold")
rect(16, 710, 1148, 22, "#eee", "#888")
for x, t in [(24, "Year (Oct to Sep)"), (300, "Canopy proxy (low to high)"), (640, "Mean temperature"), (900, "Clear Landsat looks per pixel")]:
    text(x, 725, t, 10, "bold")
for r in range(3):
    rect(16, 732 + r * 20, 1148, 20, "#fff", "#ddd"); text(24, 746 + r * 20, "20xx-10 to 20xx-09", 10); text(300, 746 + r * 20, "xx.x%  (xx.x% to xx.x%)", 10); text(640, 746 + r * 20, "xx.x °C", 10); text(900, 746 + r * 20, "x.x", 10)
text(16, 806, "... five rows, then the series note (single years are noisy).", 10, fill="#777")
call(18, 0, 702)
text(16, 836, "Do independent maps agree about canopy?", 13, "bold")
text(16, 854, "Estimates range from 4.4% to 27.7%, about 6 times apart, so canopy share is uncertain.", 11)
rect(16, 862, 1148, 22, "#eee", "#888"); text(24, 877, "Method", 10, "bold"); text(300, 877, "Window", 10, "bold"); text(460, 877, "Tree or canopy share", 10, "bold")
for r, (m, w, v) in enumerate([("ESA WorldCover (2021 map)", "Baseline", 27.7), ("Google Dynamic World", "Baseline", 7.1), ("Our NDVI proxy", "Baseline", 9.7)]):
    rect(16, 884 + r * 20, 1148, 20, "#fff", "#ddd"); text(24, 898 + r * 20, m, 10); text(300, 898 + r * 20, w, 10); text(460, 898 + r * 20, f"{v}%", 10)
    rect(560, 890 + r * 20, v * 8, 8, "#6b8fb5", sw=0)
text(16, 962, "... six rows (4 reference rows + our proxy twice), then the caveat note.", 10, fill="#777")
call(19, 0, 836)
footer(954)
parts.append("</g>")

# ===================== States =====================
oy3 = oy2 + 1010 + 80
text(0, oy3 - 6, "States to design (all must stay honest and readable)", 14, "bold", "#1c1c1c")
parts.append(f'<g transform="translate(40,{oy3 + 6})">')
states = [
    ("A. API not reachable", "Full-page message: \"The data service is not reachable\", why, the exact start command, and a Retry button. Main content hidden.", "#f8d7da", "#c0392b"),
    ("B. Mock data", "Red banner: invented MOCK data, do not present as Elmina results. Red chips. Layer toggles that have no data are disabled.", "#f8d7da", "#c0392b"),
    ("C. Placeholder scores", "Amber chip and a notice in the detail panel until the ML scores are merged (score_source = placeholder).", "#fff3cd", "#b8860b"),
    ("D. Score file problem or stale", "Red notice with a generic message (scores_error) or \"computed on older data\" (scores_stale). Ranking keeps working.", "#f8d7da", "#c0392b"),
]
for i, (t, d, fill, stroke) in enumerate(states):
    x = (i % 2) * 596
    y = (i // 2) * 120
    rect(x, y, 580, 104, fill, stroke, dash="5 3")
    text(x + 12, y + 24, t, 13, "bold")
    words, line_txt, ly = d.split(), "", y + 46
    for w in words:
        if len(line_txt) + len(w) > 78:
            text(x + 12, ly, line_txt, 11); ly += 16; line_txt = ""
        line_txt += w + " "
    text(x + 12, ly, line_txt, 11)
parts.append("</g>")

H = oy3 + 6 + 240 + 40
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Arial, Helvetica, sans-serif">'
       f'<title>Wireframe: Elmina Canopy Prioritiser</title><rect width="100%" height="100%" fill="#ffffff"/>'
       f'<g transform="translate(20,0)">' + "".join(parts) + "</g></svg>")
OUT.write_text(svg, encoding="utf-8")
print(f"wrote {OUT} ({W} x {H})")
