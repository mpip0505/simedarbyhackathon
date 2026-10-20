# Pitch fact-check: the outside claims in the project brief

Written for: the pitch writers (Mechanism and Enabler sections). Checked on 21 October 2026.
Method and limits: web search plus page-reading, so quotes below come from summaries of the pages. I could **not**
retrieve Bursa Malaysia's own rule text, and the journal's publisher page blocked access, so those two items are
marked accordingly. Re-read each source yourself before it goes on a slide.

Status key: **Confirmed**, **Confirmed with caveat**, **Conflicting** (sources disagree), **Needs wording care**,
**Not verified**.

## Summary: what to change before the pitch
1. **Do not say "5% planted" as a fact.** The same sponsored page gives two incompatible tree counts (below).
2. **Soften the reporting-rule claim.** Bursa's December 2024 amendments moved to IFRS S2-based disclosure; the
   "TCFD-aligned for FY ending on or after 31 Dec 2025" wording is from earlier sources.
3. **Do not say "KL heat islands doubled".** The paper's abstract says two-fold for one location, not the city.
4. **Avoid "reportable evidence".** It overclaims for a screening tool (the repo already treats it as screening-grade).
5. Everything about the tree target, the corridor and the net-zero targets can be used, with the small caveats below.

## Claim by claim

| # | Claim in the brief | Status | What the sources actually say | Safe wording |
|---|---|---|---|---|
| 1 | City of Elmina targets 210,000 trees, 21,000 of them ERT species | **Confirmed with caveat** | The Star partner pages (sponsored content for Sime Darby Property): "set a goal of 210,000 trees to be planted upon completion of the township"; one page says "by 2040" and "10% or 21,000 of them being IUCN trees". The pages say "ERT" in one place and "IUCN trees" in another. | "Sime Darby Property's stated goal is 210,000 trees at completion, about 10% of them endangered, rare or threatened species." Attribute it to the developer. |
| 2 | About 10,266 trees planted, roughly 5% | **Conflicting** | Same Star partner page: an infographic reads "Total trees planted in Elmina to-date: 10,266 trees" citing a **2022** biodiversity survey, while the text on the same page says "over 41,000 trees including 5,691 IUCN trees" (about 20% of 210,000). A different partner page says "5,450 trees have been re-planted in the park" and that Central Park "will have 8,555 trees from 170 species" (planned). None of the pages is dated; the latest dated item on them is an event on 20 March 2024. | Do not state a percentage. If you must: "Sime Darby Property's own material gives figures from about 10,000 (a 2022 survey) to over 41,000 trees planted; most of the 210,000 goal is still ahead." Ask the developer for the current count. |
| 3 | A 5 km Urban Biodiversity Corridor linking six park precincts inside the 300-acre Elmina Central Park | **Confirmed with caveat** | Sime Darby Property's site, Star partner content and Wikipedia all describe a 5 km corridor and six parks in a 300-acre Central Park (about 120 to 121 ha). Caveats: precinct sizes listed on one page add up to 360 acres, not 300; one search result mentions a 2 km corridor (not checked at source); bioSEA lists the corridor project as 2024-ongoing, still in design. | "A planned 5 km corridor connecting six park precincts." Say "planned" or "being developed", not "complete". |
| 4 | Net zero by 2050 and a 40% cut in Scope 1 and 2 emissions by 2030 | **Confirmed** | Sime Darby Property press release, 27 November 2023, repeated by EdgeProp and Star Property. Scope 3 is not part of the 2030 target. One third-party tracker (DitchCarbon) says 50%; the company's own release says 40%, so use 40%. | "Pledged net zero by 2050, with a 40% cut in Scope 1 and 2 emissions by 2030 (announced November 2023)." |
| 5 | Urban forest conservation named as a sequestration lever | **Confirmed with caveat** | The release says the group will reach net zero partly through "carbon removal through nature-based solutions", and mentions conserving and regenerating urban biodiversity: two urban biodiversity corridors under development and 53 acres of secondary forest conserved at KL East Park. "Urban forest conservation" is our paraphrase. No sequestration figures were found. | "Names nature-based solutions, including urban biodiversity corridors and forest conservation, as part of its route to net zero." Do not quote tonnes of carbon. |
| 6 | Bursa Main Market companies must make TCFD-aligned climate disclosures for FY ending on or after 31 December 2025 | **Needs wording care** | Earlier sources (a law-firm guide, Slaughter and May / Rahmat Lim) say exactly this. But Bursa amended the Listing Requirements on **23 December 2024** to align with the national sustainability reporting framework using **IFRS S1 and S2**, phased by group (Group 1: Main Market issuers with market cap of RM2 billion or more; Group 2: other Main Market issuers). Sources disagree on whether the dates mean periods *beginning* or *ending* on those dates (FY2025 for Group 1, FY2026 for Group 2). I could not read Bursa's own text. | "Bursa Malaysia requires listed companies to make climate-related disclosures aligned with IFRS S2, which builds on TCFD, phased in from FY2025 for the largest Main Market issuers." Check Bursa's published text, and which group Sime Darby Property falls in, before quoting a date. |
| 7 | A UM Landsat study found KL urban heat islands doubled between 2013 and 2021, and that more vegetation is a simple, effective remedy | **Confirmed with caveat** | The paper is "Analysis of urban heat islands with Landsat satellite images and GIS in Kuala Lumpur Metropolitan City", Heliyon vol. 9 issue 8, 2023 (Jumari et al.), listed in Universiti Malaya's research repository; I could not verify author affiliations. Per the abstract: urban heat islands "increase two-fold from 2013 to 2021", **for Bukit Ketumbar, one location, not the whole city**; the highest urban-rural temperature difference across the selected cities went from a 10.8 to 25.5 deg C range (2013) to a 16.1 to 26.73 deg C range (2021). The authors conclude that increasing vegetation is a simple and effective way to reduce urban heat island effects. The abstract does not obviously show the doubling, so read the full paper first. | "A 2023 Landsat study of Kuala Lumpur reported rising urban heat island effects between 2013 and 2021 and concluded that adding vegetation is a simple, effective remedy." Cite the paper. Do not say "KL doubled". |

