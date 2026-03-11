# Blog Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the blog listing and post pages with reading experience enhancements, add nav blog link, and streamline the Obsidian publish pipeline.

**Architecture:** Featured+grid listing page with client-side tag filtering. Individual posts get a sticky TOC sidebar, reading progress bar, estimated read time, related posts, and improved typography. Nav gets a Blog link. Publish script gains auto commit+push.

**Tech Stack:** Astro 5, Tailwind CSS 4, vanilla JS for client-side interactivity (progress bar, TOC tracking, tag filtering). Python for publish pipeline.

**Design doc:** `docs/plans/2026-03-11-blog-overhaul-design.md`

**Mockup reference:** The design mockups were in temporary files (`public/blog-mockups.html`, `public/post-mockup.html`) that have been cleaned up. Refer to the design doc for specifications.

---

### Task 1: Add Blog link to Nav

**Files:**
- Modify: `src/components/Nav.astro:11-13` (desktop links), `src/components/Nav.astro:24-26` (mobile menu)

**Step 1: Add Blog link to desktop nav**

In `src/components/Nav.astro`, the desktop links are on lines 12-13. Add a Blog link after the Toolkit link:

```html
<a href="/" class="hidden md:inline text-[#a3a3a3] hover:text-white font-bold text-xs uppercase tracking-[0.1em] transition-colors">Home</a>
<a href="/toolkit" class="hidden md:inline text-[#a3a3a3] hover:text-white font-bold text-xs uppercase tracking-[0.1em] transition-colors">Toolkit</a>
<a href="/blog" class="hidden md:inline text-[#a3a3a3] hover:text-white font-bold text-xs uppercase tracking-[0.1em] transition-colors">Blog</a>
```

**Step 2: Add Blog link to mobile menu**

In the mobile menu section (line 24-26), add Blog link after Toolkit:

```html
<a href="/" class="text-[#a3a3a3] hover:text-white font-bold text-sm uppercase tracking-[0.1em] transition-colors py-2">Home</a>
<a href="/toolkit" class="text-[#a3a3a3] hover:text-white font-bold text-sm uppercase tracking-[0.1em] transition-colors py-2">Toolkit</a>
<a href="/blog" class="text-[#a3a3a3] hover:text-white font-bold text-sm uppercase tracking-[0.1em] transition-colors py-2">Blog</a>
```

**Step 3: Visual verification**

Run dev server, navigate to homepage. Verify "Blog" appears in desktop nav between Toolkit and Take Action. Open hamburger menu on mobile, verify Blog link appears.

**Step 4: Commit**

```bash
git add src/components/Nav.astro
git commit -m "feat(blog): add Blog link to nav"
```

---

### Task 2: Create blog utility functions

**Files:**
- Create: `src/lib/blog-utils.ts`
- Create: `src/lib/blog-utils.test.ts`

**Step 1: Write tests for read time and related posts**

