# Handoff: Blog Rewrite Project (Session 1)

**Date:** 2026-04-15
**Project:** DeflockSC website (`blog-rewrite` branch)
**Session duration:** Extended multi-post session

---

## What We Did

Launched a systematic rewrite of all 8 published blog posts through the `prose-craft` skill to replace the old voice-DNA aesthetic (choppy, aggressive, staccato) with a more flowing investigative journalism register. Built a design doc, set a priority order, and completed 4 of 8 posts with full brainstorm → write → section review → edit → learn cycles.

The `prose-craft-learn` skill is being used between posts to accumulate observations about the user's editing patterns. Rules get promoted to the register files once enough evidence accumulates.

## Decisions Made

- **Single `blog-rewrite` branch, merge all at once.** Avoids intermediate Netlify deploys. Each post gets its own commit for history.
- **Priority order:** Greenville Flock Contracts and SCPIF v. SLED first (original research, active news), then SEO-value order for the rest. User reordered the original SEO-first priority to put original research first.
- **Preserve all special modules** (PDF iframe, comparison tables, numbered callouts, FAQ accordion, JSON-LD schema, styled action boxes) — red inline `<strong class="red">` highlights are exempt and recreated as needed.
- **Published posts only** (8 of 10); the 2 drafts handled separately.
- **Per-post brainstorming pass** (not one unified plan) before each rewrite.
- **Section-by-section review** for posts 3+ after user noted the earlier posts had old voice-DNA choppiness.
- **Pre-review snapshot goes after hard fails are cleaned up**, not before — matters for prose-craft-learn accuracy.

## Current State

**Completed posts (4/8), all committed to `blog-rewrite` branch:**
1. `greenville-flock-contracts.md` — New opener with national-network angle + forfeiture framing, merged Public Works section, "What the city asked for vs. what it signed" restructure, added North Charleston Lt. Terrell abuse case, cross-links to SCPIF/SC-No-Law/H4675
2. `scpif-v-sled-explainer.md` — Deck moved to subtitle, cold open with 2013 SLED officer scene, "The legal ground shifting under SLED" heading, tightened FBI bulletin transition, Milwaukee DA named
3. `sc-has-no-license-plate-camera-law.md` — Fatal patterns fixed, outline-like 6-item list collapsed to 3 thematic groups, Columbia Muckraker inline link, Richland County SO geographically grounded
4. `h4675-strongest-alpr-bill-in-sc.md` — New bipartisan hook, 7 provisions in numbered callout boxes (SCPIF style), federal access restructured around UW front/back/side door framework with HSI email listserv evidence for side door

**Design doc:** `docs/plans/2026-04-12-blog-rewrite-design.md` (committed)

**Accumulator state:** `C:\Users\tim\.claude\plugins\cache\local\prose-craft\2.0.0\learning\accumulator.md` — 14 hold observations tracked across 4 sessions. Two rules have been applied to `registers/advocacy.md`:
- Staccato consolidation rule (session 1)
- Conversational joins with ", and" rule (session 4)

Caps for emphasis has 8 instances across 4 sessions — user wants more evidence before promoting to apply. Applies to both advocacy and personal registers when eventually promoted.

## What Remains

**4 posts left, in priority order:**

1. **How to Fight ALPR in Your SC Community** (`how-to-fight-alpr-surveillance-sc.md`)
   - Has design doc: `docs/plans/2026-03-12-action-guide-blog-post-design.md`
   - Action-oriented, 5 concrete steps, imperative register
   - Has 2 action boxes to preserve

2. **The 4th Amendment Loophole** (`the-4th-amendment-loophole.md`)
   - Has design doc: `docs/plans/2026-03-12-blog-rework-4th-amendment-design.md`
   - 1 action box to preserve
   - National topic with SC angle

3. **Flock Patent / Facial Recognition** (`flock-safety-patent-facial-recognition.md`)
   - Has design doc: `docs/plans/2026-03-20-patent-blog-post-design.md`
   - **Complex modules to preserve:** capability comparison table (markdown), FAQ accordion (`<details>`/`<summary>`), JSON-LD FAQPage schema
   - Longest post (232 lines)

4. **Why We Built DeflockSC** (`building-deflocksc.md`)
   - No design doc, no repo plans file
   - Source: vault `building-deflocksc.md` (personal narrative)
   - Pure markdown, no special modules
   - **Register question:** may need `personal` register instead of `advocacy`

**After all 8 are done:**
- Final review of cross-links across all posts
- Merge `blog-rewrite` to `master`
- Single Netlify deploy

## Open Questions

- **Caps-for-emphasis threshold:** User wants more examples before promoting to apply. 8 instances across 4 sessions already. How many more sessions before we pull the trigger?
- **"Why We Built DeflockSC" register:** Personal narrative, not advocacy. Ask at start of that post whether to use `personal` register.
- **Post-merge cross-link verification:** Several posts now link to each other (SCPIF, SC No Law, H4675, Greenville). Need a final pass to verify all internal links resolve and slugs haven't drifted.

## Context to Reload

**Branch:** `blog-rewrite` off `master`. 5 commits so far (1 design doc + 4 post rewrites).

**Paths:**
- Posts: `src/content/blog/`
- Design doc: `docs/plans/2026-04-12-blog-rewrite-design.md`
- Pre-edit snapshots: `.claude/snapshots/<slug>-generated.md`
- Accumulator: `C:\Users\tim\.claude\plugins\cache\local\prose-craft\2.0.0\learning\accumulator.md`
- Active register file: `C:\Users\tim\.claude\plugins\cache\local\prose-craft\2.0.0\registers\advocacy.md`
- Vault research: `C:\Users\tim\OneDrive\Documents\Tim's Vault\Projects\Activism\DeflockSC Website\`

**Workflow per post (established in session):**
1. Read current post + any repo design doc + relevant vault research
2. Quick brainstorm with user on opening, structure questions, tricky sections
3. Write the rewrite
4. Dispatch section-by-section review agent (sonnet, explicit per-section breakdown)
5. Fix hard fails silently
6. Save snapshot to `.claude/snapshots/` AFTER hard fails cleaned up
7. Present remaining issues to user, get decisions
8. Apply approved fixes
9. Update snapshot
10. User does manual edit pass
11. Run `/prose-craft-learn`
12. Update accumulator, promote rules that hit evidence threshold
13. Commit to `blog-rewrite` branch

**Patterns learned about user's editing preferences (in accumulator, not yet promoted):**
- Caps for single-word emphasis (ANY, NOTHING, FAR, SINGLE, NO, ZERO, TIMES)
- "At least N" hedging to imply the real number is higher
- Stronger verbs (spy > scan)
- Colon → period when the second clause can stand alone
- ", and" joins over sentence breaks (now applied)
- Editorial kickers after bare factual lists
- Deictic pronouns (this/that) over articles (a/the) for established referents
- Temporal markers on present-tense claims (currently, now)
- Intensifier additions (whatsoever, completely)

**Special modules per remaining post:**
- How to Fight: 2 action boxes
- 4th Amendment: 1 action box
- Flock Patent: capability table, FAQ accordion, JSON-LD schema, action box
- Why We Built: nothing special

**User directives to honor:**
- Preserve PDF iframe format from Greenville post for any future document-embed sections
- Action box HTML is standard across posts — don't rewrite the markup, just the label copy
- Numbered callout box pattern (from SCPIF / H4675) is the preferred format when a section has 3-7 parallel items
- Review agent goes section by section, not holistic