## Statements in the brief that are assumptions, not facts
- **"Who pays: Sime Darby Property's sustainability and landscape budgets."** A reasonable business hypothesis, not a
  sourced fact. Present it as "we expect", and check it with a mentor.
- **"Better-placed planting plus reportable evidence."** Our own data supports "screening and prioritisation". It does not
  yet support "reportable". Use "supports reporting" at most, and see [pilot-readiness.md](pilot-readiness.md).
- **"Tool gives defensible site-level numbers."** Not with the current data: the independent cross-check shows canopy
  share is uncertain by a factor of several. Say "site-level screening scores".

## How these facts relate to what we built
- The backend uses **none** of these outside figures. The 10,266 number appears only in the brief.
- Our OSM-derived corridor spine is about 2 km against the stated 5 km, and OSM shows Elmina Valley Central Park at about
  17 ha against about 120 ha in the developer's material: OSM maps only part of it. Say so if a judge compares them.
- The developer's tree counts are undated (one traces to a 2022 survey), so our baseline (2021-10 to 2023-09) and latest
  (2024-10 to 2026-09) windows cannot be tied to a specific planting milestone. Do not imply the before/after view
  measures the effect of planting.

## Sources
- Star partner content for Sime Darby Property: [overview](https://www.urban-biodiversity.thestar.com.my/sime-darby-property/), [Bridging the disconnect](https://www.urban-biodiversity.thestar.com.my/sime-darby-property/bridging-the-disconnect/), [Growing tomorrow's forest today](https://www.urban-biodiversity.thestar.com.my/sime-darby-property/growing-tomorrows-forest-today/)
- Sime Darby Property: [Enhancing urban biodiversity, City of Elmina](https://www.simedarbyproperty.com/sustainability/urbanbiodiversity/spotlight-city-of-elmina.html); [net zero press release, 27 Nov 2023](https://www.simedarbyproperty.com/sites/default/files/2023-11/20231127%20-%20FOR%20IMMEDIATE%20RELEASE%20-%20SIME%20DARBY%20PROPERTY%20PLEDGES%20TO%20ACHIEVE%20NET%20ZERO%20EMISSION%20BY%202050.pdf)
- [EdgeProp: Sime Darby Property aims to achieve net zero emissions by 2050](https://www.edgeprop.my/content/1907825/sime-darby-property-aims-achieve-net-zero-emissions-2050)
- [Wikipedia: Elmina, Malaysia](https://en.wikipedia.org/wiki/Elmina,_Malaysia); [bioSEA: Elmina Urban Biodiversity Corridor](https://biosea.sg/?p=23694)
- Bursa reporting rules: [Slaughter and May, ESG in APAC 2024: Malaysia](https://insights.slaughterandmay.com/esg-in-apac-2024-malaysia/index.html); [Skrine alert, January 2025](https://www.skrine.com/insights/alerts/january-2025/bursa-malaysia-amends-sustainability-reporting-req); [IFRS Foundation Malaysia profile](https://www.ifrs.org/content/dam/ifrs/publications/sustainability-jurisdictions/pdf-profiles/malaysia-ifrs-profile.pdf)
- Heat-island paper: [UM research repository record](https://knova.um.edu.my/research_publications_2021_2025/3383); Heliyon 2023, vol. 9 issue 8
