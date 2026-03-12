# SEO Remaining Work — DeflockSC

**Date:** 2026-03-12
**Branch:** feature/seo (from master)
**Status:** Quick + medium wins complete; remaining items below

---

## What's Done (feature/seo branch)

All quick and medium wins from the audit are implemented and verified:

- `public/robots.txt` — crawl directives + sitemap reference
- `@astrojs/sitemap` integration — auto-generates XML sitemap at build
- Canonical `<link>` tags on every page
- Fallback domain fixed (`deflocksc.org`, not `deflocksc.netlify.app`)
- `src/pages/404.astro` — full-viewport page with ghost text, matches UI overhaul
- JSON-LD structured data: Organization, FAQPage, Article, BreadcrumbList
- Dynamic `og:type` (website vs article) + `og:site_name` + `article:published_time`
- Title/description optimization on index, toolkit, blog index, blog posts
- Non-render-blocking font loading (preload + media print/onload)
- Blog image `width`/`height` attributes for CLS prevention
- Related post `loading="lazy"` + dimensions
- Security headers in `netlify.toml` (X-Frame-Options, CSP-adjacent, Referrer-Policy)
- Footer internal links (Explore column with site navigation)
- `<slot name="head" />` in Base.astro for page-specific schema injection

---

## Remaining Work

### 1. Publish Draft Blog Posts

Four posts sitting in draft, ~6,500 words of keyword-rich content not being indexed:

| Post | Target Keyword |
|------|---------------|
| "99% of the Plates They Scan" | ALPR surveillance general awareness |
| "Flock Safety's Track Record" | Flock Safety cameras South Carolina |
| "SC Has No License Plate Camera Law" | ALPR laws South Carolina |
| "The 4th Amendment Loophole" | ALPR fourth amendment South Carolina |

**Before publishing:** Review each post for accuracy (dates, claims, sources). Optimize title tags to include target keyword + "South Carolina" + year. Add 2-3 internal links per post (to other blog posts + toolkit). Consider adding per-post FAQ schema for People Also Ask targeting.

### 2. Internal Linking Pass

Current state: near-zero internal links between content. Every blog post should link to at least 2 other posts and 1 toolkit section. Homepage sections should deep-link to relevant blog posts where natural. The blog index hero and cards already link to posts, but the posts themselves don't cross-link.

### 3. Break Toolkit Into Separate Pages

The toolkit currently hides ~3,500 words behind JS tabs. Search engines may deprioritize tab-hidden content. Breaking into `/toolkit/foia`, `/toolkit/speaking`, `/toolkit/outreach`, `/toolkit/legal` would:
- Make each section independently indexable
- Allow keyword-optimized titles per section
- Create more internal linking targets
- Each page would target different long-tail queries (e.g., "FOIA request ALPR camera data")

Keep `/toolkit` as a hub page linking to all four.

### 4. New Cornerstone Content

The competitor scout identified three keyword clusters with LOW competition and no quality content in the SERP. These are the highest-ROI content pieces:

**a) "ALPR Surveillance in South Carolina: The Complete Guide"**
- Target: "ALPR surveillance South Carolina"
- Format: 2,500-3,000 word comprehensive guide
- Includes: camera map embed, bill tracker, SLED stats, county deployment data, FAQ schema
- Differentiator: only page combining live map + legislative tracker + action tools

**b) "License Plate Reader Bills in SC: What Each Proposal Means"**
- Target: "license plate readers SC", "ALPR laws South Carolina"
- Format: 1,800-2,200 word legislative explainer
- Includes: bill comparison table (S447 vs H3155 vs H4675), plain-language summaries, status badges, FAQ schema
- Differentiator: only human-readable comparison of all active bills

**c) "How to Stop Surveillance Cameras in South Carolina"**
- Target: "stop surveillance cameras South Carolina"
- Format: 1,500-2,000 word action guide
- Includes: step-by-step playbook, rep finder embed, FOIA templates, public comment talking points, success stories
- Differentiator: completely unserved query — zero relevant results in SERP today

### 5. Google Search Console

Submit the sitemap (`/sitemap-index.xml`) to GSC. Verify the domain. Monitor indexing status. This is mechanical but critical — nothing ranks until it's indexed.

### 6. Font Self-Hosting (Optional)

Currently loading Instrument Sans + DM Mono from Google Fonts. Self-hosting would:
- Eliminate the render-blocking external request
- Improve LCP by ~100-200ms
- Remove the Google Fonts privacy/tracking concern

Low priority since the preload + media-swap pattern already mitigates most of the performance hit.

### 7. Image Alt Text Audit

Blog featured images and the camera map screenshots should have keyword-rich alt text rather than just the post title. Low effort, minor SEO signal.

---

## Competitive Landscape Summary

Full report: `reports/competitor-scout-alpr-surveillance-2026-03-12.md`

**The opportunity:** No organization publishes comprehensive, SEO-optimized, SC-specific ALPR content. EFF and ACLU dominate national keywords but have zero South Carolina pages. SC news outlets publish episodic coverage that goes stale. The SC Law Review article is academic and inaccessible.

**DeflockSC's moats:** Camera map, bill tracker, 46-county letter templates, rep finder. National orgs can't replicate these.

**Priority keywords by timeline:**

| Timeline | Keywords | Competition |
|----------|----------|-------------|
| Immediate | "ALPR laws South Carolina", "stop surveillance cameras SC", "license plate readers SC" | LOW |
| Short-term | "Flock Safety controversy SC", "surveillance camera advocacy" | MEDIUM |
| Long-term | "Flock Safety cameras", "ALPR fourth amendment", "license plate reader laws" | HIGH |

---

## Recommended Order of Operations

1. Merge feature/seo branch (infrastructure is ready)
2. Submit sitemap to Google Search Console
3. Review + publish the 4 draft blog posts
4. Internal linking pass across all published content
5. Write cornerstone content piece (a) — the comprehensive SC guide
6. Break toolkit into separate pages
7. Write cornerstone pieces (b) and (c)
8. Font self-hosting + alt text audit
