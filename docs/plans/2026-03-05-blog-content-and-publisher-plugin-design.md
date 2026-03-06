# Blog Content Strategy + Obsidian Publisher Plugin

**Date:** 2026-03-05
**Status:** Approved

---

## Part 1: Blog Content Strategy

### Goals

Three goals, served by different post types:
1. **Credibility** — Deep, well-sourced posts that establish DeflockSC as serious and trustworthy
2. **SEO / Awareness** — Individual posts indexed for specific search queries (Flock Safety SC, license plate cameras, etc.)
3. **Shareability** — Posts that travel in group chats, email forwards, and social media better than a homepage link

The homepage already handles the action funnel (education -> email your rep). Blog posts don't need to replicate that. Their job is depth, discoverability, and shareability that the homepage can't do.

### Voice

Blend of personal voice (from voice-dna.md) and non-partisan advocacy:
- Natural tone: contractions, parenthetical asides, physical verbs, varied sentence length
- Careful framing: avoid partisan triggers, lead with shared values (government overreach, 4th Amendment, data privacy, fiscal responsibility)
- "We" framing (organizational voice for DeflockSC)
- All banned phrases from voice-dna.md apply
- No em dashes. Short paragraphs (1-3 sentences).

### Topic Selection Framework

All topics filtered through the Talking Points document. Priority order:
1. Local Sovereignty / Anti-Federalism ("most important for SC")
2. Vendor Accountability ("single most transferable tactic")
3. Government Overreach
4. Data Privacy
5. 4th Amendment
6. Fiscal Responsibility
7. Parental Rights / Family Privacy
8. Documented Local Harms

### Post Structure

- 1200-2000 words
- Lead with a concrete fact, incident, or quote (not an abstract claim)
- Sources inline where referenced + Sources section at bottom
- Soft CTA at the end linking to the action tool (not the point of the post)
- Astro frontmatter: title, date, summary, tags

### Launch Batch (6 posts)

#### 1. "Building DeflockSC" (existing draft, publish as-is)
- **Frame:** Launch / meta
- **Source material:** Already written in `src/content/blog/welcome.md` and `docs/building-deflocksc.md`
- **Action:** Un-draft the existing post, or replace with the longer version from docs/

#### 2. "SC Has No License Plate Camera Law"
- **Frame:** Local Sovereignty + SC Regulatory Gap
- **Key facts:** SCDOT Secretary's admission (no public policy), 200+ unpermitted cameras on state roads, SLED 3-year retention, Greenville contract via forfeiture funds with no council vote, federal access without local consent, bipartisan support (Smith R, Rutherford D), 3 pending bills in committee
- **Source notes:** SC ALPR Legislation.md, SC Legislature.md, Greenville City Council.md, Greenville City - Flock Safety Cameras.md
- **SEO target:** "South Carolina license plate cameras", "SC ALPR law"

#### 3. "Flock Safety's Track Record"
- **Frame:** Vendor Accountability
- **Key facts:** Langley's on-camera federal contract lie (July 2025), cameras reactivated in Eugene without authorization, 200+ unpermitted SC installations, Langley's email insulting Staunton police chief, Flock admitting they can't monitor federal usage, Hays County and Staunton cancellations (explicitly pro-police framing)
- **Source notes:** Garrett Langley.md, Flock Safety.md, Federal Data Access.md, Staunton VA.md, Hays County TX.md, Eyes Off Eugene (OR).md
- **SEO target:** "Flock Safety problems", "Flock Safety controversy"

#### 4. "What Happened in Greenville"
- **Frame:** Documented Local Harms
- **Key facts:** Greenville sisters at gunpoint (rental car misread), SLED officer database abuse (2013) + SLED refusal to release records, Chuck Wright federal conviction while controlling Spartanburg surveillance, Greenville contract details
- **Source notes:** Greenville County.md, Spartanburg County.md, SLED Database.md, Greenville PD.md
- **SEO target:** "Greenville SC Flock cameras", "Flock Safety wrongful stop"

