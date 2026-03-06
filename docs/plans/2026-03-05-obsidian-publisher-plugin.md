# Obsidian Publisher Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code plugin that pipelines Obsidian vault research into blog posts and coordinated social media content.

**Architecture:** Two skills (blog-writing, social-media) with reference files for detailed guidance. The plugin reads project-specific config (voice-dna.md path, vault path, framework, audience) from CLAUDE.md or a config file in each repo. Voice always comes from voice-dna.md. First-person for personal content, "we" for organizational.

**Tech Stack:** Claude Code plugin (plugin.json + skills with SKILL.md + references)

**Plugin location:** `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\`

**Design doc:** `docs/plans/2026-03-05-blog-content-and-publisher-plugin-design.md` in deflocksc-website repo.

---

### Task 1: Create Plugin Scaffolding

**Files:**
- Create: `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\.claude-plugin\plugin.json`
- Create: `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\README.md`

**Step 1: Create directory structure**

```bash
mkdir -p "C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\.claude-plugin"
mkdir -p "C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\skills\blog-writing\references"
mkdir -p "C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\skills\social-media\references"
```

**Step 2: Write plugin.json**

```json
{
  "name": "obsidian-publisher",
  "description": "Pipeline from Obsidian vault research to blog posts and coordinated social media content",
  "author": {
    "name": "Tim Simpson"
  }
}
```

**Step 3: Initialize git repo**

```bash
cd "C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher"
git init
```

**Step 4: Write README.md**

Brief README covering: what the plugin does, the two skills, how to configure project-specific settings. Keep it short (under 100 lines).

**Step 5: Commit**

```bash
git add .claude-plugin/plugin.json README.md
git commit -m "feat: initialize obsidian-publisher plugin scaffolding"
```

---

### Task 2: Write blog-writing SKILL.md

**Files:**
- Create: `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\skills\blog-writing\SKILL.md`

**Context needed:**
- Read the design doc at `C:\Users\tim\OneDrive\Documents\Projects\deflocksc-website\docs\plans\2026-03-05-blog-content-and-publisher-plugin-design.md` for voice rules, post structure, and workflow
- Read `C:\Users\tim\.claude\voice-dna.md` to understand the voice system (but don't duplicate its contents in the skill)

**Step 1: Write SKILL.md**

Frontmatter:
```yaml
---
name: blog-writing
description: This skill should be used when the user asks to "write a blog post", "draft a blog post", "create a blog post from research", "turn research into a blog post", "publish research as a blog post", or mentions writing blog content from Obsidian vault notes or research materials.
---
```

Body (target 1500-2000 words, imperative form, third person in description). Must cover:

1. **Overview** (2-3 sentences): Pipeline for turning Obsidian vault research into well-sourced blog posts. Reads voice from voice-dna.md. Outputs framework-compatible markdown.

2. **Project Configuration**: The skill expects these settings to be defined in the project's CLAUDE.md or a `.obsidian-publisher.md` config file:
   - Path to voice-dna.md
   - Path to Obsidian vault / research directory
   - Blog framework (astro, hugo, generic)
   - Output path for blog posts
   - Target audience description
   - Framing: "personal" (first-person) or "org" (we)
   - Any project-specific talking points or messaging framework

3. **Workflow** (the core procedure):
   - Step 1: Read project config to get voice, audience, framing, and framework settings
   - Step 2: Read voice-dna.md and internalize all rules (writing rules, formatting rules, banned phrases)
   - Step 3: Identify source material in the Obsidian vault. Search for relevant notes using Glob and Grep. Follow wikilinks between notes to build a complete picture.
   - Step 4: Verify claims and sources. Cross-reference facts across multiple vault notes. Check that URLs are cited. Flag any claims without sources.
   - Step 5: Draft the post following voice rules, framing rules, and post structure (see `references/post-structure.md`)
   - Step 6: Self-review against voice-dna.md banned phrases. Check for em dashes, banned transitions, AI language. Fix violations.
   - Step 7: Output the post as framework-compatible markdown with correct frontmatter

4. **Voice Application Rules**:
   - Always read voice-dna.md fresh (don't rely on memory of its contents)
   - Apply ALL writing rules, formatting rules, and banned phrases
   - Framing: if project config says "personal", use first-person ("I"). If "org", use "we".
   - When blending voice with advocacy: the voice is the foundation, but avoid framing that could trigger partisan auto-rejection in the target audience

5. **Source Handling**:
   - Inline citations where facts are stated
   - Sources section at bottom with full URLs
   - Follow Obsidian wikilinks to find related notes
   - Prioritize primary sources over secondary
   - See `references/source-verification.md` for detailed guidance

6. **Additional Resources** section pointing to:
   - `references/post-structure.md` for detailed post format and frontmatter schemas
   - `references/source-verification.md` for source cross-referencing and citation

**Step 2: Validate SKILL.md**

Check:
- Frontmatter has name and description
- Description uses third person ("This skill should be used when...")
- Description includes specific trigger phrases
- Body uses imperative/infinitive form (not "you should")
- Body is under 2000 words
- References to reference files are present

**Step 3: Commit**

```bash
git add skills/blog-writing/SKILL.md
git commit -m "feat: add blog-writing skill"
```

---

### Task 3: Write blog-writing Reference Files

**Files:**
- Create: `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\skills\blog-writing\references\post-structure.md`
- Create: `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\skills\blog-writing\references\source-verification.md`

**Step 1: Write post-structure.md**

Detailed reference covering:

1. **Post Anatomy**:
   - Hook: Open with a concrete fact, incident, or quote (not an abstract claim). 1-3 sentences.
   - Body: 1200-2000 words. Short paragraphs (1-3 sentences). Varied sentence length. Specific facts with inline citations.
   - Sources section: Full URLs at the bottom, grouped by topic if many.
   - CTA (optional): Soft link to action tool or related content. Not the point of the post.

2. **Frontmatter Schemas**:
   - Astro: `title`, `date` (ISO 8601), `summary`, `tags` (array), `draft` (boolean)
   - Hugo: `title`, `date`, `description`, `tags`, `draft`
   - Generic: `title`, `date`, `summary`, `tags`
   - Include example frontmatter for each

3. **Structural Patterns**:
   - Investigative: hook -> context -> evidence (multiple angles) -> implications -> soft CTA
   - Narrative: incident -> what happened -> why it matters -> pattern -> soft CTA
   - Rebuttal: their claim -> why it's wrong (with specifics) -> what's actually true -> soft CTA

4. **Length and Formatting**:
   - Target 1200-2000 words
   - Short paragraphs (1-3 sentences max)
   - Bold sparingly (1-2 key moments per section)
   - Numbers as digits
   - No em dashes (use commas, periods, colons, semicolons, or parentheses)

**Step 2: Write source-verification.md**

Detailed reference covering:

1. **Vault Navigation**:
   - Search for relevant notes using Glob patterns in the vault research directory
   - Read notes and follow `[[wikilinks]]` to find related material
   - Use `[[Full Title|short name]]` display links to find the actual note title
   - Check for tag-based grouping (frontmatter tags like `research`, `tactical-research`, etc.)

2. **Cross-Referencing**:
   - Every factual claim in the post should trace back to a vault note
   - Every vault note claim should trace back to a primary source (URL, document, public record)
   - When multiple notes discuss the same fact, check for consistency
   - Flag discrepancies for the user to resolve

3. **Citation Format**:
   - Inline: parenthetical with source name and date, or natural attribution ("according to [source]")
   - Sources section: markdown links with descriptive text
   - Example: `[EFF, Aug 2025](https://www.eff.org/...)`
   - For paywalled or hard-to-access sources, note this

4. **Handling Gaps**:
   - If a claim has no source in the vault, flag it with a TODO comment
   - If a source URL is dead or inaccessible, note the original source and suggest alternatives
   - Prefer primary sources (court documents, official statements, public records) over news coverage

**Step 3: Validate reference files**

Check both files exist, are substantial, and don't duplicate SKILL.md content.

**Step 4: Commit**

```bash
git add skills/blog-writing/references/
git commit -m "feat: add blog-writing reference files"
```

---

### Task 4: Write social-media SKILL.md

**Files:**
- Create: `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\skills\social-media\SKILL.md`

**Step 1: Write SKILL.md**

Frontmatter:
```yaml
---
name: social-media
description: This skill should be used when the user asks to "create social media posts", "write a LinkedIn post", "write a tweet", "create social content from a blog post", "share this on social media", "draft social media content", or mentions coordinating social media promotion for blog posts or articles.
---
```

Body (target 1500-2000 words, imperative form). Must cover:

1. **Overview**: Generate coordinated social media content from blog posts. Each platform gets tailored content (not copy-paste). Reads voice from voice-dna.md. Matches the blog post's framing and key points to each platform's conventions.

2. **Project Configuration**: Same config source as blog-writing. Additional settings:
   - Which platforms to target (linkedin, twitter/x, etc.)
   - Any platform-specific tone adjustments
   - Framing: "personal" (first-person) or "org" (we), same as blog

3. **Workflow**:
   - Step 1: Read the blog post being promoted
   - Step 2: Read voice-dna.md and project config
   - Step 3: Identify the 2-3 most compelling points from the post (the facts that make people stop scrolling)
   - Step 4: Draft platform-specific content (see `references/platform-formats.md`)
   - Step 5: Self-review against voice-dna.md banned phrases
   - Step 6: Present all drafts to the user for review before posting

4. **Content Principles**:
   - Lead with the most concrete, specific fact (numbers, names, incidents)
   - Each social post should stand alone (reader may never click through)
   - But include a clear link to the full post
   - Match the blog post's framing (don't make the social post more inflammatory than the source)
   - Never use engagement bait (banned in voice-dna.md)

