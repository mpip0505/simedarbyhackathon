# Prior art: other canopy prioritisers, what works, and where this project fits

Written for: the pitch writers and whoever fields judge questions. Researched on 21 October 2026 from web search summaries and
a few pages read in full. **Two key PDFs were blocked (HTTP 403), so some items rest on abstracts; re-read each source before putting a
number on a slide.** The evidence is mostly from US and European cities. Whether it transfers to a tropical, master-planned township is
an assumption, not a finding.

## The short version
1. Existing tools (Tree Equity Score, i-Tree Landscape, Boston's Right Place Right Tree) rank **census areas**, mostly by canopy gap, heat and social vulnerability.
   None of them ranks **individual planting cells**, uses a habitat-corridor goal, or is built for a cloudy tropical climate.
2. Different tools find the **same broad areas but different top sites** (Austin comparison). One ranking is not "the answer", so our rank-steadiness result and adjustable weights address a documented weakness.
3. Whether prioritising by heat actually **delivered measured cooling or health benefit** is largely unevaluated. Benefits are modelled; **survival after planting** is the proven weak link.
4. So the honest value of this project is **better, faster, auditable decisions about where to plant first**. It is not a measured cooling, carbon or health result, and it cannot be until planting happens and is checked in the field.

## What the existing tools do
| Tool | Scale | Ranks by | What it does well | Known limits |
|---|---|---|---|---|
| [Tree Equity Score](https://www.treeequityscore.org/) (American Forests) | US census block group | canopy gap plus a priority index of equally weighted indicators (income, race, age, employment, health burden, linguistic isolation, heat) | simple, national, equity-first | needs US census data; coarse; fixed equal weights |
| i-Tree Landscape (USDA Forest Service) | US census block group | user-chosen indices and weights (poverty, runoff, PM2.5, and so on) | flexible; peer-reviewed benefit estimates | scenarios differing by one variable can pick different areas |
| [Right Place, Right Tree, Boston](https://pmc.ncbi.nlm.nih.gov/articles/PMC7544061/) (Werbin et al., PLoS One 2020) | census tract | heat vulnerability index plus summer Landsat land-surface temperature, **only where planting is feasible**; 34-species list; points to cool roofs or depaving where trees cannot go | pairs ranking with feasibility and species | tract scale cannot pick individual sites; land-surface temperature runs warmer than air; the vulnerability index was not validated against health outcomes; tree mortality peaks after the 2-year guarantee |
| [Five Austin tools compared](https://auf.isa-arbor.com/content/early/2025/07/16/jauf.2025.020) (J. Arboriculture and Urban Forestry, 2025) | block group or tract | CEJST, Tree Equity Score, i-Tree Landscape, My City's Trees, Community Tree Priority Map | the comparison itself | all five point to east Austin, but **the specific top areas differ**: of Tree Equity Score's top five block groups, four were also flagged by the others; of seven top i-Tree Poverty-scenario areas, only one |
| [i-Tree Landscape index versus an optimisation framework](https://www.sciencedirect.com/science/article/abs/pii/S1618866722002461) (Bronx, 2022) | block group | priority index versus multi-objective optimisation | shows the two choose differently | abstract only (full text blocked) |
| [Treepedia 2.0](https://arxiv.org/pdf/1808.04754) and the [ETH Singapore street-view study](https://www.swissinfo.ch/eng/sci-tech/cooling-canopy_google-street-view-reveals-urban-tree-cover-benefits/43002688) | street segment | Green View Index from street-level photos (Singapore: about 100,000 images, over 80% of the road network) | pedestrian's-eye view; cheap way to find low-shade streets | misses private land, parks and gardens; not a tree inventory |
| [Singapore thermal-comfort mapping](https://meetingorganizer.copernicus.org/ICUC12/ICUC12-739.html) (ICUC12, 2025) | about 200 m | simulated comfort under greenery scenarios | tropical; found tall walls sharply cut the cooling trees give (modelled cooling fell from about 11 °C to 1.2 °C as wall fraction rose) | simulation; needs 3D city data we do not have |

## What the evidence says works, and what is unproven
**Reasonably supported**
- Land-surface temperature and greenness do carry signal about heat: a Sri Lankan study found NDVI and land-surface temperature correlated at about -0.43 (2015) and -0.48 (2025) ([source](https://archive.cmb.ac.lk/handle/70130/8535)). Moderate, not strong.
- Green-space cooling is **local**: about 200 m in a Paris study and up to about 300 m for London parks, and it varies by month. That supports scoring the 250 m neighbourhood (as we do) rather than the cell alone.
- Cloud is the main constraint on satellite heat and land-cover work in the tropics (a Kuala Lumpur remote-sensing paper surfaced in search; the exact paper was not pinned down, so cite it only after finding it again). This matches why the pipeline pools two-year, cloud-masked medians.
- **Survival matters more than the plan:** typical annual street-tree mortality in the first five years is about 6.6 to 7.0%, and one study found 7.5% dead or removed by the first summer, with better survival where there is less pavement, for fall planting and for larger trees ([street-view survival study](https://auf.isa-arbor.com/content/early/2026/01/23/jauf.2026.007), [Portland street-tree balance](https://www.fs.usda.gov/nrs/pubs/jrnl/2013/nrs_2013_roman_002.pdf)). Boston's authors note mortality peaks after the maintenance guarantee ends. A Northwestern study found year-to-year **loss** of canopy, not the canopy level, tracked mortality, so protecting existing trees matters as much as planting ([news summary](https://news.northwestern.edu/stories/2026/08-2/as-urban-tree-shade-shrinks-mortality-rises)).

**Unproven or weak**
- **That following a heat-based priority list produces measured cooling or fewer heat illnesses.** The searches found modelled benefits only: a London study estimates that 10% more tree cover would cut heat-related deaths attributed to the urban heat island by about 10% in its model ([source](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11009716/)). A Stanford ECHO review argues causal evidence that planting reduces heat-related illness is weak ([source](https://www.stanfordecholab.com/blog/does-planting-trees-reduce-heat-related-health-impacts)). Portland shows an association, not a test of prioritisation.
- That any tool's **ranking is correct.** None of the sources I read reports validating a tool's priority list against outcomes (that is an absence in what I found, not proof that no such study exists).
- Tropical NDVI canopy accuracy and NDVI saturation in dense canopy: **not found** in these searches. Our own cross-check (our proxy about 10%, WorldCover about 28%, Dynamic World 7% falling to 4%) is evidence the maps disagree, consistent with the Austin lesson.

## Where this project sits
**What is different**
- **Cell scale (30 m), not tract or block group.** It answers "which cell first", the thing Boston's authors say tract-scale tools cannot.
- **A cloud-aware tropical pipeline from free data** (two-year cloud-masked medians, quality-masked Landsat thermal, labelled gap filling). The others rely on US census and land-cover data.
- **Corridor connectivity is a score.** The equity tools have no habitat-linkage term. This is the part that fits Sime Darby Property's 5 km Urban Biodiversity Corridor goal.
- **Explainable and uncertainty-aware.** A plain-language reason per site, weights adjustable live with matching server and browser formulas, and a **rank-steadiness** result (2,000 plausible weightings). Given Austin's finding that top picks differ between tools, showing how steady a pick is answers a documented weakness.
- **Honest limits on screen** (the cross-check, "no detectable change", the simulated-sites label).

**What others have that we lack (say so before a judge does)**
- **A social-vulnerability or equity layer** (Tree Equity Score, Boston's index). We have none: no Malaysian equivalent is in our data. A township developer's equity question is also different, so we frame it as shade for walkers and residents. Roadmap: Malaysian census data or the developer's own resident data.
- **Planting feasibility and species** (Boston). We exclude buildings and roads but have no soil, utilities or species. Roadmap with the Elmina Living Collection Nursery.
- **Survival and maintenance.** None. The implementation plan must include monitoring and care after the guarantee period.
- **The wall-enclosure effect** (Singapore). We have built-up share but not wall height, so cooling potential in enclosed streets is overstated.
- **Ground truth.** No tree inventory, LiDAR or field plots; nothing here shows our ranking is right.

## How our ranking compares with simplified versions of those approaches
Generated by `python -m ml.method_agreement` (report: [ml/reports/method_agreement.md](../ml/reports/method_agreement.md)). These are **stand-ins built from our own fields**,
not the real tools, and agreement is not accuracy.
- **Heat only** and **ours** share **0 of their top 20 sites**, although their rankings across all 564 sites are fairly similar (Spearman 0.78). Adding corridor and shade changes which sites come first; that is a choice the planning team should make knowingly, which is why the weights are sliders.
- **Canopy gap only** and **ours** share 3 of 20 (rank correlation 0.33). The gap-only list is spread over 6 areas, ours over 6, heat-only over 9.
- **Equal weights** and **ours** share 18 of 20 (0.97): within our own method the sliders matter much less than the choice to include corridor and shade at all.
- Heat-only and heat-plus-gap lists find **none** of the 14 sites our uncertainty run calls steady picks; canopy-gap-only finds 2.
- Read it the way the Austin paper does: tools agree on broad areas and differ on specific sites. This shows the same pattern on our data, and says nothing about which is better.

## Value, by user (what we can honestly claim)
| User | Job to be done | What the tool gives | What it does not give |
|---|---|---|---|
| Landscape and planting team | choose where to plant first this season | a ranked, explained shortlist in minutes; adjustable priorities; rank steadiness; GIS file and printable brief; re-runnable each season | proof that those sites cool more or that trees survive |
| Sustainability and reporting team | show how priorities were set | a documented, reproducible method and an honest list of limits that supports reporting | carbon, canopy growth or compliance numbers |
| Township management | compare options and decide where to pilot | weights and a labelled planting scenario; a pilot design (field plots) that can turn screening into evidence | a forecast or a cost saving |
| Residents and walkers | shade and cooler walks | the shade score targets unshaded footpaths | any benefit until trees are planted and survive |

**Do not say:** "proven", "accurate", "cooler by N degrees", "saves lives", "saves money", or any carbon figure. **Say:** "decision support for where to plant first,
explained and re-runnable, with its uncertainty shown."

## Next steps this research suggests
1. Add post-planting monitoring and care to the implementation slide (survival is the documented failure point).
2. Field-check a sample of top and bottom sites (the first thing to ask Sime Darby Property for) and compare with the ranking.
3. Add an equity-style layer if Malaysian small-area data can be obtained.
4. Test whether enclosure (building height) changes the cooling score ordering, if 3D building data is available.
