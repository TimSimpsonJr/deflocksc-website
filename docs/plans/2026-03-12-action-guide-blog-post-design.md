# Design: Action Guide Blog Post

**Date:** 2026-03-12
**Branch:** feature/seo
**File:** `src/content/blog/how-to-fight-alpr-surveillance-sc.md`

---

## SEO

- **Title:** "How to Fight License Plate Surveillance in Your SC Community"
- **Slug:** `how-to-fight-alpr-surveillance-sc`
- **Target keyword:** "stop surveillance cameras South Carolina" (zero SERP competition)
- **Meta description:** "5 concrete steps any South Carolinian can take: find cameras in your area, file records requests, prep for council meetings, and push for H4675."
- **Featured image:** `/blog/how-to-fight-alpr-surveillance-sc.png` (needs creation)
- **Featured image alt:** "How to fight license plate surveillance in South Carolina — action guide"
- **Tags:** `action`, `toolkit`, `sc`
- **FAQ schema:** 3 questions at bottom for People Also Ask targeting

---

## Structure (~1,850 words)

### Intro (~120 words)
- "You found out your city has cameras. Now what?"
- Frame: 5 steps, all doable by one person, no organization required
- Set expectations: playbook, not lecture

### Step 1: Find out what's in your area (~200 words)
- Link to [camera map](/#camera-map)
- Explain dots/clusters, data source (Deflock.org, community-sourced, hourly updates)
- Scale: 110+ SC agencies use Flock, 1,000+ cameras statewide

### Step 2: Find out who's responsible (~200 words)
- Link to [rep finder / action modal](/#take-action) via `data-open-action` button
- Key insight: most contracts signed by police chief, not elected officials
- Greenville example: 6 years of contracts, zero council votes
- State bills would override local inaction

### Step 3: File a records request (~350 words)
- Link to [FOIA toolkit](/toolkit#request-records)
- SC FOIA basics: § 30-4-10, 10 business day response, free for electronic records
- 4 template types: camera locations, retention policies, federal sharing agreements, the actual contract
- **Greenville success story:** 96-page FOIA response revealed $2K→$131K/year cost escalation, perpetual data rights to Flock, zero council votes
- **Richland County cautionary tale:** $9K quote for electronic records (FOIA stonewalling)
- **National proof:** Eyes Off Eugene found 800 of 1,200 searches had no case number

### Step 4: Show up at a council meeting (~350 words)
- Link to [speaking prep](/toolkit#speak-up)
- How to find next meeting, how SC public comment works
- 4 talking points:
  1. No public vote authorized these cameras
  2. No oversight policy exists
  3. Data feeds a national network with federal access (Colorado CBP pilot: 25 departments enrolled without being told)
  4. H4675 would void existing contracts — ask if they've read it
- **National proof:** Hays County TX (conservative, 3-2 termination vote, "vendor accountability, not anti-police"), Olympia WA (200-person rally, cameras covered next day)

### Step 5: Get your neighbors asking questions (~200 words)
- Link to [outreach materials](/toolkit#spread-the-word)
- Channels: HOA, Nextdoor, neighborhood Facebook
- More people asking = harder to ignore
- Eyes Off GSP already organizing in the Upstate

### What's happening at the state level (~200 words)
- Link to [bill tracker](/#bill-tracker)
- 4 bills in committee, none have had a hearing
- H4675: cloud storage ban, warrant requirement, 21-day retention, void-contract clause
- Bipartisan: Freedom Caucus Republicans + Democrat Rutherford
- Bills move when legislators hear from constituents

### CTA (~80 words)
- "Pick one step. Do it today."
- Embed Find Your Rep button (`data-open-action` pattern)

### FAQ (~150 words)
1. "Can I find out if there are surveillance cameras in my area?" → Camera map
2. "How do I file a FOIA request for ALPR data in South Carolina?" → SC § 30-4-10, toolkit link
3. "What bills would regulate license plate cameras in SC?" → 4 bills, H4675 strongest

---

## Internal Links

Most internally-linked post on the site. Every step points to a tool:

| Link Target | Context |
|-------------|---------|
| `/#camera-map` | Step 1 |
| `data-open-action` button | Step 2 + CTA |
| `/toolkit#request-records` | Step 3 |
| `/toolkit#speak-up` | Step 4 |
| `/toolkit#spread-the-word` | Step 5 |
| `/#bill-tracker` | State level section |
| `/blog/greenville-flock-contracts` | Step 3 (FOIA success) |
| `/blog/sc-has-no-license-plate-camera-law` | Step 3 (Richland FOIA) |
| `/blog/h4675-strongest-alpr-bill-in-sc` | Step 4 + State level |
| `/blog/the-4th-amendment-loophole` | Step 4 (constitutional framing, optional) |

## After Publishing

- Add cross-links FROM "SC Has No Law" and "H4675" posts TO this post
- Add to homepage BlogPreview if featured
- Consider linking from toolkit page sections
- Featured image needs creation (can use OG generation system)

## Source Material

All facts grounded in vault research notes:
- Greenville FOIA analysis (cost escalation, zero council votes, perpetual data rights)
- SC Camera Deployments (110+ agencies, 1,000+ cameras)
- SLED Database (422M reads, 3-year retention)
- Campaign Index (23 cities terminated, winning formula)
- Hays County TX, Eyes Off Eugene, Olympia WA campaign notes
- Public Records Requests (SC FOIA law, template language)
- Eyes Off GSP (active local coalition)

## Voice

- Follow voice-dna.md: contractions, short paragraphs, no em dashes, no banned phrases
- Second person throughout ("you")
- Concrete over abstract: specific steps, real SC examples
- Run through `/humanize` before publishing
