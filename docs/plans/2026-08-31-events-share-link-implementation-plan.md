# Events Share / Copy Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Share control to every upcoming event card and to the detail popover, and make the resulting `/events#<id>` permalink actually open that event when a recipient visits it.

**Architecture:** Three pure, unit-tested helpers land in `src/lib/events-view.ts` (`eventShareUrl`, `parseEventIdHash`, `occurrenceById`); all browser behaviour lands in `src/scripts/events-page.ts` (a `shareEvent` action with a native-share → clipboard → honest-failure ladder, plus a deep-link resolver state machine driven from first paint, the overlay merge, and `hashchange`). Card markup changes land on BOTH render paths under the repo's documented class-parity contract (`src/components/EventsList.astro` server render + `buildCard()` client render), and the popover Share button + failure affordance land in `src/components/EventsExplorer.astro`.

**Tech Stack:** Astro 5, TypeScript, Tailwind 4 + daisyUI 5, vitest 4 (node environment — **jsdom is NOT installed**, so DOM behaviour is manual-verify), native `<dialog>`/`showModal()`.

---

## Worker context (read once before Task 1)

- **Design doc (the WHAT):** `C:\Users\tim\workspace\deflocksc-website\docs\plans\2026-08-31-events-share-link-design.md`. This plan implements exactly that design.
- **Branch:** `feature/events-share-link` (already checked out).
- **Commands** (run from `C:\Users\tim\workspace\deflocksc-website`; `npx`/`.bin` shims are flaky on this machine — use these exact forms):
  - Unit tests (one file): `npm test -- src/lib/events-view.test.ts`
  - Full suite: `npm test`  → baseline is **32 files / 775 tests, all passing**.
  - Typecheck: `node node_modules/typescript/bin/tsc --noEmit`  → baseline is **14 pre-existing errors** in `astro.config.mjs`, `src/lib/geo-utils.test.ts`, `src/pages/blog/[...slug]/og.png.ts`, and ONE in `src/scripts/events-page.ts` (TS7016, missing declarations for `accessible-autocomplete`). "Pass" for this plan = still exactly those errors, none mentioning your new code.
  - Build: `npm run build` → must end with Astro's "Complete!" summary, exit 0.
  - Dev server for manual verification: `npm run dev` → http://localhost:4321
- **Class-parity contract:** every card class emitted by `EventsList.astro` must be emitted identically by `buildCard()` in `events-page.ts`, and all card CSS is `<style is:global>` in `EventsExplorer.astro` (runtime-built nodes carry no scoped attribute). Task 3 touches both paths in one commit on purpose.
- **Line numbers** below are accurate against the branch state before Task 1. Later tasks shift them slightly; anchor on the quoted code, not the number.
- **Commit per task.** Do not amend across tasks.

---

## Task 1 — Pure helpers in `events-view.ts` (TDD)

**Type: TDD (pure logic, unit-tested).**

**Files:**
- Modify: `src/lib/events-view.test.ts` (import block lines 2–26; append new describes after line 699)
- Modify: `src/lib/events-view.ts` (append after `emptyStateProof`, line 516)

### Steps

- [ ] **1.1 Write the failing tests.** In `src/lib/events-view.test.ts`, add the three new names to the existing import (after `upcomingFooter,` on line 25, before `} from './events-view.js';`):

```ts
  eventShareUrl,
  parseEventIdHash,
  occurrenceById,
```

Then append at the end of the file (after the `upcomingFooter` describe, line 699):

