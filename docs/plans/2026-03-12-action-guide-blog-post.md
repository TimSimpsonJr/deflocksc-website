# Cornerstone Blog Post: "How to Stop Surveillance Cameras in South Carolina"

**Date:** 2026-03-12
**Priority:** High — competitor scout flagged this as a completely unserved query (zero relevant SERP results)
**Target keyword:** "stop surveillance cameras South Carolina"
**Format:** 1,500-2,000 word action guide
**Branch:** create from master (or feature/seo if not yet merged)

---

## Why This Post Matters

The SEO audit identified 3 cornerstone content opportunities. The other 2 are largely covered by existing posts:
- "SC Has No License Plate Camera Law" covers the complete guide angle (~70%)
- "H4675 Is the Strongest ALPR Bill" covers the legislative explainer angle (~80%)

This action guide is the only one with **zero existing coverage**. The competitor scout found no quality results for "stop surveillance cameras South Carolina" — the SERP is empty. This is the highest-ROI content piece remaining.

---

## What It Should Cover

This post ties together resources that already exist on the site into a step-by-step playbook. It's not new research — it's a funnel that turns awareness into action.

### Suggested Structure

**1. Introduction** (~150 words)
- You found out your city has cameras. Now what?
- This is the playbook. 5 concrete steps, all doable by one person.

**2. Step 1: Find out what's in your area** (~200 words)
- Link to the [camera map](/#camera-map) — show them how to use it
- Explain what the dots/clusters mean
- Mention the data source (Deflock.org, community-sourced, updated hourly)
- Embed or screenshot of the map would help SEO (image with alt text)

**3. Step 2: Find out who's responsible** (~200 words)
- Link to the [action modal / rep finder](/#take-action) — "Find Your Rep" button
- Explain the 3 input paths (geolocation, address, manual dropdown)
- Mention that most camera contracts are signed by city/county, not state
- But state bills would override local inaction

**4. Step 3: File a records request** (~300 words)
- Link to [FOIA toolkit](/toolkit#request-records)
- Explain SC FOIA law basics (§ 30-4-10) — you have the right, it's free for electronic records
- Walk through the 4 template types:
  1. Camera locations
  2. Data retention policies
  3. Federal data sharing agreements
  4. The actual Flock contract
- Reference the Greenville FOIA success story from the [Greenville post](/blog/greenville-flock-contracts)
- Reference the Richland County $9K FOIA quote from the ["SC Has No Law" post](/blog/sc-has-no-license-plate-camera-law) as a cautionary tale

**5. Step 4: Show up at a council meeting** (~300 words)
- Link to [council meeting prep](/toolkit#speak-up)
- How to find your next meeting (county/city websites, agenda postings)
- How public comment works in SC (sign-up rules, time limits)
- 3-4 key talking points to hit:
  - No public vote authorized these cameras
  - No oversight policy exists
  - Data goes to a national network with federal access
  - [H4675](/blog/h4675-strongest-alpr-bill-in-sc) would void existing contracts — ask if they've read it
- Reference the council handout PDF from the toolkit

**6. Step 5: Get your neighbors asking questions too** (~200 words)
- Link to [outreach materials](/toolkit#spread-the-word)
- One-pager PDF, social media cards, email templates
- Suggest: share with your HOA, neighborhood Facebook group, Nextdoor
- The more people asking, the harder it is to ignore

**7. What's happening at the state level** (~200 words)
- Link to the [bill tracker](/#bill-tracker)
- Brief summary: 4 bills, all in committee, none have had a hearing
- H4675 is the strongest — link to the [H4675 explainer](/blog/h4675-strongest-alpr-bill-in-sc)
- The bills move when legislators hear from constituents

**8. Call to action** (~100 words)
- Embed the "Find Your Rep" button (`data-open-action` pattern used in other posts)
- "Pick one step. Do it today."

---

## Internal Links to Include

This post should be the most internally-linked piece on the site. Every step points to an existing tool:

| Link Target | Context |
|-------------|---------|
| `/#camera-map` | Step 1 |
| `/#take-action` or `data-open-action` button | Step 2 + CTA |
| `/toolkit#request-records` | Step 3 |
| `/toolkit#speak-up` | Step 4 |
| `/toolkit#spread-the-word` | Step 5 |
| `/toolkit#know-your-rights` | Step 5 or 7 |
| `/#bill-tracker` | Step 7 |
| `/blog/greenville-flock-contracts` | Step 3 (FOIA success story) |
| `/blog/sc-has-no-license-plate-camera-law` | Step 3 (Richland FOIA) or Step 4 (talking points) |
| `/blog/h4675-strongest-alpr-bill-in-sc` | Step 4 + Step 7 |
| `/blog/the-4th-amendment-loophole` | Optional, Step 4 constitutional framing |

---

## SEO Considerations

- **Title tag:** Should include "South Carolina" + action verb. Examples:
  - "How to Fight License Plate Surveillance in South Carolina"
  - "5 Steps to Stop ALPR Cameras in Your SC Community"
  - "How to Push Back Against Surveillance Cameras in South Carolina"
- **Meta description:** Action-oriented, mention the tools (FOIA templates, rep finder, council prep)
- **FAQ schema:** Consider adding 2-3 FAQs at the bottom for People Also Ask targeting:
  - "Can I find out if there are surveillance cameras in my area?"
  - "How do I file a FOIA request for ALPR data in South Carolina?"
  - "What bills would regulate license plate cameras in SC?"
- **Featured image:** Needs alt text with "South Carolina" + "surveillance" + action keyword

---

## Voice & Style

Follow the site's existing voice (see `voice-dna.md`):
- Direct, second-person ("you"), no hedging
- Concrete over abstract — specific steps, not vague encouragement
- Reference real SC examples, not hypotheticals
- No AI vocabulary (pivotal, delve, tapestry, underscore, etc.)
- Run through `/humanize` skill before publishing

---

## Content Schema

```yaml
title: "TBD — optimize for target keyword"
date: 2026-MM-DDT00:00:00.000Z
summary: "TBD"
tags:
  - action
  - toolkit
  - sc
draft: false
featuredImage: /blog/TBD.png
featuredImageAlt: "TBD — keyword-rich alt text"
```

---

## After Publishing

- [ ] Add internal links FROM other posts TO this one (especially "SC Has No Law" and "H4675" which both end with CTAs)
- [ ] Add to the Footer "Explore" column if it exists
- [ ] Update the homepage BlogPreview if this should be featured
- [ ] Consider linking from the toolkit page header or individual toolkit sections
