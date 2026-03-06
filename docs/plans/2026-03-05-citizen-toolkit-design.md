# Citizen Toolkit + FOIA Templates Design

**Date:** 2026-03-05
**Issues:** #8 (Public Records Request Templates), #39 (Citizen Toolkit)
**Branch:** `feature/citizen-toolkit`

## Overview

A dedicated `/toolkit` page combining FOIA request templates with council meeting prep, community outreach materials, and legal context. All content is original, written from scratch using existing SC research (46 county notes, campaign models, legislation analysis). The linked [Flock ALPR Toolkit](https://github.com/DeflockYourCity/flock-alpr-toolkit) is used as a topic reference, not a content source.

## Page Structure

**Route:** `/toolkit` (new Astro page)
**Layout:** `Base.astro` shell (Nav + Footer)
**Navigation:** Add "Toolkit" link to Nav component
**Homepage:** Add teaser CTA near BillTracker linking to `/toolkit`

### Tabbed Interface

Four tabs, client-side JS, URL hash for deep-linking (`/toolkit#speak-up`). Default: Request Records.

| Tab | Hash | Purpose |
|-----|------|---------|
| Request Records | `#request-records` | SC FOIA templates (copy + PDF) |
| Speak Up | `#speak-up` | Council meeting talk track, rebuttals, handout |
| Spread the Word | `#spread-the-word` | One-pager, conversation starters, business cards, share links |
| Know Your Rights | `#know-your-rights` | Legal landscape, bill status, gaps analysis |

## Tab Content

### 1. Request Records

SC Freedom of Information Act (S.C. Code 30-4-10 et seq.) gives residents the right to request public records. Agencies must respond within 15 business days.

**Intro section:** What FOIA is, who can file, what to expect, how to follow up if denied.

**4 template cards:**

1. **Flock contract and costs** — Full contract text, renewal terms, total cost, funding source (general fund vs. civil asset forfeiture vs. grant)
2. **Data retention and access policies** — How long plate data is kept locally and at SLED, who has access, any audit logs
3. **Camera locations and deployment scope** — Number of cameras, locations, roads covered, expansion plans
4. **Federal data sharing agreements** — MOUs with CBP, ICE, or other federal agencies; participation in Flock's national network

Each card has:
- Title and description of what it requests
- Copyable template text with `[PLACEHOLDER]` fields (agency name, requester name, date)
- "Copy to Clipboard" button
- "Download PDF" link

**Filing instructions:** Where to send (city clerk, county administrator, PD records office), certified mail tips, what to do if request is denied or fees are excessive.

**Data:** `src/data/toolkit-foia.json`
**PDFs:** Pre-generated in `public/toolkit/foia/`

### 2. Speak Up

For residents attending city/county council meetings or public comment periods.

**Intro:** How public comment works in SC, typical 3-minute time limits, sign-up procedures.

**Talk Track:** A scripted 3-minute public comment, SC-specific:
- What ALPRs are and how they work (plain language)
- Local deployment facts (1,000+ cameras, 110+ agencies)
- SLED database concern (422M reads, 3-year retention)
- The ask: moratorium on new deployments pending oversight ordinance

Written conversationally. Not a legal brief.

**Rebuttal Cards ("If Challenged"):**
- "It only captures plates, not people" — Patent-documented capabilities, SLED's 422M reads create movement profiles
- "We only keep data 30 days" — SLED retains 3 years, plus Flock's national sharing network
- "It reduces crime" — Austin's independent audit found no evidence of crime reduction
- "It's just like a security camera" — Mass dragnet vs. targeted surveillance, no warrant required
- "We need it for public safety" — Greenville sisters lawsuit (wrongful stop), 30+ cities have terminated contracts

**Council Handout:** One-page printable PDF with key SC facts, the 3 asks, and sources. Designed for handing to council members before public comment.

**Data:** `src/data/toolkit-speaking.json`
**PDFs:** Council handout in `public/toolkit/speaking/`

### 3. Spread the Word

Community outreach beyond government meetings.

**One-Pager Explainer:** "What's happening with surveillance cameras in SC?" Plain-language summary for neighbors, HOA meetings, church groups. Covers: what ALPRs are, SC deployment scale, why it matters, what to do. Copyable text + PDF download.

**Conversation Starters:** 3-4 short prompts for different audiences:
- Neighbors: "Did you know there are 1,000+ cameras scanning every car in SC?"
- Parents: "Your kids' school may have cameras feeding data to federal agencies"
- Small-government conservatives: "Your local PD spent $22K on surveillance cameras without council approval"
- General: "Your license plate was probably scanned today — here's why that matters"

**Business Cards:** 4 designs, dark theme matching site aesthetic, 3.5" x 2" standard size:

1. **"In 1984, the Thought Police weren't looking for criminals. Neither is Flock Safety."** + QR code to deflocksc.org
2. **"Your city council signed a contract that hands your movement data to the federal government — with no local veto."** + QR code
3. **"Surveillance doesn't equal safety."** + QR code + URL
4. **"1,000 Eyes"** — features the eye graphic (`public/toolkit/outreach/eye-graphic.png`) with "1,000 eyes on every SC road" or similar copy + QR code. Visual-forward design where the graphic is the focal point.

Downloadable as:
- Individual card images (PNG) for preview
- Avery 8371-compatible printable sheets (10 per page, letter-size PDF)

**Share Links:** Pre-formatted sharing buttons for the site (Twitter/X, Facebook, email) with suggested copy.

**Data:** `src/data/toolkit-outreach.json`
**Assets:** `public/toolkit/outreach/` (one-pager PDF, card PNGs, Avery PDFs)

### 4. Know Your Rights

Legal context and legislative status.

**4th Amendment Primer:** Plain-language explanation of why mass plate scanning raises constitutional questions. Not legal advice — framed as what courts and scholars are debating.

**SC Bill Tracker (compact):** Current status of S447, H3155, H4013 with links. Lighter than the homepage BillTracker — status badge + bill number + link only.

**Legal Landscape:** What other states have done:
- Virginia: law enforcement-only access, 7-day retention
- Montana: outright ban on ALPR data sharing
- Utah: strict retention limits
- Shows SC is behind on regulation

**What's Missing from Current Bills:** Gaps in S447/H3155/H4013:
- No restrictions on federal agency access
- No prohibition on immigration enforcement use
- No limits on Flock's national data-sharing network
- No disclosure requirements for vendor data agreements

Frames the "why your voice matters" angle.

**Data:** Reuses `src/data/bills.json` for bill status. New `src/data/toolkit-legal.json` for legal landscape and gaps.

## Technical Implementation

### New Files

```
src/pages/toolkit.astro          — Page shell + tab logic
src/components/ToolkitTabs.astro — Tab navigation + panels
src/components/TemplateCard.astro — Reusable card for FOIA templates
src/components/RebuttalCard.astro — Expandable rebuttal card
src/data/toolkit-foia.json       — FOIA template content
src/data/toolkit-speaking.json   — Talk track + rebuttals
src/data/toolkit-outreach.json   — Conversation starters + card metadata
src/data/toolkit-legal.json      — Legal landscape + bill gaps
public/toolkit/foia/             — FOIA template PDFs (4 files)
public/toolkit/speaking/         — Council handout PDF
public/toolkit/outreach/         — One-pager PDF, card PNGs, Avery PDFs
```

### Styling

- Follows existing section patterns: `bg-[#171717]`/`bg-[#262626]` alternation, `max-w-4xl mx-auto px-6`
- Tab bar: horizontal scroll on mobile, styled tabs with amber accent for active state
- Template cards: reuse `.glow-frame` pattern or `bg-[rgba(163,163,163,0.12)] rounded-xl` card style
- Copy button: clipboard API with success feedback (checkmark or "Copied!")
- Rebuttal cards: accordion-style expand/collapse (like FAQ pattern)
- All typography follows existing scale (Inter, same color tokens)

### Copy to Clipboard

```js
navigator.clipboard.writeText(templateText).then(() => {
  // Show "Copied!" feedback
});
```

Fallback for older browsers: `document.execCommand('copy')` with a hidden textarea.

### PDF Generation

Pre-generate all PDFs as static assets rather than build-time generation. Simpler, more reliable, no additional dependencies. Store in `public/toolkit/` subdirectories.

Business card PDFs: Create as designed SVGs, convert to PDF. Avery sheets: layout 10 cards per letter page with standard Avery 8371 margins (0.5" top/bottom, 0.75" sides, 0.0" gap between cards).

### QR Codes

Static QR code images pointing to `https://deflocksc.org` (or specific pages). Generate once, store as PNG in `public/toolkit/outreach/`.

### Research Cross-Reference

Before writing content, cross-reference the linked toolkit's topics against our existing research vault to identify any gaps:
- Security vulnerabilities (CVEs) — check if our research covers this
- Camera hackability — check existing notes
- Contract term changes — check campaign notes
- Patent-documented capabilities — check existing research

Fill gaps with original research, then write all toolkit content from scratch using SC-specific data.

## Content Voice

All toolkit content follows the project's established voice: direct, factual, non-partisan. Bipartisan framing throughout (fiscal responsibility + civil liberties). No AI-sounding language. Sources cited for every factual claim.

## Scope Boundaries

**In scope:**
- 4-tab toolkit page with all content described above
- FOIA templates (4) with copy + PDF
- Talk track + rebuttals + council handout
- One-pager + conversation starters + business cards
- Legal landscape + bill gaps
- Nav link + homepage teaser
- Research cross-reference with linked toolkit

**Out of scope:**
- Slide decks or presentation materials
- Social media graphics/infographics (beyond share links)
- Media pitch templates
- Video content
- Translated versions (see #20)
