# Blog Preview Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a responsive blog preview grid to the homepage between BillTracker and CitizenToolkit.

**Architecture:** Single new Astro component (`BlogPreview.astro`) fetching published posts via `getCollection('blog')`, rendered as a CSS Grid that reveals more columns/posts at wider breakpoints. No JavaScript needed.

**Tech Stack:** Astro 5 content collections, Tailwind CSS 4, CSS media queries

---

### Task 1: Create BlogPreview component

**Files:**
- Create: `src/components/BlogPreview.astro`

**Step 1: Create the component file**

```astro
---
import { getCollection } from 'astro:content';
import { estimateReadTime } from '../lib/blog-utils';

const posts = (await getCollection('blog'))
  .filter((post) => !post.data.draft)
  .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime())
  .slice(0, 5);
---

{posts.length >= 3 && (
  <section id="blog-preview" aria-labelledby="blog-preview-heading" class="py-20 md:py-28 relative overflow-hidden">
    <div class="max-w-[1400px] mx-auto px-6 relative z-10">

      {/* Header */}
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <p data-reveal="left" class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.18em] text-[#737373] mb-3">From the Blog</p>
          <h2 id="blog-preview-heading" data-reveal="left" data-reveal-delay="1" class="text-[#e8e8e8] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] tracking-[-0.025em] leading-[1.05]">Latest Posts</h2>
        </div>
        <a href="/blog" data-reveal="left" data-reveal-delay="2" class="font-['DM_Mono',monospace] text-[11px] uppercase tracking-[0.12em] text-[#737373] hover:text-[#e8e8e8] transition-colors whitespace-nowrap">
          Read all posts &rarr;&#xFE0E;
        </a>
      </div>

      {/* Post grid */}
      <div class="blog-preview-grid grid gap-6">
        {posts.map((post, i) => (
          <a
            href={`/blog/${post.id}`}
            class:list={[
              'block group',
              i >= 4 && 'blog-preview-5th',
              i >= 3 && i < 4 && 'blog-preview-4th',
            ]}
            data-reveal="up"
            data-reveal-delay={String(i)}
          >
            <article class="bg-[#111111] rounded-xl overflow-hidden border border-[rgba(255,255,255,0.07)] group-hover:border-[rgba(255,255,255,0.12)] transition-all duration-200 group-hover:-translate-y-0.5 h-full">
              {post.data.featuredImage && (
                <img
                  src={post.data.featuredImage}
                  alt={post.data.featuredImageAlt ?? post.data.title}
                  width="440"
                  height="220"
                  loading="lazy"
                  class="w-full object-contain bg-[#0a0a0a]"
                />
              )}
              <div class="p-5">
                <div class="flex items-center gap-3 font-['DM_Mono',monospace] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
                  <time datetime={new Date(post.data.date).toISOString()}>
                    {new Date(post.data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}
                  </time>
                  <span class="text-[rgba(255,255,255,0.15)]">/</span>
                  <span>{estimateReadTime(post.body ?? '')} min read</span>
                </div>
                <h3 class="text-lg font-bold text-[#e8e8e8] mt-1.5 leading-snug">{post.data.title}</h3>
                {post.data.subtitle && (
                  <p class="text-sm text-[#a0a0a0] font-medium mt-0.5 leading-snug">{post.data.subtitle}</p>
                )}
                <p class="text-[#a0a0a0] text-sm leading-relaxed mt-1.5 line-clamp-2">{post.data.summary}</p>
                {post.data.tags && (
                  <div class="flex items-center gap-2 mt-3 font-['DM_Mono',monospace] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
                    {post.data.tags.map((tag, ti) => (
                      <>
                        {ti > 0 && <span class="text-[rgba(255,255,255,0.15)]">/</span>}
                        <span>{tag}</span>
                      </>
                    ))}
                  </div>
                )}
              </div>
            </article>
          </a>
        ))}
      </div>
    </div>
  </section>
)}

<style>
  /* Base: 1 column, show first 3 */
  .blog-preview-grid {
    grid-template-columns: 1fr;
  }
  .blog-preview-4th,
  .blog-preview-5th {
    display: none;
  }

  /* 640px+: 2 columns, still 3 posts */
  @media (min-width: 640px) {
    .blog-preview-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* 900px+: 3 columns, still 3 posts */
  @media (min-width: 900px) {
    .blog-preview-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* 1200px+: 4 columns, reveal 4th post */
  @media (min-width: 1200px) {
    .blog-preview-grid {
      grid-template-columns: repeat(4, 1fr);
    }
    .blog-preview-4th {
      display: block;
    }
  }

  /* 1500px+: 5 columns, reveal 5th post */
  @media (min-width: 1500px) {
    .blog-preview-grid {
      grid-template-columns: repeat(5, 1fr);
    }
    .blog-preview-5th {
      display: block;
    }
  }
</style>
```