#### 5. "The 4th Amendment Loophole"
- **Frame:** 4th Amendment End-Run via Private Industry
- **Key facts:** Carpenter v US (warrantless location tracking unconstitutional), government outsources to Flock to sidestep, UW "three doors" (front/back/side), IJ v Norfolk federal litigation, 4000 immigration-related side-door searches (404 Media), local officers running searches on behalf of feds with no paper trail, Rutherford quotes
- **Source notes:** 4th Amendment.md, Federal Data Access.md, Flock Safeguards Analysis.md, Institute for Justice.md
- **SEO target:** "license plate cameras 4th amendment", "ALPR constitutional"

#### 6. "99% of the Plates They Scan Belong to People Like You"
- **Frame:** Parental Rights / Family Privacy
- **Key facts:** 99%+ innocent (LAPD audit), every family trip logged (doctor, church, school, political events), chilling effect on protected activities, SC-specific: church attendance, gun shows, political organizing all tracked, Rutherford's stalking case (ALPR used to track domestic partner), mosaic theory
- **Source notes:** Talking Points.md (parental rights section), ALPRs.md, Debunking Point-in-Time.md
- **SEO target:** "license plate cameras privacy", "ALPR tracking innocent people"

### Backlog (prioritized)

**Tier 1: Core Frames**
1. "Flock Says Their Cameras Don't Track You. Here's Why That's Misleading." (Debunking Point-in-Time / Data Privacy)
2. "Does Flock Safety Actually Reduce Crime?" (Fiscal Responsibility)
3. "Flock's New 'Safeguards' Don't Fix Anything" (Data Privacy + Government Overreach)

**Tier 2: SC-Specific**
4. "Your HOA Might Be Part of Greenville's Surveillance Network" (HOA Creep)
5. "Three Bills Sitting in Committee Right Now" (SC Regulatory Gap + action-oriented)
6. "What Spartanburg's Sheriff Tells Us About Surveillance" (Documented Local Harms)

**Tier 3: Vendor Accountability Deep Cuts**
7. "The Numbers Flock Doesn't Want You to See" (Scale of misuse)
8. "What Flock's CEO Said About Your Community" (Langley profile)
9. "How Sedona Went From Flock Supporter to Unanimous Ban" (Campaign success)
10. "Your Location Data Is a Product. Here's Who's Buying." (Commercial ALPR)

### Social Media

Each blog post gets coordinated social media content:
- LinkedIn post (long-form, professional)
- X/Twitter post or thread
- Tailored to each platform's conventions and character limits
- Links back to the full blog post

---

## Part 2: Obsidian Publisher Plugin

### Purpose

Pipeline from Obsidian vault research to published blog posts and coordinated social media content. General-purpose (not deflocksc-specific).

### Core Workflow

1. Select topic and vault research notes
2. Cross-reference sources across vault, verify claims
3. Draft blog post matching project voice and style
4. Output framework-compatible markdown (Astro, Hugo, etc.)
5. Generate coordinated social media content from the blog post

### Voice Rules

- Always pull voice guidelines from `voice-dna.md` (location specified in project config or CLAUDE.md)
- First-person framing for personal content
- "We" framing for organizational content
- All voice-dna.md banned phrases enforced

### Plugin Structure

```
obsidian-publisher/
  .claude-plugin/
    plugin.json
  skills/
    blog-writing/
      SKILL.md
      references/
        post-structure.md
        source-verification.md
    social-media/
      SKILL.md
      references/
        platform-formats.md
```

### Skills

#### blog-writing
- Vault-to-blog-post workflow
- How to pull from Obsidian vault notes (wikilinks, cross-references)
- Source verification and citation
- Post structure and formatting
- Reading voice-dna.md and applying voice rules
- Framework-specific output (Astro frontmatter, Hugo front matter, etc.)

#### social-media
- Blog-post-to-social-media workflow
- Platform-specific formatting (LinkedIn, X/Twitter)
- Character limits, conventions, engagement patterns
- Coordinated messaging across platforms
- Link-back to full blog post

### Project-Specific Config

Each project provides (via CLAUDE.md or a config file):
- Path to voice-dna.md
- Path to Obsidian vault / research notes
- Target audience description
- Blog framework and frontmatter schema
- Output path for blog posts
- Social media platforms and any platform-specific tone adjustments
- Whether to use first-person or "we" framing
