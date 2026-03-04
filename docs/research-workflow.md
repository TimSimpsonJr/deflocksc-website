# Research Workflow

## What Is It?

The [research workflow](https://github.com/TimSimpsonJr/research-workflow) is a Claude Code skill set that automates the full research pipeline: web search, content fetch, classification, and vault note synthesis. It is designed for Obsidian vaults and produces sourced, cited, formatted notes ready to publish or reference.

DeflockSC used this workflow to create all of the site's copy, FAQ citations, case study content, and jurisdiction-specific form letters. If you are forking this site for your own state, the research workflow is how you build your localized content without starting from scratch.

## The Pipeline

The workflow runs in four stages:

1. **Search** (Haiku model) -- Given a topic, the search stage identifies 3-7 relevant URLs. It prioritizes primary sources (government records, court filings, news investigations) over aggregator pages.

2. **Fetch and Cache** (Python) -- Each URL is retrieved via the Jina Reader API and converted to clean markdown. Results are cached locally for 7 days so repeated research on the same topic does not re-fetch pages.

3. **Classify** (Haiku model) -- The fetched content is mapped to your vault's folder structure. The classifier suggests tags (content-type and location) and wikilinks to existing notes, so the output integrates into your vault graph rather than sitting in isolation.

4. **Synthesize** (Sonnet model) -- The final stage writes formatted Obsidian notes with inline citations, updates parent MOCs (Maps of Content), and links back to the source material. The output is ready to use as-is or to edit further.

## How DeflockSC Used It

### Site Copy

**FAQ section.** Each FAQ entry in `src/components/FAQ.astro` has an optional `source` field -- an HTML string with amber-colored links rendered via Astro's `set:html` directive. The research workflow found and verified each claim (EFF reports, CBS investigations, Post and Courier articles, city audits), then produced sourced notes that were distilled into the FAQ's lead + rest format.

**Case studies.** The HowItWorks carousel presents real incidents as concise cards. The research workflow gathered news articles, court documents, and council meeting minutes for each case (the Greenville sisters' wrongful stop, Spartanburg sheriff's federal conviction, Flock's CEO contradicting himself on federal contracts), then synthesized them into the short narratives used in the carousel.

**Bill descriptions.** The Bill Tracker section tracks SC legislation related to ALPR regulation. The research workflow tracked bill status, committee assignments, sponsor history, and related news coverage, producing structured notes that fed into the bill descriptions and status badges.

### Form Letters

`src/data/action-letters.json` contains 11 jurisdiction-specific letter templates. Each letter references local facts: camera counts, specific incidents, named officials, and precedent cities that have restricted or banned Flock.

**Letter structure.** Each entry has:

- `divisionPattern` -- a key that maps the letter to a jurisdiction (e.g., `state:sc/sldu:` for state senators, `state:sc/place:greenville` for Greenville City Council)
- `category` -- `state` or `local`
- `label` -- display name for the jurisdiction (e.g., "Greenville County Council")
- `subject` -- email subject line
- `body` -- the letter text, with `[NAME]` and `[Your name and address]` placeholders

The ActionModal matches letters to representatives by comparing each rep's district key against the `divisionPattern` values. A state senator in district 5 matches `state:sc/sldu:`, a Greenville city council member matches `state:sc/place:greenville`, and a rep in a jurisdiction without a specific letter falls back to the generic `state:sc/` template.

**How the research workflow produced these letters:**

1. **Jurisdiction research.** For each target jurisdiction (state legislature, 4 county councils, 3 city councils), the workflow researched ALPR deployments -- camera counts, contract details, funding sources, data-sharing agreements.

2. **Incident research.** The workflow identified local incidents that make the issue concrete: the Greenville sisters handcuffed at gunpoint over a wrongly flagged rental car, the Spartanburg sheriff's federal conviction, SLED's three-year data retention with no public accountability.

3. **Precedent research.** The workflow found cities and counties that have restricted or banned Flock -- Sedona, AZ (contract cancelled); Hays County, TX (contract cancelled); Cambridge, MA (strict oversight rules); Staunton, VA (contract cancelled). These precedents give each letter a "other communities did this, so can we" closing argument.

4. **Synthesis.** Each letter was drafted with jurisdiction-specific facts and specific asks tailored to the body's authority. State legislators are asked to push bills out of committee and amend them to cover vendors. County councils are asked to require disclosure and establish oversight policies. City councils are asked to hold public hearings and pass surveillance oversight ordinances.

**How to create letters for your state:**

1. Use the research workflow to research your state's ALPR deployments: camera counts, vendor contracts, data-sharing agreements, any documented incidents or misuse.
2. Identify local incidents that make the issue real for residents -- wrongful stops, data breaches, lack of oversight votes, contracts funded outside normal appropriations.
3. Find precedent cities in your region (or nationally) that have restricted, banned, or added oversight to ALPR systems. These give elected officials political cover to act.
4. Draft letters per jurisdiction tier. State legislators get letters about pending bills. County councils get letters about sheriff's office deployments and oversight policies. City councils get letters about municipal deployments and public hearings.
5. Add each letter to `action-letters.json` with the appropriate `divisionPattern` key. The pattern format is `state:{abbr}/` plus an optional jurisdiction suffix (`sldu:`, `sldl:`, `county:{name}`, `place:{name}`).
6. The ActionModal automatically matches letters to representatives based on district -- no additional wiring is needed.

## Setting Up the Research Workflow

### Prerequisites

- [Claude Code](https://claude.ai/claude-code) installed and configured
- An Obsidian vault (the workflow writes notes directly into your vault structure)
- Python 3.10+
- An Anthropic API key (the pipeline calls Haiku and Sonnet models)

### Installation

```bash
# 1. Clone the workflow repo
git clone https://github.com/TimSimpsonJr/research-workflow.git

# 2. Install Python dependencies
cd research-workflow
pip install -r requirements.txt

# 3. Auto-detect your vault structure
python scripts/discover_vault.py

# 4. Copy skill folders into Claude Code
cp -r skills/* ~/.claude/skills/

# 5. Set environment variables
export VAULT_ROOT="/path/to/your/obsidian/vault"
export SCRIPTS_DIR="/path/to/research-workflow/scripts"
export PYTHON_PATH="python3"
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Customizing for Your State

The workflow's output format is controlled by a few configuration files:

- **`scripts/prompts/vault_rules.txt`** -- Formatting rules, citation format, and wikilink targets. Edit this to match your vault's conventions (heading styles, callout syntax, how you want citations formatted).

- **Location tags** -- The workflow tags notes with location using `{city}-{state-abbr}` format (e.g., `greenville-sc`, `austin-tx`). Update the location tag format if your vault uses a different convention.

- **Content-type tags** -- Notes are tagged with one of 10 content categories: `research`, `legislation`, `campaign`, `plan`, `reference`, `tracking`, `decision`, `index`, `resource`, `meta`. These map to how the classifier sorts content into your vault folders.

### Usage

Run the full pipeline on a topic:

```
/research "ALPR cameras in {your city}"
```

Or enrich an existing note with additional sources:

```
/research path/to/existing-note.md
```

The output is a formatted Obsidian note with inline citations, tags, and wikilinks. From there, distill the research into site copy, FAQ entries, or letter templates as needed.
