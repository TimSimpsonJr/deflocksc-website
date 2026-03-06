# Statewide Research Expansion — Design

## Goal

Expand DeflockSC's research and form letters from Upstate-only coverage to all 46 SC counties, so the action modal delivers locally relevant content statewide.

## Current State

- **Rep data**: Already statewide — 46 senate, 124 house, all 46 counties + ~40 cities in `local-councils.json`
- **Action letters**: 10 entries — 6 Upstate-specific (Greenville, Spartanburg, Anderson, Pickens, Laurens) + 2 statewide templates (state senator/rep) + 1 generic local fallback
- **Research**: ~30 Obsidian notes focused on Upstate deployments, national campaigns, and Flock Safety corporate behavior
- **Camera data**: 30+ of 46 counties have confirmed Flock/ALPR deployments (110+ agencies statewide, 422M SLED reads 2019-2022)

## Approach: Per-County Pipeline

For each county, produce two outputs as a unit:

1. **Obsidian research note** — `{County Name} County.md` in `Research/`, tagged `#sc-county/{name}`, wiki-linked to existing notes
2. **Action letter(s)** — entry in `action-letters.json` referencing local facts from the research

### County Tiers

**Tier 1 — Known cameras + local controversy** (19 counties):
Greenville, Spartanburg, Anderson, Pickens, Richland, Charleston, Berkeley, Horry, Florence, York, Beaufort, Laurens, Newberry, Greenwood, Sumter, Orangeburg, Chester, Union, Oconee

**Tier 2 — Known cameras, less controversy** (18 counties):
Kershaw, Colleton, Georgetown, Clarendon, Darlington, Lancaster, Marion, Lexington, Fairfield, Jasper, Cherokee, Aiken, Dillon, Hampton, Barnwell, Abbeville, Chesterfield, Calhoun

**Tier 3 — No known cameras or very thin data** (~9 counties):
Bamberg, Dorchester, Edgefield, Lee, Marlboro, McCormick, Saluda, Williamsburg, and any others without confirmed deployments

### Research Note Format

```markdown
---
tags: [research, sc-county/{name}, area-activism]
---

# {County Name} County

**Related:** [[Flock Safety]], [[SC ALPR Legislation]], ...

---

## Known Deployments
- Agency, camera count, date, source

## Local Controversies / Stories
- Incidents, FOIA issues, council votes, news coverage

## Regional Context
- Neighboring county stories that apply (for Tier 2/3)

## Sources
- URLs with descriptions
```

### Letter Content Strategy

- **Tier 1**: Letter references specific local facts — camera counts, agency names, incidents, contract details
- **Tier 2**: Letter references local deployments + nearest Tier 1 regional story as spillover
- **Tier 3**: Letter uses "your neighbors have cameras" framing + statewide facts (SLED database, 200+ unpermitted cameras, no state regulation)

### Documentation Updates

Update existing `docs/research-workflow.md` and `README.md` to document:
- How the statewide research was gathered (sources, search methodology)
- How to replicate for a new state or update existing data
- The tiering system and how counties are categorized
- How research notes feed into action letters

## Data Sources

- EFF Atlas of Surveillance
- Flock Safety transparency portals
- Post and Courier investigative reporting
- SCPIF v. SLED lawsuit filings
- Local news (WPDE, WSPA, Fox Carolina, ABC News 4, WBTW, Columbia Muckraker)
- SCDOT camera records
- Deflock CDN camera data

## Key Statewide Facts (for all letters)

- 110+ SC law enforcement agencies use Flock Safety
- SLED database: 422M reads (2019-2022), 3-year retention, 99+ agencies with access
- 200+ unpermitted Flock cameras on state roads (SCDOT)
- Zero SC statutes governing ALPR use
- SCPIF v. SLED lawsuit challenging constitutionality
- Flock CEO denied then admitted federal data sharing (July-August 2025)
- Three bills stalled: S447, H3155, H4013
