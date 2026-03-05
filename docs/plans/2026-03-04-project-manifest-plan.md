# Project Manifest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a MANIFEST.md structural map for deflocksc-website, and add a global CLAUDE.md rule to auto-generate manifests for all GitHub repos.

**Architecture:** Two independent deliverables — a concrete MANIFEST.md file for this repo, and a behavioral rule in the global CLAUDE.md. No code, no tests, just markdown files and a git rule.

**Tech Stack:** Markdown, git

---

### Task 1: Write MANIFEST.md for deflocksc-website

**Files:**
- Create: `MANIFEST.md`

**Step 1: Write the manifest**

Create `MANIFEST.md` at repo root with three sections: Stack, Structure, Key Relationships.

The Structure section should be an annotated file tree covering:
- `src/components/` — all 10 Astro components with 1-line descriptions
- `src/pages/` — routes (index, blog index, blog slugs, RSS, OG image)
- `src/layouts/` — Base.astro
- `src/lib/` — district-matcher.js, geo-utils.js, og-image.ts
- `src/scripts/` — camera-map.ts, carousel.ts
- `src/data/` — bills.json, state-legislators.json, local-councils.json, action-letters.json, registry.json
- `src/styles/` — global.css
- `src/content/` — content.config.ts, blog posts
- `scripts/` — scraper.py, build-districts.py, publish.py, fetch-camera-data.mjs, build-map-style.mjs
- `public/` — static assets (camera images, district GeoJSON, map style)
- `docs/` — architecture.md, deployment.md, plans/
- `.github/workflows/` — scrape-bills.yml, scrape-reps.yml, refresh-camera-data.yml, lighthouse.yml

Key Relationships should document:
- ActionModal inlines district-matcher.js functions (Astro define:vars can't import ES modules)
- camera-map.ts extracted from MapSection, carousel.ts from HowItWorks
- HowItWorksOverlays.astro extracted from HowItWorks
- bills.json populated by scraper.py via GitHub Actions
- build-districts.py generates GeoJSON consumed by district-matcher.js
- publish.py pulls content from Obsidian vault

Target: 50-80 lines, scannable.

**Step 2: Commit**

```bash
git add MANIFEST.md
git commit -m "docs: add MANIFEST.md structural map for instant project context"
```

---

### Task 2: Add manifest rule to global CLAUDE.md

**Files:**
- Modify: `C:\Users\tim\.claude\CLAUDE.md`

**Step 1: Append the manifest rule**

Add a new `## Project Manifest` section to the end of `~/.claude/CLAUDE.md` with these directives:

1. **Ownership check:** On session start in a git repo, run `git remote get-url origin` and check if the URL contains `TimSimpsonJr` (handles both `git@github.com:TimSimpsonJr/` and `https://github.com/TimSimpsonJr/`).

2. **Owned repo behavior:**
   - If no `MANIFEST.md` exists, generate one (Stack, Structure, Key Relationships) and commit it.
   - After merging a PR, regenerate `MANIFEST.md` to reflect updated structure and commit.

3. **Non-owned repo behavior:**
   - If no `MANIFEST.md` exists, generate one but add `MANIFEST.md` to `.git/info/exclude` instead of committing.
   - After merging a PR, regenerate and keep excluded.

4. **Manifest format:** Include the template (Stack, Structure with annotated file tree, Key Relationships).

The rule should be concise — behavioral instructions, not a script. ~20-30 lines.

**Step 2: Verify the rule reads correctly**

Read back `~/.claude/CLAUDE.md` and confirm the new section is well-formed and doesn't conflict with existing instructions.

---

### Task 3: Commit global CLAUDE.md change (separate from repo)

Note: The global CLAUDE.md is not part of this repo, so it won't be in the PR. Just save it — no git action needed for this file.

---

### Task 4: Update project memory

**Files:**
- Modify: `C:\Users\tim\.claude\projects\C--Users-tim-OneDrive-Documents-Projects-deflocksc-website\memory\MEMORY.md`

**Step 1: Add manifest entry**

Add a brief note to MEMORY.md under a relevant section noting that `MANIFEST.md` exists at repo root and is auto-maintained per the global CLAUDE.md rule.

---
