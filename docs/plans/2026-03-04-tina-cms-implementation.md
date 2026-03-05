# Tina CMS Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add TinaCMS for visual editing of blog posts (inline images, featured images) and auto-generate OG images at build time.

**Architecture:** TinaCMS runs locally alongside Astro dev, editing the same `.md` files in `src/content/blog/`. OG images generated at build time via satori+sharp as an Astro endpoint. Media stored in `public/uploads/blog/` (git-tracked). OG images output to a build-time endpoint (not git-tracked).

**Tech Stack:** TinaCMS (local mode), satori, sharp, Astro 5 content collections

---

### Task 1: Install TinaCMS

**Files:**
- Modify: `package.json`

**Step 1: Run Tina CLI init**

Run: `npx @tinacms/cli@latest init`

When prompted for public assets directory, enter `public`.

This creates `tina/config.ts` with a starter schema and adds tinacms dependencies to `package.json`.

**Step 2: Delete the generated starter content**

The init command may create sample content files. Delete any files it creates in `content/` or similar directories — we already have our content in `src/content/blog/`.

**Step 3: Verify package.json has tinacms deps**

Check that `tinacms` and `@tinacms/cli` are in dependencies/devDependencies.

**Step 4: Commit**

```bash
git add package.json package-lock.json tina/
git commit -m "chore: install tinacms"
```

---

### Task 2: Configure Tina Collection for Blog Posts

**Files:**
- Modify: `tina/config.ts` (replace generated content)

**Step 1: Write the Tina config**

Replace the contents of `tina/config.ts` with:

```ts
import { defineConfig } from "tinacms";

export default defineConfig({
  branch: process.env.GITHUB_BRANCH || "master",
  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },
  media: {
    tina: {
      publicFolder: "public",
      mediaRoot: "uploads/blog",
    },
  },
  schema: {
    collections: [
      {
        name: "blog",
        label: "Blog Posts",
        path: "src/content/blog",
        format: "md",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "datetime",
            name: "date",
            label: "Date",
            required: true,
          },
          {
            type: "string",
            name: "summary",
            label: "Summary",
            required: true,
            ui: {
              component: "textarea",
            },
          },
          {
            type: "string",
            name: "tags",
            label: "Tags",
            list: true,
          },
          {
            type: "boolean",
            name: "draft",
            label: "Draft",
          },
          {
            type: "image",
            name: "featuredImage",
            label: "Featured Image",
          },
          {
            type: "image",
            name: "ogImage",
            label: "OG Image Override",
            description: "Custom social sharing image. If empty, one is auto-generated from the title and featured image.",
          },
          {
            type: "rich-text",
            name: "body",
            label: "Body",
            isBody: true,
          },
        ],
      },
    ],
  },
});
```

