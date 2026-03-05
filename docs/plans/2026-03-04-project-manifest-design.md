# Project Manifest Design

## Goal

Give Claude an instant structural understanding of any project on session start, without needing to explore the codebase first.

## Deliverables

### 1. MANIFEST.md (per-repo)

A structural map at the repo root. Contains:

- **Stack** — framework, language, key dependencies (2-3 lines)
- **Structure** — annotated file tree with 1-line descriptions, grouped by purpose
- **Key Relationships** — non-obvious couplings between files/modules

Target length: 50-80 lines. Concise, scannable.

### 2. Global CLAUDE.md rule

A behavioral directive added to `~/.claude/CLAUDE.md` that instructs Claude to:

1. On session start, check repo ownership by parsing `git remote get-url origin` for `TimSimpsonJr` (handle both SSH `git@github.com:TimSimpsonJr/...` and HTTPS `https://github.com/TimSimpsonJr/...` formats).

2. Based on ownership:
   - **Owned repo, no MANIFEST.md:** Generate one and commit it.
   - **Owned repo, after PR merge:** Regenerate to reflect updated structure.
   - **Non-owned repo, no MANIFEST.md:** Generate one but add `MANIFEST.md` to `.git/info/exclude` (local-only gitignore, never committed).
   - **Non-owned repo, after PR merge:** Regenerate but keep excluded.

3. The manifest format is the same regardless of ownership. Only the git handling differs.

## Manifest Template

```markdown
# Project Manifest

## Stack
[framework] + [styling] + [key deps]

## Structure
[annotated file tree grouped by purpose]

## Key Relationships
[non-obvious couplings, inlining, extraction patterns]
```
