# Blog Post Design: H4675 — The Strongest ALPR Bill in SC

**Date:** 2026-03-12
**Status:** Approved

## Purpose

Dedicated blog post explaining what H4675 does, why it matters, and what SC residents should do about it. Works standalone for readers who've never heard of Flock or ALPR cameras. Structured to rank for H4675 searches.

## Audience

SC residents (most don't know about Flock cameras yet) + new visitors arriving via search. The post should explain the problem from scratch, not assume prior site visits.

## File

`src/content/blog/h4675-strongest-alpr-bill-in-sc.md`

## Frontmatter

```yaml
title: "H4675 Is the Strongest ALPR Bill South Carolina Has Ever Seen"
date: 2026-03-12T00:00:00.000Z
summary: "Four bills to regulate license plate cameras are sitting in committee. One of them would void every Flock Safety contract in the state. Here's what H4675 does, where it falls short, and why it needs a hearing."
tags: [legislation, sc, privacy, h4675]
draft: true
```

## Sections

### 1. Opening (3-4 paragraphs)

- Hook: SC has 4 ALPR bills. Three regulate what police do with camera data. H4675 regulates what Flock Safety does with it.
- Context for new readers: Flock Safety is the company behind most SC plate cameras. They store data on their own cloud servers, share across a national network, and have been caught giving federal agencies access without telling local departments. SC has zero laws governing any of it.
- Stakes: If H4675 passed, every existing Flock contract in SC would be void.

### 2. What H4675 actually does (provisions walkthrough)

Plain-language rundown of 7 key provisions, each as a short paragraph:

1. **Cloud storage ban** — all data on state-owned, in-state servers
2. **AI vehicle tracking ban** — targets "Vehicle Fingerprint" technology
3. **21-day retention limit** — vs. SLED's current 3-year retention of 422M+ records
4. **Warrant requirement** for historical data access
5. **Immigration enforcement ban**
6. **Civil remedies** — residents can sue, collect damages + attorney's fees
7. **Quarterly independent audits** by SC Inspector General + annual transparency reports

Brief note: sponsored by 4 Freedom Caucus Republicans; a Democrat (Rutherford) has his own ALPR bill in the same committee. Supporting detail, not central theme.

### 3. The federal access problem (full section)

- Setup: local agencies think cameras are for local crime. But Flock runs a national network where any agency can query any other agency's data.
- **Key framing: This is about unconstitutional surveillance, not immigration specifically. If federal agencies can access the system without limits, ANY federal agency can. That's the structural problem.**
- Key incidents (sourced, avoid naming CBP/ICE as primary framing):
  - Colorado: Flock gave federal agents a secret account to access local cameras (Aug 2025). CEO had denied federal contracts 20 days earlier.
  - Illinois: Federal agents accessed 12 local agencies' data in violation of state law.
  - Washington: UWCHR documented 3 access modes (front door, back door, side door).
  - Virginia: ~3,000 immigration-related searches on Flock network over 12 months.
- Pivot: Three of SC's four bills don't touch this. H4675 does. Its cloud ban makes the national network structurally impossible in SC. It addresses the architecture, not just the rules.

### 4. Where it could be stronger (light touch, 2-3 paragraphs)

Constructive framing, not criticism:

- Biggest obstacle: in House Judiciary since January, no hearing scheduled. Can't pass if it doesn't get heard.
- Practical question: who pays for state-owned servers for smaller agencies? 21-day retention means far less data to store; Montana and New Hampshire manage local storage.
- Only 4 sponsors so far. Needs more.
- Frame: these aren't fatal flaws, they're normal legislative friction. The point is to get it to committee.

### 5. Why it needs a hearing now (urgency, 3-4 paragraphs)

- SLED database: 422M+ plate reads, no statutory authority. Every day without legislation = unregulated mass data collection.
- Flock rewrote ToS twice in 3 months (Dec 2025, Feb 2026), 147 documented changes. Cities may be bound by provisions they never agreed to.
- Cities canceling Flock nationwide (Denver, Evanston, Mountain View). SC can get ahead or wait for a scandal.
- Both H4675 and H3155 in House Judiciary. Strongest provisions from H4675 should be folded into whatever bill advances.

### 6. CTA (short)

If your rep sits on Judiciary or Education & Public Works, they have a direct say. Tell them you want H4675 to get a hearing.

Inline "Find Your Rep" button:
```html
<div class="flex justify-center my-10">
  <button type="button" data-open-action class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 rounded transition-colors cursor-pointer">Find Your Rep</button>
</div>
```

### 7. Sources

All claims linked:
- scstatehouse.gov bill pages (H4675, S447, H3155, H4013)
- 9NEWS Colorado federal access story
- UWCHR report (Washington front/back/side door)
- IL Secretary of State audit
- VCIJ Virginia investigation
- Post and Courier SC coverage (Mar 2024, Dec 2020)
- Mobile Pro Systems industry analysis

## Internal Cross-Links

- Link to "SC Has No License Plate Camera Law" when referencing regulatory vacuum
- Link to "The 4th Amendment Loophole" when mentioning warrant requirements
- Link to toolkit page "Know Your Rights" tab for full bill comparison

## Style Rules (from voice-dna.md)

- Contractions always
- Short paragraphs (1-3 sentences)
- NO em dashes (use commas, colons, parentheses)
- Physical verbs ("bolted on," "stripped back")
- No banned phrases (no "delve," "landscape," "game-changer," etc.)
- No "This isn't X. This is Y." pattern
- Bold sparingly (1-2 per section)
- Numbers as digits

## Reference Files

- `src/content/blog/sc-has-no-license-plate-camera-law.md` — closest style match
- `src/content.config.ts` — blog schema (title, date, summary, tags, draft, featuredImage, featuredImageAlt, ogImage)
- Vault: `H4675 - Community Data Protection and Responsible Surveillance Act.md` — bill provisions, sponsor analysis, strengths/weaknesses
- Vault: `Federal Data Access.md` — federal access incidents, UWCHR framework, documented cases
- Vault: `SC ALPR Legislation.md` — bill comparison, legislative strategy, key quotes

## Verification

1. `astro build` compiles without errors
2. Dev server: post appears at `/blog/h4675-strongest-alpr-bill-in-sc`
3. CTA button triggers action modal
4. All source links are valid URLs
5. Internal cross-links resolve to existing pages
