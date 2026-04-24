# S.447 Urgent CTA Blog Post Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a blog post at `/blog/s447-time-is-running-out` that drives constituent action on four specific floor amendments to S.447 before the Senate floor vote. Add a state-senator filter to the action modal in a separate commit.

**Architecture:** Astro content collection post, written section-by-section through the prose-craft review gate. Standard DeflockSC styling (dark cards, red accents, CTA block). Modal filter added as a DOM-only filter on the existing results renderer, triggered via a `data-open-action-filter` attribute on the CTA button.

**Tech Stack:** Astro 5 content collections, Tailwind CSS 4, TypeScript. Prose-craft skill for review gate with `prose-craft:prose-review` and `prose-craft:craft-review` sub-agents (sonnet model).

**Design doc:** [docs/plans/2026-04-24-s447-post-design.md](docs/plans/2026-04-24-s447-post-design.md)

**Branch:** `blogs/s447-urgent-cta` (already created, design doc committed)

---

## Task 1: Source Verification

Before writing any prose, verify the load-bearing facts. Getting these wrong means re-running review gates.

**Step 1: Verify S.447 sponsor**

Fetch [scstatehouse.gov/sess126_2025-2026/bills/447.htm](https://www.scstatehouse.gov/sess126_2025-2026/bills/447.htm) and confirm the sponsor name. Vault research note says "Senator Adams" but I wrote "Sen. Shane Martin" in one chunk during brainstorming. The bill page is authoritative.

Expected output: Confirmed sponsor name + party + district. Record it for use in Section 2 intro.

**Step 2: Verify §23-1-235(D)(1) exact text**

Fetch the [April 9, 2026 committee version](https://www.scstatehouse.gov/sess126_2025-2026/prever/447_20260409.htm) and extract the exact wording of subsection (D)(1), including the "including operation and maintenance of an ALPR database by SLED" clause. This is the pull-quote — must be word-for-word accurate.

Expected output: Quote block with the exact statutory text.

**Step 3: Verify Colorado (Brittney Gilliam) case details**

Use web search to confirm the specifics we'll cite in the opening hook. Verify: date (August 2020?), location (Aurora, CO), number of kids and their ages, vehicle mismatch type (Montana motorcycle vs SC SUV), settlement amount ($1.9M from Aurora PD).

Primary sources to check: 9News Denver, Washington Post, CBS, Aurora settlement press release.

Expected output: Confirmed facts with 2-3 citation URLs for the Sources section.

**Step 4: Verify session calendar**

Confirm: sine die date (May 14, 2026 per vault), S.447 Senate Judiciary favorable report date (April 9, 2026), Second Reading Calendar placement (April 22, 2026 at position #27). Count exact days from publish date (2026-04-24) to May 14 — verify "three weeks" phrasing.

Expected output: Day count (April 24 to May 14 = 20 days = "three weeks" is accurate).

**Step 5: Commit verification notes**

If any facts differ from the design doc, update the design doc inline with corrections. Commit only if the design doc was modified.

```bash
git add docs/plans/2026-04-24-s447-post-design.md
git commit -m "docs: correct S.447 design doc facts from source verification"
```

---

## Task 2: Write Opening Hook (Section 1)

Target: ~350-400 words, 5 paragraphs. See design doc Section 1 for structural breakdown.

**Step 1: Draft P1 (Colorado scene, ~100 words)**

Use the verified Gilliam facts from Task 1 Step 3. Concrete-first opening. Names, ages, specific vehicle details. No political framing yet.

Voice notes: Accumulation sentences building the scene. No em dashes. Deictic pronouns if any ("that plate," "those officers"). End on the specific settlement number.

**Step 2: Draft P2 (system, not camera, ~70-90 words)**

Key claim: the harm is what the network produces, not what one camera does. Name Flock Safety's national network + SLED's 430M-record state database. Close with the explicit pivot: Colorado happened because the network was underregulated.

**Step 3: Draft P3 (bipartisan brief, ~50 words)**

Four bills filed this session. Cross-ideological sponsorship. Use the positive construction: "The consensus is bipartisan, and it's unusual." No negation. No fatal pattern.

**Step 4: Draft P4 (what strong regulation includes, ~100 words)**

Prose enumeration, not bullets. Retention, warrants, in-state storage, plate-only AI limit, federal-sharing block, independent audits. Reads as consensus description.

**Step 5: Draft P5 (the reveal, ~80 words)**

One SC bill has all of the above. It's stuck. A weaker bill is moving — cleared Senate Judiciary on April 9, queued for a Senate floor vote, three weeks before the legislative session ends on May 14. If it passes, it becomes SC's first ALPR law. And it would make the stronger version harder to get.

**Step 6: Self-check pass**

Scan draft for:
- Em dashes (replace with commas/periods/parentheses/semicolons)
- Fatal pattern ("This isn't X. This is Y." and variants across sentence boundaries)
- AI vocabulary (delve, landscape, in today's, it's worth noting, tapestry)
- ChatGPT-isms (look, let's be honest, here's the thing, sit with)
- Colons used for inline elaboration (should only precede lists)

Fix any hits silently before dispatching review agents.

**Step 7: Dispatch prose-craft review agents (parallel)**

Using Agent tool with two parallel invocations:

Agent 1:
- `subagent_type`: "prose-craft:prose-review"
- `description`: "Review S.447 hook for AI patterns"
- `prompt`: Include full Section 1 draft + the active register's voice feature description from `C:\Users\tim\.claude\plugins\cache\local\prose-craft\2.0.0\registers\advocacy.md`

Agent 2:
- `subagent_type`: "prose-craft:craft-review"
- `description`: "Review S.447 hook for craft depth"
- `prompt`: Include full Section 1 draft

Wait for both to return.

**Step 8: Snapshot post-review**

Invoke prose-craft-learn with `snapshot post-review` to save the current text and review findings.

**Step 9: Process review findings**

Fix hard-fails silently (banned phrases, fatal pattern, em dashes, ChatGPT-isms). Present all other findings to user as advisory table:

| # | Line | Pattern | Current | Proposed fix |
|---|---|---|---|---|

User accepts, rejects, or modifies each row.

**Step 10: Snapshot post-fixes**

After user processes the advisory, invoke prose-craft-learn with `snapshot post-fixes`.

**Step 11: Hold section — don't write file yet**

Keep Section 1 prose in conversation state. Assemble the full file in Task 7.

---

## Task 3: Write Section 2 (What S.447 Does + Chart + SLED Clause)

Target: ~500-600 words prose + comparison chart + pull-quote callout. See design doc Section 2.

**Step 1: Draft intro + what S.447 regulates (~150 words)**

Open: "The bill is S.447, sponsored by [verified name from Task 1]." Credit the provisions that exist — 90-day retention, written policy, penalty, SCDOT permitting. Neutral description, not dismissive.

**Step 2: Draft what S.447 leaves out (~150 words)**

Name the silences in prose. Don't exhaust them — the chart handles exhaustion. Pivot sentence at the end: "In statutory interpretation, silence on a practice reads as permission to continue it."

**Step 3: Build the comparison chart**

Three-column HTML table. Use the `not-prose` wrapper Tailwind pattern from the H.4675 post for consistent styling. Columns: What's at stake | H.4675 (strong regulation) | S.447 (bill on the floor). Nine rows per design doc.

Red-accent S.447 cells where the bill fails: use `text-[#dc2626]` or similar. H.4675 cells stay neutral.

Template for each row:

```html
<tr>
  <td>Data retention</td>
  <td><strong>21 days</strong> with automatic deletion</td>
  <td class="text-[#dc2626]">90 days (codified baseline)</td>
</tr>
```

Wrap in a styled table container matching the dark-card aesthetic.

**Step 4: Draft SLED clause deep-dive (~150-200 words)**

Pull-quote the 11 words in §23-1-235(D)(1) using a styled callout (same visual language as numbered cards but without the numeral). Explain what the clause does. Weave SCPIF v. SLED quietly. Link to [/blog/scpif-v-sled-explainer](/blog/scpif-v-sled-explainer) for the full lawsuit backstory.

Pull-quote block template:

```html
<blockquote class="not-prose my-8 bg-[#1a1a1a] border-l-4 border-[#dc2626] px-6 py-6">
  <p class="text-[#e8e8e8] text-base italic">"[exact 11 words from Task 1 Step 2]"</p>
  <p class="text-[#a0a0a0] text-sm mt-3">— S.447, §23-1-235(D)(1)</p>
</blockquote>
```

**Step 5: Self-check pass**

Same banned-phrase scan as Task 2 Step 6.

**Step 6: Dispatch prose-craft review agents (parallel)**

Same pattern as Task 2 Step 7. Include the full Section 2 draft (prose + chart + pull-quote). Review agents should evaluate the prose; HTML structure is design-doc-approved and not under review.

**Step 7-9: Snapshot, process findings, snapshot post-fixes**

Same pattern as Task 2 Steps 8-10.

---

## Task 4: Write Section 3 (The Codification Trap)

Target: ~400 words, named-concept payoff. See design doc Section 3.

**Step 1: Draft the usual pattern (~80 words)**

Most weak legislation becomes a stepping stone. Acknowledge the normal logic of incremental reform. Don't strawman it.

**Step 2: Draft the four beats (~200 words)**

The anchor (90 days becomes baseline). Silence as permission. The lawsuit mutes (§23-1-235(D)(1) answers SCPIF). Politics harden (enacted statute is stronger defensive posture than unauthorized status quo).

Accumulation sentence structure throughout. Each beat builds on the previous.

**Step 3: Draft the named concept (~80 words)**

Call it the **Codification Trap.** Define it: a bill that regulates visibly while authorizing structurally. The visible regulation creates the appearance of progress, which makes the authorization harder to unwind.

**Step 4: Capture-adjacent acknowledgment (~40 words)**

One sentence noting that industry lobbying typically produces statutes of this shape. Don't assert capture. Don't name Sen. Adams/Martin.

**Step 5: Transition out (1 sentence)**

"If the bill passes as written, the trap closes. Four floor amendments would prevent it."

**Step 6: Self-check pass**

Same banned-phrase scan. Especially watch for the fatal pattern here — this section contrasts "normal pattern" with "this case" which is a classic trigger.

**Step 7-10: Review agents, snapshot, process, snapshot**

Same pattern as Task 2.

---

## Task 5: Write Section 4 (Four Amendments)

Target: ~350-400 words. Four numbered cards matching H.4675 post style.

**Step 1: Draft section intro (~50 words)**

Senate Second Reading Calendar. What a floor amendment is (brief, plain language). Four specific amendments would close the gap.

**Step 2: Draft four cards**

Each card: title (short, imperative), body paragraph (what it does + why it matters). ~70-80 words per card body.

Card 1: Strike the SLED database authorization
Card 2: Block federal agency access
Card 3: Require warrants for historical searches
Card 4: Cut retention from 90 days to 30

**Step 3: Build card HTML**

Use H.4675 post's card template, adapted:

```html
<div class="not-prose my-8 flex flex-col gap-3">
  <div class="bg-[#1a1a1a] border border-[rgba(255,255,255,0.07)] px-6 py-6 flex gap-5 items-start">
    <div class="text-[32px] font-bold text-[#dc2626] leading-none shrink-0 w-9 text-center">1</div>
    <div>
      <p class="text-[#e8e8e8] font-bold text-base mb-1.5">Strike the SLED database authorization</p>
      <p class="text-[#a0a0a0] text-[15px] leading-relaxed">[body text]</p>
    </div>
  </div>
  <!-- Cards 2-4 identical structure -->
</div>
```

**Step 4: Draft transition out (1 sentence)**

"These four amendments are what a sophisticated floor defense of privacy looks like in the next three weeks. Senators won't file them unless constituents ask for them specifically."

**Step 5: Self-check pass**

Banned-phrase scan. Watch for "let's" and "look" constructions in the card body copy.

**Step 6-9: Review agents, snapshot, process, snapshot**

Same pattern as Task 2.

---

## Task 6: Write Section 5 (CTA)

Target: ~150-200 words. Match H.4675 post's CTA style.

**Step 1: Draft CTA context (~80 words)**

Senate calendar position. What constituent contact does. Why senators listen.

**Step 2: Draft the 4-point ask**

Bulleted list inside the CTA block:

- Strike the SLED database authorization
- Block federal agency access to ALPR data
- Require warrants for historical queries
- Cut retention from 90 days to 30

**Step 3: Build CTA block HTML**

Match H.4675 post's CTA block style. Include the `data-open-action-filter="state-senator"` attribute on the button (inert until Task 10, then becomes functional):

```html
<div class="not-prose my-10 border border-[rgba(255,255,255,0.07)] bg-[#1a1a1a] px-8 py-8 text-center">
  <p class="label-mono-heading mb-3">Take Action</p>
  <p class="text-[#a3a3a3] text-sm mb-5">Find the state senator who represents you.</p>
  <ul class="text-left text-[#a3a3a3] text-sm mb-6 max-w-md mx-auto list-disc list-inside space-y-1">
    <li>Strike the SLED database authorization</li>
    <li>Block federal agency access to ALPR data</li>
    <li>Require warrants for historical queries</li>
    <li>Cut retention from 90 days to 30</li>
  </ul>
  <button type="button" data-open-action data-open-action-filter="state-senator" class="inline-block bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm uppercase tracking-[0.05em] px-8 py-4 transition-colors cursor-pointer">Find Your Senator</button>
</div>
```

**Step 4: Draft optional closer (~20 words)**

"For a step-by-step outreach guide, read the [action guide](/blog/how-to-fight-alpr-surveillance-sc)."

**Step 5: Self-check pass + review agents + snapshots**

Same pattern as Task 2.

---

## Task 7: Assemble Full Post

**Step 1: Create the markdown file**

Create `src/content/blog/s447-time-is-running-out.md` with:

- Frontmatter (title, date, summary placeholder, tags, draft:false, featuredImage placeholder, featuredImageAlt)
- All 5 sections in order, separated by `## ` headings

Section headings (slug-friendly, SEO-aware):

1. `## What Colorado's false alert tells us about ALPR systems` (or similar — finalize during writing)
2. `## What S.447 does, and what it doesn't`
3. `## The Codification Trap`
4. `## Four floor amendments that would close the gap`
5. `## Contact your state senator`

Don't over-commit to headings in the plan — adjust during writing to match prose flow.

**Step 2: Draft the summary (meta description)**

~155 characters. States the bill, the window, the ask. Example: "A South Carolina ALPR bill passed Senate Judiciary and is headed to a floor vote. Four specific amendments would close the gap."

**Step 3: Full-post prose-craft review (final pass)**

Dispatch prose-review + craft-review agents on the complete assembled post. Section-level review may miss inter-section issues (repetition, pacing, transitions).

**Step 4: Process any remaining advisory findings**

Same pattern.

**Step 5: Sources section**

Add a "## Sources" section at the end matching H.4675 post style. Include:

- [S.447 bill page](https://www.scstatehouse.gov/sess126_2025-2026/bills/447.htm)
- [S.447 April 9, 2026 committee version](https://www.scstatehouse.gov/sess126_2025-2026/prever/447_20260409.htm)
- [Senate Journal April 9, 2026 (favorable report)](https://www.scstatehouse.gov/sess126_2025-2026/sj26/20260409.htm)
- [Senate Calendar April 22, 2026](https://www.scstatehouse.gov/sess126_2025-2026/scal26/20260422.pdf)
- [H.4675 bill page](https://www.scstatehouse.gov/sess126_2025-2026/bills/4675.htm)
- [Policing Project: SCPIF v. SLED](https://www.policingproject.org/south-carolina-license-plate-reader-lawsuit)
- Brittney Gilliam / Aurora case (URLs from Task 1 Step 3)

**Step 6: Internal cross-links audit**

Verify links resolve:
- `/blog/h4675-strongest-alpr-bill-in-sc`
- `/blog/scpif-v-sled-explainer`
- `/blog/how-to-fight-alpr-surveillance-sc`

---

## Task 8: Technical Verification

**Step 1: Build check**

Run: `node node_modules/astro/astro.js check` (or `npm run check` if available)
Expected: No type errors.

Run: `node node_modules/astro/astro.js build`
Expected: Build completes, post appears in build output.

**Step 2: Dev server smoke test**

Use the preview_start tool with the `dev` config in `.claude/launch.json`. Navigate to `http://127.0.0.1:4321/blog/s447-time-is-running-out`.

Verify visually:
- Hero image renders (or placeholder if Tim's image not yet delivered)
- All 5 sections render with correct styling
- Comparison chart is readable and red cells highlight correctly
- Pull-quote callout styles correctly
- Four amendment cards render with numerals
- CTA block renders with 4-point ask + button

**Step 3: Preview tool CTA button test**

Click the "Find Your Senator" button. Verify:
- Action modal opens
- `data-open-action-filter` attribute is present on button (inspect via preview_inspect)
- Modal shows all rep groups (filter inert pre-Task 10)
- No console errors

**Step 4: Mobile responsive check**

Use preview_resize to 375px width. Verify all sections render without horizontal overflow. Chart scrolls horizontally if needed, or reflows acceptably.

---

## Task 9: Commit the Post

**Step 1: Stage the post**

```bash
git add src/content/blog/s447-time-is-running-out.md
```

**Step 2: Verify no unrelated changes**

```bash
git status
git diff --cached --stat
```

Expected: only the blog post file changed.

**Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
publish: S.447 urgent CTA blog post

Blog post explaining what S.447 does, what it leaves out, and four
specific floor amendments that would close the gap between this bill
and real ALPR regulation before the Senate floor vote.

Companion to the existing H.4675 and SCPIF v. SLED posts. Unique
angle: the Codification Trap, why this bill is the rare exception to
"any regulation is better than none."

CTA button includes data-open-action-filter="state-senator" attribute.
The attribute is inert until the modal filter implementation lands in
a follow-up commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Implement Modal State-Senator Filter

Separate commit per user direction. Post is locked first.

**Step 1: Read current modal code**

Re-read:
- `src/scripts/action-modal/index.ts` — find the `[data-open-action]` handler at line 23
- `src/scripts/action-modal/results-renderer.ts` — find where `renderResults()` is defined
- `src/scripts/action-modal/types.ts` — check if a filter state needs adding

**Step 2: Add filter capture to index.ts**

In the click handler at `index.ts:23-28`, read the `data-open-action-filter` attribute from the clicked button and stash it in a module-scoped variable. Pass it to the results renderer when results are rendered.

```typescript
let activeFilter: string | null = null;

document.querySelectorAll('[data-open-action]').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    activeFilter = (btn as HTMLElement).getAttribute('data-open-action-filter');
    openModal(btn as HTMLElement);
  });
});
```

Update the 3 `handleMatch(match)` call sites (`action-geo`, `action-form`, `action-manual-submit`) to pass the filter through.

**Step 3: Update handleMatch signature**

```typescript
function handleMatch(match: DistrictMatch): void {
  const groups = buildGroups(match, actionLetters, stateLegislators, localCouncils);
  showState('results');
  renderResults(groups, cameraCounts, activeFilter);
  // ... rest unchanged
}
```

**Step 4: Update renderResults in results-renderer.ts**

Add an optional `filter` parameter. When `filter === 'state-senator'`, render only the group where `category === 'state'` AND `label` includes "Senator" (or use a more precise match based on the group label pattern).

```typescript
export function renderResults(
  groups: RepGroup[],
  cameraCounts: CameraCounts,
  filter?: string | null
): void {
  let displayGroups = groups;
  if (filter === 'state-senator') {
    displayGroups = groups.filter(g => 
      g.category === 'state' && g.label.toLowerCase().includes('senator')
    );
  }
  // ... existing render logic using displayGroups instead of groups
}
```

**Step 5: Clear filter on modal close**

In `modal-controller.ts` `closeModal()`, or in index.ts, reset `activeFilter = null` so the next modal open starts clean.

**Step 6: TypeScript compile check**

Run: `node node_modules/astro/astro.js check`
Expected: No type errors.

---

## Task 11: Smoke Test Modal Filter

**Step 1: Start dev server**

Use preview_start with dev config. Navigate to the S.447 blog post.

**Step 2: Test the filtered path**

Click "Find Your Senator" button. Enter test SC address. Verify:
- Only state senator group renders (no state rep, no county, no city)
- No console errors
- Modal closes cleanly

**Step 3: Test unfiltered paths (regression)**

Navigate to each of these entry points and verify the modal still shows ALL rep groups:
- `/` (Hero "Take Action" button)
- `/` (TakeAction section CTA)
- `/` (BillTracker card CTAs if present)
- `/blog/h4675-strongest-alpr-bill-in-sc` (H.4675 post CTA)
- `/blog/how-to-fight-alpr-surveillance-sc` (action guide CTA)

Any of these regressing to senator-only would be a critical bug.

**Step 4: Mobile smoke test**

Use preview_resize 375px. Repeat Step 2 on mobile. Verify filter works and results render cleanly at mobile width.

**Step 5: Console error check**

Use preview_console_logs to verify no errors or warnings introduced by the filter logic.

---

## Task 12: Commit Modal Filter

**Step 1: Stage**

```bash
git add src/scripts/action-modal/index.ts src/scripts/action-modal/results-renderer.ts
```

If types.ts or modal-controller.ts were modified, add those too.

**Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(action-modal): add state-senator filter via data attribute

Adds a DOM-level filter to the action modal results renderer. Buttons
can now include data-open-action-filter="state-senator" to show only
the state senator group in results, hiding state rep, county, and
city council groups.

Used by the S.447 blog post CTA to focus constituent attention on
senators before the Senate floor vote. Unfiltered entry points
(Hero, TakeAction, other blog post CTAs) are unchanged.

Filter is cleared on modal close so subsequent opens start fresh.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: MANIFEST + PR

**Step 1: Regenerate MANIFEST.md**

Per global CLAUDE.md rule: "Owned repo, before PR merge: Regenerate MANIFEST.md to reflect the updated structure and include in the PR."

Update the structure section to reflect:
- New blog post at `src/content/blog/s447-time-is-running-out.md`
- New plan docs at `docs/plans/2026-04-24-s447-post-design.md` and `docs/plans/2026-04-24-s447-post-implementation.md`
- Modified action modal files

**Step 2: Commit MANIFEST**

```bash
git add MANIFEST.md
git commit -m "chore: regenerate MANIFEST for S.447 post + modal filter"
```

**Step 3: Push branch**

```bash
git push -u origin blogs/s447-urgent-cta
```

**Step 4: Open PR**

```bash
gh pr create --title "S.447 urgent CTA blog post + state-senator modal filter" --body "$(cat <<'EOF'
## Summary

- Publishes blog post at `/blog/s447-time-is-running-out` — urgent CTA targeting state senators before the S.447 floor vote
- Adds `data-open-action-filter="state-senator"` attribute support to the action modal
- Blog post unique angle: the **Codification Trap** (why this bill is the rare exception to "any regulation is better than none")

## Test plan

- [x] Blog post builds via `astro build`
- [x] Dev server renders post at correct URL
- [x] Comparison chart, pull-quote, amendment cards, CTA block all styled correctly
- [x] Modal smoke test: senator-only filter works from S.447 post
- [x] Modal regression test: all other entry points still show all groups
- [x] Mobile responsive check at 375px
- [x] Internal cross-links resolve
- [x] External source links valid
- [x] All prose passed prose-craft review gate

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL when complete.

---

## Execution Notes

**Voice consistency:** The main agent writes each section to keep voice stable. Prose-craft review agents (prose-review + craft-review) run as subagents at each section gate — these are the subagent invocations, not per-task writing dispatch.

**Featured image:** Tim is providing the image in parallel. If it's not ready when Task 9 commits, publish with the placeholder path and update when delivered.

**Blog post file naming:** `src/content/blog/s447-time-is-running-out.md`. Matches the title's urgency without spelling out the bill number (readers won't search "S447" but they will click "running out").

**Fallback if review agents flag load-bearing issues:** If a prose-craft review agent raises a structural issue (not just a line-level fix), loop back to design doc and user for reconciliation before continuing.
