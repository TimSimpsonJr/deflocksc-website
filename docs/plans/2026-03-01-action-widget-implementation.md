# Action Widget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a custom action widget that looks up a user's state and local representatives by zip code, then presents tailored form letters with mailto: send buttons and copy-to-clipboard fallback.

**Architecture:** Pure client-side widget inside `TakeAction.astro`. Google Civic Information API for rep lookup (free, API key restricted to domain). BigDataCloud for optional browser geolocation reverse geocoding (free, no key). Letter data in a single JSON file matched by OCD division ID patterns.

**Tech Stack:** Astro 5 (vanilla JS client scripts via `define:vars`), Tailwind CSS 4, Google Civic Information API, BigDataCloud reverse geocoding API

**Design doc:** `docs/plans/2026-03-01-action-widget-design.md`

**Existing patterns:** Components use vanilla JS with `define:vars={{ data }}`, DOM manipulation via `getElementById`/`querySelectorAll`, class toggling for state, `addEventListener` for interactivity. No framework. See `BillTracker.astro` for the most complex example (modal with focus trap, animations, data hydration).

---

## Task 1: Environment Setup

**Files:**
- Modify: `.env`
- Create: `.env.example`

**Step 1: Add API key placeholder to `.env`**

Add the Google Civic API key variable. The user will need to create a Google Cloud project, enable the Civic Information API, and generate a restricted API key.

Add to `.env`:
```
PUBLIC_GOOGLE_CIVIC_API_KEY=your_api_key_here
```

The `PUBLIC_` prefix is required — Astro only exposes env vars prefixed with `PUBLIC_` to client-side code via `import.meta.env`.

**Step 2: Create `.env.example`**

Create `.env.example` so other contributors know what's needed:

```
# Google Civic Information API key
# Get one at https://console.cloud.google.com/apis/credentials
# Enable "Google Civic Information API" and restrict key to your domain
PUBLIC_GOOGLE_CIVIC_API_KEY=
```

**Step 3: Verify `.env` is gitignored**

Check that `.gitignore` includes `.env`. If not, add it.

**Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add env var setup for Google Civic API key"
```

---

## Task 2: Create Action Letters Data File

**Files:**
- Create: `src/data/action-letters.json`

**Reference:** Read Letter A and Letter B from the vault note at `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\docs\plans\deflocksc-website.md` (Section "Form Letters"). Read research from `C:\Users\tim\OneDrive\Documents\Tim's Vault\Areas\Activism\DeflockSC Website\Research\Upstate SC.md` and related files for local facts.

**Step 1: Create the data file**

Create `src/data/action-letters.json` with all 11 letter entries. Each entry has:
- `divisionPattern`: OCD division ID substring to match against
- `category`: `"state"` or `"local"`
- `label`: Human-readable group label
- `subject`: Email subject line
- `body`: Full letter text with `[NAME]` placeholder

Letter content guidelines:
- State legislator letter: use Letter A from vault verbatim (~195 words)
- Greenville City Council: use Letter B from vault verbatim (~215 words)
- Other local letters: follow Letter B's structure — open with a concrete local fact, explain Flock data-sharing risk, make specific asks relevant to that body's authority
- All letters under 250 words (longer letters get lower open rates per vault note)
- Use `\n\n` for paragraph breaks in JSON strings

**Local facts by municipality (from vault research):**
- **Greenville County:** 11 cameras via Sheriff's Office, plus 57 city cameras. HOA/SafeWatch expansion. Data goes to SLED (3-year retention).
- **Spartanburg County:** Sheriff Chuck Wright pled guilty to federal charges (conspiracy to commit theft, wire fraud) in May 2025. He oversaw Flock camera deployments — the official with access to location data was a convicted criminal.
- **Spartanburg City:** Regional deployment confirmed. Reference county sheriff case as shared jurisdiction concern.
- **Anderson City/County:** Flock deployment confirmed but camera counts undocumented. Use regional framing (155 cameras across Upstate, no local oversight).
- **Pickens County:** Sheriff's Office + Clemson University Police + Furman University Police all have Flock deployments. Multiple agencies, no coordinated oversight.
- **Laurens County:** Limited local data. Use statewide framing (Legislature has never addressed ALPR data privacy, 200+ cameras installed without permits statewide).
- **Default fallback:** Generic SC local body letter. Reference statewide 155-camera count, Flock data-sharing, ask for local oversight hearing.