5. **Additional Resources** section pointing to:
   - `references/platform-formats.md` for platform-specific formatting and conventions

**Step 2: Validate SKILL.md**

Same validation checks as Task 2.

**Step 3: Commit**

```bash
git add skills/social-media/SKILL.md
git commit -m "feat: add social-media skill"
```

---

### Task 5: Write social-media Reference Files

**Files:**
- Create: `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\skills\social-media\references\platform-formats.md`

**Step 1: Write platform-formats.md**

Detailed reference covering:

1. **LinkedIn**:
   - Character limit: 3000 for posts
   - Format: 1-2 sentence hook, then short paragraphs (1-2 sentences each), end with link
   - Line breaks between paragraphs (LinkedIn collapses whitespace otherwise)
   - Hashtags: 3-5 relevant ones at the bottom, not inline
   - Tone: slightly more professional than the blog, but still the voice-dna.md voice
   - No images required but recommended if available

2. **X/Twitter**:
   - Character limit: 280 per tweet
   - Single tweet: the one most shareable fact + link
   - Thread format: numbered tweets (1/N), each can stand alone, first tweet is the hook
   - Thread length: 3-6 tweets max (longer threads lose readers)
   - Hashtags: 1-2 max, only if genuinely discoverable
   - Tone: punchier than LinkedIn, same voice