**Step 2: Verify the file was created**

Run: `ls src/components/BlogPreview.astro`
Expected: file exists

**Step 3: Commit**

```bash
git add src/components/BlogPreview.astro
git commit -m "feat: add BlogPreview component with responsive grid"
```

---

### Task 2: Wire component into homepage

**Files:**
- Modify: `src/pages/index.astro`

**Step 1: Add the import and component between BillTracker and CitizenToolkit**

In `src/pages/index.astro`, add `import BlogPreview from '../components/BlogPreview.astro';` to the frontmatter imports, then insert `<BlogPreview />` between `<BillTracker />` and `<CitizenToolkit />`.

The result should look like:

```astro
---
import Base from '../layouts/Base.astro';
import Hero from '../components/Hero.astro';
import HowItWorks from '../components/HowItWorks.astro';
import MapSection from '../components/MapSection.astro';
import BillTracker from '../components/BillTracker.astro';
import BlogPreview from '../components/BlogPreview.astro';
import CitizenToolkit from '../components/CitizenToolkit.astro';
import FAQ from '../components/FAQ.astro';
import TakeAction from '../components/TakeAction.astro';
---

<Base title="DeflockSC — Stop License Plate Surveillance in South Carolina" description="Over 240 ALPR cameras track drivers across South Carolina with no public vote and no oversight. See the map, find your reps, and fight back.">
  <Hero />
  <HowItWorks />
  <MapSection />
  <BillTracker />
  <BlogPreview />
  <CitizenToolkit />
  <FAQ />
  <TakeAction />
</Base>
```

**Step 2: Build to verify no errors**

Run: `node node_modules/astro/astro.js build`
Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add blog preview section to homepage"
```

---

### Task 3: Visual verification

**Step 1: Start dev server**

Run: `node node_modules/astro/astro.js dev --host 127.0.0.1`

**Step 2: Check desktop layout**

Navigate to `http://localhost:4321/`. Scroll to the blog preview section between Bill Tracker and Citizen Toolkit. Verify:
- Section header shows "From the Blog" overline, "Latest Posts" heading, "Read all posts" link
- Cards display in a responsive grid with featured images, dates, titles, summaries, tags
- Cards have hover effects (border brighten, slight lift)
- `data-reveal` animations fire on scroll

**Step 3: Check responsive breakpoints**

Resize viewport through breakpoints and verify:
- < 640px: 1 column, 3 posts
- 640px+: 2 columns, 3 posts
- 900px+: 3 columns, 3 posts
- 1200px+: 4 columns, 4 posts (4th appears)
- 1500px+: 5 columns, 5 posts (5th appears)

**Step 4: Check mobile layout**

Resize to 375px width. Verify single-column layout with 3 cards stacked vertically.

**Step 5: Fix any issues found during visual check**

If layout, spacing, or responsive behavior needs adjustment, update `src/components/BlogPreview.astro` accordingly.

**Step 6: Commit any fixes**

```bash
git add src/components/BlogPreview.astro
git commit -m "fix: polish blog preview layout after visual review"
```

---

### Task 4: Clean up dev mockup

**Step 1: Delete the dev mockup file**

Run: `rm public/dev-blog-mockup.html`

**Step 2: Commit**

```bash
git add -u public/dev-blog-mockup.html
git commit -m "chore: remove blog preview dev mockup"
```