Create `src/lib/blog-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { estimateReadTime, findRelatedPosts } from './blog-utils';

describe('estimateReadTime', () => {
  it('returns 1 min for short content', () => {
    expect(estimateReadTime('hello world')).toBe(1);
  });

  it('calculates minutes from word count at 200 wpm', () => {
    const words = Array(600).fill('word').join(' ');
    expect(estimateReadTime(words)).toBe(3);
  });

  it('rounds up partial minutes', () => {
    const words = Array(250).fill('word').join(' ');
    expect(estimateReadTime(words)).toBe(2);
  });

  it('handles empty content', () => {
    expect(estimateReadTime('')).toBe(1);
  });
});

describe('findRelatedPosts', () => {
  const posts = [
    { id: 'a', data: { title: 'A', tags: ['research', 'greenville'], date: new Date('2026-03-10'), summary: '', draft: false } },
    { id: 'b', data: { title: 'B', tags: ['legislation'], date: new Date('2026-03-05'), summary: '', draft: false } },
    { id: 'c', data: { title: 'C', tags: ['research', 'campaign'], date: new Date('2026-02-28'), summary: '', draft: false } },
    { id: 'd', data: { title: 'D', tags: ['campaign'], date: new Date('2026-02-20'), summary: '', draft: false } },
  ];

  it('returns posts with shared tags, excluding current', () => {
    const related = findRelatedPosts('a', ['research', 'greenville'], posts);
    expect(related.map(p => p.id)).toContain('c');
    expect(related.map(p => p.id)).not.toContain('a');
  });

  it('returns at most 3 posts', () => {
    const related = findRelatedPosts('a', ['research', 'campaign', 'legislation'], posts);
    expect(related.length).toBeLessThanOrEqual(3);
  });

  it('ranks by number of shared tags', () => {
    const related = findRelatedPosts('a', ['research', 'campaign'], posts);
    // 'c' has both research + campaign, 'd' has only campaign
    expect(related[0].id).toBe('c');
  });

  it('returns empty array when no tags match', () => {
    const related = findRelatedPosts('a', ['unique-tag'], posts);
    expect(related).toEqual([]);
  });

  it('handles posts with no tags', () => {
    const postsWithNoTags = [
      ...posts,
      { id: 'e', data: { title: 'E', tags: undefined, date: new Date('2026-01-01'), summary: '', draft: false } },
    ];
    const related = findRelatedPosts('a', ['research'], postsWithNoTags);
    expect(related.map(p => p.id)).not.toContain('e');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/blog-utils.test.ts
```

Expected: FAIL — `blog-utils` module not found.

**Step 3: Implement blog-utils**

Create `src/lib/blog-utils.ts`:

```typescript
const WORDS_PER_MINUTE = 200;

/** Estimate reading time in minutes from raw markdown content. */
export function estimateReadTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

interface PostData {
  title: string;
  tags?: string[];
  date: Date;
  summary: string;
  draft?: boolean;
}

interface Post {
  id: string;
  data: PostData;
}

/**
 * Find related posts by counting shared tags.
 * Returns up to 3 posts, sorted by relevance (shared tag count desc, then date desc).
 */
export function findRelatedPosts(
  currentId: string,
  currentTags: string[],
  allPosts: Post[],
): Post[] {
  if (!currentTags || currentTags.length === 0) return [];

  const tagSet = new Set(currentTags);

  return allPosts
    .filter((p) => p.id !== currentId && p.data.tags && p.data.tags.length > 0)
    .map((p) => ({
      post: p,
      shared: p.data.tags!.filter((t) => tagSet.has(t)).length,
    }))
    .filter((r) => r.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.post.data.date.getTime() - a.post.data.date.getTime())
    .slice(0, 3)
    .map((r) => r.post);
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/blog-utils.test.ts
```

Expected: All 9 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/blog-utils.ts src/lib/blog-utils.test.ts
git commit -m "feat(blog): add read time and related posts utilities"
```

---

### Task 3: Redesign blog listing page — Featured + Grid

**Files:**
- Modify: `src/pages/blog/index.astro` (full rewrite)

**Step 1: Rewrite blog listing with featured hero + grid + tag filtering**

Replace the entire content of `src/pages/blog/index.astro`:

```astro
---
import Base from '../../layouts/Base.astro';
import { getCollection } from 'astro:content';

const posts = (await getCollection('blog'))
  .filter((post) => !post.data.draft)
  .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

// Collect all unique tags across published posts
const allTags = [...new Set(posts.flatMap((p) => p.data.tags ?? []))].sort();
---

