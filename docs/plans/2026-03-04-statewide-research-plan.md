# Statewide Research Expansion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand DeflockSC from Upstate-only coverage to all 46 SC counties — each county gets an Obsidian research note and locally tailored form letters in `action-letters.json`.

**Architecture:** Per-county pipeline. For each county, research local Flock/ALPR deployments via web search, write an Obsidian note in the vault's Research/ folder with tags and wiki-links, then draft action letters referencing local facts. Counties are tiered by data richness. Subagents handle research in parallel batches.

**Tech Stack:** Web search, Obsidian markdown, JSON (action-letters.json), wiki-links

---

## Reference Files

- **Obsidian vault research folder:** `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\Research\`
- **Action letters:** `C:\Users\tim\OneDrive\Documents\Projects\deflocksc-website\src\data\action-letters.json`
- **Local councils (for divisionPattern keys):** `C:\Users\tim\OneDrive\Documents\Projects\deflocksc-website\src\data\local-councils.json`
- **Existing research note example:** `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\Research\Greenville PD.md`
- **Existing letter example:** see Greenville City Council entry in action-letters.json (divisionPattern `state:sc/place:greenville`)
- **Design doc:** `docs/plans/2026-03-04-statewide-research-design.md`

## Conventions

### Research Note Format

Every county research note goes in the Research/ folder as `{County Name} County.md`. Use this template:

```markdown
---
tags: [research, sc-county/{lowercase-name}, area-activism]
---

# {County Name} County

**Related:** [[Flock Safety]], [[SC ALPR Legislation]], {other relevant wiki-links}

---

## Known Deployments

| Agency | Cameras | Date | Source |
|--------|---------|------|--------|
| {Agency Name} | {count or "Unknown"} | {date or "Unknown"} | {source name + URL} |

## Local Stories

{Specific incidents, controversies, council actions, FOIA issues, news coverage.
For Tier 2/3 counties with no local drama, use "No local incidents documented as of {date}." and skip to Regional Context.}

## Regional Context

{For counties without strong local stories: reference the nearest Tier 1 county's story.
Example: "Neighboring Greenville County had the sisters' wrongful stop incident. The same Flock network and SLED database serve {County Name} County."}

## Sources

- [{Source title}]({URL})
```

Wiki-link rules:
- Always link `[[Flock Safety]]`, `[[SC ALPR Legislation]]` on first mention
- Link neighboring counties: `[[{Neighbor} County]]`
- Link relevant campaign notes: `[[Hays County TX]]`, `[[Sedona AZ]]`, etc.
- Link `[[Federal Data Access]]` when mentioning CBP/ICE data sharing
- Link `[[SLED Database]]` or `[[SC ALPR Legislation]]` when mentioning statewide data retention

### Action Letter Format

Each letter entry in `action-letters.json`:

```json
{
  "divisionPattern": "state:sc/county:{lowercase-name}",
  "category": "local",
  "label": "{County Name} County Council",
  "subject": "{Short subject line referencing local angle}",
  "body": "Dear [NAME],\n\n{Letter body with local facts, ~300-500 words}\n\nSincerely,\n[Your name and address]"
}
```

For cities that have their own council entry in local-councils.json AND have known camera deployments, also create a separate city letter with `divisionPattern`: `state:sc/place:{city-name}`.

Letter content rules:
- Open with the most compelling local fact (incident, camera count, contract detail)
- Include statewide context (SLED database, 110+ agencies, no state law)
- Reference the three pending bills (S447, H3155, H4013)
- End with 3 specific asks tailored to the body's authority
- Close with precedent cities (Sedona AZ, Hays County TX, Cambridge MA)
- Use `[NAME]` for the rep's name, `[Your name and address]` for sender

### Statewide Shared Facts (use in all letters)

These facts apply to every county and should be woven into letters as appropriate:

- 110+ SC law enforcement agencies use Flock Safety cameras
- SLED database: 422 million license plate reads (2019-2022), 3-year retention, 99+ agencies, 2,000+ users
- 200+ unpermitted Flock cameras found on state roads by SCDOT
- Zero SC statutes governing ALPR use
- SCPIF v. SLED lawsuit challenging constitutionality of the statewide database
- Flock CEO denied federal contracts on camera July 2025, admitted them 3 weeks later
- Flock gave CBP direct access to local police cameras without telling those agencies
- Three bills stalled in committee: S447, H3155, H4013
- Flock installed cameras in 100+ school systems; ICE accessing data through same network

---

## Task 1: Create Statewide Reference Notes

Create two new Obsidian reference notes that all county notes will link to.

**Step 1: Create `SLED Database.md`**

Write to: `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\Research\SLED Database.md`

```markdown
---
tags: [research, reference, sc, area-activism]
---