**Entry order matters** — more specific patterns must come before less specific ones. The catch-all `"state:sc/"` entry must be last.

**Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/data/action-letters.json', 'utf8')); console.log('Valid JSON')"
```

Expected: `Valid JSON`

**Step 3: Commit**

```bash
git add src/data/action-letters.json
git commit -m "feat: add action letter templates for state and local representatives"
```

---

## Task 3: Build Widget HTML Structure

**Files:**
- Modify: `src/components/TakeAction.astro`

**Step 1: Read the existing component**

Read `src/components/TakeAction.astro` to understand the current structure. The placeholder `<div>` (lines 29-33) will be replaced with the widget HTML.

**Step 2: Replace placeholder with widget HTML**

Replace the placeholder div with the full widget structure. All three states (input, loading, results) are rendered in the HTML with visibility controlled via CSS classes (`hidden`). This follows the existing pattern in `BillTracker.astro`.

The widget container keeps the existing dark card styling (`bg-[#0f172a] border border-[#334155] rounded-lg`) but replaces the centered placeholder text.

**Input state** (`#action-input`):
- Zip code `<input>` (type text, maxlength 5, pattern `[0-9]{5}`, inputmode numeric)
- "Look Up My Reps" `<button>` (red accent, `bg-[#ef4444]`)
- "Use my location instead" `<button>` (text link style, `text-[#3b82f6]`)
- Privacy note `<p>` (small, muted: `text-[#64748b] text-xs`)

**Loading state** (`#action-loading`, initially `hidden`):
- CSS spinner (animated border, `border-[#ef4444]`)
- "Finding your representatives..." text

**Results state** (`#action-results`, initially `hidden`):
- Container div that will be populated dynamically by JS
- "Look up a different zip" reset link at bottom

**Error state** (`#action-error`, initially `hidden`):
- Error message `<p>` (red text)
- "Try again" button

**Step 3: Verify layout in browser**

Start dev server, navigate to `/#take-action`, confirm:
- Input state renders with zip field, button, geolocation link, privacy note
- Other states are hidden
- Styling matches site aesthetic (dark card, red button, blue link)
- Mobile responsive at 375px

**Step 4: Commit**

```bash
git add src/components/TakeAction.astro
git commit -m "feat: add action widget HTML structure with input, loading, results, and error states"
```

---

## Task 4: Wire Up API Integration

**Files:**
- Modify: `src/components/TakeAction.astro` (add `<script>` block)

**Reference:** Google Civic Information API docs: `GET https://www.googleapis.com/civicinfo/v2/representatives?address={zip}&key={key}`. BigDataCloud: `GET https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lng}&localityLanguage=en`.

**Step 1: Import letter data and set up script block**

Add a `<script>` block to `TakeAction.astro`. Use Astro's frontmatter to import the letter data and pass it to the client script via `define:vars`:

```astro
---
import actionLetters from '../data/action-letters.json';
---

<!-- existing HTML -->

<script define:vars={{ actionLetters, civicApiKey: import.meta.env.PUBLIC_GOOGLE_CIVIC_API_KEY }}>
  // Client-side code here
</script>
```

**Step 2: Write the Civic API fetch function**

```javascript
async function lookupReps(zip) {
  const url = `https://www.googleapis.com/civicinfo/v2/representatives?address=${encodeURIComponent(zip)}&key=${civicApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

**Step 3: Write the response parser**

Parse the Civic API response into grouped representatives. The response has `offices[]` (each with `divisionId` and `officialIndices[]`) and `officials[]`. For each office:

1. Get the `divisionId`
2. Find the matching letter entry by checking `divisionId.includes(entry.divisionPattern)` — first match wins
3. Skip entries that don't match any letter (e.g., federal offices)
4. Group matched reps by their letter entry's `label`

```javascript
function parseReps(data) {
  const groups = [];
  const seen = new Set();

  for (const office of data.offices) {
    const divId = office.divisionId;

    // Find matching letter
    const letter = actionLetters.find(l => divId.includes(l.divisionPattern));
    if (!letter) continue;

    // Group by label
    let group = groups.find(g => g.label === letter.label);
    if (!group) {
      group = { label: letter.label, category: letter.category, subject: letter.subject, body: letter.body, reps: [] };
      groups.push(group);
    }

    for (const idx of office.officialIndices) {
      const official = data.officials[idx];
      if (seen.has(official.name)) continue;
      seen.add(official.name);
      group.reps.push({
        name: official.name,
        office: office.name,
        emails: official.emails || [],
        phones: official.phones || []
      });
    }
  }

  // Sort: state groups first, then local
  groups.sort((a, b) => (a.category === 'state' ? 0 : 1) - (b.category === 'state' ? 0 : 1));
  return groups;
}
```

**Step 4: Write the geolocation function**

```javascript
async function getZipFromLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=en`
          );
          const data = await res.json();
          if (data.postcode) resolve(data.postcode);
          else reject(new Error('Could not determine zip code'));
        } catch (e) { reject(e); }
      },
      (err) => reject(err)
    );
  });
}
```

**Step 5: Verify API integration**

Start dev server. Open browser console. Test with a known SC zip code (e.g., `29601` for Greenville). Confirm:
- API returns offices and officials
- Parser groups them correctly
- Division IDs match expected patterns (`sldu:`, `sldl:`, `place:greenville`, etc.)

**Step 6: Commit**

```bash
git add src/components/TakeAction.astro
git commit -m "feat: add Civic API integration and response parsing"
```

---

## Task 5: Wire Up UI Interactions

**Files:**
- Modify: `src/components/TakeAction.astro` (extend `<script>` block)

**Step 1: Write the results renderer**

Function that takes the parsed groups and builds the results HTML. For each group:
- Group header (uppercase label)
- Rep list (name + office)
- Action buttons: individual "Send Email" + "Copy Letter" per rep for state legislators, "Send Email All" + "Copy Letter" for local councils
- Collapsible "Preview & edit letter" with textarea

```javascript
function renderResults(groups) {
  const container = document.getElementById('action-results-list');
  if (!container) return;
  container.innerHTML = '';

  for (const group of groups) {
    const section = document.createElement('div');
    section.className = 'mb-8 last:mb-0';

    // Build group HTML — header, rep list, collapsible letter preview, action buttons
    // Use the same dark styling as the rest of the site
    // State reps: individual buttons per rep
    // Local councils: group send button

    // ... (full implementation in the step)
    container.appendChild(section);
  }
}
```

This function generates:
- Group header: `<h3>` with uppercase text, `text-[#64748b]` color, `text-sm font-bold tracking-wider`
- Rep list: each rep as a flex row with name (white, `font-semibold`), office (`text-[#94a3b8]`), and action buttons
- For state reps: "Send Email" (red button) + "Copy Letter" (gray button) per rep, since there are only 2
- For local councils: "Send Email All" (red button) + "Copy Letter" (gray button) for the group
- Collapsible letter preview: `<details>` element with "Preview & edit letter" summary, containing a `<textarea>` pre-filled with the letter body (with `[NAME]` replaced)
- Textarea styling: `bg-[#0f172a] border border-[#334155] text-[#cbd5e1] rounded p-4 w-full font-mono text-sm`

**Step 2: Write mailto: construction**

```javascript
function buildMailto(emails, subject, body) {
  const to = emails.join(',');
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

For individual state reps: replace `[NAME]` with rep's actual name in the letter body before encoding.

For "Send Email All" on local councils: use "Dear Council Member" greeting (replace `[NAME]` with "Council Member"), put all emails in the `to:` field.

The mailto: link reads the current textarea content (in case the user edited it), not the original template.

**Step 3: Write clipboard fallback**

```javascript
async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => { button.textContent = original; }, 2000);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}
```

Copy button copies: subject line + newline + letter body (reading current textarea value).

**Step 4: Wire up form submit handler**

```javascript
const form = document.getElementById('action-form');
const inputSection = document.getElementById('action-input');
const loadingSection = document.getElementById('action-loading');
const resultsSection = document.getElementById('action-results');
const errorSection = document.getElementById('action-error');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const zip = document.getElementById('action-zip')?.value?.trim();
  if (!zip || zip.length !== 5) return;

  showState('loading');
  try {
    const data = await lookupReps(zip);
    const groups = parseReps(data);
    if (groups.length === 0) throw new Error('No representatives found');
    renderResults(groups);
    showState('results');
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again in a moment.');
  }
});
```

`showState(state)` toggles visibility of the four state containers using `classList.add/remove('hidden')`.

**Step 5: Wire up geolocation handler**

```javascript
const geoBtn = document.getElementById('action-geo');
geoBtn?.addEventListener('click', async () => {
  showState('loading');
  try {
    const zip = await getZipFromLocation();
    // Fill the zip input so user can see what was detected
    const zipInput = document.getElementById('action-zip');
    if (zipInput) zipInput.value = zip;
    const data = await lookupReps(zip);
    const groups = parseReps(data);
    if (groups.length === 0) throw new Error('No representatives found');
    renderResults(groups);
    showState('results');
  } catch (err) {
    if (err.code === 1) { // GeolocationPositionError.PERMISSION_DENIED
      showError('Location access denied. Please enter your zip code instead.');
    } else {
      showError(err.message || 'Something went wrong. Please try again in a moment.');
    }
  }
});
```

**Step 6: Wire up reset handler**

```javascript
const resetBtn = document.getElementById('action-reset');
resetBtn?.addEventListener('click', () => {
  showState('input');
  document.getElementById('action-zip')?.focus();
});
```

**Step 7: Verify full flow in browser**

Start dev server. Test the complete flow:
1. Enter zip `29601` (Greenville) → should show state reps + Greenville City Council + Greenville County Council
2. Enter zip `29301` (Spartanburg) → should show state reps + Spartanburg groups
3. Enter zip `00000` (invalid) → should show error
4. Click "Use my location" → should prompt for permission, then look up reps
5. Click "Send Email" → should open mail client with pre-filled email
6. Click "Copy Letter" → should copy text and show "Copied!" confirmation
7. Edit the textarea, then click "Send Email" → should use the edited text
8. Click "Look up a different zip" → should reset to input state
9. Test at 375px mobile width → all elements fit and are tappable

**Step 8: Commit**

```bash
git add src/components/TakeAction.astro
git commit -m "feat: wire up action widget UI — rep lookup, letter preview, mailto, clipboard"
```

---

## Task 6: Polish and Responsive QA

**Files:**
- Modify: `src/components/TakeAction.astro` (if fixes needed)

**Step 1: Test at mobile (375px)**

Check:
- Zip input and button stack vertically or fit side-by-side
- Rep cards are readable
- Send/Copy buttons are tappable (min 44px touch target)
- Textarea is full-width and scrollable
- Letter preview accordion works on touch

**Step 2: Test at tablet (768px) and desktop (1280px)**

Check:
- Layout uses available width well
- Buttons don't stretch too wide on desktop
- No horizontal overflow

**Step 3: Test keyboard navigation**

Check:
- Tab order flows logically: zip input → submit → geolocation → (after results) rep buttons → textarea → reset
- Enter submits the form
- All interactive elements are focusable and have visible focus styles

**Step 4: Test edge cases**

- Empty zip → form validation prevents submit
- Non-numeric zip → pattern validation prevents submit
- API key missing/invalid → error state shows
- Non-SC zip (e.g., `10001` NYC) → may return federal reps only, no state/local matches → should show helpful message
- Very long rep list → results should scroll within the section

**Step 5: Fix any issues found**

**Step 6: Commit**

```bash
git add src/components/TakeAction.astro
git commit -m "fix: responsive and accessibility polish for action widget"
```

---

## Task 7: Final Verification and Cleanup

**Files:**
- Modify: any files that need cleanup

**Step 1: Run production build**

```bash
node node_modules/astro/astro.js build
```

Expected: clean build, no errors. Verify the API key is inlined in the built JS (check `dist/` output).

**Step 2: Verify in dev-preview**

Open `localhost:4321/dev-preview.html` (side-by-side mobile + desktop). Confirm widget works in both viewports.

**Step 3: Check for console errors**

Open browser dev tools. Navigate through the full flow. Confirm no JS errors or warnings.

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final cleanup for action widget"
```
