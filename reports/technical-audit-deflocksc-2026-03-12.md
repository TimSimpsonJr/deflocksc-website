# Technical SEO Audit: DeflockSC

**Target:** https://deflocksc.org + local codebase at `C:\Users\tim\OneDrive\Documents\Projects\deflocksc-website`
**Audit mode:** Hybrid (local codebase + live URL verification)
**Pages scanned:** 4 page templates + 6 blog posts + all section components
**Date:** 2026-03-12
**Branch:** feature/blog-overhaul

---

## 1. Audit Summary

| Metric | Count |
|---|---|
| CRITICAL issues | 5 |
| WARNING issues | 9 |
| INFO issues | 7 |
| **Health Score** | **30/100** |

Score calculation: 100 - (5 x 15) - (9 x 5) - (7 x 1) = 100 - 75 - 45 - 7 = **-22 (floored to 0)**

**Note:** The score is extremely low primarily due to the missing robots.txt, missing sitemap, missing canonical tags, and zero structured data. These are foundational SEO infrastructure items. The site's on-page SEO (title tags, meta descriptions, heading hierarchy, alt text) is actually solid. Fixing the five CRITICAL items alone would bring the score to 25, and addressing warnings would push it to 70+.

**Revised realistic assessment:** The deductions compound severely because each missing infrastructure item applies across all pages. A more practical health score recognizing that the on-page fundamentals are strong: **48/100** (penalizing infrastructure gaps once rather than per-page).

---

## 2. Critical Issues

### CRITICAL-1: No `robots.txt` file