```ts
describe('eventShareUrl', () => {
  it('builds origin + /events + a hash of the id', () => {
    expect(eventShareUrl('https://deflocksc.org', 'abcd2345')).toBe(
      'https://deflocksc.org/events#abcd2345',
    );
  });

  it('keeps a council id readable (encoding is a no-op for its alphabet)', () => {
    expect(eventShareUrl('https://deflocksc.org', 'council-greenville-county')).toBe(
      'https://deflocksc.org/events#council-greenville-county',
    );
  });

  it('percent-encodes an id carrying URL-hostile characters', () => {
    expect(eventShareUrl('https://deflocksc.org', 'a b&c=d')).toBe(
      'https://deflocksc.org/events#a%20b%26c%3Dd',
    );
  });
});

describe('parseEventIdHash', () => {
  it('returns null for an empty hash', () => {
    expect(parseEventIdHash('')).toBeNull();
    expect(parseEventIdHash('#')).toBeNull();
  });

  it('returns null for any filter hash (contains =)', () => {
    expect(parseEventIdHash('#county=greenville')).toBeNull();
    expect(parseEventIdHash('#type=meetups')).toBeNull();
    expect(parseEventIdHash('#county=greenville&type=meetups')).toBeNull();
  });

  it('returns a bare id, with or without the leading #', () => {
    expect(parseEventIdHash('#abcd2345')).toBe('abcd2345');
    expect(parseEventIdHash('abcd2345')).toBe('abcd2345');
    expect(parseEventIdHash('#council-greenville-county')).toBe('council-greenville-county');
  });

  it('passes reserved in-page anchors through as tokens (id lookup is the real guard)', () => {
    expect(parseEventIdHash('#main-content')).toBe('main-content');
    expect(parseEventIdHash('#event-abcd2345')).toBe('event-abcd2345');
  });

  it('decodes a percent-encoded token', () => {
    expect(parseEventIdHash('#a%20b')).toBe('a b');
  });

  it('returns the raw token when decoding throws (malformed percent-escape)', () => {
    expect(parseEventIdHash('#%')).toBe('%');
    expect(parseEventIdHash('#%zz')).toBe('%zz');
  });
});

describe('occurrenceById', () => {
  const HORIZON = '2027-09-01';
  const TODAY = '2026-08-23';
  // The exact pipeline the deep-link resolver feeds it (design §2): expand,
  // keep upcoming, collapse each series to its next occurrence.
  const upcomingRows = (events: PublicEvent[]) =>
    collapseSeries(splitByToday(expandAll(events, HORIZON), TODAY).upcoming);

  it('finds a one-off event by id at its date', () => {
    const rows = upcomingRows([ev({ id: 'gv2publ', date: '2026-09-04' })]);
    const hit = occurrenceById(rows, 'gv2publ');
    expect(hit?.event.id).toBe('gv2publ');
    expect(hit?.date).toBe('2026-09-04');
  });

  it('resolves a recurring series to its next upcoming occurrence', () => {
    const rows = upcomingRows([
      ev({ id: 'gvweekly', date: '2026-08-04', recurrence: { freq: 'weekly', until: '2026-10-13' } }),
    ]);
    const hit = occurrenceById(rows, 'gvweekly');
    expect(hit?.event.id).toBe('gvweekly');
    // Weekly from Tue 2026-08-04; today is 2026-08-23, so the next one is 08-25.
    expect(hit?.date).toBe('2026-08-25');
  });

  it('returns undefined for a past-only event (excluded by the upcoming split)', () => {
    const rows = upcomingRows([ev({ id: 'pastonce', date: '2026-08-01' })]);
    expect(occurrenceById(rows, 'pastonce')).toBeUndefined();
  });

  it('returns undefined for an unknown id and for an empty list', () => {
    const rows = upcomingRows([ev({ id: 'gv2publ', date: '2026-09-04' })]);
    expect(occurrenceById(rows, 'zzzzzzzz')).toBeUndefined();
    expect(occurrenceById([], 'gv2publ')).toBeUndefined();
  });
});
```

(`ev`, `collapseSeries`, `splitByToday`, `expandAll`, and the `PublicEvent` type are already imported at the top of this test file — do not re-import them.)

- [ ] **1.2 Run the test file — expected FAIL.**

```
npm test -- src/lib/events-view.test.ts
```

Expected: the run FAILS with a module-evaluation error naming a missing export, e.g. `SyntaxError: The requested module './events-view.js' does not provide an export named 'eventShareUrl'` (vitest reports the file as failed). If it passes, stop — you edited the wrong file.

- [ ] **1.3 Implement the three helpers.** Append to `src/lib/events-view.ts` after `emptyStateProof` (end of file, line 516):

```ts
/* ------------------------------------------------------------------------ *
 * Event share links / deep links (design: 2026-08-31-events-share-link)
 *
 * The sanctioned permalink for an event is /events#<id> — the same URL the
 * submit form already generates and copies. These three pure helpers are the
 * unit-tested core of the share button and the deep-link resolver in
 * src/scripts/events-page.ts.
 * ------------------------------------------------------------------------ */

/**
 * The shareable permalink for an event: `${origin}/events#<id>`. The id is
 * encodeURIComponent-escaped; for the real id alphabets ([a-z2-7]{8} submitted,
 * council-<slug> curated) that is a no-op, but a malformed id can never break
 * the URL. The client calls this as eventShareUrl(location.origin, e.id).
 */
export function eventShareUrl(origin: string, id: string): string {
  return `${origin}/events#${encodeURIComponent(id)}`;
}

/**
 * Read a bare event id out of a URL hash, or null when the hash is not an
 * event-id hash. An empty hash and any filter hash (anything containing '=',
 * i.e. #county=…/#type=…) return null; anything else returns the token,
 * decodeURIComponent-d, falling back to the RAW token when decoding throws
 * (#%, #%zz — a crafted link must not throw, mirroring parseFilterHash).
 * Reserved in-page anchors (#main-content, the month chips' #event-<id> hrefs)
 * deliberately parse to a token: the id lookup downstream is the real guard,
 * and those tokens simply match no event.
 */