<Base title="Blog — DeflockSC" description="Campaign updates and research on license plate surveillance in South Carolina.">
  <section class="py-20 md:py-28">
    <div class="max-w-[900px] mx-auto px-6">
      <h1 class="text-3xl md:text-4xl font-[900] text-white mb-4">Blog</h1>
      <p class="text-[#a3a3a3] text-lg mb-8">Campaign updates and research on license plate surveillance in South Carolina.</p>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div class="flex flex-wrap gap-2 mb-10" id="tag-bar" role="toolbar" aria-label="Filter posts by tag">
          <button
            type="button"
            class="tag-pill active px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border border-transparent"
            data-tag="all"
          >All</button>
          {allTags.map((tag) => (
            <button
              type="button"
              class="tag-pill px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border border-transparent"
              data-tag={tag}
            >{tag}</button>
          ))}
        </div>
      )}

      {posts.length === 0 && (
        <p class="text-[#737373]">We're preparing our first post. In the meantime, <a href="/" class="text-[#fbbf24] hover:text-[#fcd34d] transition-colors">learn how Flock Safety cameras work</a> and why South Carolina needs oversight.</p>
      )}

      {/* Featured hero (latest post) */}
      {posts.length > 0 && (
        <a href={`/blog/${posts[0].id}`} class="block group mb-8 blog-card" data-tags={(posts[0].data.tags ?? []).join(',')}>
          <article class="bg-[#171717] rounded-xl overflow-hidden border border-[#262626] group-hover:border-[#404040] transition-all duration-200">
            {posts[0].data.featuredImage && (
              <img
                src={posts[0].data.featuredImage}
                alt=""
                class="w-full aspect-[2.5/1] object-cover"
              />
            )}
            <div class="p-7 md:p-8">
              <time class="text-[#737373] text-[13px] font-medium" datetime={new Date(posts[0].data.date).toISOString()}>
                {new Date(posts[0].data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>
              <h2 class="text-2xl md:text-[28px] font-[900] text-white mt-2 mb-3 leading-tight">{posts[0].data.title}</h2>
              <p class="text-[#a3a3a3] text-[15px] leading-relaxed max-w-[600px]">{posts[0].data.summary}</p>
              {posts[0].data.tags && (
                <div class="flex flex-wrap gap-1.5 mt-4">
                  {posts[0].data.tags.map((tag) => (
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#262626] text-[#a3a3a3]">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </article>
        </a>
      )}

      {/* Grid of remaining posts */}
      {posts.length > 1 && (
        <div class="grid md:grid-cols-2 gap-6" id="post-grid">
          {posts.slice(1).map((post) => (
            <a href={`/blog/${post.id}`} class="block group blog-card" data-tags={(post.data.tags ?? []).join(',')}>
              <article class="bg-[#171717] rounded-xl overflow-hidden border border-[#262626] group-hover:border-[#404040] transition-all duration-200 group-hover:-translate-y-0.5 h-full">
                {post.data.featuredImage && (
                  <img
                    src={post.data.featuredImage}
                    alt=""
                    class="w-full aspect-video object-cover"
                  />
                )}
                <div class="p-5">
                  <time class="text-[#737373] text-[13px] font-medium" datetime={new Date(post.data.date).toISOString()}>
                    {new Date(post.data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </time>
                  <h2 class="text-lg font-[800] text-white mt-1.5 mb-2 leading-snug">{post.data.title}</h2>
                  <p class="text-[#a3a3a3] text-sm leading-relaxed">{post.data.summary}</p>
                  {post.data.tags && (
                    <div class="flex flex-wrap gap-1.5 mt-3">
                      {post.data.tags.map((tag) => (
                        <span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-[#262626] text-[#a3a3a3]">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            </a>
          ))}
        </div>
      )}
    </div>
  </section>
</Base>

<style>
  .tag-pill {
    background: #262626;
    color: #a3a3a3;
  }
  .tag-pill:hover {
    background: #333;
    color: #fff;
  }
  .tag-pill.active {
    background: #ef4444;
    color: #fff;
    border-color: #ef4444;
  }
  .blog-card.hidden-by-filter {
    display: none;
  }
</style>

<script>
  const pills = document.querySelectorAll<HTMLButtonElement>('.tag-pill');
  const cards = document.querySelectorAll<HTMLElement>('.blog-card');

  function filterByTag(tag: string) {
    // Update URL hash
    window.location.hash = tag === 'all' ? '' : tag;

    // Update pill active state
    pills.forEach((p) => p.classList.toggle('active', p.dataset.tag === tag));

    // Show/hide cards
    cards.forEach((card) => {
      const cardTags = (card.dataset.tags ?? '').split(',').filter(Boolean);
      const show = tag === 'all' || cardTags.includes(tag);
      card.classList.toggle('hidden-by-filter', !show);
    });
  }

  // Pill click handlers
  pills.forEach((pill) => {
    pill.addEventListener('click', () => filterByTag(pill.dataset.tag ?? 'all'));
  });

  // Restore from URL hash on load
  const hashTag = window.location.hash.slice(1);
  if (hashTag) filterByTag(hashTag);
</script>
```

**Step 2: Visual verification**

Run dev server, navigate to `/blog`. With the current single draft post, the page should show the empty state. To test, temporarily set `draft: false` in `src/content/blog/welcome.md`, verify the hero card renders, then revert.

**Step 3: Commit**

```bash
git add src/pages/blog/index.astro
git commit -m "feat(blog): redesign listing with featured hero + grid + tag filtering"
```

---

### Task 4: Redesign individual post page with reading enhancements

**Files:**
- Modify: `src/pages/blog/[...slug].astro` (full rewrite)

**Step 1: Rewrite post page with TOC, progress bar, read time, related posts**

Replace the entire content of `src/pages/blog/[...slug].astro`:

```astro
---
import Base from '../../layouts/Base.astro';
import Footer from '../../components/Footer.astro';
import { getCollection, render } from 'astro:content';
import { estimateReadTime, findRelatedPosts } from '../../lib/blog-utils';

export async function getStaticPaths() {
  const posts = (await getCollection('blog')).filter((post) => !post.data.draft);
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content, headings } = await render(post);

// Read time from raw markdown body
const allPosts = (await getCollection('blog')).filter((p) => !p.data.draft);
const readTime = estimateReadTime(post.body ?? '');
const relatedPosts = findRelatedPosts(post.id, post.data.tags ?? [], allPosts);

// OG image priority: manual override > auto-generated > site default
const ogImage = post.data.ogImage
  ? post.data.ogImage
  : `/blog/${post.id}/og.png`;

// Filter headings to h2 and h3 for TOC
const tocHeadings = headings.filter((h) => h.depth === 2 || h.depth === 3);
---

<Base title={`${post.data.title} — DeflockSC`} description={post.data.summary} ogImage={ogImage}>
  {/* Progress bar */}
  <div id="progress-bar" class="fixed top-0 left-0 h-[3px] bg-[#ef4444] z-[100] transition-[width] duration-[50ms] linear" style="width: 0%;" aria-hidden="true"></div>

  <div class="grid grid-cols-[1fr_minmax(0,720px)_1fr] lg:grid-cols-[1fr_minmax(0,720px)_240px_1fr] gap-x-10 pt-20 md:pt-28 px-6 lg:px-0">
    {/* Main article */}
    <article class="col-start-2 col-end-3 min-w-0">
      <a href="/blog" class="text-[#fbbf24] hover:text-[#fcd34d] text-sm font-medium transition-colors mb-6 inline-block">&larr; Back to Blog</a>

      {post.data.featuredImage && (
        <img
          src={post.data.featuredImage}
          alt=""
          class="w-full rounded-xl mb-8 aspect-[2/1] object-cover"
        />
      )}

      <header class="mb-10">
        <div class="flex items-center gap-3 text-[13px] text-[#737373] font-medium mb-2.5">
          <time datetime={new Date(post.data.date).toISOString()}>
            {new Date(post.data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
          <span class="text-[#404040]">&middot;</span>
          <span>{readTime} min read</span>
        </div>
        <h1 class="text-3xl md:text-4xl font-[900] text-white leading-tight tracking-[-0.02em]">{post.data.title}</h1>
        {post.data.tags && (
          <div class="flex flex-wrap gap-2 mt-4">
            {post.data.tags.map((tag) => (
              <a href={`/blog#${tag}`} class="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#262626] text-[#a3a3a3] hover:bg-[#333] hover:text-white transition-all no-underline">{tag}</a>
            ))}
          </div>
        )}
      </header>

      <div class="prose prose-invert max-w-none
        [&>p]:text-[#d4d4d4] [&>p]:text-[17px] [&>p]:leading-[1.8] [&>p]:mb-6
        [&>h2]:text-white [&>h2]:font-[800] [&>h2]:text-2xl [&>h2]:mt-12 [&>h2]:mb-4 [&>h2]:leading-snug
        [&>h3]:text-white [&>h3]:font-bold [&>h3]:text-xl [&>h3]:mt-9 [&>h3]:mb-3
        [&>ul]:text-[#d4d4d4] [&>ul]:space-y-2 [&>ul]:mb-6 [&>ul>li]:pl-2 [&>ul>li]:text-[17px] [&>ul>li]:leading-[1.7]
        [&>ol]:text-[#d4d4d4] [&>ol]:space-y-2 [&>ol]:mb-6 [&>ol>li]:text-[17px]
        [&>blockquote]:border-l-3 [&>blockquote]:border-[#ef4444] [&>blockquote]:pl-6 [&>blockquote]:text-[#a3a3a3] [&>blockquote]:italic [&>blockquote]:my-8 [&>blockquote]:text-[17px] [&>blockquote]:leading-[1.7]
        [&_a]:text-[#fbbf24] [&_a]:hover:text-[#fcd34d] [&_a]:focus-visible:text-[#fcd34d] [&_a]:transition-colors
        [&_strong]:text-white
        [&_code]:bg-[#262626] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
        [&>pre]:bg-[#262626] [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre]:mb-6
        [&_pre_code]:p-0 [&_pre_code]:bg-transparent
        [&_img]:rounded-lg [&_img]:my-6
        [&>hr]:border-t [&>hr]:border-[#262626] [&>hr]:my-10">
        <Content />
      </div>
    </article>

    {/* TOC sidebar — desktop only */}
    {tocHeadings.length > 0 && (
      <aside class="hidden lg:block col-start-3 col-end-4" aria-label="Table of contents">
        <nav class="sticky top-20 pt-4">
          <div class="text-[11px] font-bold uppercase tracking-[0.12em] text-[#737373] mb-4">On this page</div>
          <ul class="space-y-2" id="toc-list">
            {tocHeadings.map((h) => (
              <li>
                <a
                  href={`#${h.slug}`}
                  class={`toc-link block text-[13px] leading-snug text-[#525252] hover:text-[#a3a3a3] transition-colors border-l-2 border-transparent ${h.depth === 3 ? 'pl-6' : 'pl-3'}`}
                  data-slug={h.slug}
                >{h.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    )}
  </div>

  {/* Related posts */}
  {relatedPosts.length > 0 && (
    <section class="max-w-[900px] mx-auto px-6 pt-16 mt-16 border-t border-[#262626]">
      <div class="text-xs font-bold uppercase tracking-[0.12em] text-[#737373] mb-6">Related Posts</div>
      <div class="grid md:grid-cols-3 gap-5">
        {relatedPosts.map((rp) => (
          <a href={`/blog/${rp.id}`} class="block group">
            <article class="bg-[#1a1a1a] rounded-[10px] overflow-hidden border border-[#262626] group-hover:border-[#404040] group-hover:-translate-y-0.5 transition-all duration-200 h-full">
              {rp.data.featuredImage && (
                <img src={rp.data.featuredImage} alt="" class="w-full aspect-video object-cover" />
              )}
              <div class="p-4">
                <time class="text-xs text-[#737373] font-medium" datetime={new Date(rp.data.date).toISOString()}>
                  {new Date(rp.data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </time>
                <h3 class="text-[15px] font-bold text-white mt-1 leading-snug">{rp.data.title}</h3>
                {rp.data.tags && rp.data.tags[0] && (
                  <span class="inline-block mt-2 text-[11px] font-semibold px-2 py-0.5 rounded bg-[#262626] text-[#a3a3a3]">{rp.data.tags[0]}</span>
                )}
              </div>
            </article>
          </a>
        ))}
      </div>
    </section>
  )}
</Base>

<script>
  // Reading progress bar
  const progressBar = document.getElementById('progress-bar');
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
      progressBar.style.width = `${Math.min(pct, 100)}%`;
    }, { passive: true });
  }

  // TOC active state tracking
  const tocLinks = document.querySelectorAll<HTMLAnchorElement>('.toc-link');
  if (tocLinks.length > 0) {
    const headingEls = Array.from(tocLinks).map((link) =>
      document.getElementById(link.dataset.slug ?? '')
    ).filter(Boolean) as HTMLElement[];

    window.addEventListener('scroll', () => {
      let activeSlug = '';
      for (const el of headingEls) {
        if (el.getBoundingClientRect().top < 120) {
          activeSlug = el.id;
        }
      }
      tocLinks.forEach((link) => {
        const isActive = link.dataset.slug === activeSlug;
        link.classList.toggle('text-[#ef4444]', isActive);
        link.classList.toggle('border-[#ef4444]', isActive);
        link.classList.toggle('text-[#525252]', !isActive);
        link.classList.toggle('border-transparent', !isActive);
      });
    }, { passive: true });
  }
</script>
```

**Note on `post.body`:** Astro content collections expose `post.body` as the raw markdown string for glob-loaded collections. If this is undefined at runtime, fall back to a default read time of 1. Check the Astro 5 docs if the property name has changed.

**Step 2: Visual verification**

Temporarily set `draft: false` in `src/content/blog/welcome.md`. Navigate to `/blog/welcome`. Verify:
- Progress bar fills as you scroll
- "1 min read" appears next to date
- Tags appear below title (if post has tags)
- TOC sidebar visible on desktop (only if post has h2/h3 headings — welcome.md may not)
- Related posts section at bottom (only if other non-draft posts exist with shared tags)
- Footer renders at bottom

Revert draft status when done.

**Step 3: Commit**

```bash
git add src/pages/blog/[...slug].astro
git commit -m "feat(blog): redesign post page with TOC, progress bar, read time, related posts"
```

---

### Task 5: Add sample blog posts for testing

**Files:**
- Create: `src/content/blog/greenville-cameras.md`
- Create: `src/content/blog/s447-committee-hearing.md`
- Create: `src/content/blog/foia-guide.md`

**Step 1: Create 3 sample posts with varied tags**

These are test fixtures to verify the listing layout and related posts. All should have `draft: true` so they don't deploy.

`src/content/blog/greenville-cameras.md`:
```markdown
---
title: "Greenville PD's 57 Cameras: What We Found"
date: 2026-03-10
summary: "An analysis of Greenville's ALPR deployment, how many cameras are active, and what data they collect."
tags:
  - research
  - greenville
draft: true
---

Greenville has become one of the most heavily surveilled mid-size cities in South Carolina.

## Where the Cameras Are

The cameras aren't distributed evenly.

## How Long They Keep Your Data

Greenville PD's contract with Flock Safety includes a standard 30-day retention period.

### The SLED Connection

Every plate read also flows to SLED's statewide database.

## What You Can Do

Transparency is the first step.
```

`src/content/blog/s447-committee-hearing.md`:
```markdown
---
title: "S.447 Update: Committee Hearing Scheduled"
date: 2026-03-05
summary: "The Senate Judiciary Committee will hear testimony on the ALPR oversight bill next week."
tags:
  - legislation
draft: true
---

The Senate Judiciary Committee has scheduled a hearing on S.447 for next week.

## What the Bill Does

S.447 would require law enforcement agencies to get approval before deploying ALPRs.

## How to Submit Testimony

You can submit written testimony by email.
```

`src/content/blog/foia-guide.md`:
```markdown
---
title: "How to File a FOIA Request for Camera Records"
date: 2026-02-28
summary: "A step-by-step guide to requesting ALPR data from your local police department."
tags:
  - campaign
  - research
draft: true
---

Filing a FOIA request is one of the most effective ways to learn how ALPR cameras are being used in your community.

## What to Request

Ask for deployment maps, data retention policies, and sharing agreements.

## Sample Request Letter

Use our toolkit to generate a customized FOIA request.
```

**Step 2: Visual verification**

Temporarily set all 3 posts + welcome.md to `draft: false`. Navigate to `/blog`. Verify:
- Hero card shows "Greenville PD's 57 Cameras" (latest by date)
- 2-column grid shows the other 3 posts
- Tag pills appear: research, greenville, legislation, campaign, launch
- Click "research" tag — only Greenville + FOIA posts show
- Click "All" — all 4 posts show
- Navigate to `/blog/greenville-cameras` — TOC sidebar shows 3 h2s + 1 h3
- Related posts section shows FOIA guide (shares "research" tag)

Revert all posts back to `draft: true` when done.

**Step 3: Commit**

```bash
git add src/content/blog/greenville-cameras.md src/content/blog/s447-committee-hearing.md src/content/blog/foia-guide.md
git commit -m "test(blog): add sample posts for layout testing"
```

---

### Task 6: Enhance publish.py with auto commit + push

**Files:**
- Modify: `scripts/publish.py:154-191` (main function)

**Step 1: Add git commit + push to main function**

After the processing loop in `main()`, add git operations. Import `subprocess` at the top of the file (line 15, after `import sys`):

```python
import subprocess
```

Then replace the `main()` function (lines 154-191) with:

```python
def main():
    if not os.path.isdir(VAULT_PATH):
        print(f"ERROR: Vault not found at {VAULT_PATH}")
        sys.exit(1)

    # Resolve the repo root (parent of scripts/)
    repo_root = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

    os.makedirs(BLOG_DIR, exist_ok=True)

    print(f"Scanning vault: {VAULT_PATH}")
    files = find_publishable_files(VAULT_PATH)
    print(f"Found {len(files)} file(s) with publish: deflocksc")

    processed = 0
    published_files = []
    for fpath in files:
        fname = os.path.basename(fpath)
        print(f"\nProcessing: {fname}")

        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        content = process_content(content)

        if not validate_frontmatter(content, fname):
            continue

        # Write to blog directory
        slug = fname.lower().replace(" ", "-")
        dest = os.path.join(BLOG_DIR, slug)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(content)

        print(f"  -> {dest}")
        published_files.append(dest)
        processed += 1

    print(f"\nDone. {processed} file(s) published to {BLOG_DIR}")

    if processed == 0:
        print("No files to commit.")
        return

    # Git add, commit, push
    print("\nCommitting and pushing to remote...")
    try:
        for f in published_files:
            subprocess.run(["git", "add", f], cwd=repo_root, check=True)

        slugs = ", ".join(os.path.basename(f) for f in published_files)
        msg = f"content(blog): publish {processed} post(s)\n\n{slugs}"
        subprocess.run(["git", "commit", "-m", msg], cwd=repo_root, check=True)
        subprocess.run(["git", "push"], cwd=repo_root, check=True)
        print("Pushed to remote. Netlify will auto-rebuild.")
    except subprocess.CalledProcessError as e:
        print(f"Git error: {e}")
        print("Files were written but not committed. Run git commands manually.")
        sys.exit(1)
```

**Step 2: Manual test**

Don't run the full pipeline (it would scan the vault and push). Instead, verify the script still parses correctly:

```bash
python -c "import scripts.publish; print('Module loads OK')"
```

If that fails due to import path issues, just run:

```bash
python scripts/publish.py --help 2>&1 || echo "Script loaded (no --help flag, expected)"
```

The script should load without syntax errors (it will print the vault scanning output or an error about the vault path if run outside the repo context).

**Step 3: Commit**

```bash
git add scripts/publish.py
git commit -m "feat(blog): add auto git commit and push to publish pipeline"
```

---

### Task 7: Final integration verification

**Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass (geo-utils, district-matcher, blog-utils).

**Step 2: Build the site**

```bash
npm run build
```

Expected: Build succeeds with no errors. (Draft posts won't be included in the build.)

**Step 3: Full visual walkthrough**

Start dev server. Set all sample posts to `draft: false`. Walk through:

1. Homepage — verify "Blog" link in nav works
2. `/blog` — hero card, grid, tag filtering, URL hash
3. `/blog/greenville-cameras` — progress bar, read time, TOC sidebar, related posts, footer
4. `/blog/greenville-cameras` on mobile viewport — TOC hidden, content full-width, related posts stacked
5. RSS feed at `/rss.xml` — verify posts appear

Revert sample posts to `draft: true`.

**Step 4: Commit any fixes**

If any issues found during verification, fix and commit individually.

**Step 5: Final commit — update MANIFEST.md**

Update `MANIFEST.md` to reflect the new `src/lib/blog-utils.ts` file and any other changes. Commit:

```bash
git add MANIFEST.md
git commit -m "docs: update MANIFEST with blog overhaul files"
```