Key decisions:
- `path` points to `src/content/blog` (where our posts live)
- `mediaRoot` is `uploads/blog` (relative to `public/`)
- `format: "md"` (not mdx — we don't need custom components)
- `isBody: true` on the rich-text field maps it to the markdown body
- `featuredImage` and `ogImage` use the `image` type (stores path in frontmatter)

**Step 2: Update .gitignore for Tina generated files**

Add to `.gitignore`:

```
tina/__generated__/
```

Tina generates GraphQL schema files at dev time — these shouldn't be committed.

**Step 3: Commit**

```bash
git add tina/config.ts .gitignore
git commit -m "feat: configure tina collection for blog posts"
```

---

### Task 3: Update Astro Content Schema

**Files:**
- Modify: `src/content.config.ts`

**Step 1: Add image fields to Zod schema**

Update `src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().optional(),
    featuredImage: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { blog };
```

**Step 2: Commit**

```bash
git add src/content.config.ts
git commit -m "feat: add featuredImage and ogImage to blog schema"
```

---

### Task 4: Update Dev Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add tina dev script**

Add to `package.json` scripts:

```json
{
  "scripts": {
    "dev": "astro dev",
    "tina": "tinacms dev -c \"astro dev\"",
    "start": "astro dev",
    "build": "tinacms build && astro build",
    "preview": "astro preview",
    "astro": "astro"
  }
}
```

- `npm run tina` starts both Tina and Astro together (use this for editing)
- `npm run build` runs Tina build first (generates GraphQL artifacts), then Astro build
- `npm run dev` still works without Tina for quick dev

**Step 2: Update `.claude/launch.json`**

Read the existing launch.json and add a second config for tina dev, or update the existing one. The tina command wraps astro dev, so the port stays the same.

**Step 3: Commit**

```bash
git add package.json .claude/launch.json
git commit -m "chore: add tina dev and build scripts"
```

---

### Task 5: Verify Tina Runs Locally

**Step 1: Start tina dev**

Run: `npx tinacms dev -c "astro dev"`

**Step 2: Open the admin UI**

Navigate to `http://localhost:4321/admin/index.html`

Verify:
- The admin panel loads
- The Blog Posts collection is visible
- The existing `welcome.md` post appears in the list
- Clicking it opens the editor with title, date, summary, tags, draft, featured image, OG image fields
- The rich-text body editor shows the post content
- You can upload an image via the Featured Image field

**Step 3: Test image upload**

Upload a test image via the Featured Image field. Verify:
- Image appears in `public/uploads/blog/`
- Frontmatter in `welcome.md` gets a `featuredImage` field with the path

**Step 4: Revert the test image** (don't commit test data)

Remove the test image from `public/uploads/blog/` and revert `welcome.md` if modified.

**Step 5: Commit** (only if there were config adjustments needed)

---

### Task 6: Install OG Image Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install satori and sharp**

Run: `npm install satori sharp`

**Step 2: Download Inter font file for satori**

Satori needs a font buffer (can't use Google Fonts URL). Download Inter-Bold (weight 700 or 800) as a `.ttf` file and save to `src/assets/fonts/Inter-Bold.ttf`.

You can get it from Google Fonts: download the Inter family, extract the Bold variant.

Run: `curl -L -o src/assets/fonts/Inter-Bold.ttf "https://github.com/rsms/inter/raw/master/fonts/desktop/Inter-Bold.ttf"`

Create the directory first: `mkdir -p src/assets/fonts`

**Step 3: Commit**

```bash
git add package.json package-lock.json src/assets/fonts/Inter-Bold.ttf
git commit -m "chore: install satori, sharp, and Inter font for OG generation"
```

---

### Task 7: Create OG Image Generator

**Files:**
- Create: `src/lib/og-image.ts`

**Step 1: Write the OG image rendering function**

Create `src/lib/og-image.ts`:

```ts
import satori from "satori";
import sharp from "sharp";
import fs from "node:fs/promises";

const INTER_BOLD = await fs.readFile(
  new URL("../assets/fonts/Inter-Bold.ttf", import.meta.url)
);

export async function generateOgImage(title: string): Promise<Buffer> {
  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px",
          backgroundColor: "#171717",
          fontFamily: "Inter",
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                width: "80px",
                height: "6px",
                backgroundColor: "#dc2626",
                marginBottom: "24px",
              },
            },
          },
          {
            type: "div",
            props: {
              children: title,
              style: {
                fontSize: title.length > 60 ? 48 : 64,
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.2,
                marginBottom: "24px",
              },
            },
          },
          {
            type: "div",
            props: {
              children: "DeflockSC",
              style: {
                fontSize: 24,
                color: "#737373",
                fontWeight: 700,
              },
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: INTER_BOLD,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );

  return await sharp(Buffer.from(svg)).png().toBuffer();
}
```

This renders a dark card with a red accent stripe, the post title in white Inter Bold, and "DeflockSC" branding at the bottom. Title font size shrinks for long titles.

**Step 2: Commit**

```bash
git add src/lib/og-image.ts
git commit -m "feat: add OG image generator with satori and sharp"
```

---

### Task 8: Create OG Image Endpoint

**Files:**
- Create: `src/pages/blog/[...slug]/og.png.ts`

**Step 1: Write the endpoint**

Create `src/pages/blog/[...slug]/og.png.ts`:

```ts
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { generateOgImage } from "../../../lib/og-image";

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = (await getCollection("blog")).filter((p) => !p.data.draft);
  return posts
    .filter((post) => !post.data.ogImage)
    .map((post) => ({
      params: { slug: post.id },
      props: { title: post.data.title },
    }));
};

export const GET: APIRoute = async ({ props }) => {
  const png = await generateOgImage(props.title);
  return new Response(png, {
    headers: { "Content-Type": "image/png" },
  });
};
```

Key details:
- Only generates for non-draft posts that don't have a manual `ogImage`
- Output path: `/blog/{slug}/og.png`
- Static generation at build time (Astro SSG default)

**Step 2: Commit**

```bash
git add src/pages/blog/[...slug]/og.png.ts
git commit -m "feat: add OG image endpoint for blog posts"
```

---

### Task 9: Wire Up OG Images in Blog Detail Page

**Files:**
- Modify: `src/pages/blog/[...slug].astro`

**Step 1: Update the blog detail page**

Update `src/pages/blog/[...slug].astro` to:
- Compute the OG image path (manual override > auto-generated > site default)
- Pass it to `<Base>`
- Render the featured image as a hero if present

```astro
---
import Base from '../../layouts/Base.astro';
import { getCollection, render } from 'astro:content';

export async function getStaticPaths() {
  const posts = (await getCollection('blog')).filter((post) => !post.data.draft);
  return posts.map((post) => ({
    params: { slug: post.id },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await render(post);

// OG image priority: manual override > auto-generated > site default
const ogImage = post.data.ogImage
  ? post.data.ogImage
  : `/blog/${post.id}/og.png`;
---

<Base title={`${post.data.title} — DeflockSC`} description={post.data.summary} ogImage={ogImage}>
  <article class="py-20 md:py-28">
    <div class="max-w-3xl mx-auto px-6">
      <a href="/blog" class="text-[#fbbf24] hover:text-[#fcd34d] text-sm font-medium transition-colors mb-8 inline-block">&larr; Back to Blog</a>

      {post.data.featuredImage && (
        <img
          src={post.data.featuredImage}
          alt=""
          class="w-full rounded-lg mb-8 aspect-[2/1] object-cover"
        />
      )}

      <header class="mb-10">
        <time class="text-[#737373] text-sm font-medium" datetime={new Date(post.data.date).toISOString()}>
          {new Date(post.data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </time>
        <h1 class="text-3xl md:text-4xl font-[900] text-white mt-2 leading-tight">{post.data.title}</h1>
      </header>

      <div class="prose prose-invert max-w-none
        [&>p]:text-[#d4d4d4] [&>p]:leading-[1.8] [&>p]:mb-6
        [&>h2]:text-white [&>h2]:font-bold [&>h2]:text-2xl [&>h2]:mt-10 [&>h2]:mb-4
        [&>h3]:text-white [&>h3]:font-bold [&>h3]:text-xl [&>h3]:mt-8 [&>h3]:mb-3
        [&>ul]:text-[#d4d4d4] [&>ul]:space-y-2 [&>ul]:mb-6 [&>ul>li]:pl-2
        [&>ol]:text-[#d4d4d4] [&>ol]:space-y-2 [&>ol]:mb-6
        [&>blockquote]:border-l-3 [&>blockquote]:border-[#ef4444] [&>blockquote]:pl-6 [&>blockquote]:text-[#a3a3a3] [&>blockquote]:italic [&>blockquote]:my-8
        [&_a]:text-[#fbbf24] [&_a]:hover:text-[#fcd34d] [&_a]:focus-visible:text-[#fcd34d] [&_a]:transition-colors
        [&_strong]:text-white
        [&_code]:bg-[#262626] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
        [&>pre]:bg-[#262626] [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre]:mb-6
        [&_pre_code]:p-0 [&_pre_code]:bg-transparent
        [&_img]:rounded-lg [&_img]:my-6">
        <Content />
      </div>
    </div>
  </article>
</Base>
```

Changes:
- Compute `ogImage` path with priority chain
- Pass `ogImage` to `<Base>`
- Render `featuredImage` as hero image above title
- Add `[&_img]:rounded-lg [&_img]:my-6` to prose styles for inline images from rich text

**Step 2: Commit**

```bash
git add src/pages/blog/[...slug].astro
git commit -m "feat: wire up OG images and featured image in blog detail"
```

---

### Task 10: Add Thumbnails to Blog Listing

**Files:**
- Modify: `src/pages/blog/index.astro`

**Step 1: Update the blog listing page**

Update the post card in `src/pages/blog/index.astro` to show a thumbnail when `featuredImage` is set:

```astro
---
import Base from '../../layouts/Base.astro';
import { getCollection } from 'astro:content';

const posts = (await getCollection('blog'))
  .filter((post) => !post.data.draft)
  .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());
---

<Base title="Blog — DeflockSC" description="Campaign updates and research on license plate surveillance in South Carolina.">
  <section class="py-20 md:py-28">
    <div class="max-w-3xl mx-auto px-6">
      <h1 class="text-3xl md:text-4xl font-[900] text-white mb-4">Blog</h1>
      <p class="text-[#a3a3a3] text-lg mb-12">Campaign updates and research on license plate surveillance in South Carolina.</p>

      {posts.length === 0 && (
        <p class="text-[#737373]">We're preparing our first post. In the meantime, <a href="/" class="text-[#fbbf24] hover:text-[#fcd34d] transition-colors">learn how Flock Safety cameras work</a> and why South Carolina needs oversight.</p>
      )}

      <div class="space-y-8">
        {posts.map((post) => (
          <a href={`/blog/${post.id}`} class="block group">
            <article class="bg-[#262626] rounded-lg border-l-3 border-[#262626] group-hover:border-[#ef4444] transition-all duration-200 group-hover:bg-[#2e2e2e] overflow-hidden">
              {post.data.featuredImage && (
                <img
                  src={post.data.featuredImage}
                  alt=""
                  class="w-full aspect-[3/1] object-cover"
                />
              )}
              <div class="p-6">
                <time class="text-[#737373] text-sm font-medium" datetime={new Date(post.data.date).toISOString()}>
                  {new Date(post.data.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </time>
                <h2 class="text-xl font-bold text-white mt-2 mb-2 group-hover:text-[#fafafa] transition-colors">{post.data.title}</h2>
                <p class="text-[#a3a3a3] text-sm leading-relaxed">{post.data.summary}</p>
              </div>
            </article>
          </a>
        ))}
      </div>
    </div>
  </section>
</Base>
```

Changes:
- If `featuredImage` exists, render it as a wide banner at top of card (3:1 aspect ratio)
- Move text content into a `<div class="p-6">` wrapper (padding only on text, image goes edge-to-edge)
- Add `overflow-hidden` to article for image rounded corners

**Step 2: Commit**

```bash
git add src/pages/blog/index.astro
git commit -m "feat: show featured image thumbnails in blog listing"
```

---

### Task 11: Fix RSS Draft Filtering

**Files:**
- Modify: `src/pages/rss.xml.ts`

**Step 1: Add draft filter to RSS**

Update `src/pages/rss.xml.ts`:

```ts
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog')).filter((post) => !post.data.draft);
  return rss({
    title: 'DeflockSC Blog',
    description: 'Campaign updates and research on license plate surveillance in South Carolina.',
    site: context.site ?? 'https://deflocksc.org',
    items: posts
      .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime())
      .map((post) => ({
        title: post.data.title,
        pubDate: new Date(post.data.date),
        description: post.data.summary,
        link: `/blog/${post.id}`,
      })),
  });
}
```

Only change: `.filter((post) => !post.data.draft)` added to line 6.

**Step 2: Commit**

```bash
git add src/pages/rss.xml.ts
git commit -m "fix: filter draft posts from RSS feed"
```

---

### Task 12: Update .gitignore and Verify Build

**Files:**
- Modify: `.gitignore`

**Step 1: Ensure gitignore covers Tina artifacts**

Verify `.gitignore` contains:

```
tina/__generated__/
```

(Should already be there from Task 2.)

**Step 2: Run full build**

Run: `npx tinacms build && npx astro build`

Verify:
- Tina build succeeds (generates GraphQL schema)
- Astro build succeeds
- OG image for the welcome post is generated (check `dist/blog/welcome/og.png` or similar)
- No draft posts appear in the built output

**Step 3: Commit any remaining adjustments**

```bash
git add -A
git commit -m "chore: verify build with tina and OG generation"
```

---

### Task 13: Smoke Test End-to-End

**Step 1: Start Tina dev**

Run: `npx tinacms dev -c "astro dev"`

**Step 2: Open admin at `http://localhost:4321/admin/index.html`**

Verify:
- Blog collection visible
- Welcome post editable
- Can add/remove tags
- Can toggle draft
- Can upload featured image
- Rich text editor works for body content (can insert inline images)

**Step 3: Test the blog pages**

Navigate to `http://localhost:4321/blog` and `http://localhost:4321/blog/welcome`:
- Blog listing renders
- If featured image was set, it shows as thumbnail/hero
- Inline images from rich text render with rounded corners

**Step 4: Test OG image**

Navigate to `http://localhost:4321/blog/welcome/og.png`:
- Should return a PNG image with the post title

**Step 5: Revert any test edits to welcome.md**

**Step 6: Final commit if any adjustments were needed**