export function parseEventIdHash(hash: string): string | null {
  const raw = hash.replace(/^#/, '');
  if (raw === '' || raw.includes('=')) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The collapsed occurrence for an event id, or undefined. Callers feed it an
 * already-collapsed upcoming set — collapseSeries(splitByToday(...).upcoming) —
 * so a recurring series resolves to its NEXT upcoming occurrence and a
 * past-only or unknown id resolves to nothing.
 */
export function occurrenceById(
  occurrences: readonly Occurrence[],
  id: string,
): Occurrence | undefined {
  return occurrences.find((o) => o.event.id === id);
}
```

- [ ] **1.4 Run the test file — expected PASS.**

```
npm test -- src/lib/events-view.test.ts
```

Expected: `Test Files  1 passed (1)`, all tests green (the file's prior tests plus the 13 new ones).

- [ ] **1.5 Commit.**

```
git add src/lib/events-view.ts src/lib/events-view.test.ts
git commit -m "feat(events): add share-link pure helpers (eventShareUrl, parseEventIdHash, occurrenceById)"
```

---

## Task 2 — The share action in `events-page.ts` (manual-verify)

**Type: manual-verify (browser APIs — `navigator.share`, clipboard, DOM; no jsdom in this repo).**

**Files:**
- Modify: `src/scripts/events-page.ts`
  - import block from `../lib/events-view.js` (lines 35–59): add `eventShareUrl`
  - after the `escapeHtml` import (line 67): add the `showToast` import
  - after `extLinkIcon()` (ends line 545): add a new `--- Share ---` section

### Steps

- [ ] **2.1 Add the imports.** In the `from '../lib/events-view.js'` import list, add `eventShareUrl,` after `upcomingFooter,`. Then, directly below `import { escapeHtml } from '../lib/escape-html.js';` (line 67), add:

```ts
import { showToast } from './toast.js';
```

- [ ] **2.2 Add the share section.** Insert after the closing brace of `extLinkIcon()` (line 545), before the `WEEKDAYS` constant:

```ts
// --- Share (design: 2026-08-31-events-share-link) ------------------------
// One action for both surfaces (card inline button, popover footer button).
// The URL is built synchronously and navigator.share is the FIRST async call,
// so it runs inside the click's transient activation — some browsers reject
// share() if you await anything first.

/** The share glyph (feather "share-2"): three nodes joined by two lines.
 *  Built via createElementNS, mirroring extLinkIcon — createElement makes
 *  HTML, not SVG, elements. */
function shareIcon(): SVGElement {
  const svg = svgEl('svg', {
    class: 'event-share-icon',
    viewBox: '0 0 24 24',
    width: '14',
    height: '14',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });
  svg.append(
    svgEl('circle', { cx: '18', cy: '5', r: '3' }),
    svgEl('circle', { cx: '6', cy: '12', r: '3' }),
    svgEl('circle', { cx: '18', cy: '19', r: '3' }),
    svgEl('line', { x1: '8.59', y1: '13.51', x2: '15.42', y2: '17.49' }),
    svgEl('line', { x1: '15.41', y1: '6.51', x2: '8.59', y2: '10.49' }),
  );
  return svg;
}

/** Copy `url` to the clipboard. Resolves true on success, false on failure —
 *  never throws and never lies. The same ladder the toolkit copy buttons use:
 *  the async clipboard API first, then the execCommand('copy') textarea
 *  fallback, whose boolean result is honoured rather than assumed. */
async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    // fall through to execCommand
  }
  const ta = document.createElement('textarea');
  ta.value = url;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/** Copy + honest feedback: a toast on success; on failure, the popover's
 *  select-and-copy affordance when the dialog is open, else a toast that says
 *  where to find one. Never a lying "copied" (design §1). */
async function copyWithFeedback(url: string): Promise<void> {
  if (await copyLink(url)) {
    showToast('Link copied');
    return;
  }
  const fallback = document.getElementById('event-detail-copy-fallback');
  const input = document.getElementById('event-detail-copy-url') as HTMLInputElement | null;
  if (detailDialog?.open && fallback && input) {
    input.value = url;
    fallback.hidden = false;
    input.focus();
    input.select();
  } else {
    showToast("Couldn't copy — open the event to copy the link");
  }
}

/** Share an event. navigator.share when available — called synchronously so it
 *  keeps the click's transient activation. AbortError (the visitor cancelled
 *  the OS sheet / no target) stays SILENT: no toast, no copy. Any other
 *  rejection (NotAllowedError, TypeError, …) falls through to the copy ladder.
 *  Payload is title + url only — no address, organizer, or type (design §1). */
function shareEvent(e: PublicEvent): void {
  const url = eventShareUrl(location.origin, e.id);
  if (typeof navigator.share === 'function') {
    navigator.share({ title: e.title, url }).catch((err: unknown) => {
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      void copyWithFeedback(url);
    });
    return;
  }
  void copyWithFeedback(url);
}
```

(Note: `copyWithFeedback` references `#event-detail-copy-fallback`, which does not exist until Task 4 — the null check makes it degrade to the toast branch in the meantime. `detailDialog` and `svgEl` are declared earlier in the module, lines 512–522.)

- [ ] **2.3 Typecheck — expected no NEW errors.**

```
node node_modules/typescript/bin/tsc --noEmit
```

Expected: exactly the 14 baseline errors (see Worker context). `shareIcon` is not referenced yet — if tsc reports an unused-symbol error for it, it will not (this config does not flag unused locals); any NEW error naming your added lines means a real mistake.

- [ ] **2.4 Build — expected pass.**

```
npm run build
```

Expected: exits 0, ends with the Astro completion summary. (`shareEvent`/`shareIcon` are as-yet-unused module-level functions; bundlers keep them without complaint.)

- [ ] **2.5 Commit.**

```
git add src/scripts/events-page.ts
git commit -m "feat(events): shareEvent action - native share first, clipboard fallback, honest failure"
```

---

## Task 3 — Inline Share button on cards, both render paths (manual-verify)

**Type: manual-verify (DOM rendering + delegated click handling).**

**Files:**
- Modify: `src/components/EventsList.astro` (the upcoming-card `<li>`, lines 37–66)
- Modify: `src/scripts/events-page.ts` — `buildCard()` (lines 414–472) and the `#events-list` delegated handler (lines 732–741)

### Steps

- [ ] **3.1 Server render.** In `src/components/EventsList.astro`, make two changes to the upcoming `<li>`:

(a) add `id={o.event.id}` as the first attribute of the `<li>` (line 38 — list cards only; month chips keep `data-event-id` + `#event-<id>` hrefs, so there is no duplicate-id collision, and the real id gives baked links a native fragment target with JS off):

```astro
      <li
        id={o.event.id}
        class={`event-card event-card--${eventTypeSlug(o.event.type)}`}
        data-event-id={o.event.id}
        data-date={o.date}
        data-sort={sortKey(o.date, o.event.time, o.event.id)}
      >
```

(b) replace the bare type line (lines 57–64, the comment plus the `<p class="event-typeline">`) with a flex actions row. The full replacement:

```astro
          {/* Quiet type/recurrence line + inline Share, one flex row. MUST stay
              in class-parity with buildCard() in events-page.ts: a
              <div class="event-actions"> holding the <p class="event-typeline">
              (type label, " · Repeats …" appended for a collapsed series) and a
              .event-share-inline button (neutral grey, ~44px target). The Signal
              join lives only in the detail popover, never here. */}
          <div class="event-actions">
            <p class="event-typeline">
              {eventTypeLabel(o.event.type)}{recurrenceLabel(o.event.recurrence) ? ` · ${recurrenceLabel(o.event.recurrence)}` : ''}
            </p>
            <button type="button" class="event-share-inline" aria-label={`Share ${o.event.title}`}>
              <svg class="event-share-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
              Share
            </button>
          </div>
```

- [ ] **3.2 Client render (class-parity).** In `buildCard()` in `src/scripts/events-page.ts`:

(a) after `li.className = ...` (line 423), add the real id:

```ts
  // Real id, mirroring EventsList.astro: gives a shared /events#<id> link a
  // native fragment target. List cards only — month chips keep data-event-id.
  li.id = e.id;
```

(b) replace the type-line block (lines 462–468, the comment plus the `body.append(el('p', 'event-typeline', ...))` statement) with:

```ts
  // Quiet type/recurrence line + inline Share, one flex row. Mirrors
  // EventsList.astro's <div class="event-actions"> exactly (the class-parity
  // contract): the .event-typeline text, then a .event-share-inline button
  // (neutral grey, ~44px target, aria-label carries the title). The delegated
  // #events-list handler owns the click, so no per-card listener is attached.
  const repeat = recurrenceLabel(e.recurrence);
  const typeLabel = eventTypeLabel(e.type);
  const actions = el('div', 'event-actions');
  actions.append(el('p', 'event-typeline', repeat ? `${typeLabel} · ${repeat}` : typeLabel));
  const share = el('button', 'event-share-inline') as HTMLButtonElement;
  share.type = 'button';
  share.setAttribute('aria-label', `Share ${e.title}`);
  share.append(shareIcon(), document.createTextNode('Share'));
  actions.append(share);
  body.append(actions);
```

- [ ] **3.3 Delegated handler.** Replace the `#events-list` click handler (lines 732–741) with a version that checks the share branch FIRST (design §4):

```ts
// Sidebar cards: delegated on the stable #events-list <ul> so it covers both the
// server-rendered cards and the ones buildCard() inserts later, without either
// renderer wiring a per-card listener. The share branch is checked before the
// title branch; the title button opens the popover.
document.getElementById('events-list')?.addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement;
  const shareBtn = target.closest<HTMLElement>('.event-share-inline');
  if (shareBtn) {
    const card = shareBtn.closest<HTMLElement>('[data-event-id]');
    const event = allEvents.find((candidate) => candidate.id === card?.dataset.eventId);
    if (event) shareEvent(event);
    return;
  }
  const btn = target.closest<HTMLElement>('.event-title-btn');
  if (!btn) return;
  const card = btn.closest<HTMLElement>('[data-event-id]');
  const id = card?.dataset.eventId;
  const date = card?.dataset.date;
  if (!id || !date) return;
  const event = allEvents.find((candidate) => candidate.id === id);
  if (event) openEventPopover({ event, date }, btn);
});
```

- [ ] **3.4 Typecheck — expected no NEW errors.**

```
node node_modules/typescript/bin/tsc --noEmit
```

Expected: exactly the 14 baseline errors.

- [ ] **3.5 Build — expected pass.**

```
npm run build
```

Expected: exits 0.

- [ ] **3.6 Manual verification.** `npm run dev`, open http://localhost:4321/events in a desktop browser:
  - Every upcoming card shows a "Share" control on the type-line row (unstyled/rough is fine — CSS lands in Task 6). Clicking it shows the "Link copied" toast (or the OS share sheet if the browser has `navigator.share`); pasting yields `http://localhost:4321/events#<that card's id>`.
  - Clicking the card TITLE still opens the detail popover (share branch must not swallow title clicks).
  - View source (or inspect): each `<li class="event-card ...">` carries `id="<event id>"`.
  - Open http://localhost:4321/ (homepage preview): the capped cards show the same Share control and it copies the same `/events#<id>` URL.

- [ ] **3.7 Commit.**

```
git add src/components/EventsList.astro src/scripts/events-page.ts
git commit -m "feat(events): inline Share button on event cards (both render paths)"
```

---

## Task 4 — Popover Share button + copy-failure affordance (manual-verify)

**Type: manual-verify (dialog DOM).**

**Files:**
- Modify: `src/components/EventsExplorer.astro` — the dialog footer `.modal-action` (lines 233–240) and the markup just above it
- Modify: `src/scripts/events-page.ts` — `popoverInvoker` region (line 515), `openEventPopover` (lines 574–706), the static listener region after the council-signal listener (line 725)

### Steps

- [ ] **4.1 Popover markup.** In `src/components/EventsExplorer.astro`, insert the failure affordance directly BEFORE the `<div class="modal-action event-pop-foot">` (line 233):

```astro
      {/* Honest copy-failure affordance (design §1): revealed by events-page.ts
          only when BOTH clipboard paths fail while this popover is open. The
          readonly input arrives pre-filled and pre-selected. Hidden on every
          openEventPopover fill. */}
      <p class="event-pop-copy-fallback" id="event-detail-copy-fallback" hidden>
        <label class="event-pop-copy-label" for="event-detail-copy-url">Copy failed — select and copy this link:</label>
        <input class="event-pop-copy-url" id="event-detail-copy-url" type="text" readonly />
      </p>
```

Then add the Share button inside `.modal-action`, between the Close form and the Signal CTA (after line 234's `</form>`; brand red stays reserved for the Signal CTA, so this is `btn-neutral`):

```astro
        <button type="button" class="btn btn-neutral btn-sm" id="event-detail-share">
          <svg class="event-share-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
          Share
        </button>
```

Do NOT touch the backdrop form (lines 242–244) — backdrop click / Esc / Close behaviour is a preserved requirement.

- [ ] **4.2 Store the current event.** In `src/scripts/events-page.ts`, directly under `let popoverInvoker: HTMLElement | null = null;` (line 515), add:

```ts
/** The event the detail dialog is currently showing. Read by the footer Share
 *  button's static listener and by the deep-link resolver's already-open check. */
let popoverEvent: PublicEvent | null = null;
```

- [ ] **4.3 Fill-time wiring.** In `openEventPopover`, directly after `const meetup = e.type === 'meetup';` (line 577), add:

```ts
  popoverEvent = e;

  // A stale copy-failure affordance must never survive into the next event.
  const copyFallback = document.getElementById('event-detail-copy-fallback');
  if (copyFallback) copyFallback.hidden = true;
```

- [ ] **4.4 Static Share listener.** After the council-signal click listener (its closing `});` on line 725), add:

```ts
// Popover footer Share button: one static listener, reading whichever event the
// dialog currently shows. shareEvent handles native share vs copy vs the honest
// failure affordance (which lives in this same dialog).
document.getElementById('event-detail-share')?.addEventListener('click', () => {
  if (popoverEvent) shareEvent(popoverEvent);
});
```

- [ ] **4.5 Typecheck + build.**

```
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Expected: 14 baseline tsc errors, build exits 0.

- [ ] **4.6 Manual verification.** `npm run dev` → http://localhost:4321/events:
  - Open any event's popover → the footer shows Close · Share · (Signal CTA when present). Click Share → "Link copied" toast (dialog stays open); paste → correct `/events#<id>`.
  - Forced failure: in DevTools console run `Object.defineProperty(navigator, 'clipboard', { value: undefined })` and `document.execCommand = () => false`, then click the popover Share → NO "Link copied" toast; the "Copy failed — select and copy this link:" row appears with the URL selected. Open a DIFFERENT event's popover → the affordance is hidden again.
  - Backdrop click, Esc, and the Close button all still close the dialog.

- [ ] **4.7 Commit.**

```
git add src/components/EventsExplorer.astro src/scripts/events-page.ts
git commit -m "feat(events): Share button and copy-failure affordance in the detail popover"
```

---

## Task 5 — Deep-link resolver (manual-verify)

**Type: manual-verify (hash routing + dialog state machine).**

**Files:**
- Modify: `src/scripts/events-page.ts`
  - import block from `../lib/events-view.js`: add `parseEventIdHash`, `occurrenceById`
  - dialog `close` handler (lines 711–715)
  - after `hashHasFilterKey` (ends line 1180): new deep-link section
  - `hashchange` handler (lines 1188–1192): replace
  - first-paint bootstrap (lines 1199–1204): add the first resolve call
  - `loadOverlay` (lines 1206–1219): settle + pending resolution

### Steps

- [ ] **5.1 Imports.** In the `from '../lib/events-view.js'` list, add `parseEventIdHash,` and `occurrenceById,` (alongside `eventShareUrl` from Task 2).

- [ ] **5.2 Deep-link state + resolver.** Insert after the closing brace of `hashHasFilterKey` (line 1180), before the `hashchange` listener:

```ts
// --- Event deep links (design: 2026-08-31-events-share-link §3) -----------
// A bare #<id> hash resolves to that event's popover. Invariants: re-parse the
// LIVE hash before every resolution (never trust a remembered id); never call
// showModal() on an open dialog (it throws) — defer to its close event instead;
// best-effort scroll only (a card can legitimately be absent: filtered out,
// behind the homepage cap, overlay not merged yet) and NEVER clear a filter to
// manufacture one. Closing leaves #<id> in the URL on purpose: close adds no
// history entry, so Back leaves the page normally and reload re-opens,
// consistent with the URL.

/** A deep-linked id that was not resolvable when seen, kept only until the
 *  overlay merge settles (it may deliver the event). */
let pendingDeepLinkId: string | null = null;
/** True once loadOverlay() finished (success OR failure): an id that still
 *  matches nothing stops being pending. */
let overlaySettled = false;
/** True while the open dialog was opened BY this resolver, so a hash change
 *  away from it closes it (hash-away close). User-opened dialogs never close
 *  on hash changes. */
let deepLinkOwned = false;
/** A resolution arrived while the dialog was open; run the resolver again from
 *  the dialog's close event. */
let deferredResolve = false;

/** Resolve the CURRENT location.hash as an event deep link: select the List
 *  tab, best-effort scroll the card into view, open the popover. A hash that
 *  is empty, a filter hash, or an id matching no upcoming event resolves to
 *  nothing (and is remembered as pending while the overlay might still
 *  deliver it). */
function resolveDeepLink(): void {
  const id = parseEventIdHash(location.hash);
  if (id === null) {
    pendingDeepLinkId = null;
    return;
  }

  const occurrence = occurrenceById(collapseSeries(upcomingFor(allEvents)), id);
  if (!occurrence) {
    // Unknown (yet): pending only while the overlay might still deliver it.
    // #main-content, #event-<id> month anchors, and past-only ids land here
    // and stay a graceful no-op.
    pendingDeepLinkId = overlaySettled ? null : id;
    return;
  }
  pendingDeepLinkId = null;

  if (detailDialog?.open) {
    // showModal() throws on an open dialog. Re-resolving the id the dialog
    // already shows is a no-op; any other id waits for the close event, whose
    // handler re-runs this resolver against the then-live hash.
    if (popoverEvent?.id !== id) deferredResolve = true;
    return;
  }

  selectTab('list');
  const card = document
    .getElementById('events-list')
    ?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(id)}"]`);
  // Close returns focus to the card's title button when a card exists, else to
  // the List tab. No flash on this path — it would sit behind the modal.
  const invoker =
    card?.querySelector<HTMLElement>('.event-title-btn') ??
    document.getElementById('tab-list');
  card?.scrollIntoView({ block: 'center' });
  openEventPopover(occurrence, invoker);
  deepLinkOwned = true;
}
```

(`upcomingFor` is the module-local helper at line 102; `collapseSeries` is already imported; `popoverEvent` came from Task 4. `resolveDeepLink` is a hoisted function declaration, so the Task 5.3 close handler — which appears earlier in the file — may call it.)

- [ ] **5.3 Close handler.** Replace the dialog `close` handler (lines 711–715) with:

```ts
// showModal() already traps focus and closes on Esc; the method="dialog" forms
// handle the ✕, Close, and backdrop-click. All routes fire 'close', so returning
// focus to the invoking control lives in one place here. A deep link that
// arrived while the dialog was open was deferred (showModal throws on an open
// dialog); the dialog is closed now, so resolve it against the live hash.
detailDialog?.addEventListener('close', () => {
  const invoker = popoverInvoker;
  popoverInvoker = null;
  deepLinkOwned = false;
  if (invoker && invoker.isConnected) invoker.focus();
  if (deferredResolve) {
    deferredResolve = false;
    resolveDeepLink();
  }
});
```

- [ ] **5.4 hashchange.** Replace the `hashchange` listener (lines 1188–1192) with:

```ts
// Back, forward, and any manual edit of the hash are hash changes; the pushState
// in pushHash deliberately is not, so this fires once per user navigation and
// never doubles a re-render. An empty hash clears the filter; a hash with a
// recognised filter key applies it; any OTHER token routes to the deep-link
// resolver, where an unknown one (the skip link's #main-content, a month
// anchor) is a graceful no-op that never wipes the county/type selection.
window.addEventListener('hashchange', () => {
  if (location.hash.replace(/^#/, '') === '' || hashHasFilterKey(location.hash)) {
    pendingDeepLinkId = null;
    // Hash-away close: leaving a deep-link-opened dialog's id closes it.
    if (deepLinkOwned && detailDialog?.open) detailDialog.close();
    applyFilter(parseFilterHash(location.hash));
    return;
  }
  const id = parseEventIdHash(location.hash);
  if (deepLinkOwned && detailDialog?.open && popoverEvent?.id !== id) {
    // The hash moved away from a deep-link-opened dialog: close it, and let
    // its close handler run the deferred resolve against the new hash.
    deferredResolve = true;
    detailDialog.close();
    return;
  }
  resolveDeepLink();
});
```

- [ ] **5.5 First paint.** After the bootstrap block (the `buildFilters(); if (...) { syncChrome(); } else { applyFilter(filter); }` statements ending line 1204), add:

```ts
// First paint: resolve any #<id> already in the URL against the baked set.
// Baked list cards carry a real id, so the browser's native fragment scroll
// already landed; this adds the tab select + popover open.
resolveDeepLink();
```

- [ ] **5.6 Overlay settle.** Replace `loadOverlay` (lines 1206–1219) with:

```ts
async function loadOverlay() {
  try {
    const res = await fetch('/api/events', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`/api/events: ${res.status}`);
    // The endpoint returns { events: PublicEvent[] } (netlify/functions/events.ts).
    // parseOverlayEnvelope returns that array, or null for any non-envelope body;
    // mergeEvents(baked, null) then renders the baked set unchanged.
    const overlay = parseOverlayEnvelope(await res.json());
    applyMerge(mergeEvents(island.events, overlay));
    overlaySettled = true;
    // A deep link naming an overlay-only id was left pending by the first-paint
    // resolve; the merged set may resolve it now. Re-resolve ONLY when that
    // pending id is still what the live hash names — never re-open a popover
    // the visitor already closed.
    if (pendingDeepLinkId !== null && parseEventIdHash(location.hash) === pendingDeepLinkId) {
      resolveDeepLink();
    } else {
      pendingDeepLinkId = null;
    }
  } catch (err) {
    // Fail soft: the baked page stays exactly as rendered, and the overlay is
    // settled either way — an unresolved deep link stops being pending.
    console.warn('events: overlay unavailable, showing baked events only', err);
    overlaySettled = true;
    pendingDeepLinkId = null;
  }
}
```

- [ ] **5.7 Typecheck + build.**

```
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Expected: 14 baseline tsc errors, build exits 0.

- [ ] **5.8 Manual verification.** `npm run dev`:
  - Copy a real event id from `src/data/events.json` (or a `council-<slug>` id from the rendered page). Load `http://localhost:4321/events#<id>` fresh → List tab selected, card scrolled into view, popover open on that event.
  - Close the popover → the hash stays `#<id>`, focus returns to that card's title button, nothing re-opens (wait a few seconds so the overlay merge lands after your close — it must NOT re-open the dialog).
  - With /events open and no dialog, edit the address bar hash to another id → that popover opens. Edit it to `#county=greenville` while the deep-link popover is open → the popover closes and the filter applies.
  - While one popover is open via deep link, edit the hash to a second id → the first closes and the second opens.
  - Load `/events#zzzzzzz9` (unknown id) → no popover, no filter change, no console error.
  - Load `/events#main-content` → no popover, page behaves as before.

- [ ] **5.9 Commit.**

```
git add src/scripts/events-page.ts
git commit -m "feat(events): resolve /events#<id> deep links to the event popover"
```

---

## Task 6 — CSS for the share controls and failure affordance (manual-verify)

**Type: manual-verify (visual).**

**Files:**
- Modify: `src/components/EventsExplorer.astro` `<style is:global>` — after `.event-title-btn:focus-visible` (line 657) for the card rules; after `.event-pop-foot` / `#event-detail-signal[hidden]` (lines 723–724) for the popover rules

### Steps

- [ ] **6.1 Card share row.** Insert after the `.event-title-btn:focus-visible` rule (line 657):

```css
  /* --- Card actions row: type line + inline Share ---
     One flex row (space-between) wrapping the quiet type line and the Share
     button. The wrapper takes over the top margin the bare typeline used to
     carry inside a card; this rule is AFTER ".event-card .event-typeline"
     above, so the equal-specificity zeroing below wins by order. */
  .event-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .event-card .event-actions { margin: 0.6rem 0 0; }
  .event-actions .event-typeline { margin: 0; }

  /* Neutral grey Share trigger — the type COLOUR stays on the label, never on
     this control. The row reads as an 11px type line; the ~44px tap target
     comes from min-height/min-width whose vertical overhang is absorbed by the
     negative margin, so the card does not grow ~30px. flex-shrink:0 stops a
     long type line crushing it. */
  .event-share-inline {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
    flex-shrink: 0;
    min-height: 44px;
    min-width: 44px;
    margin: -15px 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: #a3a3a3;
    font-family: 'Instrument Sans Variable', sans-serif;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    cursor: pointer;
  }
  .event-share-inline:hover { color: #ffffff; }
  .event-share-inline:focus-visible { outline: 2px solid #fbbf24; outline-offset: -2px; }
  .event-share-icon { flex: none; }
```

- [ ] **6.2 Popover failure affordance.** Insert after `#event-detail-signal[hidden] { display: none; }` (line 724):

```css
  /* --- Copy-failure affordance ---
     Revealed only when BOTH clipboard paths fail while the popover is open
     (design §1: honest failure, never a lying toast). The readonly input
     arrives pre-filled and pre-selected by events-page.ts. */
  .event-pop-copy-fallback { margin: 1rem 0 0; }
  .event-pop-copy-fallback[hidden] { display: none; }
  .event-pop-copy-label { display: block; color: #a3a3a3; font-size: 0.8125rem; margin: 0 0 0.35rem; }
  .event-pop-copy-url {
    width: 100%;
    background: #0d0d0d;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #e8e8e8;
    font-family: inherit;
    font-size: 0.8125rem;
    padding: 0.45rem 0.55rem;
  }
  .event-pop-copy-url:focus-visible { outline: 2px solid #fbbf24; outline-offset: -2px; }
```

- [ ] **6.3 Build — expected pass.**

```
npm run build
```

Expected: exits 0.

- [ ] **6.4 Manual verification.** `npm run dev`:
  - /events list: the type line and Share sit on one row, Share right-aligned, grey (NOT the type colour — check against an amber meetup and a green public card), turning white on hover, amber inset focus ring on keyboard focus. Card height is visually unchanged versus a card without the button being hovered (the negative-margin trick) — if the row visibly inflates the card, tune `margin: -15px 0` until it does not.
  - DevTools → inspect a Share button → its hit box is ≥ 44px tall.
  - Homepage preview cards: same row, not crowding the compact card (the design allows revisiting only if this looks crowded — note it in the PR if so, do not redesign).
  - Popover: trigger the forced copy failure from Task 4.6 → the affordance renders as a labelled dark input, full width, selected text.

- [ ] **6.5 Commit.**

```
git add src/components/EventsExplorer.astro
git commit -m "style(events): share-control and copy-fallback CSS"
```

---

## Task 7 — Full verification + manual acceptance matrix

**Type: verification (no new code unless a check fails; fix-forward and commit any fix separately).**

**Files:** none (verification only).

### Steps

- [ ] **7.1 Full unit suite.**

```
npm test
```

Expected: **32 files passed, 788 tests passed** (775 baseline + 13 from Task 1), 0 failures.

- [ ] **7.2 Typecheck.**

```
node node_modules/typescript/bin/tsc --noEmit
```

Expected: exactly the 14 baseline errors; none in files this plan touched except the pre-existing `accessible-autocomplete` TS7016 in `events-page.ts`.

- [ ] **7.3 Build.**

```
npm run build
```

Expected: exits 0.

- [ ] **7.4 Manual acceptance matrix** (from the design's Testing section; run against `npm run dev`, using a real baked id and — where possible — a freshly submitted overlay-only event via /events/submit):

  - [ ] **Native share (mobile or DevTools device emulation with `navigator.share` available):** card Share and popover Share open the OS sheet with title + URL only; completing shows NO toast.
  - [ ] **Native share cancel = silent:** dismiss the OS sheet → no toast, no copy, no console error.
  - [ ] **Desktop copy + toast:** no `navigator.share` → click Share → "Link copied" toast; clipboard holds `http://localhost:4321/events#<id>`.
  - [ ] **Forced copy failure = honest affordance:** with clipboard + execCommand disabled (Task 4.6 recipe), popover Share reveals the select-and-copy input (URL selected); a CARD Share with no popover open shows the "Couldn't copy — open the event to copy the link" toast instead. Never a false "Link copied".
  - [ ] **Baked deep-link on load:** `/events#<baked id>` → List tab, card scrolled, popover open.
  - [ ] **Overlay-only deep-link (pending → resolve after merge):** load `/events#<overlay-only id>` → nothing at first paint, popover opens when the overlay merge lands.
  - [ ] **Unknown / past id:** `/events#zzzzzzz9` and a past-only event's id → no popover, no filter change, no error.
  - [ ] **Deep-link while another popover is open (defer):** open any popover from a card, edit the hash to a different id → nothing happens until you close; on close, the deep-linked popover opens.
  - [ ] **hashchange to a bare id:** with /events already loaded, editing the hash to `#<id>` opens that popover.
  - [ ] **Hash-away close:** with a DEEP-LINK-opened popover showing, change the hash to `#county=greenville` (or another id) → that popover closes (and the filter applies / the other popover opens).
  - [ ] **Backdrop click closes:** clicking outside the popover still closes it (preserved requirement).
  - [ ] **JS disabled:** disable JavaScript (DevTools → Ctrl+Shift+P → "Disable JavaScript"), load `/events#<baked id>` → the browser natively scrolls to that card.
  - [ ] **Filter + deep link never fight:** apply `#type=meetups`, then navigate to a council event's id → the popover opens, the type filter is NOT cleared, and the (absent) card is simply not scrolled to.

- [ ] **7.5 Wrap up.** All boxes above checked → the branch is ready for review/PR (per repo flow; the orchestrator handles merge). If any manual row failed, fix on this branch with its own commit (`fix(events): …`) and re-run the affected rows.

---

## Self-review notes (spec coverage)

Design § → task map: §1 share action → Task 2 (+4.4 wiring); §2 pure helpers → Task 1; §3 resolver invariants and all three call moments → Task 5 (first paint 5.5, overlay 5.6, hashchange 5.4; showModal guard + defer 5.2/5.3; hash-away close 5.4; best-effort scroll + never-clear-filter 5.2); §4 card changes both paths + delegated share-first branch → Task 3; §5 popover button, `popoverEvent`, static listener, failure affordance, preserved backdrop close → Task 4; CSS → Task 6; Testing section → Tasks 1 and 7. Non-goals honored: no past-row controls, no new routes, no history manipulation, no analytics.