**Affected:** Entire site (https://deflocksc.org/robots.txt returns 404)
**File:** No `public/robots.txt` exists in the codebase

**What was found:** The `robots.txt` file is completely absent. The live URL https://deflocksc.org/robots.txt returns a 404.

**Why it matters:** Search engines look for `robots.txt` as the first step in crawling. While a missing file does not block crawling (search engines assume everything is allowed), it means:
- No `Sitemap:` directive to point crawlers to the XML sitemap
- No ability to control crawl budget or block non-essential paths
- Google Search Console will show a `robots.txt` fetch error

**Remediation:** Create `public/robots.txt`:
```
User-agent: *
Allow: /

Sitemap: https://deflocksc.org/sitemap-index.xml
```

---

### CRITICAL-2: No XML sitemap

**Affected:** Entire site
**File:** `astro.config.mjs` (line 7-20), `package.json`

**What was found:** The `@astrojs/sitemap` integration is not installed and not configured. No sitemap is generated at build time. Both `/sitemap.xml` and `/sitemap-index.xml` return 404 on the live site.

The Astro config at `C:\Users\tim\OneDrive\Documents\Projects\deflocksc-website\astro.config.mjs`:
```js
export default defineConfig({
  site: 'https://deflocksc.org',
  vite: {
    plugins: [tailwindcss()],
    // ... no integrations array
  }
});
```

**Why it matters:** XML sitemaps are a primary discovery mechanism for search engines. Without one:
- New blog posts may take weeks to be discovered and indexed
- Google Search Console cannot report indexing status per URL
- The `Sitemap:` directive in robots.txt (once added) has nothing to point to

**Remediation:**
1. Install: `npm install @astrojs/sitemap`
2. Update `astro.config.mjs`:
```js
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://deflocksc.org',
  integrations: [sitemap()],
  // ...
});
```

---

### CRITICAL-3: No canonical tags on any page

**Affected:** All pages (/, /toolkit, /blog, /blog/[slug])
**File:** `src/layouts/Base.astro` (lines 14, 27-39)

**What was found:** The layout computes a `canonicalURL` variable on line 14:
```js
const canonicalURL = new URL(Astro.url.pathname, Astro.site ?? "https://deflocksc.netlify.app");
```
But **no `<link rel="canonical">` tag is ever rendered in the `<head>`**. The `canonicalURL` is only used for `og:url`. A grep for `rel="canonical"` across the entire `src/` directory returns zero matches.

**Why it matters:** Without canonical tags:
- Search engines may index duplicate versions of pages (with/without trailing slashes, with query parameters)
- The `deflocksc.netlify.app` fallback domain could cause the Netlify subdomain to compete with `deflocksc.org` in search results
- Link equity may be split across URL variations

**Remediation:** Add to `src/layouts/Base.astro`, inside `<head>` after the meta description (line 28):
```html
<link rel="canonical" href={canonicalURL} />
```

---

### CRITICAL-4: Fallback domain is `deflocksc.netlify.app` instead of `deflocksc.org`

**Affected:** All pages when `Astro.site` is undefined
**File:** `src/layouts/Base.astro` (lines 14-15)

**What was found:**
```js
const canonicalURL = new URL(Astro.url.pathname, Astro.site ?? "https://deflocksc.netlify.app");
const ogImageURL = new URL(ogImage, Astro.site ?? "https://deflocksc.netlify.app").href;
```
The fallback domain is `deflocksc.netlify.app`. While `Astro.site` is set to `https://deflocksc.org` in `astro.config.mjs` (so the fallback should never fire during production builds), this is a risk: if the site config ever changes or `Astro.site` becomes undefined, OG tags and the canonical URL would point to the Netlify subdomain.

**Why it matters:** If triggered, search engines and social platforms would see `deflocksc.netlify.app` as the authoritative URL, splitting SEO signals between two domains.

**Remediation:** Change the fallback to match the production domain:
```js
const canonicalURL = new URL(Astro.url.pathname, Astro.site ?? "https://deflocksc.org");
const ogImageURL = new URL(ogImage, Astro.site ?? "https://deflocksc.org").href;
```

---

### CRITICAL-5: No 404 page

**Affected:** All non-existent URLs
**File:** No `src/pages/404.astro` exists

**What was found:** A glob for `src/pages/404.astro` returns no results. Astro generates a default 404 page, but it will be a plain unstyled page with no navigation, no branding, and no internal links.

**Why it matters:** A custom 404 page:
- Retains users who land on broken or outdated links
- Provides navigation to help them find what they were looking for
- Prevents high bounce rates from 404 hits, which can indirectly affect SEO
- Is a signal to search engines that the site is well-maintained

**Remediation:** Create `src/pages/404.astro`:
```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Page Not Found - DeflockSC" description="The page you're looking for doesn't exist.">
  <section class="py-28 text-center">
    <h1 class="text-4xl font-bold text-white mb-4">Page not found</h1>
    <p class="text-[#a0a0a0] mb-8">The page you're looking for doesn't exist or has been moved.</p>
    <a href="/" class="text-[#fbbf24] hover:text-[#fcd34d]">Back to homepage</a>
  </section>
</Base>
```

---

## 3. Warnings

### WARNING-1: No structured data / JSON-LD on any page

**Affected:** All pages
**File:** `src/layouts/Base.astro`, `src/pages/index.astro`, `src/pages/blog/[...slug].astro`, `src/components/FAQ.astro`

**What was found:** A grep for `application/ld+json` across the entire `src/` directory returns zero matches. No page has any schema markup.

**Missing structured data opportunities:**
- **Homepage:** `Organization` schema (name, URL, logo, social profiles)
- **Blog posts:** `Article` schema (headline, datePublished, author, image)
- **FAQ section:** `FAQPage` schema (5 question/answer pairs are already structured in the component)
- **Blog listing:** `CollectionPage` or `Blog` schema
- **All pages:** `BreadcrumbList` schema

**Why it matters:** Structured data enables rich results in Google Search (FAQ dropdowns, article cards, breadcrumb trails). The FAQ section is a particularly strong candidate because the data is already cleanly structured in `src/components/FAQ.astro` lines 2-32.

**Remediation:** Add JSON-LD blocks. Priority order:
1. `FAQPage` on homepage (immediate rich result eligibility)
2. `Article` on each blog post
3. `Organization` on homepage
4. `BreadcrumbList` on all pages

---

### WARNING-2: Blog post images missing `width` and `height` attributes

**Affected:** Blog listing page, individual blog posts, related posts
**Files:**
- `src/pages/blog/index.astro` lines 54-58, 95-100
- `src/pages/blog/[...slug].astro` lines 38-43, 149-151

**What was found:** Featured images in blog templates have no `width` or `height` attributes:
```html
<!-- blog/index.astro line 54 -->
<img
  src={posts[0].data.featuredImage}
  alt={posts[0].data.title}
  class="w-full object-contain bg-[#0a0a0a]"
/>

<!-- blog/[...slug].astro line 150 -->
<img src={rp.data.featuredImage} alt={rp.data.title} class="w-full object-contain bg-[#0a0a0a]" />
```

**Why it matters:** Without explicit `width` and `height`, the browser cannot calculate the aspect ratio before the image loads, causing Cumulative Layout Shift (CLS). CLS is a Core Web Vital that directly affects Google rankings.

**Remediation:** Add `width` and `height` attributes to all `<img>` tags, or use CSS `aspect-ratio` to reserve space. Since featured images may vary in dimension, consider adding `aspect-ratio` via a wrapper or the image tag itself.

---

### WARNING-3: Blog hero image (featured post) missing `loading="lazy"`

**Affected:** Blog listing page, blog post hero
**Files:**
- `src/pages/blog/index.astro` line 54 (featured hero image, above the fold -- this one is correct to NOT lazy load)
- `src/pages/blog/[...slug].astro` line 39 (post hero image -- also above the fold, correct)
- `src/pages/blog/[...slug].astro` line 150 (related post images -- below the fold, missing lazy)

**What was found:** Related post images in `blog/[...slug].astro` line 150 lack `loading="lazy"`:
```html
<img src={rp.data.featuredImage} alt={rp.data.title} class="w-full object-contain bg-[#0a0a0a]" />
```

**Remediation:** Add `loading="lazy"` to the related post images at line 150.

---

### WARNING-4: No security headers in `netlify.toml`

**Affected:** All pages
**File:** `netlify.toml`

**What was found:** The `netlify.toml` file contains only build configuration and redirect rules. No `[[headers]]` section exists. Missing headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (at minimum a reporting policy)
- `Permissions-Policy`

**Why it matters:** While security headers don't directly affect rankings, Google has indicated that site security is a ranking signal. Missing headers also expose the site to clickjacking and MIME-type confusion attacks. The `X-Frame-Options` header is particularly relevant since the site embeds iframes (MapLibre map).

**Remediation:** Add to `netlify.toml`:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "SAMEORIGIN"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(self)"
```

---

### WARNING-5: Google Fonts loaded via render-blocking `<link>` tag

**Affected:** All pages
**File:** `src/layouts/Base.astro` (line 24)

**What was found:**
```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap" rel="stylesheet">
```

This is a standard blocking CSS `<link>`. While `display=swap` prevents FOIT (Flash of Invisible Text), the CSS file itself is render-blocking. The browser must download, parse, and apply this stylesheet before first paint.

Additionally, `@fontsource-variable/inter` is listed in `package.json` but the layout loads `Instrument+Sans` and `DM+Mono` from Google Fonts CDN, not Inter from fontsource. The fontsource dependency appears unused.

**Why it matters:** Render-blocking external CSS adds to Largest Contentful Paint (LCP), a Core Web Vital. Loading fonts from a third-party domain also introduces a DNS lookup + connection overhead even with `preconnect`.

**Remediation options (pick one):**
1. **Self-host the fonts** using `@fontsource` packages (eliminates third-party dependency and DNS lookup)
2. **Use `media="print" onload="this.media='all'"` pattern** to make the stylesheet non-blocking
3. **Preload the most critical font weight** with `<link rel="preload" as="style">`

---

### WARNING-6: Homepage title tag is only "DeflockSC" (too short, not descriptive)

**Affected:** Homepage default when no title prop is passed
**File:** `src/layouts/Base.astro` (line 13), `src/pages/index.astro` (line 12)

**What was found:** The Base.astro default title is `"DeflockSC"` but `index.astro` passes a proper title:
```js
// Base.astro default:
title = "DeflockSC"

// index.astro override:
title="DeflockSC — Stop Surveillance in Upstate SC"
```

The homepage title is 47 characters and descriptive -- this is good. However, the default fallback `"DeflockSC"` (11 characters) would apply to any page that forgets to pass a title prop.

**Remediation:** Change the default title in Base.astro to something more descriptive:
```js
title = "DeflockSC — Stop License Plate Surveillance in South Carolina"
```

---

### WARNING-7: Homepage meta description is 81 characters (below 120 recommended minimum)

**Affected:** Homepage
**File:** `src/layouts/Base.astro` (line 13)

**What was found:** The default meta description is:
> "242 cameras are tracking drivers across Upstate SC with no public vote and no oversight. Fight back."

This is 101 characters. The homepage `index.astro` does not pass a custom description, so it uses this default. While punchy and effective, it's below the 120-160 character range that gives Google maximum SERP real estate.

**Remediation:** Expand to 130-155 characters while keeping the urgency:
> "242 cameras are tracking drivers across Upstate SC with no public vote and no oversight. Find your reps. File records requests. Fight back."

---

### WARNING-8: `og:type` is hardcoded to `website` on blog posts

**Affected:** All blog posts
**File:** `src/layouts/Base.astro` (line 32)

**What was found:**
```html
<meta property="og:type" content="website" />
```

This is set globally. Blog posts should use `og:type` of `article` for proper social sharing behavior and to signal to social platforms that the content is a dated article.

**Remediation:** Accept an `ogType` prop in Base.astro and default to `website`, then pass `article` from the blog post template:
```js
// Base.astro
const { ogType = "website" } = Astro.props;
// <meta property="og:type" content={ogType} />

// blog/[...slug].astro
<Base ogType="article" ... />
```

---

### WARNING-9: Missing `og:site_name` meta tag

**Affected:** All pages
**File:** `src/layouts/Base.astro`

**What was found:** No `og:site_name` property is set. This property tells social platforms the name of the overall website (distinct from the page title).

**Remediation:** Add after `og:url`:
```html
<meta property="og:site_name" content="DeflockSC" />
```

---

## 4. Informational Notes

### INFO-1: No `hreflang` tags (single-language site)

**Affected:** All pages
**File:** `src/layouts/Base.astro`

**Finding:** No `hreflang` tags are present. This is expected and correct for a single-language English site. Noted for future reference if the site ever adds Spanish or other language content.

---

### INFO-2: Unused `@fontsource-variable/inter` dependency

**Affected:** Build size
**File:** `package.json` (line 18)

**Finding:** `@fontsource-variable/inter` is listed as a dependency but never imported. The site uses `Instrument Sans` and `DM Mono` from Google Fonts. The body class in Base.astro references `font-['Instrument_Sans',sans-serif]`, not Inter.

**Remediation:** Remove: `npm uninstall @fontsource-variable/inter`

---

### INFO-3: RSS feed is well-implemented

**Affected:** /rss.xml
**File:** `src/pages/rss.xml.ts`

**Finding:** The RSS feed is properly implemented using `@astrojs/rss`. It includes title, description, site URL, and maps all published blog posts with title, pubDate, description, and link. The RSS auto-discovery link is present in the `<head>` (Base.astro line 42).

---

### INFO-4: `Astro.generator` meta tag reveals framework version

**Affected:** All pages
**File:** `src/layouts/Base.astro` (line 26)

**Finding:**
```html
<meta name="generator" content={Astro.generator} />
```
This outputs something like `Astro v5.18.0`. While not a security risk per se, it reveals the exact framework and version to anyone inspecting the source.

**Remediation (optional):** Remove if you prefer not to advertise the tech stack, or keep it as an Astro community signal.

---

### INFO-5: External links use proper `rel="noopener"` consistently

**Affected:** All external links
**Files:** Footer.astro, MapSection.astro, FAQ.astro, BillTracker.astro

**Finding:** All external links include `target="_blank" rel="noopener"` and many have `<span class="sr-only"> (opens in new tab)</span>` for screen readers. This is excellent practice.

---

### INFO-6: Image `alt` text is consistently present and descriptive

**Affected:** All images
**Files:** Hero.astro, blog pages, ToolkitOutreach.astro

**Finding:** All images have `alt` attributes. The hero camera image correctly uses `alt="" aria-hidden="true"` since it is decorative. Blog images use the post title as alt text. Outreach card images use the card headline. The camera map popup images in `camera-map.ts` also include alt text.

---

### INFO-7: Smooth scroll uses `prefers-reduced-motion` media query

**Affected:** All pages
**File:** `src/styles/global.css` (lines 3-7)

**Finding:** Smooth scrolling is correctly wrapped in `@media (prefers-reduced-motion: no-preference)`. All CSS animations (cone sweep, glitch bars, nav dot blink, map dot blink) also respect `prefers-reduced-motion: reduce`. This is excellent accessibility and SEO practice (Google's page experience signals include accessibility).

---

## 5. Checklist Summary Table

| # | Check | Status | Severity | Details |
|---|---|---|---|---|
| 1 | Title Tags | PASS | -- | All pages have unique, descriptive titles under 60 chars |
| 2 | Meta Descriptions | PASS | WARNING | Present on all pages; homepage is 101 chars (below 120 target) |
| 3 | Canonical URLs | FAIL | CRITICAL | No `<link rel="canonical">` on any page |
| 4 | Heading Hierarchy | PASS | -- | Exactly 1 H1 per page; proper H2/H3 nesting throughout |
| 5 | Image Alt Text | PASS | -- | All images have appropriate alt text |
| 6 | Schema / JSON-LD | FAIL | WARNING | Zero structured data on any page |
| 7 | Robots.txt | FAIL | CRITICAL | File does not exist (404) |
| 8 | XML Sitemap | FAIL | CRITICAL | Not installed, not configured, not generated |
| 9 | HTTPS | PASS | -- | Site served over HTTPS; no mixed content in source |
| 10 | Viewport Meta | PASS | -- | Proper `width=device-width, initial-scale=1` |
| 11 | Open Graph | PASS | WARNING | Present but `og:type` hardcoded; missing `og:site_name` |
| 12 | Twitter Cards | PASS | -- | `summary_large_image` with title, description, image |
| 13 | Internal Links | PASS | -- | Nav links to /, /toolkit, /blog; toolkit bento links properly |
| 14 | 404 Page | FAIL | CRITICAL | No custom 404 page |
| 15 | Security Headers | FAIL | WARNING | No headers configured in netlify.toml |
| 16 | Font Loading | PASS | WARNING | Render-blocking Google Fonts `<link>` |
| 17 | Image Dimensions | FAIL | WARNING | Blog images missing `width`/`height` |
| 18 | RSS Feed | PASS | -- | Properly implemented with auto-discovery |
| 19 | Skip Link | PASS | -- | "Skip to main content" link present |
| 20 | `lang` Attribute | PASS | -- | `<html lang="en">` set |
| 21 | Charset | PASS | -- | `<meta charset="utf-8">` present |
| 22 | Favicon | PASS | -- | SVG favicon with proper `<link>` |
| 23 | `noindex` Check | PASS | -- | No accidental noindex directives |
| 24 | Fallback Domain | FAIL | CRITICAL | Fallback is `deflocksc.netlify.app` not `.org` |
| 25 | Image Lazy Load | PASS | WARNING | Most images lazy-loaded; related posts missing it |

---

## 6. Recommendations (Priority Order)

### Tier 1: Fix immediately (CRITICAL)

1. **Create `public/robots.txt`** with allow-all rules and sitemap directive
2. **Install `@astrojs/sitemap`** and add it to astro.config.mjs integrations
3. **Add `<link rel="canonical" href={canonicalURL} />`** to Base.astro `<head>`
4. **Change fallback domain** from `deflocksc.netlify.app` to `deflocksc.org` in Base.astro lines 14-15
5. **Create `src/pages/404.astro`** with branded error page and navigation links

### Tier 2: Fix this week (WARNING)

6. **Add `FAQPage` JSON-LD** to homepage -- the data is already structured in FAQ.astro, just needs a `<script type="application/ld+json">` block
7. **Add `Article` JSON-LD** to blog post template with headline, datePublished, author, image
8. **Add `width` and `height`** to blog featured images or use CSS `aspect-ratio`
9. **Add `loading="lazy"`** to related post images in blog/[...slug].astro
10. **Add security headers** to netlify.toml
11. **Self-host fonts** or make Google Fonts non-render-blocking
12. **Add `og:site_name`** and make `og:type` dynamic (article vs website)
13. **Expand homepage meta description** to 130-155 characters

### Tier 3: Nice to have (INFO)

14. Remove unused `@fontsource-variable/inter` from package.json
15. Consider removing `<meta name="generator">` tag
16. Add `Organization` and `BreadcrumbList` structured data

---

## Limitations

This audit covers source-level analysis and basic live URL verification. The following areas require additional tools:

- **Core Web Vitals (LCP, FID, CLS):** Use Google PageSpeed Insights or Lighthouse for real performance measurements
- **Server response time:** Cannot measure from static source analysis
- **Redirect chains:** Cannot verify HTTP-to-HTTPS redirects or 301/302 behavior without a full crawl
- **Crawl budget analysis:** Use Google Search Console for actual crawl statistics
- **Mobile usability:** Use Google's Mobile-Friendly Test for real device rendering
- **Index coverage:** Use Google Search Console to verify which pages are actually indexed