3. **General Principles**:
   - Every platform post links back to the full blog post
   - Use the blog post's title or a variation as the social post's hook
   - Don't summarize the whole post (give them a reason to click)
   - Time-sensitive content should note the date/context
   - Images: if the blog post has a key chart/map/screenshot, reference it

**Step 2: Validate reference file**

Check file exists, is substantial, doesn't duplicate SKILL.md content.

**Step 3: Commit**

```bash
git add skills/social-media/references/
git commit -m "feat: add social-media reference files"
```

---

### Task 6: Final Validation and README

**Files:**
- Modify: `C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher\README.md`

**Step 1: Validate full plugin structure**

Verify directory tree matches:
```
obsidian-publisher/
  .claude-plugin/
    plugin.json
  skills/
    blog-writing/
      SKILL.md
      references/
        post-structure.md
        source-verification.md
    social-media/
      SKILL.md
      references/
        platform-formats.md
  README.md
```

**Step 2: Validate all SKILL.md files**

For each SKILL.md, check:
- [ ] Frontmatter has name and description
- [ ] Description uses third person
- [ ] Description includes specific trigger phrases
- [ ] Body uses imperative form
- [ ] Body under 2000 words
- [ ] References to reference files are present and correct
- [ ] No duplicated content between SKILL.md and references

**Step 3: Finalize README.md**

Update README with:
- What the plugin does
- The two skills and what they do
- How to configure (what goes in CLAUDE.md)
- Example CLAUDE.md config block
- Installation instructions (--plugin-dir)

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: finalize README with configuration guide"
```

---

### Task 7: Test Plugin Locally

**Step 1: Install plugin locally**

```bash
# Test with --plugin-dir flag
cc --plugin-dir "C:\Users\tim\OneDrive\Documents\Projects\obsidian-publisher"
```

**Step 2: Test blog-writing skill triggers**

In the test session, say: "Write a blog post from my research on [topic]"
Verify the blog-writing skill loads.

**Step 3: Test social-media skill triggers**

Say: "Create social media posts for this blog post"
Verify the social-media skill loads.

**Step 4: Note any issues for iteration**

Document what worked and what needs adjustment. Common issues:
- Trigger phrases too narrow or too broad
- Missing workflow steps
- Reference files missing needed information