# SLED Database

**Type:** Statewide System Reference
**Related:** [[Flock Safety]], [[SC ALPR Legislation]], [[Federal Data Access]]

---

## Overview

The South Carolina Law Enforcement Division (SLED) operates a centralized ALPR database collecting data from 48+ contributing agencies statewide.

## Key Facts

- **Total reads:** 422 million license plate reads (2019-2022), 100M+/year
- **Retention:** 3 years
- **Access:** 99+ agencies, 2,000+ individual users
- **Oversight:** No state statute governs the database; SLED guidelines are not legally binding
- **Legal challenge:** SCPIF v. SLED lawsuit challenges constitutionality — Greenville resident John Sloan is a named plaintiff

## Sources

- [The Policing Project — SCPIF v. SLED](https://www.policingproject.org/south-carolina-license-plate-reader-lawsuit)
- [Post and Courier — SC law enforcement ALPR cameras](https://www.postandcourier.com/news/alpr-cameras-south-carolina-flock-safety-license-plate-readers/article_787a262a-dbd2-11ee-a901-634acead588b.html)
```

**Step 2: Create `SC Camera Deployments.md`**

Write to: `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\Research\SC Camera Deployments.md`

This is a statewide index note listing all known deployments by county, drawn from the research agent's findings. Use a table format with Agency, County, Camera Count, Vendor, Source columns. Link each county name to its `[[{County Name} County]]` note. Mark it as `tags: [research, index, sc, area-activism]`.

**Step 3: Commit**

No git commit for Obsidian vault changes — these are outside the repo.

---

## Task 2: Tier 1 Counties — Batch 1 (Midlands + Lowcountry)

Research and write notes + letters for the first batch of Tier 1 counties outside the Upstate. These have the richest data.

**Counties:** Richland (Columbia), Charleston, Berkeley, Horry, Florence, Beaufort

**Per county, do:**

1. **Web search** for `"Flock Safety" OR "license plate reader" OR "ALPR" "{county name}" South Carolina` — find news articles, council votes, contracts, incidents
2. **Write Obsidian research note** following the template in Conventions above
3. **Draft county council letter** — open with strongest local fact, include statewide context, end with 3 asks
4. **Draft city letter(s)** if the county has cities with known deployments AND entries in local-councils.json

**Key local angles per county (from initial research):**

- **Richland County:** Columbia PD approved ~130 cameras ($539K, Oct 2024), transparency portal noncompliant. Richland County SO quoted journalist $9,000+ for FOIA on Flock records. Columbia Metropolitan Airport PD also uses Flock.
  - Letters needed: `county:richland`, `place:columbia`
- **Charleston County:** Charleston PD has 12 cameras. North Charleston has 34 ALPR + 745 total cameras ($2.5M). Mount Pleasant, Sullivan's Island, Folly Beach also confirmed.
  - Letters needed: `county:charleston`, `place:charleston`, `place:north-charleston`, `place:mount-pleasant`
- **Berkeley County:** Sheriff's Office has 56 Flock cameras — highest county SO count in the state. Goose Creek PD also uses Flock.
  - Letters needed: `county:berkeley`, `place:goose-creek`, `place:moncks-corner`
- **Horry County:** 23 cameras at entry/exit points. Conway PD has 54. North Myrtle Beach 18, Surfside Beach 9. Myrtle Beach has 1,034-camera Real Time Crime Center.
  - Letters needed: `county:horry`, `place:myrtle-beach`, `place:conway`
- **Florence County:** 30 cameras funded by $400K state grant. Sheriff placing cameras on private property to circumvent SCDOT permit pause. Lawmakers proposed resolution to force SCDOT to resume permits.
  - Letters needed: `county:florence`, `place:florence`
- **Beaufort County:** SO uses Rekor (not Flock), ~70 cameras, $600K+ ARPA funds. Bluffton and Beaufort PD use Flock separately. Hilton Head planning installation.
  - Letters needed: `county:beaufort`, `place:beaufort`, `place:hilton-head`

**Step 5: Add all letters to action-letters.json**

Insert new letter entries into the JSON array. Keep existing entries unchanged. Place new entries before the generic fallback (the last entry with `divisionPattern: "state:sc/"`).

**Step 6: Commit**

```bash
git add src/data/action-letters.json
git commit -m "feat: add Tier 1 Batch 1 action letters (Richland, Charleston, Berkeley, Horry, Florence, Beaufort)"
```

---

## Task 3: Tier 1 Counties — Batch 2 (Remaining Tier 1)

**Counties:** York, Laurens, Newberry, Greenwood, Sumter, Orangeburg, Chester, Union, Oconee

**Per county, same pipeline as Task 2.**

**Key local angles:**

- **York County:** Fort Mill PD 24 cameras, Tega Cay "virtual gate" covering peninsula entry points ($11K, Oct 2020), Rock Hill PD 6, Catawba Nation Tribal Police 8. York County SO 16.
  - Letters needed: `county:york`, `place:rock-hill`
- **Laurens County:** SO 10 cameras, Laurens PD 25 (installed 2023 to reduce crime).
  - Letters needed: `county:laurens` (already exists — update if needed)
- **Newberry County:** SO has 40 cameras — one of the highest county SO counts.
  - Letters needed: `county:newberry`, `place:newberry`
- **Greenwood County:** SO 23, PD 34, Lander University PD 8.
  - Letters needed: `county:greenwood`, `place:greenwood`
- **Sumter County:** SO 30 cameras, Sumter PD also on Flock portal.
  - Letters needed: `county:sumter`, `place:sumter`
- **Orangeburg County:** DPS 29 Flock cameras, SO uses NDI vendor (not Flock), Claflin University 4, plus Branchville/Cameron/Elloree PDs.
  - Letters needed: `county:orangeburg`, `place:orangeburg`
- **Chester County:** SO 25 cameras, Chester PD also on Flock portal.
  - Letters needed: `county:chester`, `place:chester`
- **Union County:** SO 23 cameras.
  - Letters needed: `county:union`, `place:union`
- **Oconee County:** SO 6, Seneca PD 4, Pendleton PD on Flock portal.
  - Letters needed: `county:oconee`, `place:walhalla`

**Step: Update existing Upstate letters**

Check existing letters for Greenville, Spartanburg, Anderson, Pickens. Update camera counts and facts if the research found newer data. The existing Greenville letters reference "242 Flock cameras across Upstate SC" — update to statewide count if appropriate.

**Step: Commit**

```bash
git add src/data/action-letters.json
git commit -m "feat: add Tier 1 Batch 2 action letters (York, Laurens, Newberry, Greenwood, Sumter, Orangeburg, Chester, Union, Oconee)"
```

---

## Task 4: Tier 2 Counties

**Counties:** Kershaw, Colleton, Georgetown, Clarendon, Darlington, Lancaster, Marion, Lexington, Fairfield, Jasper, Cherokee, Aiken, Dillon, Hampton, Barnwell, Abbeville, Chesterfield, Calhoun

**Same pipeline, but:**
- Research notes will be thinner (fewer local sources)
- Letters reference local deployments where known + nearest Tier 1 regional story
- Some counties may only need a county council letter (no city letter if the city has no known cameras)

**Regional spillover mapping:**
- Midlands counties (Kershaw, Lexington, Fairfield, Calhoun) → reference Columbia/Richland stories
- Lowcountry counties (Colleton, Jasper, Hampton) → reference Charleston/Beaufort stories
- Pee Dee counties (Georgetown, Clarendon, Darlington, Dillon, Marion, Chesterfield) → reference Florence/Horry stories
- Upstate counties (Cherokee, Abbeville) → reference Greenville/Spartanburg stories
- Savannah River counties (Aiken, Barnwell) → reference statewide facts + SLED database

**Step: Commit**

```bash
git add src/data/action-letters.json
git commit -m "feat: add Tier 2 action letters (18 counties)"
```

---

## Task 5: Tier 3 Counties

**Counties:** Bamberg, Dorchester, Edgefield, Lee, Marlboro, McCormick, Saluda, Williamsburg (and any others without confirmed deployments after Tasks 2-4)

**These counties get:**
- Brief research note acknowledging no known local deployments
- Letter using "your neighbors have cameras" framing + statewide facts
- Regional spillover from nearest Tier 1/2 county

**Step: Commit**

```bash
git add src/data/action-letters.json
git commit -m "feat: add Tier 3 action letters (remaining counties)"
```

---

## Task 6: Update Existing Upstate Letters

Review and update the 8 existing Upstate-specific letters (Greenville city/county, Spartanburg city/county, Anderson city/county, Pickens county, Laurens county) with any new facts discovered during research:

- Updated camera counts if changed
- Replace "242 Flock cameras across Upstate SC" with statewide number if the letters now serve a statewide audience
- Add any new incidents or developments found during research

Also create Obsidian research notes for Greenville County, Spartanburg County, Anderson County, and Pickens County if they don't already exist as standalone county notes (currently Greenville info is split across `Greenville PD.md` and `Greenville City Council.md`).

**Step: Commit**

```bash
git add src/data/action-letters.json
git commit -m "fix: update Upstate letters with statewide context and current data"
```

---

## Task 7: Update Statewide Template Letters

The two statewide letters (State Senator, State Representative) currently reference Upstate-only facts. Update them to:

- Reference statewide camera counts and deployment breadth
- Keep the Greenville sisters incident as the lead (it's the strongest SC-specific story)
- Add the SLED database stats (422M reads, 3-year retention)
- Add the Florence private-property workaround as an example of enforcement gaps
- Update the "242 Flock cameras across Upstate SC" line to reflect statewide scope

**Step: Commit**

```bash
git add src/data/action-letters.json
git commit -m "fix: update statewide template letters with broader SC context"
```

---

## Task 8: Update SC Camera Deployments Index

After all county research is complete, update the `SC Camera Deployments.md` index note in Obsidian with the final tally — total agencies, total known cameras, counties covered, and links to each county note.

---

## Task 9: Update Documentation

**Modify:** `docs/research-workflow.md`

Add a new section "## Statewide Research Expansion" after the existing "How DeflockSC Used It" section. Document:
- The tiering methodology (Tier 1/2/3 based on data richness)
- Data sources used (EFF Atlas, Flock transparency portals, Post and Courier, SLED lawsuit filings, local news)
- The per-county pipeline (research note → letter)
- How regional spillover works for counties without local stories
- How to replicate this for another state

**Modify:** `README.md`

In the "What This Site Does" section, update the action modal description to mention statewide coverage. In the "Adapting for Your State" section, add a bullet referencing the statewide research methodology in research-workflow.md.

**Step: Commit**

```bash
git add docs/research-workflow.md README.md
git commit -m "docs: document statewide research methodology and update README"
```

---

## Task 10: Update MANIFEST.md

Regenerate MANIFEST.md to reflect any new files or structural changes.

```bash
git add MANIFEST.md
git commit -m "docs: regenerate MANIFEST.md after statewide expansion"
```

---

## Execution Notes

- **Parallelization:** Tasks 2, 3, and 4 can each be split into parallel subagents — one per county or one per batch of 3-4 counties. Each subagent does web research + note writing + letter drafting independently.
- **Obsidian notes are outside the git repo** — they won't appear in commits. Only `action-letters.json` and docs changes get committed.
- **Letter quality:** Each letter should read like it was written by a concerned local resident, not a template engine. Vary the openings, the specific asks, and the precedent cities referenced. Avoid copy-paste between counties.
- **Source verification:** Web search results should be cross-referenced where possible. Don't cite a camera count from one source if another source contradicts it. Note discrepancies in the research note.
- **Wiki-link discipline:** Every county note must link to `[[Flock Safety]]` and `[[SC ALPR Legislation]]`. Neighboring counties should cross-link. This keeps the Obsidian graph connected.
