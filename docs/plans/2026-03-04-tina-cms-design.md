# Tina CMS Integration Design

## Goal

Add visual content to Obsidian-authored blog posts (inline images, featured images) and auto-generate OG/thumbnail images for social sharing.

## Workflow

Obsidian (write text) → `publish.py` (import as draft) → Tina (add images, set featured image, flip draft off) → `astro build` (generates OG images + site)

Tina runs locally alongside Astro's dev server. It edits the same `.md` files in `src/content/blog/` that `publish.py` writes. Markdown remains the single source of truth.

## Schema

New optional frontmatter fields alongside existing ones:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | yes | existing |
| `date` | date | yes | existing |
| `summary` | string | yes | existing |
| `tags` | string[] | no | existing |
| `draft` | boolean | no | existing |
| `featuredImage` | string | no | path to hero image, e.g. `/uploads/blog/my-post/hero.jpg` |
| `ogImage` | string | no | manual OG override path |

`featuredImage` serves double duty: displayed as hero on the post page, and used as background for auto-generated OG cards (unless `ogImage` overrides it).

Both image fields are optional. Posts work fine without them.

## Tina Configuration

- `tina/config.ts` defines one collection: `blog`
- Maps to `src/content/blog/`
- Rich text body editor with image upload support
- Media stored in `public/uploads/blog/`
- Local mode only (no Tina Cloud auth). Can add Cloud later without restructuring.

## Image Storage

- Uploaded images go to `public/uploads/blog/` (git-tracked)
- Organized by post slug subfolders
- Repo-based storage is fine for this site's scale; can migrate to CDN later if needed

## OG Image Generation

Build-time static generation using `satori` + `sharp`:

- **Template:** Dark card (#171717 bg), Inter 800 title text, DeflockSC branding, red accent stripe (#dc2626). If `featuredImage` exists, composite it as a dimmed background.
- **Output:** `public/og/blog/{slug}.png` (1200x630)
- **Priority:** `ogImage` frontmatter field > auto-generated > site default `/og-image.png`
- **Built OG images are gitignored** — regenerated on each deploy

## Blog Page Updates

### Detail page (`[...slug].astro`)
- Render `featuredImage` as full-width hero above the title (if present)
- Pass resolved OG image path to `<Base ogImage={...}>`

### Listing page (`index.astro`)
- Show `featuredImage` as thumbnail in post card (if present)

## File Structure

```
tina/
  config.ts              — Tina collection + media config
public/
  uploads/blog/          — uploaded images (git-tracked)
  og/blog/               — auto-generated OG images (gitignored)
src/
  lib/og-image.ts        — satori template + sharp rendering
  content.config.ts      — updated Zod schema (add featuredImage, ogImage)
  pages/blog/
    [...slug].astro      — updated with featured image + OG
    index.astro          — updated with thumbnail
```

## What Stays the Same

- `publish.py` unchanged — it won't set `featuredImage` or `ogImage`. Those are Tina's domain.
- Posts come in as text-only drafts; Tina adds visuals and publishes.
- Existing blog post structure and styling preserved.

## Bug Fix (bonus)

- `src/pages/rss.xml.ts` currently doesn't filter drafts. Fix while we're touching blog infrastructure.
