# Events Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an events calendar where vetted organizers self-publish meetups and public events, visitors browse them by date and by county, and the meeting place for a vetted meetup is never published on the site.

**Architecture:** Submissions POST to a Netlify Function that validates, rate-limits, and verifies a per-organizer code, then writes to Netlify Blobs. The `/events` page renders baked JSON committed to the repo and merges a live overlay fetched from `/api/events`, so a submission appears immediately without triggering a deploy. A weekly scheduled function folds the store back into `src/data/events.json`, keeping deploys at a fixed ~4.3/month regardless of volume. Signal invite links never appear in the page or in git: they resolve through a `/go/:eventId` function that refuses past, tombstoned, and revoked events.

**Tech Stack:** Astro 5 (static), TypeScript, Vitest, Netlify Functions + Netlify Blobs, Zod, MapLibre GL JS, Python + Shapely for the build-time geo scripts.

**Design doc:** `docs/plans/2026-08-17-events-calendar-design.md`. Every task traces to a section there; where this plan and the design disagree, the design wins and the plan is wrong.

---

## Before you start

- Read the design doc's section 16.1 (attack surface inventory) first. Several tasks exist only to close a specific vector, and the tests that look paranoid are the point.
- This repo runs a **30-day minimum package release age** policy. Tasks that add a dependency pin an exact version and explain the cutoff. If the gate hook blocks an install, stop and report the package it named. Do not pass a bypass flag.
- Two Unicode code points, U+2028 and U+2029, must **never** be typed as literal characters anywhere in this codebase. Write them only as backslash-u escapes. A literal U+2028 inside a regex literal is a `SyntaxError`, and literal copies degrade to spaces when moved through editors and clipboards. Task 6 exists partly to enforce this.
- Tasks 1-7 are pure modules with no infrastructure dependency. Their code has been executed against this repo's vitest: **169 tests, all passing**. If a test in tasks 1-7 fails for you, you have mistyped something, not found a design flaw.

---

## File structure

Files this plan creates or modifies, and what each is responsible for.

### Shared library (`src/lib/`) — pure, no I/O, unit-tested

| File | Responsibility |
|---|---|
| `text-result.ts` | `Ok`/`Err` result vocabulary every validator returns |
| `sanitize-text.ts` | Byte cap, NFKC, grapheme cap, reject-list, script restriction. Owns `TITLE_LIMITS` / `DESCRIPTION_LIMITS` / `ADDRESS_LIMITS` |
| `signal-url.ts` | `signal.group` URL allowlist, fragment preserved |
| `organizer-code.ts` | Code normalization, HMAC digest, generation |
| `jurisdictions.ts` | City allowlist and city-to-county derivation from `registry.json` |
| `json-island.ts` | Safe JSON embedding for `<script type="application/json">` |
| `public-event.ts` | `toPublicEvent()` allowlist projection — the single highest-consequence rule in the design |
| `recurrence.ts` | Occurrence expansion for weekly and monthly-Nth-weekday |
| `event-schema.ts` | Zod submission schema composing all of the above |
| `blob-stores.ts` | The only place Blobs handles are created; refuses writes outside production |
| `rate-limit.ts` | Blobs token bucket with optimistic concurrency, fails open |

### Serverless (`netlify/functions/`)

| File | Responsibility |
|---|---|
| `submit-event.ts` | The only unauthenticated write path. Body cap, rate limit, validate, verify code |
| `events.ts` | `/api/events` overlay read. Projects every record through `toPublicEvent` |
| `go.ts` | `/go/:eventId` invite resolution. Identical refusals, no reflection |
| `fold-events.ts` | Weekly scheduled fold to `src/data/events.json` via the GitHub contents API |

### Scripts, pages, config

| File | Responsibility |
|---|---|
| `scripts/organizer-codes.ts` | Issue, revoke, list codes. Bundled by esbuild, run locally |
| `scripts/build-city-centroids.py` | Geocodes allowlisted places once into `src/data/city-centroids.json` |
| `src/pages/events.astro` | The calendar page: list, month grid, map |
| `src/pages/events/submit.astro` | The submission form |
| `src/components/Events*.astro` | List, month, map components |
| `src/scripts/events-map.ts` | MapLibre factory extracted from the single-instance `camera-map.ts` |
| `public/_headers`, `netlify.toml` | CSP additions, immutable asset caching, dev proxies |

---

### Task 1: Result helpers (`text-result.ts`)

**Files:**
- Create: `src/lib/text-result.ts`
- Test: `src/lib/text-result.test.ts`

Every validator in this feature returns a `Result` instead of throwing, so callers can compose validation steps without exception control flow. This module is the shared vocabulary those validators speak. It ships first so every later task can `import { ok, err } from './text-result.js'` without a forward reference.

- [ ] **Step 1: Write the failing test**

Create `src/lib/text-result.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ok, err } from './text-result.js';
import type { Ok, Err } from './text-result.js';

describe('ok', () => {
  it('wraps a value in a success result', () => {
    expect(ok('greenville')).toEqual({ ok: true, value: 'greenville' });
  });

  it('preserves falsy values rather than treating them as failure', () => {
    expect(ok('')).toEqual({ ok: true, value: '' });
    expect(ok(0)).toEqual({ ok: true, value: 0 });
    expect(ok(null)).toEqual({ ok: true, value: null });
  });

  it('returns a fresh object on every call', () => {
    const a = ok('one');
    const b = ok('two');
    expect(a).not.toBe(b);
    expect(a.value).toBe('one');
    expect(b.value).toBe('two');
  });
});

describe('err', () => {
  it('wraps a code in a failure result', () => {
    expect(err('too_many_bytes')).toEqual({ ok: false, code: 'too_many_bytes' });
  });
});

describe('discriminating on the ok flag', () => {
  // The whole point of the shape: callers branch on `.ok` and TypeScript
  // narrows to the right member without a cast.
  function describeResult(result: Ok<number> | Err<'boom'>): string {
    if (result.ok) {
      return `value:${result.value}`;
    }
    return `code:${result.code}`;
  }

  it('narrows to the success member', () => {
    expect(describeResult(ok(42))).toBe('value:42');
  });

  it('narrows to the failure member', () => {
    expect(describeResult(err('boom'))).toBe('code:boom');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/text-result.test.ts`

Expected: FAIL — the module does not exist yet, so vitest cannot resolve the import and reports a collection error rather than assertion failures:

```
Error: Failed to load url ./text-result.js (resolved id: ./text-result.js)
in src/lib/text-result.test.ts.
Does the file exist?
```

- [ ] **Step 3: Implement**

Create `src/lib/text-result.ts`:

```typescript
/**
 * Result type shared by every validator in the events calendar.
 *
 * Validators return a Result instead of throwing so callers can run several
 * checks in a row and branch on `.ok` without exception control flow. The
 * failure member carries a machine-readable `code` (never a display string) so
 * the caller decides the wording.
 */

export type Ok<T> = { ok: true; value: T };

export type Err<C extends string> = { ok: false; code: C };

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <C extends string>(code: C): Err<C> => ({ ok: false, code });
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/text-result.test.ts`

Expected: PASS — 6 tests across 3 describe blocks, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/text-result.ts src/lib/text-result.test.ts
git commit -m "feat(events): add Ok/Err result helpers for event validators"
```

---

---

---

### Task 2: Text sanitizer

**Files:**
- Create: `src/lib/sanitize-text.ts`
- Test: `src/lib/sanitize-text.test.ts`

Depends on Task 1 (`src/lib/text-result.ts`) already existing.

- [ ] **Step 1: Write the failing test**

Every hostile character below is written as a `\u` escape on purpose. A literal U+200B or U+0007 does not survive a copy-paste through a terminal or an editor, and a test that silently loses its payload passes without testing anything.

The three cap pairs are imported, not redeclared. `sanitize-text.ts` owns them, every later task imports the same constants, and the `exported caps` describe block below pins their exact values so a silent edit to a cap fails a test instead of quietly widening a limit.

```typescript
import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  dedupeKey,
  TITLE_LIMITS,
  DESCRIPTION_LIMITS,
  ADDRESS_LIMITS,
  type SanitizeOptions,
} from './sanitize-text.js';

// The caps live in sanitize-text.ts and are imported here, never redeclared:
// the sanitizer enforces whatever it is handed, so a test-local copy of a cap
// would drift from the real one invisibly. Every hostile character in this file
// is written as a \u escape on purpose: a literal invisible character does not
// survive a copy-paste, and a test that silently loses its payload passes.

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemeCount = (s: string) => [...segmenter.segment(s)].length;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

function expectErr(result: ReturnType<typeof sanitizeText>, code: string) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a rejection, got success');
  expect(result.code).toBe(code);
}

function expectOk(result: ReturnType<typeof sanitizeText>, value: string) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected success, got ' + result.code);
  expect(result.value).toBe(value);
}

describe('sanitizeText: exported caps', () => {
  // These are the single source of truth, from the design doc, section 6.
  // Pinning the exact values here means a silent edit to a cap fails a test.
  it('exports the title caps as 1024 bytes and 80 graphemes', () => {
    expect(TITLE_LIMITS).toEqual({ maxBytes: 1024, maxGraphemes: 80 });
  });

  it('exports the description caps as 3072 bytes and 300 graphemes', () => {
    expect(DESCRIPTION_LIMITS).toEqual({ maxBytes: 3072, maxGraphemes: 300 });
  });

  it('exports the address caps as 512 bytes and 120 graphemes', () => {
    expect(ADDRESS_LIMITS).toEqual({ maxBytes: 512, maxGraphemes: 120 });
  });
});

describe('sanitizeText: accepts ordinary input', () => {
  it('accepts a plain title unchanged', () => {
    expectOk(sanitizeText('Sign night in Greenville', TITLE_LIMITS), 'Sign night in Greenville');
  });

  it('accepts a description under the description caps', () => {
    expectOk(
      sanitizeText('County council meeting, public comment at 6.', DESCRIPTION_LIMITS),
      'County council meeting, public comment at 6.'
    );
  });

  it('accepts an address under the address caps', () => {
    expectOk(
      sanitizeText('301 University Ridge, Greenville', ADDRESS_LIMITS),
      '301 University Ridge, Greenville'
    );
  });

  it('accepts digits, which must not be mistaken for emoji keycap bases', () => {
    expectOk(sanitizeText('Meetup 2026 #3', TITLE_LIMITS), 'Meetup 2026 #3');
  });

  it('accepts accented Latin, which the script allowance deliberately permits', () => {
    expectOk(sanitizeText('Reuni\u00F3n en Columbia', TITLE_LIMITS), 'Reuni\u00F3n en Columbia');
  });
});

describe('sanitizeText: type and byte caps', () => {
  it('rejects a number', () => {
    expectErr(sanitizeText(42, TITLE_LIMITS), 'not_a_string');
  });

  it('rejects null', () => {
    expectErr(sanitizeText(null, TITLE_LIMITS), 'not_a_string');
  });

  it('rejects undefined', () => {
    expectErr(sanitizeText(undefined, TITLE_LIMITS), 'not_a_string');
  });

  it('rejects an object', () => {
    expectErr(sanitizeText({ title: 'ok' }, TITLE_LIMITS), 'not_a_string');
  });

  it('rejects an array', () => {
    expectErr(sanitizeText(['ok'], TITLE_LIMITS), 'not_a_string');
  });

  it('rejects an over-cap raw byte length', () => {
    expectErr(sanitizeText('a'.repeat(1025), TITLE_LIMITS), 'too_many_bytes');
  });

  it('rejects on bytes before graphemes when multibyte input blows the byte cap', () => {
    // 400 x U+20AC is 1200 UTF-8 bytes but only 400 graphemes. The byte cap is
    // what must fire, because it runs first.
    const euros = '\u20AC'.repeat(400);
    expect(byteLength(euros)).toBe(1200);
    expectErr(sanitizeText(euros, TITLE_LIMITS), 'too_many_bytes');
  });

  it('accepts a string exactly at the byte cap', () => {
    expectOk(
      sanitizeText('a'.repeat(1024), { maxBytes: 1024, maxGraphemes: 2000 }),
      'a'.repeat(1024)
    );
  });

  it('rejects the empty string', () => {
    expectErr(sanitizeText('', TITLE_LIMITS), 'empty');
  });

  it('rejects a whitespace-only string', () => {
    expectErr(sanitizeText('   \u00A0 ', TITLE_LIMITS), 'empty');
  });
});

describe('sanitizeText: normalization and whitespace', () => {
  it('folds fullwidth homoglyphs to their ASCII equivalents via NFKC', () => {
    // Fullwidth "greenville", which must not survive as a distinct value.
    const fullwidth = '\uFF47\uFF52\uFF45\uFF45\uFF4E\uFF56\uFF49\uFF4C\uFF4C\uFF45';
    expectOk(sanitizeText(fullwidth, TITLE_LIMITS), 'greenville');
  });

  it('trims leading and trailing whitespace', () => {
    expectOk(sanitizeText('   Sign night   ', TITLE_LIMITS), 'Sign night');
  });

  it('collapses internal space runs to a single space', () => {
    expectOk(sanitizeText('Sign     night', TITLE_LIMITS), 'Sign night');
  });

  it('collapses a non-breaking space into an ordinary space', () => {
    expectOk(sanitizeText('Sign\u00A0night', TITLE_LIMITS), 'Sign night');
  });

  it('is idempotent: sanitizing an already-sanitized value changes nothing', () => {
    const once = sanitizeText('  Sign   night\u00A0 in \uFF23olumbia ', TITLE_LIMITS);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = sanitizeText(once.value, TITLE_LIMITS);
    expect(twice).toEqual(once);
  });
});

describe('sanitizeText: grapheme counting', () => {
  // Graphemes are never more numerous than UTF-16 code units, so a string that
  // is "20 code units but 80 graphemes" is unrepresentable. The direction that
  // does exist -- many code units for few graphemes -- is exactly what a naive
  // `.length` cap gets wrong, and it is covered below, along with the
  // independent byte axis.
  //
  // U+101FD is a combining mark (Mn, Script=Inherited) that lives outside the
  // BMP, so it costs 2 UTF-16 code units while adding 0 graphemes.
  const wide = 'a\u{101FD}\u{101FD}'; // 5 code units, 1 grapheme, 2 combining marks
  const narrow = 'a\u{101FD}'; // 3 code units, 1 grapheme, 1 combining mark
  const eightyUnitsTwentyGraphemes = wide.repeat(10) + narrow.repeat(10);

  it('builds the fixture it claims to: 80 code units, 20 graphemes', () => {
    expect(eightyUnitsTwentyGraphemes.length).toBe(80);
    expect(graphemeCount(eightyUnitsTwentyGraphemes)).toBe(20);
  });

  it('accepts 80 code units that are only 20 graphemes, under a 20-grapheme cap', () => {
    const result = sanitizeText(eightyUnitsTwentyGraphemes, { maxBytes: 1024, maxGraphemes: 20 });
    expect(result.ok).toBe(true);
  });

  it('rejects 81 ASCII characters, which are 81 graphemes, under an 80-grapheme cap', () => {
    expectErr(sanitizeText('a'.repeat(81), TITLE_LIMITS), 'too_many_graphemes');
  });

  it('accepts exactly 80 ASCII characters under an 80-grapheme cap', () => {
    expectOk(sanitizeText('a'.repeat(80), TITLE_LIMITS), 'a'.repeat(80));
  });

  it('measures bytes and graphemes independently: 20 graphemes, 80 raw bytes', () => {
    const twentyGraphemesEightyBytes = 'a\u0301\u0301'.repeat(10) + 'a\u0301'.repeat(10);
    expect(graphemeCount(twentyGraphemesEightyBytes)).toBe(20);
    expect(byteLength(twentyGraphemesEightyBytes)).toBe(80);
    expectErr(
      sanitizeText(twentyGraphemesEightyBytes, { maxBytes: 79, maxGraphemes: 20 }),
      'too_many_bytes'
    );
    expect(
      sanitizeText(twentyGraphemesEightyBytes, { maxBytes: 80, maxGraphemes: 20 }).ok
    ).toBe(true);
  });
});

describe('sanitizeText: hostile corpus', () => {
  it('rejects a right-to-left override (U+202E, Trojan Source)', () => {
    expectErr(sanitizeText('Meetup \u202Egnitseterp', TITLE_LIMITS), 'bidi_control');
  });

  it('rejects a bidi isolate (U+2066)', () => {
    expectErr(sanitizeText('Meetup \u2066Greenville\u2069', TITLE_LIMITS), 'bidi_control');
  });

  it('rejects a zero-width run', () => {
    expectErr(sanitizeText('Green\u200B\u200B\u200Bville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a zero-width joiner', () => {
    expectErr(sanitizeText('Green\u200Dville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects an internal byte order mark', () => {
    expectErr(sanitizeText('Green\uFEFFville', TITLE_LIMITS), 'zero_width');
  });

  it('rejects a Zalgo stack', () => {
    expectErr(sanitizeText('a' + '\u0301'.repeat(30) + '!', TITLE_LIMITS), 'combining_run');
  });

  it('allows two combining marks on one base', () => {
    expect(sanitizeText('a\u0327\u0316b', TITLE_LIMITS).ok).toBe(true);
  });

  it('rejects three consecutive combining marks', () => {
    expectErr(sanitizeText('a\u0327\u0316\u0331b', TITLE_LIMITS), 'combining_run');
  });

  it('rejects a Cyrillic lookalike character', () => {
    // Final character is U+0435 CYRILLIC SMALL LETTER IE, not Latin "e".
    expectErr(sanitizeText('Greenvill\u0435', TITLE_LIMITS), 'script_not_allowed');
  });

  it('rejects Hangul, which the Latin-and-Common restriction deliberately excludes', () => {
    expectErr(sanitizeText('\uD68C\uC758', TITLE_LIMITS), 'script_not_allowed');
  });

  it('rejects a single emoji in an otherwise clean title', () => {
    expectErr(sanitizeText('Sign night \u{1F389}', TITLE_LIMITS), 'emoji');
  });

  it('rejects an all-emoji title of 80 graphemes', () => {
    expectErr(sanitizeText('\u270A'.repeat(80), TITLE_LIMITS), 'emoji');
  });

  it('rejects an unassigned code point', () => {
    expectErr(sanitizeText('Meet\u0378up', TITLE_LIMITS), 'unassigned_or_private');
  });

  it('rejects a private use area code point', () => {
    expectErr(sanitizeText('Meet\uE000up', TITLE_LIMITS), 'unassigned_or_private');
  });

  it('rejects a mid-string newline', () => {
    expectErr(sanitizeText('Sign night\nGreenville', TITLE_LIMITS), 'newline');
  });

  it('rejects a mid-string carriage return', () => {
    expectErr(sanitizeText('Sign night\rGreenville', TITLE_LIMITS), 'newline');
  });

  it('rejects a mid-string tab', () => {
    expectErr(sanitizeText('Sign night\tGreenville', TITLE_LIMITS), 'newline');
  });

  it('rejects U+2028, which is a raw SyntaxError inside a JS string literal', () => {
    expectErr(sanitizeText('Sign night\u2028Greenville', TITLE_LIMITS), 'newline');
  });

  it('rejects U+2029', () => {
    expectErr(sanitizeText('Sign night\u2029Greenville', TITLE_LIMITS), 'newline');
  });

  it('rejects a C0 control character', () => {
    expectErr(sanitizeText('Sign\u0007night', TITLE_LIMITS), 'control_char');
  });

  it('rejects a DEL character', () => {
    expectErr(sanitizeText('Sign\u007Fnight', TITLE_LIMITS), 'control_char');
  });

  it('rejects a C1 control character', () => {
    expectErr(sanitizeText('Sign\u0090night', TITLE_LIMITS), 'control_char');
  });
});

describe('sanitizeText: rejections leak nothing', () => {
  it('returns only ok and code, never the offending input', () => {
    const hostile = 'Green\u200Bville-SECRET-MARKER';
    const result = sanitizeText(hostile, TITLE_LIMITS);
    expect(result.ok).toBe(false);
    expect(Object.keys(result).sort()).toEqual(['code', 'ok']);
    expect(JSON.stringify(result)).not.toContain('SECRET-MARKER');
    expect(JSON.stringify(result)).not.toContain('Green');
  });
});

describe('dedupeKey', () => {
  it('lowercases', () => {
    expect(dedupeKey('Sign Night')).toBe('sign night');
  });

  it('collapses two strings differing only by zero-width characters', () => {
    const plain = 'Sign Night';
    const spiked = 'S\u200Bign\u200C Ni\u200Dght\uFEFF';
    expect(dedupeKey(spiked)).toBe(dedupeKey(plain));
  });

  it('collapses two strings differing only by an added space', () => {
    expect(dedupeKey('Sign  Night')).toBe(dedupeKey('Sign Night'));
  });

  it('collapses fullwidth and ASCII forms of the same word', () => {
    expect(dedupeKey('\uFF33ign Night')).toBe(dedupeKey('Sign Night'));
  });

  it('is idempotent', () => {
    const once = dedupeKey('  Sign\u200B  Night ');
    expect(dedupeKey(once)).toBe(once);
  });

  it('keeps genuinely different titles distinct', () => {
    expect(dedupeKey('Sign night')).not.toBe(dedupeKey('Sign day'));
  });
});

describe('sanitizeText: no regex backtracks on adversarial input', () => {
  // Caps raised so nothing short-circuits before the regexes under test.
  const WIDE: SanitizeOptions = { maxBytes: 100000, maxGraphemes: 100000 };

  const adversarial: Array<[string, string]> = [
    ['300 plain characters, reaching every check', 'a'.repeat(300)],
    ['100 bases each carrying the maximum 2 marks', 'a\u0301\u0301'.repeat(100)],
    ['one base under a 299-mark Zalgo stack', 'a' + '\u0301'.repeat(299)],
    ['150 alternating space runs', 'a '.repeat(150)],
    ['300 unassigned code points', '\u0378'.repeat(300)],
    ['150 zero-width-separated characters', 'a\u200B'.repeat(150)],
    ['300 emoji', '\u{1F600}'.repeat(300)],
    ['300 bidi overrides', '\u202E'.repeat(300)],
  ];

  for (const [label, input] of adversarial) {
    it('completes in under 50ms: ' + label, () => {
      expect([...input].length).toBe(300);
      // 50ms is a catastrophic-backtracking tripwire -- that failure mode blows
      // up in seconds, not milliseconds -- not a performance benchmark, so the
      // threshold is loose enough not to flake on a loaded CI box.
      // Warm up first so JIT compilation and Segmenter construction are never
      // inside a measured run.
      sanitizeText(input, WIDE);
      let best = Infinity;
      for (let i = 0; i < 5; i += 1) {
        const start = performance.now();
        sanitizeText(input, WIDE);
        best = Math.min(best, performance.now() - start);
      }
      expect(best).toBeLessThan(50);
    });
  }
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/sanitize-text.test.ts`

Expected: FAIL — the suite does not even collect, because the module under test does not exist yet:

```
FAIL  src/lib/sanitize-text.test.ts [ src/lib/sanitize-text.test.ts ]
Error: Cannot find module './sanitize-text.js' imported from 'src/lib/sanitize-text.test.ts'
 ❯ src/lib/sanitize-text.test.ts:2:1

 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: Implement**

Three things drive the shape of this file, and none is negotiable.

**The caps are exported from here and nowhere else.** `sanitizeText` enforces whatever options it is handed, so a cap that gets retyped at each call site can drift without anything failing. `TITLE_LIMITS`, `DESCRIPTION_LIMITS`, and `ADDRESS_LIMITS` are the single source of truth; every later task imports them rather than writing `{ maxBytes: 1024, maxGraphemes: 80 }` again.

**The order of the checks is the design.** Each step bounds the work the next step does: the raw byte cap runs before NFKC because NFKC can expand its input (U+FDFA expands 18x), and the grapheme count runs before the reject-list because segmentation is the most expensive step that still needs a bound. Reordering these silently removes the bound.

**Every regex is a flat character class.** No nesting, no quantified alternation, no backreferences. Anchoring and a length bound do not prevent catastrophic backtracking; only the shape of the pattern does. Each pattern carries a `SHAPE:` comment stating why it cannot backtrack. If you edit one, restate that comment or the guarantee is gone.

Note `HORIZONTAL_SPACE_RUN` deliberately excludes `\n`, `\r`, and `\t`. They have to survive whitespace collapsing so that `LINE_BREAK_OR_TAB` can reject them; folding them into the collapse class would silently accept a multi-line title.

```typescript
import { ok, err, type Ok, type Err } from './text-result.js';

export type SanitizeCode =
  | 'not_a_string'
  | 'too_many_bytes'
  | 'empty'
  | 'too_many_graphemes'
  | 'control_char'
  | 'bidi_control'
  | 'zero_width'
  | 'unassigned_or_private'
  | 'newline'
  | 'combining_run'
  | 'script_not_allowed'
  | 'emoji';

export interface SanitizeOptions {
  maxBytes: number;
  maxGraphemes: number;
}

// The caps, from the design doc, section 6. These are the single source of
// truth: callers import them rather than retyping the numbers, because
// sanitizeText enforces whatever it is handed and a mismatched copy would be
// invisible. Both axes matter -- bytes bound storage and the work done before
// normalization, graphemes bound what a reader actually sees.
export const TITLE_LIMITS: SanitizeOptions = { maxBytes: 1024, maxGraphemes: 80 };
export const DESCRIPTION_LIMITS: SanitizeOptions = { maxBytes: 3072, maxGraphemes: 300 };
export const ADDRESS_LIMITS: SanitizeOptions = { maxBytes: 512, maxGraphemes: 120 };

const ENCODER = new TextEncoder();

// Horizontal space characters, collapsed to a single U+0020.
// SHAPE: one flat character class, one quantifier, no nesting, no alternation,
// no backreferences. Cannot backtrack.
// Line breaks and tabs are deliberately absent: they must survive collapsing so
// that LINE_BREAK_OR_TAB below can reject them.
const HORIZONTAL_SPACE_RUN = /[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/gu;

// SHAPE: one flat character class, no quantifier at all. Cannot backtrack.
const LINE_BREAK_OR_TAB = /[\t\n\v\f\r\u0085\u2028\u2029]/u;

// C0 and C1 controls. Line breaks and tabs are inside this range but are
// rejected earlier, with their own code.
// SHAPE: one flat character class, no quantifier. Cannot backtrack.
const CONTROL_CHAR = /[\u0000-\u001F\u007F-\u009F]/u;

// Bidi overrides and isolates (Trojan Source).
// SHAPE: one flat character class, no quantifier. Cannot backtrack.
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u;

// SHAPE: one flat character class, no quantifier. Cannot backtrack.
const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/u;
const ZERO_WIDTH_GLOBAL = /[\u200B\u200C\u200D\uFEFF]/gu;

// Unassigned code points and private use areas.
// SHAPE: one flat character class of two property escapes, no quantifier.
const UNASSIGNED_OR_PRIVATE = /[\p{Cn}\p{Co}]/u;

// Three consecutive combining marks: one more than the cap of two.
// SHAPE: one flat character class with a single fixed-count quantifier. No
// nesting, no alternation, no backreferences. Cannot backtrack.
const COMBINING_RUN = /[\p{Mn}\p{Mc}\p{Me}]{3}/u;

// Anything outside Latin, Common, and Inherited. Inherited is required, not
// optional: combining marks live there, and the cap above already permits two.
// SHAPE: one negated flat character class, no quantifier. Cannot backtrack.
const DISALLOWED_SCRIPT =
  /[^\p{Script_Extensions=Latin}\p{Script_Extensions=Common}\p{Script_Extensions=Inherited}]/u;

// Emoji, plus the variation selectors that drive emoji presentation.
// Deliberately not \p{Emoji}, which matches every ASCII digit and would reject
// "Meetup 2026".
// SHAPE: one flat character class, no quantifier. Cannot backtrack.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE00-\uFE0F]/u;

let graphemeSegmenter: Intl.Segmenter | null = null;

function countGraphemes(value: string): number {
  if (graphemeSegmenter === null) {
    graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  }
  let count = 0;
  for (const _segment of graphemeSegmenter.segment(value)) count += 1;
  return count;
}

export function sanitizeText(
  input: unknown,
  opts: SanitizeOptions
): Ok<string> | Err<SanitizeCode> {
  if (typeof input !== 'string') return err('not_a_string');

  // 1. Raw bytes, before anything else. NFKC can expand its input, so a cap
  //    applied after normalization is not a cap on the work done to get there.
  if (ENCODER.encode(input).length > opts.maxBytes) return err('too_many_bytes');

  // 2. NFKC, so fullwidth text cannot masquerade as a distinct value.
  const normalized = input.normalize('NFKC');

  // 3. Trim, then collapse internal horizontal-space runs to a single space.
  const collapsed = normalized.trim().replace(HORIZONTAL_SPACE_RUN, ' ');

  if (collapsed.length === 0) return err('empty');

  // 4. These are single-line fields.
  if (LINE_BREAK_OR_TAB.test(collapsed)) return err('newline');

  // 5. Grapheme clusters, not code units. This is what bounds display.
  if (countGraphemes(collapsed) > opts.maxGraphemes) return err('too_many_graphemes');

  // 6. Reject-list. Reject, never strip: a filter that rewrites input can
  //    usually be used to smuggle something past it.
  if (CONTROL_CHAR.test(collapsed)) return err('control_char');
  if (BIDI_CONTROL.test(collapsed)) return err('bidi_control');
  if (ZERO_WIDTH.test(collapsed)) return err('zero_width');
  if (UNASSIGNED_OR_PRIVATE.test(collapsed)) return err('unassigned_or_private');

  // 7. Content-quality tier: the worst case if these are wrong is an ugly
  //    calendar, not a compromise.
  if (COMBINING_RUN.test(collapsed)) return err('combining_run');
  if (DISALLOWED_SCRIPT.test(collapsed)) return err('script_not_allowed');
  if (EMOJI.test(collapsed)) return err('emoji');

  return ok(collapsed);
}

// Duplicate detection runs on the normalized string, never the raw body: one
// added space or zero-width character would otherwise defeat it. Zero-width
// characters cannot reach here through sanitizeText, but this function is also
// called on values read back out of storage, so it strips them defensively.
export function dedupeKey(sanitized: string): string {
  return sanitized
    .normalize('NFKC')
    .replace(ZERO_WIDTH_GLOBAL, '')
    .replace(HORIZONTAL_SPACE_RUN, ' ')
    .trim()
    .toLowerCase();
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/sanitize-text.test.ts`

Expected: PASS — 65 tests (3 exported caps, 5 ordinary input, 10 type and byte caps, 5 normalization and whitespace, 5 grapheme counting, 22 hostile corpus, 1 leak check, 6 dedupeKey, 8 backtracking tripwires)

- [ ] **Step 5: Commit**

```bash
git add src/lib/sanitize-text.ts src/lib/sanitize-text.test.ts
git commit -m "feat(events): add text sanitizer for event free-text fields

Byte cap, NFKC, whitespace collapse, grapheme cap, reject-list,
combining-mark cap, script restriction, and emoji ban, in that order.
Exports TITLE_LIMITS, DESCRIPTION_LIMITS, and ADDRESS_LIMITS as the
single source of truth for the caps, so call sites import them instead
of retyping numbers the sanitizer cannot second-guess. Every regex is a
flat character class so hostile input cannot reach a backtracking
pattern. Rejects rather than strips, and returns a code without echoing
the offending string."
```

---

---

---

### Task 3: Signal group URL validator

**Files:**
- Create: `src/lib/signal-url.ts`
- Test: `src/lib/signal-url.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { validateSignalUrl } from './signal-url.js';

// A realistic Signal invite key: the characters Signal actually uses in the
// fragment are base64url, i.e. [A-Za-z0-9_-].
const KEY = 'CjQKIF_-1abcDEF';
const HAPPY = `https://signal.group/#${KEY}`;

describe('validateSignalUrl — non-strings', () => {
  it('rejects null', () => {
    expect(validateSignalUrl(null)).toEqual({ ok: false, code: 'not_a_string' });
  });

  it('rejects undefined', () => {
    expect(validateSignalUrl(undefined)).toEqual({ ok: false, code: 'not_a_string' });
  });

  it('rejects a number', () => {
    expect(validateSignalUrl(12345)).toEqual({ ok: false, code: 'not_a_string' });
  });

  it('rejects an object', () => {
    expect(validateSignalUrl({ href: HAPPY })).toEqual({ ok: false, code: 'not_a_string' });
  });
});

describe('validateSignalUrl — byte cap', () => {
  it('rejects input over the byte cap before parsing it', () => {
    // 622 bytes. Also has an over-long fragment, so this asserts the cheap
    // byte check runs first rather than falling through to parsing.
    const huge = `https://signal.group/#${'a'.repeat(600)}`;
    expect(validateSignalUrl(huge)).toEqual({ ok: false, code: 'too_many_bytes' });
  });
});

describe('validateSignalUrl — unparseable', () => {
  it('rejects a string that is not a URL', () => {
    expect(validateSignalUrl('not a url')).toEqual({ ok: false, code: 'unparseable' });
  });

  it('rejects the empty string', () => {
    expect(validateSignalUrl('')).toEqual({ ok: false, code: 'unparseable' });
  });
});

describe('validateSignalUrl — protocol allowlist', () => {
  it('rejects javascript:', () => {
    expect(validateSignalUrl('javascript:alert(1)')).toEqual({ ok: false, code: 'bad_protocol' });
  });

  it('rejects java<TAB>script: — the URL parser strips the tab, so the scheme is javascript:', () => {
    // This is why schemes are allowlisted, not denylisted: a denylist matching
    // the literal string "javascript:" never sees this one, but the parser
    // (and the browser) does.
    const result = validateSignalUrl('java\tscript:alert(1)');
    expect(result).toEqual({ ok: false, code: 'bad_protocol' });
    // Not 'unparseable' — it really did parse, as javascript:.
    expect(new URL('java\tscript:alert(1)').protocol).toBe('javascript:');
  });

  it('rejects data:', () => {
    expect(validateSignalUrl('data:text/html,<script>alert(1)</script>')).toEqual({
      ok: false,
      code: 'bad_protocol',
    });
  });

  it('rejects plain http', () => {
    expect(validateSignalUrl(`http://signal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'bad_protocol',
    });
  });
});

describe('validateSignalUrl — host allowlist', () => {
  it('rejects evilsignal.group (the endsWith trap)', () => {
    expect(validateSignalUrl(`https://evilsignal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'bad_host',
    });
  });

  it('rejects signal.group.evil.com (the startsWith trap)', () => {
    expect(validateSignalUrl(`https://signal.group.evil.com/#${KEY}`)).toEqual({
      ok: false,
      code: 'bad_host',
    });
  });

  it('rejects a subdomain of signal.group', () => {
    expect(validateSignalUrl(`https://www.signal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'bad_host',
    });
  });
});

describe('validateSignalUrl — credentials, port, query, path', () => {
  it('rejects user:pass credentials', () => {
    expect(validateSignalUrl(`https://user:pass@signal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_credentials',
    });
  });

  it('rejects a username with no password', () => {
    expect(validateSignalUrl(`https://user@signal.group/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_credentials',
    });
  });

  it('rejects an explicit non-default port', () => {
    expect(validateSignalUrl(`https://signal.group:8443/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects an explicit default port :443 that WHATWG URL normalizes away', () => {
    // new URL('https://signal.group:443/').port === '' — the parser drops the
    // scheme's own default port. Checking u.port alone would let this through,
    // so the validator also inspects the raw authority. The design forbids ANY
    // explicit port, default or not.
    expect(new URL(`https://signal.group:443/#${KEY}`).port).toBe('');
    expect(validateSignalUrl(`https://signal.group:443/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects the :80 port on an https URL', () => {
    // Non-default for https, so u.port is '80'; still an explicit port and still
    // forbidden. Pinned alongside :443 so both the normalized and un-normalized
    // port paths are covered.
    expect(validateSignalUrl(`https://signal.group:80/#${KEY}`)).toEqual({
      ok: false,
      code: 'has_port',
    });
  });

  it('rejects a query string', () => {
    expect(validateSignalUrl(`https://signal.group/?utm=x#${KEY}`)).toEqual({
      ok: false,
      code: 'has_query',
    });
  });

  it('rejects a path segment', () => {
    expect(validateSignalUrl(`https://signal.group/evil#${KEY}`)).toEqual({
      ok: false,
      code: 'has_path',
    });
  });
});

describe('validateSignalUrl — fragment', () => {
  it('rejects a missing fragment', () => {
    expect(validateSignalUrl('https://signal.group/')).toEqual({ ok: false, code: 'bad_fragment' });
  });

  it('rejects a bare hash with nothing after it', () => {
    expect(validateSignalUrl('https://signal.group/#')).toEqual({ ok: false, code: 'bad_fragment' });
  });

  it('rejects a fragment of 129 characters', () => {
    expect(validateSignalUrl(`https://signal.group/#${'a'.repeat(129)}`)).toEqual({
      ok: false,
      code: 'bad_fragment',
    });
  });

  it('accepts a fragment of exactly 128 characters', () => {
    const max = 'a'.repeat(128);
    expect(validateSignalUrl(`https://signal.group/#${max}`)).toEqual({
      ok: true,
      value: `https://signal.group/#${max}`,
    });
  });

  it('rejects a fragment containing an exclamation mark', () => {
    expect(validateSignalUrl('https://signal.group/#KEY!')).toEqual({
      ok: false,
      code: 'bad_fragment',
    });
  });

  it('rejects a fragment containing a slash', () => {
    expect(validateSignalUrl('https://signal.group/#abc/def')).toEqual({
      ok: false,
      code: 'bad_fragment',
    });
  });

  it('rejects a fragment containing a space (percent-encoded by the parser)', () => {
    expect(validateSignalUrl('https://signal.group/#abc def')).toEqual({
      ok: false,
      code: 'bad_fragment',
    });
  });
});

describe('validateSignalUrl — happy path', () => {
  it('accepts a valid invite and PRESERVES THE FRAGMENT', () => {
    // The regression that matters most. Signal puts the invite key in the
    // fragment precisely so it is never sent to a server; a validator that
    // returns the URL without it hands back a dead link.
    const result = validateSignalUrl(HAPPY);
    expect(result).toEqual({ ok: true, value: HAPPY });
    if (result.ok) {
      expect(result.value).toContain(`#${KEY}`);
    }
  });

  it('accepts underscores and hyphens in the key', () => {
    const url = 'https://signal.group/#a_b-c_D-9';
    expect(validateSignalUrl(url)).toEqual({ ok: true, value: url });
  });

  it('normalizes a missing trailing slash while keeping the fragment', () => {
    const result = validateSignalUrl(`https://signal.group#${KEY}`);
    expect(result).toEqual({ ok: true, value: `https://signal.group/#${KEY}` });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/signal-url.test.ts`

Expected: FAIL — the module does not exist yet, so Vite fails to resolve the import before any test runs:

```
Error: Failed to resolve import "./signal-url.js" from "src/lib/signal-url.test.ts". Does the file exist?
```

- [ ] **Step 3: Implement**

```typescript
import { ok, err, type Ok, type Err } from './text-result.js';

export type SignalUrlCode =
  | 'not_a_string'
  | 'too_many_bytes'
  | 'unparseable'
  | 'bad_protocol'
  | 'bad_host'
  | 'has_credentials'
  | 'has_port'
  | 'has_query'
  | 'has_path'
  | 'bad_fragment';

/**
 * Raw byte cap applied before the URL is parsed, so hostile input never
 * reaches the parser or the fragment regex. A legitimate invite is under
 * 160 bytes; 512 leaves generous room.
 */
const MAX_BYTES = 512;

const ALLOWED_PROTOCOL = 'https:';
const ALLOWED_HOSTNAME = 'signal.group';

/**
 * Flat character class, one bounded quantifier, no nesting, no alternation,
 * no backreferences. Anchoring alone does not prevent catastrophic
 * backtracking; the shape of the pattern does.
 */
const FRAGMENT_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const encoder = new TextEncoder();

/**
 * Validates a Signal group invite URL by parsing it with the WHATWG URL
 * constructor and then allowlisting every normalized component.
 *
 * Schemes are allowlisted, never denylisted: the URL parser strips tabs and
 * newlines out of the scheme, so `java<TAB>script:` parses as `javascript:`
 * and slips past any literal-string denylist.
 *
 * On success, `.value` is the normalized `u.href` WITH the fragment intact.
 * Signal carries the invite key in the fragment specifically so it is never
 * transmitted to a server; stripping it destroys the invite.
 */
export function validateSignalUrl(input: unknown): Ok<string> | Err<SignalUrlCode> {
  if (typeof input !== 'string') {
    return err('not_a_string');
  }

  if (encoder.encode(input).length > MAX_BYTES) {
    return err('too_many_bytes');
  }

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return err('unparseable');
  }

  if (u.protocol !== ALLOWED_PROTOCOL) {
    return err('bad_protocol');
  }

  // Exact equality. `endsWith` accepts evilsignal.group; `startsWith` accepts
  // signal.group.evil.com; either would accept www.signal.group.
  if (u.hostname !== ALLOWED_HOSTNAME) {
    return err('bad_host');
  }

  if (u.username !== '' || u.password !== '') {
    return err('has_credentials');
  }

  // WHATWG URL normalizes an explicit DEFAULT port (:443 for https, :80 for
  // http) to an empty `u.port`, so `u.port` alone would wave through
  // `signal.group:443`. The design forbids ANY explicit port, default or not,
  // so also inspect the raw authority. By this point host is exactly
  // `signal.group` (never IPv6) and there are no credentials, so any ':'
  // remaining in the authority is a port separator. Isolate the authority the
  // way the URL parser does: FIRST strip every ASCII tab and newline, exactly
  // as the WHATWG parser's initial step does. Skipping this is a real bypass:
  // `https:\t//signal.group:443/#k` parses (tab removed) to host signal.group
  // with the default port normalized away, but on the raw string the leading-
  // slash strip halts at the tab, so the ':443' never reaches the check below.
  // After removing the control chars: drop the scheme, strip the leading
  // slashes / backslashes the parser tolerates for special schemes, cut at the
  // first path/query/fragment delimiter, then drop any userinfo before the '@'.
  const rawInput = input.replace(/[\t\n\r]/g, '');
  let authority = rawInput.slice(rawInput.indexOf(':') + 1).replace(/^[/\\]+/, '');
  const authorityEnd = authority.search(/[/\\?#]/);
  if (authorityEnd !== -1) {
    authority = authority.slice(0, authorityEnd);
  }
  const at = authority.lastIndexOf('@');
  if (at !== -1) {
    authority = authority.slice(at + 1);
  }
  if (u.port !== '' || authority.includes(':')) {
    return err('has_port');
  }

  if (u.search !== '') {
    return err('has_query');
  }

  // The parser normalizes a bare origin to a pathname of '/'.
  if (u.pathname !== '/') {
    return err('has_path');
  }

  // `u.hash` is '' both when there is no '#' and when the '#' is followed by
  // nothing. Both are missing invite keys and both fail the pattern below.
  const fragment = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
  if (!FRAGMENT_PATTERN.test(fragment)) {
    return err('bad_fragment');
  }

  return ok(u.href);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/signal-url.test.ts`

Expected: PASS — 31 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/signal-url.ts src/lib/signal-url.test.ts
git commit -m "feat(events): add Signal group URL validator

Parses with the WHATWG URL constructor, then allowlists protocol, host,
credentials, port, query, path, and fragment. Returns a Result rather than
throwing. Preserves the fragment on success, since Signal carries the invite
key there and a stripped fragment is a dead link.

Rejects ANY explicit port, including a default port (:443) that the URL
parser normalizes to an empty u.port, by inspecting the raw authority.

Covers the hostile corpus from the design doc, including java<TAB>script:,
which the parser normalizes to javascript: and a scheme denylist would miss."
```

---

---

---

### Task 4: Organizer code normalization, digesting, and generation

**Files:**
- Create: `src/lib/organizer-code.ts`
- Test: `src/lib/organizer-code.test.ts`

This module is the single source of truth for how an organizer code becomes a Blobs key. The submit function imports it directly, and the CLI is written as `scripts/organizer-codes.ts` and bundled at run time with the esbuild already present in `node_modules` (no new dependency):

```bash
esbuild scripts/organizer-codes.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/organizer-codes.mjs && node node_modules/.cache/organizer-codes.mjs
```

That bundling step is why this module can stay `.ts` rather than being downgraded to plain JavaScript: esbuild resolves the repo's TS-style `'./text-result.js'` imports to `text-result.ts`, which `node --experimental-strip-types` does not (verified on Node 22.22.3), and a plain `.mjs` script run by bare node cannot import a `.ts` module at all. Two copies of this logic would drift silently and every newly issued code would simply stop validating. The equivalence tests below are the contract that keeps already-issued codes working.

- [ ] **Step 1: Write the failing test**

Create `src/lib/organizer-code.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeCode, digestCode, generateCode } from './organizer-code.js';

const PEPPER = 'a'.repeat(64);
const OTHER_PEPPER = 'b'.repeat(64);

// The canonical form every spelling below must collapse to.
const CANONICAL = 'drum-yoga-vivid-clay';

// Every spelling an organizer might realistically type or paste.
const SPELLINGS = [
  'drum-yoga-vivid-clay',
  'Drum Yoga Vivid Clay',
  'DRUM YOGA VIVID CLAY',
  ' drum  yoga\tvivid clay ',
  'drum-yoga-vivid-clay\n',
  'drum_yoga.vivid,clay',
  // Fullwidth Latin capitals: ＤＲＵＭ ＹＯＧＡ ＶＩＶＩＤ ＣＬＡＹ
  'ＤＲＵＭ ＹＯＧＡ ＶＩＶＩＤ ＣＬＡＹ',
];

function unwrap(result: ReturnType<typeof normalizeCode>): string {
  if (!result.ok) throw new Error(`expected ok, got code "${result.code}"`);
  return result.value;
}

describe('normalizeCode', () => {
  it('accepts a canonical hyphenated code unchanged', () => {
    const result = normalizeCode(CANONICAL);
    expect(result).toEqual({ ok: true, value: CANONICAL });
  });

  it('rejects anything that is not a string', () => {
    expect(normalizeCode(null)).toEqual({ ok: false, code: 'not_a_string' });
    expect(normalizeCode(undefined)).toEqual({ ok: false, code: 'not_a_string' });
    expect(normalizeCode(42)).toEqual({ ok: false, code: 'not_a_string' });
    expect(normalizeCode(['drum', 'yoga', 'vivid', 'clay'])).toEqual({ ok: false, code: 'not_a_string' });
    expect(normalizeCode({ code: CANONICAL })).toEqual({ ok: false, code: 'not_a_string' });
  });

  it('rejects input over 128 raw bytes before doing any shape work', () => {
    // 200 bytes and zero words: the byte cap must fire first, not 'wrong_shape'.
    const result = normalizeCode('x'.repeat(200));
    expect(result).toEqual({ ok: false, code: 'too_many_bytes' });
  });

  it('measures the byte cap on raw input, not on normalized input', () => {
    // 60 fullwidth letters = 180 UTF-8 bytes, but only 60 bytes after NFKC.
    // The cap bounds the work done to normalize, so this must still be rejected.
    const fullwidthA = 'ａ'; // ａ
    const result = normalizeCode(fullwidthA.repeat(60));
    expect(result).toEqual({ ok: false, code: 'too_many_bytes' });
  });

  it('accepts input at exactly 128 bytes', () => {
    const input = ['a'.repeat(32), 'b'.repeat(31), 'c'.repeat(31), 'd'.repeat(31)].join('-');
    expect(new TextEncoder().encode(input).length).toBe(128);
    expect(normalizeCode(input)).toEqual({ ok: true, value: input });
  });

  it('rejects fewer than four words', () => {
    expect(normalizeCode('drum-yoga-vivid')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('rejects more than four words', () => {
    expect(normalizeCode('drum-yoga-vivid-clay-extra')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('rejects an empty or whitespace-only string', () => {
    expect(normalizeCode('')).toEqual({ ok: false, code: 'wrong_shape' });
    expect(normalizeCode('   \t  ')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('rejects a code that contains no letters', () => {
    expect(normalizeCode('1234-5678-9012-3456')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('strips digits rather than treating them as word characters', () => {
    // Digits are outside a-z, so they act as separators and split one word in two.
    expect(normalizeCode('dr9um-yoga-vivid-clay')).toEqual({ ok: false, code: 'wrong_shape' });
  });

  it('collapses casing, spacing, tabs and punctuation to one canonical form', () => {
    for (const spelling of SPELLINGS) {
      expect(unwrap(normalizeCode(spelling))).toBe(CANONICAL);
    }
  });

  it('is idempotent', () => {
    for (const spelling of SPELLINGS) {
      const once = unwrap(normalizeCode(spelling));
      const twice = unwrap(normalizeCode(once));
      expect(twice).toBe(once);
    }
  });
});

describe('digestCode', () => {
  it('returns 64 lowercase hex characters', () => {
    const digest = digestCode(CANONICAL, PEPPER);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across calls', () => {
    expect(digestCode(CANONICAL, PEPPER)).toBe(digestCode(CANONICAL, PEPPER));
  });

  it('differs when the pepper differs', () => {
    expect(digestCode(CANONICAL, PEPPER)).not.toBe(digestCode(CANONICAL, OTHER_PEPPER));
  });

  it('differs for a different code under the same pepper', () => {
    expect(digestCode(CANONICAL, PEPPER)).not.toBe(digestCode('drum-yoga-vivid-claw', PEPPER));
  });

  it('produces one digest for every equivalent spelling', () => {
    // This is the property that keeps an issued code working no matter how it
    // is typed back in. If it breaks, every live code breaks with it.
    const expected = digestCode(CANONICAL, PEPPER);
    for (const spelling of SPELLINGS) {
      expect(digestCode(unwrap(normalizeCode(spelling)), PEPPER)).toBe(expected);
    }
  });
});

describe('generateCode', () => {
  const wordlist = ['drum', 'yoga', 'vivid', 'clay', 'ledge', 'onset'] as const;

  it('draws four words in the order the injected randomInt supplies them', () => {
    const indices = [0, 1, 2, 3];
    let call = 0;
    const randomInt = () => indices[call++];
    expect(generateCode(wordlist, randomInt)).toBe('drum-yoga-vivid-clay');
    expect(call).toBe(4);
  });

  it('allows repeated words', () => {
    const randomInt = () => 4;
    expect(generateCode(wordlist, randomInt)).toBe('ledge-ledge-ledge-ledge');
  });

  it('asks for indices bounded by the wordlist length', () => {
    const asked: number[] = [];
    const randomInt = (maxExclusive: number) => {
      asked.push(maxExclusive);
      return 0;
    };
    generateCode(wordlist, randomInt);
    expect(asked).toEqual([6, 6, 6, 6]);
  });

  it('produces a code that normalizes to itself', () => {
    const indices = [5, 4, 2, 0];
    let call = 0;
    const generated = generateCode(wordlist, () => indices[call++]);
    expect(unwrap(normalizeCode(generated))).toBe(generated);
  });

  it('throws on an empty wordlist rather than emitting an undefined word', () => {
    expect(() => generateCode([], () => 0)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/organizer-code.test.ts`

Expected: FAIL — Vite cannot resolve the module that does not exist yet:

```
Error: Failed to resolve import "./organizer-code.js" from "src/lib/organizer-code.test.ts". Does the file exist?
```

- [ ] **Step 3: Implement**

Create `src/lib/organizer-code.ts`:

```typescript
import { createHmac } from 'node:crypto';
import { ok, err } from './text-result.js';
import type { Ok, Err } from './text-result.js';

export type CodeCode = 'not_a_string' | 'too_many_bytes' | 'wrong_shape';

/**
 * Raw byte cap applied BEFORE NFKC. NFKC can expand its input, so a cap
 * applied after normalization is not a cap on the work done to get there.
 */
const MAX_CODE_BYTES = 128;

/** 4 words from the EFF short wordlist #2 (1296^4 ~= 2^41.4). */
const CODE_WORD_COUNT = 4;

/**
 * Flat negated character class with a single quantifier: no nested quantifiers,
 * no quantified alternation, no backreferences. Shape is what prevents
 * catastrophic backtracking; anchoring and length bounds do not.
 */
const NON_LETTER_RUN = /[^a-z]+/g;

const encoder = new TextEncoder();

/**
 * Canonicalize an organizer code: NFKC -> lowercase -> strip everything
 * outside a-z -> rejoin exactly four words with single hyphens.
 *
 * This normalization is FIXED. Changing it invalidates every issued code,
 * and the failure is silent: codes simply stop validating.
 */
export function normalizeCode(input: unknown): Ok<string> | Err<CodeCode> {
  if (typeof input !== 'string') return err('not_a_string');
  if (encoder.encode(input).length > MAX_CODE_BYTES) return err('too_many_bytes');

  // Every non-letter run becomes a single space, so hyphens, tabs, underscores
  // and stray punctuation all act as word separators.
  const letters = input.normalize('NFKC').toLowerCase().replace(NON_LETTER_RUN, ' ');
  const words = letters.split(' ').filter((word) => word.length > 0);

  if (words.length !== CODE_WORD_COUNT) return err('wrong_shape');

  return ok(words.join('-'));
}

/**
 * HMAC-SHA256 of the normalized code under the server-side pepper.
 * The returned hex digest IS the Blobs key in the `codes` store, so there is
 * no comparison loop and therefore no timing signal to exploit.
 */
export function digestCode(normalized: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalized, 'utf8').digest('hex');
}

/**
 * Draw a fresh code from the wordlist. `randomInt` is injected so callers pass
 * `crypto.randomInt` (rejection-sampled, never `Math.random`) in production and
 * a deterministic stub in tests.
 */
export function generateCode(
  wordlist: readonly string[],
  randomInt: (maxExclusive: number) => number,
): string {
  if (wordlist.length === 0) {
    throw new RangeError('generateCode: wordlist is empty');
  }

  const words: string[] = [];
  for (let i = 0; i < CODE_WORD_COUNT; i += 1) {
    words.push(wordlist[randomInt(wordlist.length)]);
  }

  return words.join('-');
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/organizer-code.test.ts`

Expected: PASS — 22 tests (12 `normalizeCode`, 5 `digestCode`, 5 `generateCode`); the run reports `Tests 22 passed (22)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/organizer-code.ts src/lib/organizer-code.test.ts
git commit -m "feat: add organizer code normalization, digesting, and generation"
```

---

---

---

### Task 5: City allowlist and city-to-county derivation

**Files:**
- Create: `src/lib/jurisdictions.ts`
- Test: `src/lib/jurisdictions.test.ts`
- Depends on: `src/lib/text-result.ts` (Task 1) must already exist — this module imports `ok` / `err` from it.
- Reads (do not modify): `src/data/registry.json` — top-level shape is `{ state, jurisdictions }`; each jurisdiction has `id` (e.g. `"place:north-charleston"`, `"county:greenville"`), `type`, and `county` (e.g. `"Charleston"`, `"McCormick"`). There are 50 `place:` entries today.

- [ ] **Step 1: Write the failing test**

Create `src/lib/jurisdictions.test.ts` with exactly this content:

```typescript
import { describe, it, expect } from 'vitest';
import { allCitySlugs, isKnownCity, countyForCity } from './jurisdictions.js';
import registry from '../data/registry.json';

describe('allCitySlugs', () => {
  it('returns a non-empty list', () => {
    expect(allCitySlugs().length).toBeGreaterThan(0);
  });

  it('includes greenville', () => {
    expect(allCitySlugs()).toContain('greenville');
  });

  it('includes charleston and north-charleston as separate slugs', () => {
    const slugs = allCitySlugs();
    expect(slugs).toContain('charleston');
    expect(slugs).toContain('north-charleston');
  });

  it('strips the place: prefix from every slug', () => {
    for (const slug of allCitySlugs()) {
      expect(slug.startsWith('place:')).toBe(false);
    }
  });

  it('contains no county ids', () => {
    for (const slug of allCitySlugs()) {
      expect(slug.startsWith('county:')).toBe(false);
    }
    expect(allCitySlugs()).not.toContain('county:greenville');
  });

  it('returns unique slugs', () => {
    const slugs = allCitySlugs();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('returns a frozen array so callers cannot mutate the allowlist', () => {
    expect(Object.isFrozen(allCitySlugs())).toBe(true);
  });
});

describe('isKnownCity', () => {
  it('returns true for greenville', () => {
    expect(isKnownCity('greenville')).toBe(true);
  });

  it('returns true for a multi-word slug like mount-pleasant', () => {
    expect(isKnownCity('mount-pleasant')).toBe(true);
  });

  it('returns false for a city outside the registry', () => {
    expect(isKnownCity('atlanta')).toBe(false);
  });

  it('returns false for the prefixed registry id', () => {
    expect(isKnownCity('place:greenville')).toBe(false);
  });

  it('returns false for capitalized input', () => {
    expect(isKnownCity('Greenville')).toBe(false);
  });

  it('returns false for the empty string', () => {
    expect(isKnownCity('')).toBe(false);
  });

  it('returns false for inherited Object property names', () => {
    expect(isKnownCity('constructor')).toBe(false);
    expect(isKnownCity('toString')).toBe(false);
    expect(isKnownCity('__proto__')).toBe(false);
  });
});

describe('countyForCity', () => {
  it('maps greenville to greenville', () => {
    expect(countyForCity('greenville')).toEqual({ ok: true, value: 'greenville' });
  });

  it('maps charleston to charleston', () => {
    expect(countyForCity('charleston')).toEqual({ ok: true, value: 'charleston' });
  });

  it('maps north-charleston to charleston, so city and county differ', () => {
    expect(countyForCity('north-charleston')).toEqual({ ok: true, value: 'charleston' });
  });

  it('maps mount-pleasant to charleston', () => {
    expect(countyForCity('mount-pleasant')).toEqual({ ok: true, value: 'charleston' });
  });

  it('lowercases a mixed-case county name like McCormick', () => {
    expect(countyForCity('mccormick')).toEqual({ ok: true, value: 'mccormick' });
  });

  it('returns unknown_city for a city outside the registry', () => {
    expect(countyForCity('atlanta')).toEqual({ ok: false, code: 'unknown_city' });
  });

  it('returns unknown_city for the prefixed registry id', () => {
    expect(countyForCity('place:greenville')).toEqual({ ok: false, code: 'unknown_city' });
  });
});

describe('registry consistency', () => {
  it('resolves every allowlisted slug to a lowercase county slug', () => {
    for (const slug of allCitySlugs()) {
      const result = countyForCity(slug);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value).toBe(result.value.toLowerCase());
      expect(result.value).not.toMatch(/\s/);
    }
  });

  // countyForCity lowercases the registry's `county` field and does nothing
  // else. That is only correct while every place: entry carries a bare
  // single-word county -- no embedded whitespace, no trailing "County".
  // registry.json is regenerated by a separate script, so assert the shape
  // here: if the convention ever changes, this fails loudly instead of
  // jurisdictions.ts silently emitting a county slug like "greenville county".
  it('gives every place: entry a bare single-word county, so lowercasing is the whole slug rule', () => {
    const entries = (registry as { jurisdictions?: Array<{ id?: unknown; county?: unknown }> })
      .jurisdictions ?? [];
    const places = entries.filter(
      (entry) => typeof entry.id === 'string' && entry.id.startsWith('place:'),
    );

    expect(places.length).toBeGreaterThan(0);

    for (const place of places) {
      expect(typeof place.county).toBe('string');
      const county = place.county as string;
      expect(county).toMatch(/^[A-Za-z]+$/);
      expect(county).not.toMatch(/county$/i);
    }
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/jurisdictions.test.ts`

Expected: FAIL — the module does not exist yet, so every test in the file errors before running:

```
Error: Failed to load url ./jurisdictions.js (resolved id: ./jurisdictions.js)
in src/lib/jurisdictions.test.ts.
Does the file exist?
```

- [ ] **Step 3: Implement**

Create `src/lib/jurisdictions.ts` with exactly this content:

```typescript
/**
 * Jurisdictions -- the city allowlist for event submission, and the
 * city-to-county derivation.
 *
 * `county` is never submitted by a user. It is derived here from the
 * submitted `city`, which itself must be a member of the allowlist. That
 * makes both fields enums rather than free text, which is the injection
 * defense described in the events-calendar design doc (section 6).
 *
 * Source of truth is src/data/registry.json. Entries whose `id` starts with
 * 'place:' are cities; the slug is the id with that prefix removed. The
 * county slug is the entry's `county` field lowercased.
 *
 * That last step is deliberately just a lowercase. Every place: entry in the
 * registry carries a bare single-word county ("Greenville", "McCormick") --
 * no embedded whitespace, no trailing "County" -- so there is nothing else to
 * normalize. jurisdictions.test.ts asserts that shape against registry.json
 * directly, so if the registry is ever regenerated under a different
 * convention the test fails rather than this module silently emitting a
 * malformed slug.
 */

import { ok, err } from './text-result.js';
import type { Ok, Err } from './text-result.js';
import registry from '../data/registry.json';

interface RegistryEntry {
  id?: unknown;
  county?: unknown;
}

interface Registry {
  jurisdictions?: RegistryEntry[];
}

const PLACE_PREFIX = 'place:';

/**
 * Registry county values are bare single words, so the slug is the lowercased
 * name. See the module doc comment and the 'registry consistency' tests for
 * why no further normalization belongs here.
 * "Greenville" -> "greenville", "McCormick" -> "mccormick".
 */
function slugifyCounty(name: string): string {
  return name.trim().toLowerCase();
}

function buildCityToCounty(): Map<string, string> {
  const map = new Map<string, string>();
  const entries = (registry as Registry).jurisdictions ?? [];

  for (const entry of entries) {
    if (typeof entry.id !== 'string') continue;
    if (!entry.id.startsWith(PLACE_PREFIX)) continue;
    if (typeof entry.county !== 'string') continue;

    const slug = entry.id.slice(PLACE_PREFIX.length);
    const county = slugifyCounty(entry.county);
    if (slug === '' || county === '') continue;

    map.set(slug, county);
  }

  return map;
}

// A Map, not a plain object, so lookups cannot hit inherited keys like
// 'constructor' or '__proto__'.
const CITY_TO_COUNTY: ReadonlyMap<string, string> = buildCityToCounty();

const CITY_SLUGS: readonly string[] = Object.freeze([...CITY_TO_COUNTY.keys()]);

export function allCitySlugs(): readonly string[] {
  return CITY_SLUGS;
}

export function isKnownCity(slug: string): boolean {
  return CITY_TO_COUNTY.has(slug);
}

export function countyForCity(slug: string): Ok<string> | Err<'unknown_city'> {
  const county = CITY_TO_COUNTY.get(slug);
  if (county === undefined) return err('unknown_city');
  return ok(county);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/jurisdictions.test.ts`

Expected: PASS — 23 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/jurisdictions.ts src/lib/jurisdictions.test.ts
git commit -m "feat: add city allowlist and city-to-county derivation"
```

---

---

---

### Task 6: JSON island escaping

**Files:**
- Create: `src/lib/json-island.ts`
- Test: `src/lib/json-island.test.ts`

> **Authoring rule for this task — non-negotiable.** U+2028 (LINE SEPARATOR) and
> U+2029 (PARAGRAPH SEPARATOR) must NEVER be typed as literal characters in either
> file. Write them only as `\u2028` / `\u2029` escapes inside a normal string or a
> regex character class. A literal U+2028 in a regex literal is a `SyntaxError`
> (it is a LineTerminator in the ECMAScript grammar), and literal copies of either
> character silently degrade to plain spaces when the source is copied through
> chat, diffs, or clipboards — which turns every U+2028 test into a no-op.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { toJsonIsland } from './json-island.js';

// The canonical breakout: JSON.stringify does NOT escape "</script>", and the HTML
// tokenizer ends a <script> element at the first literal occurrence regardless of
// JS string context. If this string survives unescaped, the data island is an XSS.
const BREAKOUT = '</script><img src=x onerror=alert(1)>';

// U+2028 / U+2029 appear ONLY as escapes here — never as literal characters.
const LS = '\u2028';
const PS = '\u2029';

describe('toJsonIsland', () => {
  it('round-trips a plain object unchanged through JSON.parse', () => {
    const value = { id: 'k7m29qxb', title: 'Greenville meetup', count: 3, ok: true, none: null };
    const out = toJsonIsland(value);
    expect(JSON.parse(out)).toEqual(value);
  });

  it('escapes a </script> breakout inside a string value', () => {
    const value = { title: BREAKOUT };
    const out = toJsonIsland(value);

    expect(out).not.toContain('</script');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).toContain('\\u003c');
    expect(out).toContain('\\u003e');

    // Lossless: the escape must not change the parsed value.
    expect(JSON.parse(out)).toEqual({ title: BREAKOUT });
    expect(JSON.parse(out).title).toBe(BREAKOUT);
  });

  it('escapes a </script> breakout inside an object key', () => {
    const value = { [BREAKOUT]: 'value' };
    const out = toJsonIsland(value);

    expect(out).not.toContain('</script');
    expect(out).not.toContain('<');
    expect(JSON.parse(out)).toEqual(value);
    expect(Object.keys(JSON.parse(out))).toEqual([BREAKOUT]);
  });

  it('escapes < and > wherever they appear', () => {
    const value = ['a < b', 'c > d', '<!--', '-->'];
    const out = toJsonIsland(value);

    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('escapes ampersands', () => {
    const value = { title: 'Cops & Cameras' };
    const out = toJsonIsland(value);

    expect(out).not.toContain('&');
    expect(out).toContain('\\u0026');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('escapes U+2028 and U+2029 and round-trips them', () => {
    const value = { title: `line${LS}sep`, description: `para${PS}sep` };
    const out = toJsonIsland(value);

    // JSON.stringify leaves these raw; they are legal in JSON but hostile in HTML/JS contexts.
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');

    expect(JSON.parse(out)).toEqual(value);
  });

  it('round-trips every escaped character losslessly through JSON.parse', () => {
    // One fixture exercising all five escape targets: in key position, in value
    // position, nested, and adjacent to one another.
    const key = `<key>&${LS}${PS}`;
    const value = {
      [key]: [BREAKOUT, 'a & b', `${PS}leading`, { deep: `<>&${LS}${PS}` }],
      plain: 'unchanged',
      numbers: [1, 2.5, -3],
    };
    const out = toJsonIsland(value);

    for (const raw of ['<', '>', '&', '\u2028', '\u2029']) {
      expect(out).not.toContain(raw);
    }

    // The escaping is proven lossless: parsing the escaped output deep-equals the input.
    const parsed = JSON.parse(out);
    expect(parsed).toEqual(value);
    expect(Object.keys(parsed)).toEqual(Object.keys(value));
    expect(parsed[key][3].deep).toBe(`<>&${LS}${PS}`);
  });

  it('leaves structural JSON punctuation intact', () => {
    const value = { list: [1, 2, { nested: ['a', 'b'] }] };
    const out = toJsonIsland(value);

    expect(out).toBe('{"list":[1,2,{"nested":["a","b"]}]}');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('is lossless for a full event-shaped record', () => {
    const value = {
      id: 'k7m29qxb',
      type: 'public',
      title: `Council meeting <ALPR> & ${BREAKOUT}`,
      description: `Line one${LS}line two${PS}line three`,
      date: '2026-08-22',
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: '301 University Ridge, Greenville',
      hasSignalGroup: true,
      recurrence: { freq: 'weekly', until: '2027-02-22' },
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
    };
    const out = toJsonIsland(value);

    expect(out).not.toContain('</script');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('&');
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('leaves ordinary non-ASCII text untouched', () => {
    const value = { title: 'Reunión en Ñ Street — café' };
    const out = toJsonIsland(value);

    expect(out).toContain('Reunión');
    expect(JSON.parse(out)).toEqual(value);
  });

  it('emits "null" for values JSON.stringify cannot represent', () => {
    expect(toJsonIsland(undefined)).toBe('null');
    expect(toJsonIsland(() => 'nope')).toBe('null');
    expect(JSON.parse(toJsonIsland(undefined))).toBe(null);
  });

  it('escapes every dangerous character in one adversarial string', () => {
    const nasty = `<>&${LS}${PS}</script></SCRIPT >`;
    const out = toJsonIsland({ nasty });

    for (const ch of ['<', '>', '&', '\u2028', '\u2029']) {
      expect(out).not.toContain(ch);
    }
    expect(JSON.parse(out).nasty).toBe(nasty);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/json-island.test.ts`

Expected: FAIL — Vitest cannot resolve the import because `src/lib/json-island.ts` does not exist yet:

```
Error: Failed to resolve import "./json-island.js" from "src/lib/json-island.test.ts". Does the file exist?
```

- [ ] **Step 3: Implement**

```typescript
/**
 * Safe embedding of JSON into a `<script type="application/json">` element.
 *
 * `JSON.stringify` does not escape `</script>`. The HTML tokenizer ends a script
 * element at the first literal occurrence regardless of JS string context, so a
 * title of `</script><img src=x onerror=...>` breaks out of the data island.
 * U+2028 and U+2029 are legal in JSON but hostile in JS/HTML contexts.
 *
 * Escaping is lossless: `\uXXXX` is a legal JSON string escape, so the
 * output always `JSON.parse`s back to the original value.
 *
 * NOTE: U+2028 and U+2029 appear below only as `\u2028` / `\u2029` escapes. Never
 * paste them as literal characters — a literal U+2028 inside the regex literal
 * is a SyntaxError, because U+2028 is a LineTerminator in the ECMAScript grammar
 * and a regex literal may not contain one.
 */

/** Escape targets. Keys are the raw characters; values are JSON `\uXXXX` escapes. */
const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Flat character class, no quantifiers, no alternation, no backreferences —
 * it cannot backtrack, so hostile input cannot make it expensive. The two
 * separators are spelled as escapes; a literal U+2028 here would not parse.
 */
const DANGEROUS = /[<>&\u2028\u2029]/g;

/**
 * Serialize `value` to a JSON string that is safe to place inside a
 * `<script type="application/json">` element.
 *
 * Returns the literal string `"null"` for values JSON cannot represent
 * (`undefined`, functions, symbols), so callers always get parseable output.
 */
export function toJsonIsland(value: unknown): string {
  const json = JSON.stringify(value);

  // JSON.stringify returns undefined for undefined, functions, and symbols.
  if (json === undefined) return 'null';

  // In JSON, none of the escaped characters can appear outside a string literal,
  // so a global replace can never touch structural punctuation.
  return json.replace(DANGEROUS, (ch) => ESCAPES[ch]);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/json-island.test.ts`

Expected: PASS — 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/json-island.ts src/lib/json-island.test.ts
git commit -m "feat(events): add toJsonIsland for safe data-island embedding"
```

---

---

---

### Task 7: `toPublicEvent()` allowlist projection

This is the spec's single highest-consequence rule (design doc §5, "Reading events out"). The stored record carries `signalUrl`, `codeDigest`, and `revoked`. The public API response must carry none of them, and must keep carrying none of them when someone adds a new field to the store later. The projection therefore **picks** an explicit field list and **never spreads** the record.

**Files:**
- Create: `src/lib/public-event.ts`
- Test: `src/lib/public-event.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/public-event.test.ts` with exactly this content:

```typescript
import { describe, it, expect } from 'vitest';
import {
  toPublicEvent,
  PUBLIC_EVENT_FIELDS,
  type StoredEvent,
  type PublicEvent,
} from './public-event.js';

// Distinctive secret values, chosen so a substring search for them cannot
// collide with anything a legitimate public field would contain.
const SECRET_SIGNAL_URL = 'https://signal.group/#QUJDREVGZ2hpamtsbW5vcHFy';
const SECRET_CODE_DIGEST = 'deadbeef'.repeat(8); // 64 lowercase hex chars
const EXTRA_KEY = 'submitterIpHash';
const EXTRA_VALUE = 'do-not-publish-this-value';

const publicRecord: StoredEvent = {
  id: 'k7m29qxb',
  type: 'public',
  title: 'Greenville County Council meeting',
  description: 'Public comment period on the ALPR contract renewal.',
  date: '2026-08-22',
  time: '19:00',
  city: 'greenville',
  county: 'greenville',
  address: '301 University Ridge, Greenville',
  hasSignalGroup: true,
  recurrence: { freq: 'monthly_nth', until: '2027-02-22' },
  organizer: 'handle-jay',
  createdAt: '2026-08-17T14:22:00Z',
  signalUrl: SECRET_SIGNAL_URL,
  codeDigest: SECRET_CODE_DIGEST,
  revoked: false,
};

const meetupRecord: StoredEvent = {
  id: 'b3n81vqd',
  type: 'meetup',
  title: 'Sign night',
  description: null,
  date: '2026-09-04',
  time: '18:30',
  city: 'columbia',
  county: 'richland',
  address: null,
  hasSignalGroup: true,
  recurrence: null,
  organizer: 'handle-rae',
  createdAt: '2026-08-18T09:05:00Z',
  signalUrl: SECRET_SIGNAL_URL,
  codeDigest: SECRET_CODE_DIGEST,
  revoked: true,
};

// A record that also carries a property nobody declared — simulating a field
// added to the Blobs store by a later change that forgot about this module.
const recordWithExtraField = {
  ...publicRecord,
  [EXTRA_KEY]: EXTRA_VALUE,
} as unknown as StoredEvent;

describe('PUBLIC_EVENT_FIELDS', () => {
  it('lists exactly the thirteen public fields, in data-model order', () => {
    expect(PUBLIC_EVENT_FIELDS).toEqual([
      'id',
      'type',
      'title',
      'description',
      'date',
      'time',
      'city',
      'county',
      'address',
      'hasSignalGroup',
      'recurrence',
      'organizer',
      'createdAt',
    ]);
  });

  it('contains none of the secret field names', () => {
    const names: readonly string[] = PUBLIC_EVENT_FIELDS;
    expect(names).not.toContain('signalUrl');
    expect(names).not.toContain('codeDigest');
    expect(names).not.toContain('revoked');
  });
});

describe('toPublicEvent', () => {
  it('copies every public field with its exact value', () => {
    const result = toPublicEvent(publicRecord);
    const expected: PublicEvent = {
      id: 'k7m29qxb',
      type: 'public',
      title: 'Greenville County Council meeting',
      description: 'Public comment period on the ALPR contract renewal.',
      date: '2026-08-22',
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: '301 University Ridge, Greenville',
      hasSignalGroup: true,
      recurrence: { freq: 'monthly_nth', until: '2027-02-22' },
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
    };
    expect(result).toEqual(expected);
  });

  it('returns an object whose own keys are exactly PUBLIC_EVENT_FIELDS', () => {
    expect(Object.keys(toPublicEvent(publicRecord))).toEqual([...PUBLIC_EVENT_FIELDS]);
  });

  it('omits signalUrl, codeDigest and revoked', () => {
    const result = toPublicEvent(publicRecord);
    expect(Object.prototype.hasOwnProperty.call(result, 'signalUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'codeDigest')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'revoked')).toBe(false);
  });

  it('drops an unrecognized property added to the stored record', () => {
    const result = toPublicEvent(recordWithExtraField);
    expect(Object.prototype.hasOwnProperty.call(result, EXTRA_KEY)).toBe(false);
    expect(Object.keys(result)).toEqual([...PUBLIC_EVENT_FIELDS]);
  });

  it('serializes without any secret key name or secret value', () => {
    // The critical test: this is the exact shape of the /api/events response.
    const serialized = JSON.stringify(toPublicEvent(recordWithExtraField));

    expect(serialized).not.toContain('signalUrl');
    expect(serialized).not.toContain('codeDigest');
    expect(serialized).not.toContain('revoked');
    expect(serialized).not.toContain(EXTRA_KEY);

    expect(serialized).not.toContain(SECRET_SIGNAL_URL);
    expect(serialized).not.toContain('signal.group');
    expect(serialized).not.toContain(SECRET_CODE_DIGEST);
    expect(serialized).not.toContain('deadbeef');
    expect(serialized).not.toContain(EXTRA_VALUE);

    // And every public field survived the projection.
    const parsed = JSON.parse(serialized);
    for (const field of PUBLIC_EVENT_FIELDS) {
      expect(parsed).toHaveProperty(field);
      expect(parsed[field]).toEqual(publicRecord[field]);
    }
  });

  it('preserves nulls for a meetup record', () => {
    const result = toPublicEvent(meetupRecord);
    expect(result.description).toBeNull();
    expect(result.address).toBeNull();
    expect(result.recurrence).toBeNull();
    expect(Object.keys(result)).toEqual([...PUBLIC_EVENT_FIELDS]);
  });

  it('drops the secrets from a revoked meetup record too', () => {
    const serialized = JSON.stringify(toPublicEvent(meetupRecord));
    expect(serialized).not.toContain('revoked');
    expect(serialized).not.toContain(SECRET_SIGNAL_URL);
    expect(serialized).not.toContain(SECRET_CODE_DIGEST);
  });

  it('preserves the recurrence object', () => {
    const result = toPublicEvent(publicRecord);
    expect(result.recurrence).toEqual({ freq: 'monthly_nth', until: '2027-02-22' });
  });

  it('does not mutate the input record', () => {
    const input: StoredEvent = { ...publicRecord };
    toPublicEvent(input);
    expect(input.signalUrl).toBe(SECRET_SIGNAL_URL);
    expect(input.codeDigest).toBe(SECRET_CODE_DIGEST);
    expect(input.revoked).toBe(false);
    expect(Object.keys(input).length).toBe(PUBLIC_EVENT_FIELDS.length + 3);
  });

  it('returns a new object, not the input reference', () => {
    const result = toPublicEvent(publicRecord);
    expect(result).not.toBe(publicRecord as unknown as PublicEvent);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/lib/public-event.test.ts`

Expected: FAIL — Vite cannot resolve the module, because `src/lib/public-event.ts` does not exist yet:

```
Error: Failed to resolve import "./public-event.js" from "src/lib/public-event.test.ts". Does the file exist?
```

- [ ] **Step 3: Implement**

Create `src/lib/public-event.ts` with exactly this content:

```typescript
/**
 * The event record as it is stored in the Netlify Blobs `events` store.
 *
 * It carries three fields that must never reach a browser: `signalUrl` (a live
 * Signal invite), `codeDigest` (which would cluster events by organizer across
 * pseudonyms), and `revoked` (which would publish which organizer was burned
 * and when).
 */
export interface StoredEvent {
  id: string;
  type: 'meetup' | 'public';
  title: string;
  description: string | null;
  date: string;
  time: string;
  city: string;
  county: string;
  address: string | null;
  hasSignalGroup: boolean;
  recurrence: { freq: 'weekly' | 'monthly_nth'; until: string } | null;
  organizer: string;
  createdAt: string;
  signalUrl: string | null;
  codeDigest: string;
  revoked: boolean;
}

/**
 * The event record as it is published: the exact field set of
 * `src/data/events.json` and of the `/api/events` response.
 */
export interface PublicEvent {
  id: string;
  type: 'meetup' | 'public';
  title: string;
  description: string | null;
  date: string;
  time: string;
  city: string;
  county: string;
  address: string | null;
  hasSignalGroup: boolean;
  recurrence: { freq: 'weekly' | 'monthly_nth'; until: string } | null;
  organizer: string;
  createdAt: string;
}

/**
 * The allowlist. Adding a field to `StoredEvent` does NOT publish it; a field
 * only becomes public by being added here and to `PublicEvent` deliberately.
 */
export const PUBLIC_EVENT_FIELDS: readonly (keyof PublicEvent)[] = [
  'id',
  'type',
  'title',
  'description',
  'date',
  'time',
  'city',
  'county',
  'address',
  'hasSignalGroup',
  'recurrence',
  'organizer',
  'createdAt',
];

/**
 * Project a stored record down to its publishable fields.
 *
 * This picks each allowlisted field by name. It must never spread the record
 * (`{ ...record }`) and must never delete fields from a copy: both of those
 * publish anything added to the store later, which is exactly the failure this
 * function exists to prevent.
 */
export function toPublicEvent(record: StoredEvent): PublicEvent {
  const projected: Partial<PublicEvent> = {};

  for (const field of PUBLIC_EVENT_FIELDS) {
    // Cast because TypeScript cannot see, inside the loop, that the key and
    // the value type line up. The key itself is statically an allowlisted one.
    (projected as Record<string, unknown>)[field] = record[field];
  }

  return projected as PublicEvent;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/public-event.test.ts`

Expected: PASS — 12 tests (2 in `PUBLIC_EVENT_FIELDS`, 9 in `toPublicEvent`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/public-event.ts src/lib/public-event.test.ts
git commit -m "feat(events): add toPublicEvent allowlist projection

Projects a stored event down to its publishable fields by picking an
explicit allowlist, so signalUrl, codeDigest, revoked, and any field
added to the Blobs store later are denied by construction rather than
by remembering to delete them."
```

---

---

---

### Task 8: Blobs store factory

Every Netlify Blobs handle in this codebase is created here and nowhere else. The module enforces two rules centrally so no call site has to remember them:

1. `getStore`, never the deploy-scoped variant. A deploy-scoped store is discarded on the next deploy, so every stored event would silently vanish on the next push.
2. Site-wide stores are shared across production, branch, and deploy-preview deploys. A preview deploy's functions would otherwise be able to write to and delete from the real `codes` store, which has no backup. So every handle is wrapped: `set`, `setJSON`, `delete`, and `deleteAll` throw `ContextRefusedError` unless `process.env.CONTEXT === 'production'`. Reads pass through untouched.

`codes`, `events`, and `links` are opened with `{ consistency: 'strong' }` — the default eventual model lets a revoked code keep working, a tombstoned event keep resolving its Signal invite, and a freshly set (or cleared) intake link lag, for up to 60 seconds.

**Files:**
- Modify: `package.json` (add `@netlify/blobs` to `dependencies`)
- Modify: `package-lock.json` (regenerated by npm)
- Create: `src/lib/blob-stores.test.ts`
- Create: `src/lib/blob-stores.ts`

All paths are relative to the repo root, `the repo root`.

---

- [ ] **Step 1: Add `@netlify/blobs` as a pinned dependency**

  This machine enforces a 30-day minimum release age on package installs. `@netlify/blobs@11.0.0` and `10.7.13` are both too new. **Pin `10.7.9` exactly** (published 2026-05-29, ~81 days old as of 2026-08-18) — no caret, so a later `npm install` cannot float it forward into gated territory.

  Its transitive tree matters too: `@netlify/blobs@10.7.9` depends on `@netlify/otel: ^6.0.3`, which would otherwise resolve to `6.0.6` (published 2026-08-12, 6 days old) and trip the gate. Resolve the whole subtree as of a cutoff date instead of chasing individual overrides:

  ```
  npm install @netlify/blobs@10.7.9 --save-exact --before=2026-07-19
  ```

  `--before=2026-07-19` is "30 days before 2026-08-18". It only ever makes resolutions older, so running this command on a later date is still correct — do not move the date forward. This resolves 47 new packages, the newest of which (`es-module-lexer@2.3.1`) was published 2026-07-12; everything lands at least 30 days old. Existing lockfile entries are untouched — the diff is additions only.

  It goes in `dependencies`, not `devDependencies`: Netlify's function bundler only bundles from `dependencies`.

  Expected `package.json` diff:

  ```diff
     "dependencies": {
       "@astrojs/rss": "^4.0.15",
       "@astrojs/sitemap": "^3.7.1",
       "@fontsource-variable/instrument-sans": "^5.2.8",
       "@fontsource/dm-mono": "^5.2.7",
  +    "@netlify/blobs": "10.7.9",
       "@tailwindcss/vite": "^4.2.1",
       "@tinacms/cli": "^2.1.9",
  ```

  Verify:

  ```
  node -p "require('./package.json').dependencies['@netlify/blobs']"
  ```

  Expected output: `10.7.9`

  ```
  node -p "require('@netlify/blobs').getStore.length"
  ```

  Expected output: `1`

  If the package-age gate hook blocks the install anyway, **stop and report the exact package and version it named.** Do not pass a bypass flag and do not disable the hook. The fix is to find the newest version of the blocked package that is at least 30 days old (`npm view <pkg> time --json`) and pin it in the existing `overrides` block in `package.json`.

- [ ] **Step 2: Write the failing test**

  Create `src/lib/blob-stores.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import type { Store } from '@netlify/blobs';

  // vi.mock calls are hoisted above the imports, so a plain `const mock = vi.fn()`
  // at module scope would still be in its temporal dead zone when the mock factory
  // runs. vi.hoisted is the supported way to create the spy early enough.
  const { getStoreMock } = vi.hoisted(() => ({ getStoreMock: vi.fn() }));

  vi.mock('@netlify/blobs', () => ({ getStore: getStoreMock }));

  import {
    ContextRefusedError,
    codesStore,
    eventsStore,
    linksStore,
    metaStore,
    rateLimitStore,
  } from './blob-stores.js';

  /** Stand-in for a real Netlify Store: same method names, all spied. */
  function makeFakeStore() {
    return {
      get: vi.fn(async () => 'stored-value'),
      getWithMetadata: vi.fn(async () => ({
        data: 'stored-value',
        etag: 'etag-1',
        metadata: {},
      })),
      list: vi.fn(async () => ({ blobs: [{ key: 'k7m29qxb', etag: 'etag-1' }], directories: [] })),
      set: vi.fn(async () => ({ etag: 'etag-2', modified: true })),
      setJSON: vi.fn(async () => ({ etag: 'etag-2', modified: true })),
      delete: vi.fn(async () => undefined),
      deleteAll: vi.fn(async () => ({ deleted: 1 })),
    };
  }

  let fake: ReturnType<typeof makeFakeStore>;
  const originalContext = process.env.CONTEXT;

  beforeEach(() => {
    fake = makeFakeStore();
    getStoreMock.mockReset();
    getStoreMock.mockImplementation(() => fake as unknown as Store);
  });

  afterEach(() => {
    if (originalContext === undefined) {
      delete process.env.CONTEXT;
    } else {
      process.env.CONTEXT = originalContext;
    }
  });

  describe('store configuration', () => {
    it('opens the events store with strong consistency', () => {
      eventsStore();
      expect(getStoreMock).toHaveBeenCalledWith({ name: 'events', consistency: 'strong' });
    });

    it('opens the codes store with strong consistency', () => {
      codesStore();
      expect(getStoreMock).toHaveBeenCalledWith({ name: 'codes', consistency: 'strong' });
    });

    it('opens the ratelimit store without a consistency override', () => {
      rateLimitStore();
      expect(getStoreMock).toHaveBeenCalledWith({ name: 'ratelimit' });
    });

    it('opens the meta store without a consistency override', () => {
      metaStore();
      expect(getStoreMock).toHaveBeenCalledWith({ name: 'meta' });
    });

    it('opens the links store with strong consistency', () => {
      linksStore();
      expect(getStoreMock).toHaveBeenCalledWith({ name: 'links', consistency: 'strong' });
    });

    it('never imports or calls the deploy-scoped store helper', () => {
      // Asserted against the import line rather than the whole file so the module
      // docblock is free to name the forbidden API when explaining why.
      const source = readFileSync(
        fileURLToPath(new URL('./blob-stores.ts', import.meta.url)),
        'utf8',
      );
      const importLine = source
        .split('\n')
        .find((line) => line.includes("from '@netlify/blobs'"));

      expect(importLine).toBeDefined();
      expect(importLine).not.toContain('getDeployStore');
      expect(source).not.toMatch(/getDeployStore\s*\(/);
    });
  });

  describe.each(['deploy-preview', 'branch-deploy', 'dev'])('CONTEXT=%s', (context) => {
    beforeEach(() => {
      process.env.CONTEXT = context;
    });

    it('refuses set', () => {
      const store = eventsStore();
      expect(() => store.set('k7m29qxb', 'x')).toThrow(ContextRefusedError);
      expect(fake.set).not.toHaveBeenCalled();
    });

    it('refuses setJSON', () => {
      const store = eventsStore();
      expect(() => store.setJSON('k7m29qxb', { title: 'x' })).toThrow(ContextRefusedError);
      expect(fake.setJSON).not.toHaveBeenCalled();
    });

    it('refuses delete', () => {
      const store = codesStore();
      expect(() => store.delete('deadbeef')).toThrow(ContextRefusedError);
      expect(fake.delete).not.toHaveBeenCalled();
    });

    it('refuses deleteAll', () => {
      const store = codesStore();
      expect(() => store.deleteAll()).toThrow(ContextRefusedError);
      expect(fake.deleteAll).not.toHaveBeenCalled();
    });

    it('still allows get', async () => {
      const store = eventsStore();
      await expect(store.get('k7m29qxb')).resolves.toBe('stored-value');
      expect(fake.get).toHaveBeenCalledWith('k7m29qxb');
    });

    it('still allows getWithMetadata and list', async () => {
      const store = eventsStore();
      await expect(store.getWithMetadata('k7m29qxb')).resolves.toEqual({
        data: 'stored-value',
        etag: 'etag-1',
        metadata: {},
      });
      await expect(store.list()).resolves.toEqual({
        blobs: [{ key: 'k7m29qxb', etag: 'etag-1' }],
        directories: [],
      });
    });
  });

  describe('CONTEXT unset', () => {
    beforeEach(() => {
      delete process.env.CONTEXT;
    });

    it('refuses writes', () => {
      const store = eventsStore();
      expect(() => store.set('k7m29qxb', 'x')).toThrow(ContextRefusedError);
      expect(fake.set).not.toHaveBeenCalled();
    });

    it('still allows reads', async () => {
      const store = eventsStore();
      await expect(store.get('k7m29qxb')).resolves.toBe('stored-value');
    });
  });

  describe('ContextRefusedError', () => {
    it('is an Error naming the store, the operation, and the context', () => {
      process.env.CONTEXT = 'deploy-preview';
      const store = codesStore();

      let caught: unknown;
      try {
        store.delete('deadbeef');
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect(caught).toBeInstanceOf(ContextRefusedError);
      expect((caught as Error).name).toBe('ContextRefusedError');
      expect((caught as Error).message).toContain('codes');
      expect((caught as Error).message).toContain('delete');
      expect((caught as Error).message).toContain('deploy-preview');
    });

    it('reads CONTEXT at call time, not at store-creation time', () => {
      process.env.CONTEXT = 'production';
      const store = eventsStore();

      process.env.CONTEXT = 'branch-deploy';
      expect(() => store.set('k7m29qxb', 'x')).toThrow(ContextRefusedError);
      expect(fake.set).not.toHaveBeenCalled();
    });
  });

  describe('CONTEXT=production', () => {
    beforeEach(() => {
      process.env.CONTEXT = 'production';
    });

    it('passes set through', async () => {
      const store = eventsStore();
      await expect(store.set('k7m29qxb', 'x')).resolves.toEqual({
        etag: 'etag-2',
        modified: true,
      });
      expect(fake.set).toHaveBeenCalledWith('k7m29qxb', 'x');
    });

    it('passes setJSON through with its options argument intact', async () => {
      const store = rateLimitStore();
      await store.setJSON('rl/2026-08-17/abc123', { used: 1 }, { onlyIfMatch: 'etag-1' });
      expect(fake.setJSON).toHaveBeenCalledWith(
        'rl/2026-08-17/abc123',
        { used: 1 },
        { onlyIfMatch: 'etag-1' },
      );
    });

    it('passes delete through', async () => {
      const store = codesStore();
      await store.delete('deadbeef');
      expect(fake.delete).toHaveBeenCalledWith('deadbeef');
    });

    it('passes deleteAll through', async () => {
      const store = metaStore();
      await expect(store.deleteAll()).resolves.toEqual({ deleted: 1 });
      expect(fake.deleteAll).toHaveBeenCalled();
    });
  });

  describe('links store', () => {
    it('refuses writes outside production', () => {
      process.env.CONTEXT = 'deploy-preview';
      const store = linksStore();
      expect(() => store.setJSON('intake', 'https://signal.group/#x')).toThrow(
        ContextRefusedError,
      );
      expect(fake.setJSON).not.toHaveBeenCalled();
    });

    it('passes writes through in production', async () => {
      process.env.CONTEXT = 'production';
      const store = linksStore();
      await store.setJSON('intake', 'https://signal.group/#x');
      expect(fake.setJSON).toHaveBeenCalledWith('intake', 'https://signal.group/#x');
    });
  });
  ```

- [ ] **Step 3: Run the test and watch it fail**

  ```
  npx vitest run src/lib/blob-stores.test.ts
  ```

  Expected failure — the suite fails to load because the module under test does not exist yet:

  ```
   ❯ src/lib/blob-stores.test.ts (0 test)

  ⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

   FAIL  src/lib/blob-stores.test.ts [ src/lib/blob-stores.test.ts ]
  Error: Cannot find module './blob-stores.js' imported from 'src/lib/blob-stores.test.ts'

   Test Files  1 failed (1)
        Tests  no tests
  ```

  If instead you see `Cannot find package '@netlify/blobs'`, Step 1 did not complete — go back and finish the install before continuing.

- [ ] **Step 4: Implement the store factory**

  Create `src/lib/blob-stores.ts` with exactly this content:

  ```ts
  import { getStore, type Store } from '@netlify/blobs';

  /**
   * The single source of Netlify Blobs handles for this site.
   *
   * Two rules are enforced here rather than at each call site:
   *
   * 1. Always `getStore`, never `getDeployStore`. A deploy-scoped store is
   *    discarded when its deploy is superseded, so every stored event would
   *    silently vanish on the next push.
   *
   * 2. Site-wide stores are shared across production, branch, and deploy-preview
   *    deploys. Without a guard, a preview deploy's functions could write to and
   *    delete from the real `codes` store, which has no backup and is therefore
   *    the one unrecoverable delete in the system. So every handle returned here
   *    is wrapped: writes and deletes throw ContextRefusedError unless
   *    `process.env.CONTEXT === 'production'`. Reads pass through unchanged.
   *
   * CONTEXT is read on every write call, not captured when the handle is created.
   *
   * The refusal is a synchronous throw rather than a rejected promise, so a call
   * site that forgets to await still fails loudly.
   *
   * `codes`, `events`, and `links` open with `consistency: 'strong'`. Under the
   * default eventual model a revoked code keeps validating, a tombstoned event
   * keeps resolving its Signal invite, and a just-set intake link stays stale,
   * for up to 60 seconds.
   *
   * One sanctioned bypass: the maintainer CLI (`scripts/organizer-codes.mjs`)
   * writes to the real production store from a developer machine, where CONTEXT
   * is unset. It opts in explicitly by setting `process.env.CONTEXT = 'production'`
   * before calling these factories. That path already requires local possession of
   * both the Netlify token and the pepper.
   */

  export class ContextRefusedError extends Error {
    readonly storeName: string;
    readonly operation: string;
    readonly context: string;

    constructor(storeName: string, operation: string, context: string) {
      super(
        `Refused ${operation}() on Blobs store "${storeName}": writes and deletes ` +
          `are only permitted when CONTEXT is "production" (CONTEXT is "${context}").`,
      );
      this.name = 'ContextRefusedError';
      this.storeName = storeName;
      this.operation = operation;
      this.context = context;
    }
  }

  const WRITE_METHODS: ReadonlySet<string> = new Set([
    'set',
    'setJSON',
    'delete',
    'deleteAll',
  ]);

  function readOnlyOutsideProduction(store: Store, storeName: string): Store {
    return new Proxy(store, {
      get(target, property) {
        const value = Reflect.get(target, property);

        if (typeof property === 'string' && WRITE_METHODS.has(property)) {
          return (...args: unknown[]) => {
            const context = process.env.CONTEXT ?? 'unset';
            if (context !== 'production') {
              throw new ContextRefusedError(storeName, property, context);
            }
            return (value as (...callArgs: unknown[]) => unknown).apply(target, args);
          };
        }

        // Bind so the underlying methods keep their own `this` instead of the proxy.
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  /** Event records, keyed by the 8-char opaque event id. Server-generated keys only. */
  export function eventsStore(): Store {
    return readOnlyOutsideProduction(
      getStore({ name: 'events', consistency: 'strong' }),
      'events',
    );
  }

  /** Organizer code records, keyed by the HMAC digest of the normalized code. */
  export function codesStore(): Store {
    return readOnlyOutsideProduction(
      getStore({ name: 'codes', consistency: 'strong' }),
      'codes',
    );
  }

  /** Daily rate-limit counters, keyed `rl/<yyyy-mm-dd>/<hashed-subject>`. */
  export function rateLimitStore(): Store {
    return readOnlyOutsideProduction(getStore({ name: 'ratelimit' }), 'ratelimit');
  }

  /** Operational metadata, e.g. the `pepper-canary` key written by the CLI. */
  export function metaStore(): Store {
    return readOnlyOutsideProduction(getStore({ name: 'meta' }), 'meta');
  }

  /**
   * Redirect targets for the /go function, currently a single `intake` key
   * holding the operator's vetting-page Signal link (set via the CLI's
   * `set-intake`). Strong consistency so a freshly set — or cleared — intake
   * link resolves immediately rather than lagging by up to 60 seconds.
   */
  export function linksStore(): Store {
    return readOnlyOutsideProduction(
      getStore({ name: 'links', consistency: 'strong' }),
      'links',
    );
  }
  ```

- [ ] **Step 5: Run the test and watch it pass**

  ```
  npx vitest run src/lib/blob-stores.test.ts
  ```

  Expected output:

  ```
   ✓ src/lib/blob-stores.test.ts (34 tests)

   Test Files  1 passed (1)
        Tests  34 passed (34)
  ```

- [ ] **Step 6: Run the full suite for regressions**

  ```
  npm test
  ```

  This task adds exactly one test file (`src/lib/blob-stores.test.ts`, 34 tests) and modifies no other test, so the full-suite totals must be the previous task's cumulative totals plus one file and plus 34 tests, with `0 failed`.

  Assert that delta, not a fabricated absolute: per the seam contract, the absolute `Test Files` / `Tests` baselines in earlier drafts of this plan were computed against the pre-plan repo and are unreliable, so do not gate on a specific total here. Confirm only that (a) the file count rose by exactly one, (b) the test count rose by exactly 34, and (c) nothing that previously passed now fails. The three pre-plan `src/lib/*.test.ts` files (`blog-utils`, `district-matcher`, `geo-utils`) are also collected; they are pre-existing and untouched by this task.

- [ ] **Step 7: Commit**

  ```
  git add package.json package-lock.json src/lib/blob-stores.ts src/lib/blob-stores.test.ts
  git commit -m "feat(events): add Blobs store factory refusing writes outside production"
  ```

  Stage those four paths explicitly. `npm install` may have touched nothing else, but an unrelated working-tree file swept in by `git add -A` would muddy a commit whose whole point is a security boundary.

---

---

---

### Task 9: Rate limiter on Blobs

Design reference: §8 (Rate limiting), §16.1 (`POST /api/submit-event` row). This task builds the in-function daily budget counter that sits behind Netlify's native edge rule. It is the second stage of the submit pipeline (`body cap → rate limit → validate → verify code`), so it must be cheap and it must never block a legitimate submission because Blobs had a bad day.

Two non-negotiables from the design, both of which the tests pin down:

- **Fail open.** Any thrown error from the store, and any exhaustion of the retry budget, returns `allowed: true`. Fail-closed would let a Blobs incident silently kill every submission with no signal. The entropy in the organizer code (41.4 bits) is the security boundary; this counter is a spend shield.
- **Never store a raw IP.** `hashSubject()` salts and SHA-256s the address before it becomes a key segment. A plaintext IP submission log is exactly the artifact this site criticizes.

**Depends on:** Task 8 (`src/lib/blob-stores.ts`, which exports `rateLimitStore()` and adds `@netlify/blobs` to `package.json`). Do not start this task until Task 8 is committed — the test mocks `./blob-stores.js` by path and the implementation imports it.

**Files:**

- Create: `src/lib/rate-limit.test.ts`
- Create: `src/lib/rate-limit.ts`

All commands below run from the repo root.

---

- [ ] **Step 1: Write the failing test file**

  Create `src/lib/rate-limit.test.ts` with exactly this content. Note the `vi.hoisted` block: `vi.mock` is hoisted above the `import` statements by Vitest, so the fake store AND the mocked `rateLimitStore` factory must be created inside `vi.hoisted` or the factory hits a temporal-dead-zone error at import time. `rateLimitStore` is a `vi.fn` so a test can make the factory call itself throw (distinct from the store method throwing).

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  // vi.mock is hoisted above imports, so the fake store and the mocked factory
  // must be hoisted with it.
  const { fakeStore, rateLimitStore } = vi.hoisted(() => {
    const fakeStore = {
      getWithMetadata: vi.fn(),
      setJSON: vi.fn(),
    };
    return { fakeStore, rateLimitStore: vi.fn(() => fakeStore) };
  });

  vi.mock('./blob-stores.js', () => ({
    rateLimitStore,
  }));

  import { consume, hashSubject } from './rate-limit.js';

  const TODAY = '2026-08-18';
  const SUBJECT = 'a'.repeat(64);
  const KEY = `rl/${TODAY}/${SUBJECT}`;

  beforeEach(() => {
    fakeStore.getWithMetadata.mockReset();
    fakeStore.setJSON.mockReset();
    // mockReset clears the implementation too, so restore the default of
    // returning the fake store; the factory-throw test overrides this.
    rateLimitStore.mockReset();
    rateLimitStore.mockReturnValue(fakeStore);
  });

  describe('hashSubject', () => {
    it('returns a 64-character lowercase hex digest', () => {
      expect(hashSubject('203.0.113.7', 'salt-a')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('never returns or contains the input IP', () => {
      const ip = '203.0.113.7';
      const digest = hashSubject(ip, 'salt-a');
      expect(digest).not.toBe(ip);
      expect(digest).not.toContain(ip);
    });

    it('is stable for the same ip and salt', () => {
      expect(hashSubject('203.0.113.7', 'salt-a')).toBe(hashSubject('203.0.113.7', 'salt-a'));
    });

    it('produces different digests for different salts', () => {
      expect(hashSubject('203.0.113.7', 'salt-a')).not.toBe(hashSubject('203.0.113.7', 'salt-b'));
    });

    it('produces different digests for different IPs under one salt', () => {
      expect(hashSubject('203.0.113.7', 'salt-a')).not.toBe(hashSubject('203.0.113.8', 'salt-a'));
    });
  });

  describe('consume', () => {
    it('allows the first call and reports used=1', async () => {
      fakeStore.getWithMetadata.mockResolvedValue(null);
      fakeStore.setJSON.mockResolvedValue({ modified: true });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 1, limit: 5 });
    });

    it('reads and writes the bucket at rl/<today>/<subject>', async () => {
      fakeStore.getWithMetadata.mockResolvedValue(null);
      fakeStore.setJSON.mockResolvedValue({ modified: true });

      await consume(SUBJECT, 5, TODAY);

      expect(fakeStore.getWithMetadata).toHaveBeenCalledWith(KEY, {
        type: 'json',
        consistency: 'strong',
      });
      expect(fakeStore.setJSON.mock.calls[0][0]).toBe(KEY);
    });

    it('never lets a raw IP reach the key or the stored value', async () => {
      const ip = '198.51.100.42';
      const subject = hashSubject(ip, 'pepper');
      fakeStore.getWithMetadata.mockResolvedValue(null);
      fakeStore.setJSON.mockResolvedValue({ modified: true });

      await consume(subject, 5, TODAY);

      const [key, value] = fakeStore.setJSON.mock.calls[0];
      expect(key).toBe(`rl/${TODAY}/${subject}`);
      expect(key).not.toContain(ip);
      expect(JSON.stringify(value)).not.toContain(ip);
    });

    it('creates a missing bucket with onlyIfNew', async () => {
      fakeStore.getWithMetadata.mockResolvedValue(null);
      fakeStore.setJSON.mockResolvedValue({ modified: true });

      await consume(SUBJECT, 5, TODAY);

      expect(fakeStore.setJSON).toHaveBeenCalledWith(KEY, { count: 1 }, { onlyIfNew: true });
    });

    it('guards an existing bucket with onlyIfMatch on its etag', async () => {
      fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 2 }, etag: 'etag-v2' });
      fakeStore.setJSON.mockResolvedValue({ modified: true });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(fakeStore.setJSON).toHaveBeenCalledWith(KEY, { count: 3 }, { onlyIfMatch: 'etag-v2' });
      expect(verdict).toEqual({ allowed: true, used: 3, limit: 5 });
    });

    it('denies a subject already at the limit and does not write', async () => {
      fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 5 }, etag: 'etag-v5' });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: false, used: 5, limit: 5 });
      expect(fakeStore.setJSON).not.toHaveBeenCalled();
    });

    it('denies a subject already past the limit', async () => {
      fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 9 }, etag: 'etag-v9' });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: false, used: 9, limit: 5 });
      expect(fakeStore.setJSON).not.toHaveBeenCalled();
    });

    it('retries after an etag conflict and then succeeds', async () => {
      fakeStore.getWithMetadata
        .mockResolvedValueOnce({ data: { count: 1 }, etag: 'etag-v1' })
        .mockResolvedValueOnce({ data: { count: 2 }, etag: 'etag-v2' });
      fakeStore.setJSON
        .mockResolvedValueOnce({ modified: false })
        .mockResolvedValueOnce({ modified: true });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 3, limit: 5 });
      expect(fakeStore.getWithMetadata).toHaveBeenCalledTimes(2);
      expect(fakeStore.setJSON).toHaveBeenCalledTimes(2);
      expect(fakeStore.setJSON.mock.calls[0][2]).toEqual({ onlyIfMatch: 'etag-v1' });
      expect(fakeStore.setJSON.mock.calls[1][2]).toEqual({ onlyIfMatch: 'etag-v2' });
    });

    it('fails open after three consecutive conflicts', async () => {
      fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 2 }, etag: 'etag-v2' });
      fakeStore.setJSON.mockResolvedValue({ modified: false });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 2, limit: 5 });
      expect(fakeStore.setJSON).toHaveBeenCalledTimes(3);
    });

    it('fails open when the store read throws', async () => {
      fakeStore.getWithMetadata.mockRejectedValue(new Error('blobs unavailable'));

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 0, limit: 5 });
    });

    it('fails open when the store write throws', async () => {
      fakeStore.getWithMetadata.mockResolvedValue(null);
      fakeStore.setJSON.mockRejectedValue(new Error('context refused'));

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 0, limit: 5 });
    });

    it('fails open when getWithMetadata throws synchronously', async () => {
      // A synchronous throw from the store method (as opposed to a rejected
      // promise) must still be swallowed. This is the case the old test
      // mislabelled as the factory throwing — kept here under its true name.
      fakeStore.getWithMetadata.mockImplementation(() => {
        throw new Error('read exploded');
      });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 0, limit: 5 });
    });

    it('fails open when the store factory itself throws', async () => {
      // rateLimitStore() throwing (missing site id, refused context) must not
      // 500 the caller. This genuinely makes the factory throw, so the store
      // methods are never reached.
      rateLimitStore.mockImplementation(() => {
        throw new Error('no store');
      });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 0, limit: 5 });
      expect(fakeStore.getWithMetadata).not.toHaveBeenCalled();
      expect(fakeStore.setJSON).not.toHaveBeenCalled();
    });

    it('treats a corrupt or missing count as zero', async () => {
      fakeStore.getWithMetadata.mockResolvedValue({ data: { count: 'lots' }, etag: 'etag-x' });
      fakeStore.setJSON.mockResolvedValue({ modified: true });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 1, limit: 5 });
      expect(fakeStore.setJSON).toHaveBeenCalledWith(KEY, { count: 1 }, { onlyIfMatch: 'etag-x' });
    });

    it('treats a negative count as zero', async () => {
      fakeStore.getWithMetadata.mockResolvedValue({ data: { count: -4 }, etag: 'etag-neg' });
      fakeStore.setJSON.mockResolvedValue({ modified: true });

      const verdict = await consume(SUBJECT, 5, TODAY);

      expect(verdict).toEqual({ allowed: true, used: 1, limit: 5 });
    });

    it('denies immediately when limit is zero', async () => {
      fakeStore.getWithMetadata.mockResolvedValue(null);

      const verdict = await consume(SUBJECT, 0, TODAY);

      expect(verdict).toEqual({ allowed: false, used: 0, limit: 0 });
      expect(fakeStore.setJSON).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

  ```
  npx vitest run src/lib/rate-limit.test.ts
  ```

  Expected: the run exits non-zero with a transform/resolve failure, not an assertion failure, because `src/lib/rate-limit.ts` does not exist yet:

  ```
  Error: Failed to resolve import "./rate-limit.js" from "src/lib/rate-limit.test.ts". Does the file exist?
  ```

  If instead you see `Failed to resolve import "./blob-stores.js"`, Task 8 has not landed — stop and finish Task 8 first.

- [ ] **Step 3: Implement `src/lib/rate-limit.ts`**

  Create `src/lib/rate-limit.ts` with exactly this content:

  ```ts
  import { createHash } from 'node:crypto';
  import { rateLimitStore } from './blob-stores.js';

  /**
   * Blobs-backed daily token bucket for POST /api/submit-event.
   *
   * This is a spend shield, not a security boundary. The security boundary is the
   * 41.4-bit organizer code (see design §7). Consequently every failure path here
   * FAILS OPEN: a Blobs incident must not silently kill submissions. That includes
   * the `rateLimitStore()` factory throwing (missing site id, refused context) —
   * it is called inside the try below precisely so a factory throw fails open too.
   *
   * Netlify ships an `onlyIfMatch` CAS API while also documenting that Blobs has no
   * concurrency-control mechanism (design §8, open item 5). Atomicity is therefore
   * undocumented and this counter is best-effort. Size limits with slack.
   */

  /** Optimistic-concurrency attempts before we give up and let the request through. */
  const MAX_ATTEMPTS = 3;

  /**
   * Salted SHA-256 of a client IP. The result is the only form of the address that
   * ever reaches a Blobs key or value — a plaintext IP submission log is exactly the
   * artifact this site criticizes.
   *
   * @param ip   Client address, e.g. from the `x-nf-client-connection-ip` header.
   * @param salt Server-side secret, supplied by the caller. Not the code pepper.
   * @returns 64-char lowercase hex digest.
   */
  export function hashSubject(ip: string, salt: string): string {
    return createHash('sha256').update(`${salt}\x00${ip}`, 'utf8').digest('hex');
  }

  export interface RateLimitVerdict {
    /** False only when the subject is provably at or over the limit. */
    allowed: boolean;
    /** Attempts recorded today after this call, best-effort. */
    used: number;
    /** The limit this verdict was measured against, echoed for logging. */
    limit: number;
  }

  interface Bucket {
    count: number;
  }

  /** Coerce a stored bucket to a non-negative integer, defaulting to 0. */
  function readCount(entry: { data?: unknown } | null): number {
    const raw = (entry?.data as Partial<Bucket> | undefined)?.count;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
    return Math.floor(raw);
  }

  /**
   * Record one attempt against `subject` for `today` and report whether it is allowed.
   *
   * Keys are `rl/<today>/<subject>`, so yesterday's buckets age out on their own and
   * the daily reset is implicit — no sweep job.
   *
   * @param subject Output of {@link hashSubject}. Never a raw IP.
   * @param limit   Maximum attempts per subject per day.
   * @param today   ISO date, `YYYY-MM-DD`, computed by the caller in UTC.
   */
  export async function consume(
    subject: string,
    limit: number,
    today: string,
  ): Promise<RateLimitVerdict> {
    const key = `rl/${today}/${subject}`;
    let lastSeen = 0;

    try {
      // Inside the try so a throwing factory fails open just like a throwing method.
      const store = rateLimitStore();

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // Strong consistency: an eventual read would let a spender run ~60s past the
        // limit on every edge that has not caught up.
        const entry = await store.getWithMetadata(key, {
          type: 'json',
          consistency: 'strong',
        });

        lastSeen = readCount(entry);
        if (lastSeen >= limit) {
          return { allowed: false, used: lastSeen, limit };
        }

        const next: Bucket = { count: lastSeen + 1 };
        const etag = entry?.etag;

        // Branch rather than build a union-typed options object: @netlify/blobs types
        // onlyIfMatch and onlyIfNew as mutually exclusive shapes.
        const result =
          typeof etag === 'string'
            ? await store.setJSON(key, next, { onlyIfMatch: etag })
            : await store.setJSON(key, next, { onlyIfNew: true });

        // modified === false means someone else wrote first. Anything else (true, or
        // an older client returning undefined) counts as a successful write.
        if (result?.modified !== false) {
          return { allowed: true, used: next.count, limit };
        }
      }

      // Retry budget exhausted under contention. Fail open.
      return { allowed: true, used: lastSeen, limit };
    } catch {
      // Store factory or method threw, refused by the non-production context guard, or
      // malformed. Deliberately swallowed: the error must not reach the caller as a
      // 500, and the caught value is never logged because it can embed
      // request-derived strings.
      return { allowed: true, used: 0, limit };
    }
  }
  ```

- [ ] **Step 4: Run the test again and confirm it passes**

  ```
  npx vitest run src/lib/rate-limit.test.ts
  ```

  Expected: `Test Files  1 passed (1)` and `Tests  21 passed (21)`, exit code 0.

- [ ] **Step 5: Run the full suite for regressions**

  ```
  npm test
  ```

  Expected: every existing suite (`geo-utils`, `district-matcher`, `blog-utils`, plus the Task 1-8 suites) still passes, exit code 0. `src/lib/rate-limit.ts` is a new leaf module with one internal import, so a failure anywhere else means Task 8's `blob-stores.ts` changed under you — investigate before proceeding.

- [ ] **Step 6: Commit**

  ```
  git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts
  git commit -m "feat(events): add Blobs-backed daily rate limiter

  Token bucket keyed rl/<day>/<hashed-subject>, with optimistic concurrency
  via getWithMetadata + onlyIfMatch and a 3-attempt retry budget. Every
  failure path fails open so a Blobs incident cannot kill submissions,
  including the store factory itself throwing; the organizer code entropy
  remains the security boundary. hashSubject salts and SHA-256s the client
  IP so no raw address reaches a key or value."
  ```

---

---

---

### Task 10: Recurrence expansion

Expand a stored recurrence rule into the list of calendar dates it covers. Recurrence is stored as a rule and never as rows (design §10); this module is the only place that turns the rule into dates, and it is used by the build-time page render, the `/api/events` overlay function, and the build-time expiry guard. All three must agree, so the arithmetic has to be timezone-independent.

**Files:**

- Create: `src\lib\recurrence.test.ts`
- Create: `src\lib\recurrence.ts`

No other file changes. This module has no imports — it does not depend on Tasks 1-7 and nothing in Tasks 1-7 depends on it yet.

**Semantics decided here (the rest of the plan depends on these):**

| Question | Decision |
|---|---|
| Is `startDate` in the output? | Yes, always — it is occurrence #1, not a separate anchor. |
| Is `rec.until` inclusive? | **Inclusive.** An occurrence landing exactly on `until` is returned. |
| Is `horizonEndIso` inclusive? | **Inclusive**, same rule, so the two bounds behave identically. |
| Effective end | `min(until, horizonEndIso)`. Each bound clamps on its own. |
| `startDate` past the effective end | Returns `[]` — including the `rec === null` case. Keeps the invariant "never returns a date after `until` or after `horizonEndIso`" true with no exceptions. |
| `monthly_nth` in a month with no Nth weekday | That month is **skipped**; the series continues. A 5th-Tuesday series produces nothing in a 4-Tuesday month rather than sliding to the 4th. |
| Malformed date input | Throws `RangeError`. The message never contains the offending value (design §17: rejection messages must not echo hostile input into a log). |

---

- [ ] **Step 1: Write the failing test file**

  Create `src\lib\recurrence.test.ts` with exactly this content:

  ```ts
  // The suite deliberately runs in a timezone that is NOT UTC and that observes
  // DST. A local-time implementation of expandOccurrences passes under TZ=UTC
  // and fails here, which is the whole point of the DST block below.
  //
  // ESM hoists the import above this assignment, but recurrence.ts reads no
  // timezone at import time, so the ordering is harmless. Node re-reads
  // process.env.TZ on the next Date operation.
  process.env.TZ = 'America/New_York';

  import { describe, it, expect } from 'vitest';
  import { expandOccurrences } from './recurrence.js';

  describe('test environment', () => {
    it('runs in America/New_York so local-time bugs are observable', () => {
      // 2026-01-15T00:00:00Z is 19:00 on 2026-01-14 in America/New_York (UTC-5).
      // If this fails, your Node build did not pick up the runtime TZ change --
      // re-run the suite with the variable set in the shell instead:
      //   PowerShell: $env:TZ='America/New_York'; npm test
      //   bash:       TZ=America/New_York npm test
      const probe = new Date(Date.UTC(2026, 0, 15));
      expect(probe.getHours()).toBe(19);
      expect(probe.getDate()).toBe(14);
    });
  });

  describe('expandOccurrences: no recurrence', () => {
    it('returns just the start date when rec is null', () => {
      expect(expandOccurrences('2026-08-22', null, '2027-01-31')).toEqual(['2026-08-22']);
    });

    it('returns nothing when the start date is past the horizon', () => {
      expect(expandOccurrences('2027-02-01', null, '2027-01-31')).toEqual([]);
    });
  });

  describe('expandOccurrences: weekly', () => {
    it('steps across a month boundary', () => {
      expect(
        expandOccurrences('2026-08-29', { freq: 'weekly', until: '2026-09-26' }, '2027-01-31'),
      ).toEqual(['2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
    });

    it('treats until as INCLUSIVE: an occurrence landing on until is returned', () => {
      expect(
        expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-09-19' }, '2027-01-31'),
      ).toEqual(['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19']);
    });

    it('drops an occurrence one day past until', () => {
      expect(
        expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-09-18' }, '2027-01-31'),
      ).toEqual(['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12']);
    });

    it('clamps on the horizon when the horizon is the tighter bound', () => {
      expect(
        expandOccurrences('2026-08-22', { freq: 'weekly', until: '2027-02-20' }, '2026-09-05'),
      ).toEqual(['2026-08-22', '2026-08-29', '2026-09-05']);
    });

    it('clamps on until when until is the tighter bound', () => {
      expect(
        expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-09-05' }, '2027-02-20'),
      ).toEqual(['2026-08-22', '2026-08-29', '2026-09-05']);
    });

    it('returns nothing when until precedes the start date', () => {
      expect(
        expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-08-01' }, '2027-01-31'),
      ).toEqual([]);
    });
  });

  describe('expandOccurrences: monthly_nth', () => {
    it('tracks the 2nd Tuesday as the day-of-month shifts', () => {
      // August 2026 has four Tuesdays (4, 11, 18, 25); September has five
      // (1, 8, 15, 22, 29). The 2nd Tuesday therefore moves from the 11th to
      // the 8th -- a naive "same day number each month" rule gets this wrong.
      expect(
        expandOccurrences('2026-08-11', { freq: 'monthly_nth', until: '2026-12-31' }, '2027-01-31'),
      ).toEqual(['2026-08-11', '2026-09-08', '2026-10-13', '2026-11-10', '2026-12-08']);
    });

    it('skips months that have no 5th Tuesday rather than sliding to the 4th', () => {
      // Oct 2026, Nov 2026, Jan 2027 and Feb 2027 have only four Tuesdays.
      expect(
        expandOccurrences('2026-09-29', { freq: 'monthly_nth', until: '2027-03-31' }, '2027-12-31'),
      ).toEqual(['2026-09-29', '2026-12-29', '2027-03-30']);
    });

    it('returns only the start date when until falls before the next occurrence', () => {
      // The next 2nd Tuesday is 2026-09-08, one day past until.
      expect(
        expandOccurrences('2026-08-11', { freq: 'monthly_nth', until: '2026-09-07' }, '2027-01-31'),
      ).toEqual(['2026-08-11']);
    });
  });

  describe('expandOccurrences: DST boundaries do not shift the day', () => {
    it('crosses spring-forward (2026-03-08) without losing or repeating a day', () => {
      expect(
        expandOccurrences('2026-03-01', { freq: 'weekly', until: '2026-03-29' }, '2026-12-31'),
      ).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29']);
    });

    it('crosses fall-back (2026-11-01) without losing or repeating a day', () => {
      expect(
        expandOccurrences('2026-10-25', { freq: 'weekly', until: '2026-11-15' }, '2026-12-31'),
      ).toEqual(['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15']);
    });

    it('lands monthly_nth on the correct weekday across fall-back', () => {
      expect(
        expandOccurrences('2026-10-11', { freq: 'monthly_nth', until: '2026-12-31' }, '2027-01-31'),
      ).toEqual(['2026-10-11', '2026-11-08', '2026-12-13']);
    });
  });

  describe('expandOccurrences: input guards', () => {
    it('caps a runaway expansion at 400 occurrences', () => {
      // Validation caps until at 6 months (~27 weekly occurrences); this is the
      // defence-in-depth stop for a hand-edited or fold-corrupted events.json.
      const out = expandOccurrences(
        '2026-01-01',
        { freq: 'weekly', until: '2046-01-01' },
        '2046-01-01',
      );
      expect(out.length).toBe(400);
    });

    it('throws RangeError on a start date that is not YYYY-MM-DD', () => {
      expect(() => expandOccurrences('08/22/2026', null, '2026-12-31')).toThrow(RangeError);
    });

    it('throws RangeError on a date that matches the shape but is not real', () => {
      expect(() => expandOccurrences('2026-02-30', null, '2026-12-31')).toThrow(
        /must be a real calendar date/,
      );
    });

    it('throws RangeError on a malformed until', () => {
      expect(() =>
        expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-9-5' }, '2026-12-31'),
      ).toThrow(RangeError);
    });

    it('throws RangeError on an unknown freq', () => {
      expect(() =>
        expandOccurrences(
          '2026-08-22',
          { freq: 'daily' as unknown as 'weekly', until: '2026-09-05' },
          '2026-12-31',
        ),
      ).toThrow(RangeError);
    });

    it('does not echo the offending value in the error message', () => {
      const hostile = 'notadate-\u202Eevil';
      let message = '';
      try {
        expandOccurrences(hostile, null, '2026-12-31');
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toBe('startDate must be a YYYY-MM-DD calendar date');
      expect(message).not.toContain('evil');
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

  ```
  npm test -- src/lib/recurrence.test.ts
  ```

  Expected: the run fails at import resolution, before any assertion executes. The output contains a line of the form:

  ```
  Error: Failed to load url ./recurrence.js (resolved id: ./recurrence.js) in src/lib/recurrence.test.ts. Does the file exist?
  ```

  and the summary reads `Test Files  1 failed (1)` with `Tests  no tests`. Exit code is non-zero.

  If instead you see assertion failures, the file already exists and you are on the wrong branch — stop and check `git status`.

- [ ] **Step 3: Implement the module**

  Create `src\lib\recurrence.ts` with exactly this content:

  ```ts
  /**
   * Recurrence expansion for the events calendar.
   *
   * WHY EVERY DATE OPERATION IN THIS FILE IS UTC:
   *
   * The values here are calendar days ("2026-08-22"), not instants. JavaScript's
   * local-time accessors (getDate, getMonth, setDate, and the Date(y, m, d)
   * constructor) resolve against the host timezone, which breaks calendar-day
   * arithmetic in two separate ways:
   *
   *   1. Offset. A date string parses as UTC midnight. On a host behind UTC --
   *      America/New_York, where this site's organizers and its build box both
   *      sit -- getDate() on that value reports the PREVIOUS day, so a formatted
   *      round trip silently shifts every occurrence back one day.
   *   2. DST. Adding "7 days" in local time crosses a transition twice a year.
   *      A midnight-anchored value plus seven local days lands at 23:00 the
   *      evening before (spring forward) or 01:00 (fall back) -- and once the
   *      value is no longer at midnight, the next formatting step can round to
   *      the wrong calendar day.
   *
   * Date.UTC and the getUTC* accessors have no offset and no DST, so day N plus
   * seven days is always day N plus seven days. This matters beyond tidiness:
   * the same rule is expanded at build time (page render, expiry guard) and at
   * request time inside a Netlify function, on machines in different timezones.
   * If those disagree, an event appears on two different days depending on where
   * it was rendered.
   *
   * Do not introduce a local-time Date call here, and do not "simplify" the
   * parse/format helpers into `new Date(string)` plus `toISOString().slice(0, 10)`
   * -- the latter is UTC-correct but the former accepts non-ISO input under
   * implementation-defined local-time rules.
   */

  const DAY_MS = 86_400_000;

  /**
   * Hard stop on the number of occurrences. Submission validation caps
   * `until` at six months out, which is ~27 weekly occurrences; this bound only
   * exists so a hand-edited or fold-corrupted events.json cannot spin the loop.
   */
  const MAX_OCCURRENCES = 400;

  /** Shape check only. Real-date-ness is checked by the round trip in parseIsoDate. */
  const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

  export interface Recurrence {
    freq: 'weekly' | 'monthly_nth';
    /** Inclusive last calendar day of the series, "YYYY-MM-DD". */
    until: string;
  }

  /** Format a UTC millisecond value as a "YYYY-MM-DD" calendar day. */
  function formatIsoDate(ms: number): string {
    const d = new Date(ms);
    const year = String(d.getUTCFullYear()).padStart(4, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse a "YYYY-MM-DD" calendar day into UTC milliseconds.
   *
   * Throws RangeError naming the field but never quoting the value: these
   * strings come from a public submission path and from a committed JSON file
   * that a bad commit can edit, and an error message is a log sink.
   */
  function parseIsoDate(value: unknown, label: string): number {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) {
      throw new RangeError(`${label} must be a YYYY-MM-DD calendar date`);
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const ms = Date.UTC(year, month - 1, day);
    // Date.UTC silently rolls over: "2026-02-30" becomes March 2nd and
    // "0026-01-01" becomes 1926. Round-tripping the format rejects both.
    if (formatIsoDate(ms) !== value) {
      throw new RangeError(`${label} must be a real calendar date`);
    }
    return ms;
  }

  /**
   * UTC milliseconds for the `nth` occurrence of `weekday` (0 = Sunday) in the
   * given month, or null when that month does not contain an nth one.
   */
  function nthWeekdayOfMonth(
    year: number,
    monthIndex: number,
    weekday: number,
    nth: number,
  ): number | null {
    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    const offset = (weekday - firstWeekday + 7) % 7;
    const day = 1 + offset + (nth - 1) * 7;
    // Day 0 of the following month is the last day of this one.
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    if (day > daysInMonth) return null;
    return Date.UTC(year, monthIndex, day);
  }

  /**
   * Expand a recurrence rule into the calendar days it covers.
   *
   * `startDate` is occurrence #1 and is always included, subject to the bounds.
   * Both `rec.until` and `horizonEndIso` are INCLUSIVE, and each clamps
   * independently -- the effective end is the earlier of the two. A start date
   * past the effective end yields an empty array, including when `rec` is null,
   * so the returned list never contains a date past either bound.
   *
   * `monthly_nth` repeats the Nth-weekday-of-month implied by `startDate`
   * (2026-08-11 is the 2nd Tuesday, so the series is every 2nd Tuesday). A month
   * that does not contain an Nth such weekday is skipped, not approximated.
   *
   * @param startDate      "YYYY-MM-DD"
   * @param rec            recurrence rule, or null for a one-off event
   * @param horizonEndIso  "YYYY-MM-DD", the last day the caller wants rendered
   * @throws RangeError on any malformed date or unknown freq
   */
  export function expandOccurrences(
    startDate: string,
    rec: Recurrence | null,
    horizonEndIso: string,
  ): string[] {
    const startMs = parseIsoDate(startDate, 'startDate');
    const horizonMs = parseIsoDate(horizonEndIso, 'horizonEndIso');

    let endMs = horizonMs;
    if (rec) {
      if (rec.freq !== 'weekly' && rec.freq !== 'monthly_nth') {
        throw new RangeError('recurrence.freq must be "weekly" or "monthly_nth"');
      }
      endMs = Math.min(parseIsoDate(rec.until, 'recurrence.until'), horizonMs);
    }

    if (startMs > endMs) return [];
    if (!rec) return [formatIsoDate(startMs)];

    const out: string[] = [formatIsoDate(startMs)];

    if (rec.freq === 'weekly') {
      let cursor = startMs + 7 * DAY_MS;
      while (cursor <= endMs && out.length < MAX_OCCURRENCES) {
        out.push(formatIsoDate(cursor));
        cursor += 7 * DAY_MS;
      }
      return out;
    }

    const start = new Date(startMs);
    const weekday = start.getUTCDay();
    // 1st through 5th: day 1-7 is the 1st, 8-14 the 2nd, and so on.
    const nth = Math.floor((start.getUTCDate() - 1) / 7) + 1;
    let year = start.getUTCFullYear();
    let monthIndex = start.getUTCMonth();

    while (out.length < MAX_OCCURRENCES) {
      monthIndex += 1;
      if (monthIndex > 11) {
        monthIndex = 0;
        year += 1;
      }
      const candidate = nthWeekdayOfMonth(year, monthIndex, weekday, nth);
      if (candidate === null) {
        // No Nth such weekday this month (a 5th Tuesday in a 4-Tuesday month).
        // Skip it, but stop once the whole month is past the end, otherwise a
        // series with no further occurrences would walk forward forever.
        if (Date.UTC(year, monthIndex, 1) > endMs) break;
        continue;
      }
      if (candidate > endMs) break;
      out.push(formatIsoDate(candidate));
    }

    return out;
  }
  ```

- [ ] **Step 4: Run the test again and confirm it passes**

  ```
  npm test -- src/lib/recurrence.test.ts
  ```

  Expected summary:

  ```
   Test Files  1 passed (1)
        Tests  21 passed (21)
  ```

  Exit code 0. If `test environment > runs in America/New_York` is the only failure, your Node build did not honour the runtime `TZ` change — re-run with the variable set in the shell (`$env:TZ='America/New_York'; npm test -- src/lib/recurrence.test.ts`) and the rest of the suite must still pass.

- [ ] **Step 5: Run the whole suite to confirm nothing regressed**

  ```
  npm test
  ```

  Expected: `Test Files  4 passed (4)` — `blog-utils.test.ts`, `district-matcher.test.ts`, `geo-utils.test.ts`, and the new `recurrence.test.ts`. Exit code 0. Setting `process.env.TZ` inside the new file leaks into the shared process for later files, so if `district-matcher.test.ts` or `blog-utils.test.ts` fails only under this run, you have found a real timezone bug in one of those modules — report it rather than reverting the `TZ` line.

- [ ] **Step 6: Commit**

  ```
  git add src/lib/recurrence.ts src/lib/recurrence.test.ts
  git commit -m "feat(events): expand recurrence rules into occurrence dates"
  ```

---

---

---

### Task 11: Submission schema

**Files:**

- Modify: `package.json` (add the `zod` dependency)
- Modify: `package-lock.json` (regenerated by npm — do not hand-edit)
- Create: `src/lib/event-schema.test.ts`
- Create: `src/lib/event-schema.ts`

This task builds the single validator that every submission passes through. It is the fourth stage of the submit pipeline (`body cap → rate limit → validate → verify code`), so by the time it runs the body is already known to be under 8192 bytes. It imports, and never reimplements, `sanitizeText`, `validateSignalUrl`, `normalizeCode`, `countyForCity` and `isKnownCity` from Tasks 2–6, and imports the title/description/address caps (`TITLE_LIMITS`, `DESCRIPTION_LIMITS`, `ADDRESS_LIMITS`) from `sanitize-text.ts` rather than retyping them. It also exports `publicEventSchema`, the `.strict()` validator for the stored/public event shape (the 13 `PublicEvent` fields) that `src/pages/events.astro` uses to re-validate the baked `events.json` — one shared schema, so the page keeps no local copy that can drift.

---

- [ ] **Step 1: Add zod as a pinned exact dependency**

  Zod is not currently in the project. This machine enforces a 30-day minimum release age on package installs, so the version must be pinned to something published at least 30 days ago, and pinned **exactly** — a caret range lets a later `npm install` resolve a fresher version that the gate then blocks, turning a working checkout into a failing one.

  **Exact version pin: `zod@4.4.3`, published 2026-05-04.** Verified over 30 days old. Do not use `^4.4.3`.

  Verify the publish date before installing:

  ```bash
    npm view zod time --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)['4.4.3']))"
  ```

  Expected output, exactly:

  ```
  2026-05-04T07:06:40.819Z
  ```

  Then install:

  ```bash
  npm install zod@4.4.3 --save-exact
  ```

  This must land in `dependencies`, **not** `devDependencies`. Netlify prunes dev dependencies during a production install, and `netlify/functions/submit-event.ts` (Task 12) imports this module.

  The resulting diff in `package.json` — note there is no caret:

  ```diff
       "tailwindcss": "^4.2.1",
  -    "tinacms": "^3.6.1"
  +    "tinacms": "^3.6.1",
  +    "zod": "4.4.3"
     },
  ```

  Confirm the install did not silently widen the range:

  ```bash
  node -e "console.log(require('./package.json').dependencies.zod)"
  ```

  Expected output, exactly: `4.4.3`

---

- [ ] **Step 2: Write the failing test file**

  Create `src/lib/event-schema.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { validateSubmission, publicEventSchema, type FieldError } from './event-schema.js';

  // --- fixtures ---------------------------------------------------------------

  /** ISO (YYYY-MM-DD) date `offset` days from today, in UTC. */
  function isoInDays(offset: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  /** ISO (YYYY-MM-DD) date `months` calendar months from today, in UTC. */
  function isoInMonths(months: number): string {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  // Four lowercase words. `normalizeCode()` only normalizes shape — it does not
  // check wordlist membership. Membership is proven later by the digest lookup in
  // the `codes` store (Task 12), which is not this module's job.
  const CODE = 'drum yoga vivid clay';
  const NORMALIZED_CODE = 'drum-yoga-vivid-clay';

  const SIGNAL_URL = 'https://signal.group/#CjQKIExhbXBsZUtleQ';

  const FUTURE_DATE = isoInDays(30);

  function meetup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      type: 'meetup',
      title: 'Sign night',
      date: FUTURE_DATE,
      time: '19:00',
      city: 'greenville',
      signalUrl: SIGNAL_URL,
      organizerCode: CODE,
      ...overrides,
    };
  }

  function publicEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      type: 'public',
      title: 'Richland County Council meeting',
      description: 'Council votes on the Flock contract renewal.',
      date: FUTURE_DATE,
      time: '18:30',
      city: 'columbia',
      address: '1737 Main Street, Columbia',
      recurrence: null,
      organizerCode: CODE,
      ...overrides,
    };
  }

  type Result = ReturnType<typeof validateSubmission>;

  function errorsOf(result: Result): FieldError[] {
    if (result.ok) {
      throw new Error(`expected a rejection, got ${JSON.stringify(result.value)}`);
    }
    return result.errors ?? [];
  }

  function hasError(result: Result, field: string, code: string): boolean {
    return errorsOf(result).some((e) => e.field === field && e.code === code);
  }

  // --- accepted submissions ---------------------------------------------------

  describe('validateSubmission — accepted', () => {
    it('accepts a valid meetup and derives the county from the city', () => {
      const result = validateSubmission(meetup());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Whole-object equality is deliberate: it pins the exact field set, so a
      // field added here later breaks this test rather than silently flowing
      // into the Blobs record.
      expect(result.value).toEqual({
        type: 'meetup',
        title: 'Sign night',
        description: null,
        date: FUTURE_DATE,
        time: '19:00',
        city: 'greenville',
        county: 'greenville',
        address: null,
        signalUrl: SIGNAL_URL,
        recurrence: null,
        codeNormalized: NORMALIZED_CODE,
      });
    });

    it('accepts a valid public event, deriving a county unlike the city slug', () => {
      const result = validateSubmission(publicEvent());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // columbia -> richland proves the county is derived, not echoed.
      expect(result.value.county).toBe('richland');
      expect(result.value).toEqual({
        type: 'public',
        title: 'Richland County Council meeting',
        description: 'Council votes on the Flock contract renewal.',
        date: FUTURE_DATE,
        time: '18:30',
        city: 'columbia',
        county: 'richland',
        address: '1737 Main Street, Columbia',
        signalUrl: null,
        recurrence: null,
        codeNormalized: NORMALIZED_CODE,
      });
    });

    it('accepts an event dated today', () => {
      const result = validateSubmission(meetup({ date: isoInDays(0) }));
      expect(result.ok).toBe(true);
    });
  });

  // --- type-conditional fields ------------------------------------------------

  describe('validateSubmission — meetup vs public fields', () => {
    it('rejects a meetup carrying an address', () => {
      const result = validateSubmission(meetup({ address: '123 Main Street' }));
      expect(result.ok).toBe(false);
      expect(hasError(result, 'address', 'not_allowed_for_meetup')).toBe(true);
    });

    it('rejects a meetup carrying a description', () => {
      const result = validateSubmission(meetup({ description: 'Bring signs.' }));
      expect(result.ok).toBe(false);
      expect(hasError(result, 'description', 'not_allowed_for_meetup')).toBe(true);
    });

    it('rejects a public event without an address', () => {
      const withoutAddress = publicEvent();
      delete withoutAddress.address;
      const result = validateSubmission(withoutAddress);
      expect(result.ok).toBe(false);
      expect(hasError(result, 'address', 'required_for_public')).toBe(true);
    });

    it('rejects a meetup without a Signal URL', () => {
      const withoutSignal = meetup();
      delete withoutSignal.signalUrl;
      const result = validateSubmission(withoutSignal);
      expect(result.ok).toBe(false);
      expect(hasError(result, 'signalUrl', 'required_for_meetup')).toBe(true);
    });
  });

  // --- mass assignment and prototype pollution --------------------------------

  describe('validateSubmission — unknown keys', () => {
    it('rejects a submitted county, because county is derived', () => {
      const result = validateSubmission(meetup({ county: 'charleston' }));
      expect(result.ok).toBe(false);
      expect(hasError(result, 'county', 'unrecognized_key')).toBe(true);
    });

    it('rejects an extra unknown key', () => {
      const result = validateSubmission(meetup({ notAField: 'x' }));
      expect(result.ok).toBe(false);
      expect(hasError(result, 'notAField', 'unrecognized_key')).toBe(true);
    });

    it('rejects every server-owned field name', () => {
      for (const field of ['id', 'organizer', 'createdAt', 'revoked', 'codeDigest']) {
        const result = validateSubmission(meetup({ [field]: 'attacker-supplied' }));
        expect(result.ok, `${field} must be rejected`).toBe(false);
        expect(hasError(result, field, 'unrecognized_key'), `${field}`).toBe(true);
      }
    });

    it('rejects a body carrying __proto__', () => {
      // Built through JSON.parse on purpose. An object literal `{ __proto__: {} }`
      // sets the prototype instead of creating an own key, so it would not
      // reproduce what `req.json()` actually hands the function.
      const body = JSON.parse(
        `{"__proto__":{"polluted":true},"type":"meetup","title":"Sign night","date":"${FUTURE_DATE}",` +
          `"time":"19:00","city":"greenville","signalUrl":"${SIGNAL_URL}","organizerCode":"${CODE}"}`,
      );
      expect(Object.hasOwn(body, '__proto__')).toBe(true);

      const result = validateSubmission(body);
      expect(result.ok).toBe(false);
      expect(hasError(result, '__proto__', 'unrecognized_key')).toBe(true);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });

  // --- city and date ----------------------------------------------------------

  describe('validateSubmission — city and date', () => {
    it('rejects an unknown city', () => {
      const result = validateSubmission(meetup({ city: 'atlantis' }));
      expect(result.ok).toBe(false);
      expect(hasError(result, 'city', 'unknown_city')).toBe(true);
    });

    it('rejects a past date', () => {
      const result = validateSubmission(meetup({ date: isoInDays(-1) }));
      expect(result.ok).toBe(false);
      expect(hasError(result, 'date', 'date_in_past')).toBe(true);
    });

    it('rejects a date 13 months out', () => {
      const result = validateSubmission(meetup({ date: isoInMonths(13) }));
      expect(result.ok).toBe(false);
      expect(hasError(result, 'date', 'date_too_far_out')).toBe(true);
    });
  });

  // --- body shape -------------------------------------------------------------

  describe('validateSubmission — body shape', () => {
    it('rejects a non-object body', () => {
      expect(validateSubmission('nope').ok).toBe(false);
      expect(validateSubmission(null).ok).toBe(false);
      expect(validateSubmission(42).ok).toBe(false);
    });

    it('rejects an array body', () => {
      const result = validateSubmission([]);
      expect(result.ok).toBe(false);
      expect(hasError(result, '_body', 'not_an_object')).toBe(true);
    });
  });

  // --- publicEventSchema (the stored/public shape) ----------------------------

  // Distinct from a *submission*: a stored PublicEvent carries `id` and
  // `createdAt` and has no `organizerCode`. This is the exact shape of
  // src/data/events.json, which src/pages/events.astro re-validates at build.
  function publicEventRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'k7m29qxb',
      type: 'public',
      title: 'Richland County Council meeting',
      description: 'Council votes on the Flock contract renewal.',
      date: '2026-09-01',
      time: '18:30',
      city: 'columbia',
      county: 'richland',
      address: '1737 Main Street, Columbia',
      hasSignalGroup: false,
      recurrence: null,
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
      ...overrides,
    };
  }

  describe('publicEventSchema — the stored/public shape', () => {
    it('accepts a valid PublicEvent record', () => {
      expect(publicEventSchema.safeParse(publicEventRecord()).success).toBe(true);
    });

    it('rejects a record carrying a server-only key via .strict()', () => {
      // signalUrl, codeDigest and revoked live on StoredEvent, never on the
      // published shape. `.strict()` makes a baked record that smuggles one fail
      // the build rather than flow to the client.
      for (const key of ['signalUrl', 'codeDigest', 'revoked']) {
        const parsed = publicEventSchema.safeParse(publicEventRecord({ [key]: 'x' }));
        expect(parsed.success, `${key} must be rejected`).toBe(false);
      }
    });
  });
  ```

  Two fixture facts, both verified against `src/data/registry.json` in this repo:
  `place:greenville` carries county `Greenville`, and `place:columbia` carries county `Richland`. So `countyForCity('greenville') === 'greenville'` and `countyForCity('columbia') === 'richland'`. If Task 6 slugified differently, fix Task 6, not this test.

---

- [ ] **Step 3: Run the test and confirm it fails for the right reason**

  ```bash
    npx vitest run src/lib/event-schema.test.ts
  ```

  Expected failure — the module does not exist yet, so no test executes:

  ```
   FAIL  src/lib/event-schema.test.ts [ src/lib/event-schema.test.ts ]
  Error: Cannot find module './event-schema.js' imported from 'src/lib/event-schema.test.ts'

   Test Files  1 failed (1)
        Tests  no tests
  ```

  If instead you see `Cannot find module 'zod'`, Step 1 did not complete — go back and finish it before continuing.

---

- [ ] **Step 4: Implement the schema**

  Create `src/lib/event-schema.ts` with exactly this content:

  ```ts
  import { z } from 'zod';
  import { ok, err, type Ok, type Err } from './text-result.js';
  import {
    sanitizeText,
    TITLE_LIMITS,
    DESCRIPTION_LIMITS,
    ADDRESS_LIMITS,
    type SanitizeOptions,
  } from './sanitize-text.js';
  import { validateSignalUrl } from './signal-url.js';
  import { normalizeCode } from './organizer-code.js';
  import { isKnownCity, countyForCity } from './jurisdictions.js';

  /**
   * The one validator every submission passes through.
   *
   * Runs as stage 4 of the submit pipeline: body cap -> rate limit -> validate ->
   * verify code. The 8192-byte body cap is already enforced upstream, so the
   * per-field byte caps below bound the work NFKC and grapheme segmentation are
   * asked to do, not the request size.
   */

  // The title, description and address caps live in sanitize-text.ts and are
  // imported (TITLE_LIMITS, DESCRIPTION_LIMITS, ADDRESS_LIMITS), never retyped
  // here — a cap that drifts between call sites is how a limit silently widens.
  // Each is { maxBytes, maxGraphemes }: raw UTF-8 bytes are checked before NFKC
  // (normalization can expand input up to 18x), grapheme clusters after it.
  const ORGANIZER_CODE_MAX_BYTES = 128;

  const MAX_MONTHS_AHEAD = 12;
  const MAX_RECURRENCE_MONTHS = 6;

  // Flat character classes only: no nested quantifiers, no quantified
  // alternation, no backreferences. Anchoring alone does not prevent
  // catastrophic backtracking; the shape of the pattern does.
  const ISO_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const SNAKE_CASE_RE = /^[a-z0-9_]+$/;

  const utf8 = new TextEncoder();

  export interface ValidatedSubmission {
    type: 'meetup' | 'public';
    title: string;
    description: string | null;
    date: string;
    time: string;
    city: string;
    /** Derived from `city`. Never read from input. */
    county: string;
    address: string | null;
    signalUrl: string | null;
    /** Structurally identical to `Recurrence` in ./recurrence.js. */
    recurrence: { freq: 'weekly' | 'monthly_nth'; until: string } | null;
    codeNormalized: string;
  }

  export type FieldError = { field: string; code: string };

  // --- date helpers (all UTC, all string-comparable ISO) ----------------------

  function isRealIsoDate(iso: string): boolean {
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }

  function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Calendar-month arithmetic with end-of-month clamping (Aug 31 + 6 -> Feb 28). */
  function addMonthsIso(iso: string, months: number): string {
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    const target = new Date(Date.UTC(y, m - 1 + months, 1));
    const lastDay = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return target.toISOString().slice(0, 10);
  }

  // --- field schemas that delegate to the shared primitives -------------------

  function sanitizedField(limits: SanitizeOptions) {
    return z.unknown().transform((value, ctx) => {
      const result = sanitizeText(value, limits);
      if (!result.ok) {
        ctx.addIssue({ code: 'custom', message: result.code });
        return z.NEVER;
      }
      return result.value;
    });
  }

  const signalUrlField = z.unknown().transform((value, ctx) => {
    const result = validateSignalUrl(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.code });
      return z.NEVER;
    }
    return result.value;
  });

  const organizerCodeField = z.unknown().transform((value, ctx) => {
    // Byte cap before normalization, same reasoning as the text fields.
    if (typeof value === 'string' && utf8.encode(value).length > ORGANIZER_CODE_MAX_BYTES) {
      ctx.addIssue({ code: 'custom', message: 'too_many_bytes' });
      return z.NEVER;
    }
    const result = normalizeCode(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.code });
      return z.NEVER;
    }
    return result.value;
  });

  const recurrenceField = z
    .object({
      freq: z.enum(['weekly', 'monthly_nth']),
      until: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
    })
    .strict();

  /**
   * `.strict()` is the mass-assignment defense, and it is doing more work than it
   * looks like it is.
   *
   * The stored record (StoredEvent) has `id`, `organizer`, `createdAt`,
   * `revoked`, `codeDigest` and `signalUrl` on it. Every one of those is
   * server-owned. Without `.strict()`, zod's default "strip" mode would silently
   * discard them here — which is safe only for as long as nobody downstream ever
   * spreads the raw body. `.strict()` makes an attempt to set them a hard 400
   * instead of a silent no-op, so the failure is loud at the boundary rather than
   * latent one refactor away.
   *
   * It is also what rejects a submitted `county`. County is derived from `city`
   * via countyForCity() below; the form never asks for it, and an input that
   * offers one is rejected rather than trusted.
   *
   * Prototype pollution is handled separately in validateSubmission(): zod 4.4.3
   * excludes `__proto__` from its unrecognized-key scan (verified — `constructor`
   * and `prototype` are flagged, `__proto__` is not), so `.strict()` alone does
   * not reject it.
   */
  const submissionSchema = z
    .object({
      type: z.enum(['meetup', 'public']),
      title: sanitizedField(TITLE_LIMITS),
      description: sanitizedField(DESCRIPTION_LIMITS).optional(),
      date: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
      time: z.string().regex(TIME_RE, 'bad_format'),
      city: z.string().refine(isKnownCity, 'unknown_city'),
      address: sanitizedField(ADDRESS_LIMITS).optional(),
      signalUrl: signalUrlField.optional(),
      recurrence: recurrenceField.nullable().optional(),
      organizerCode: organizerCodeField,
    })
    .strict()
    .superRefine((value, ctx) => {
      const isMeetup = value.type === 'meetup';

      // A meetup has no free-text description and no address, by design: the
      // venue is shared inside the Signal group and never published.
      if (isMeetup && value.description !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['description'], message: 'not_allowed_for_meetup' });
      }
      if (isMeetup && value.address !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['address'], message: 'not_allowed_for_meetup' });
      }
      if (isMeetup && value.signalUrl === undefined) {
        ctx.addIssue({ code: 'custom', path: ['signalUrl'], message: 'required_for_meetup' });
      }
      if (!isMeetup && value.address === undefined) {
        ctx.addIssue({ code: 'custom', path: ['address'], message: 'required_for_public' });
      }

      // Same-day events are allowed (amended design §6): organizers post
      // morning-of. /go/:id refuses to resolve a Signal link once the date has
      // actually passed.
      const today = todayIso();
      if (value.date < today) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'date_in_past' });
      } else if (value.date > addMonthsIso(today, MAX_MONTHS_AHEAD)) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'date_too_far_out' });
      }

      if (value.recurrence) {
        if (value.recurrence.until <= value.date) {
          ctx.addIssue({
            code: 'custom',
            path: ['recurrence', 'until'],
            message: 'until_not_after_date',
          });
        } else if (value.recurrence.until > addMonthsIso(value.date, MAX_RECURRENCE_MONTHS)) {
          ctx.addIssue({
            code: 'custom',
            path: ['recurrence', 'until'],
            message: 'until_too_far_out',
          });
        }
      }
    });

  /**
   * The stored/public event shape: exactly the 13 PublicEvent fields, and no
   * more. `src/pages/events.astro` re-validates the git-baked src/data/events.json
   * against this at build time, so a later bad commit that adds a server-only
   * field (signalUrl, codeDigest, revoked) is rejected by `.strict()` and fails
   * the build rather than reaching a rendered card or the data island.
   *
   * This is the ONE schema for that shape — the page keeps no local copy that can
   * drift from it. It is deliberately separate from submissionSchema above:
   * a submission has `organizerCode` and no `id`/`createdAt`; a stored record is
   * the mirror image. The per-field text caps are the same imported constants, so
   * the two schemas cannot disagree on a limit.
   */
  export const publicEventSchema = z
    .object({
      id: z.string(),
      type: z.enum(['meetup', 'public']),
      title: sanitizedField(TITLE_LIMITS),
      description: sanitizedField(DESCRIPTION_LIMITS).nullable(),
      date: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
      time: z.string().regex(TIME_RE, 'bad_format'),
      city: z.string(),
      county: z.string(),
      address: sanitizedField(ADDRESS_LIMITS).nullable(),
      hasSignalGroup: z.boolean(),
      recurrence: z
        .object({
          freq: z.enum(['weekly', 'monthly_nth']),
          until: z
            .string()
            .regex(ISO_DATE_RE, 'bad_format')
            .refine(isRealIsoDate, 'not_a_real_date'),
        })
        .strict()
        .nullable(),
      organizer: z.string(),
      createdAt: z.string(),
    })
    .strict();

  function invalid(errors: FieldError[]): Err<'invalid'> & { errors: FieldError[] } {
    return { ...err('invalid'), errors };
  }

  function toFieldErrors(error: z.ZodError): FieldError[] {
    const out: FieldError[] = [];
    for (const issue of error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          out.push({ field: [...issue.path, key].join('.'), code: 'unrecognized_key' });
        }
        continue;
      }
      const field = issue.path.length > 0 ? issue.path.join('.') : '_body';
      // Our own messages are snake_case machine codes (from sanitizeText,
      // validateSignalUrl, normalizeCode, and the refinements above). Anything
      // else is zod's English prose, so fall back to zod's issue code and never
      // echo submitted text back to the caller.
      const code = SNAKE_CASE_RE.test(issue.message) ? issue.message : issue.code;
      out.push({ field, code });
    }
    return out;
  }

  export function validateSubmission(
    raw: unknown,
  ): Ok<ValidatedSubmission> | (Err<'invalid'> & { errors?: FieldError[] }) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return invalid([{ field: '_body', code: 'not_an_object' }]);
    }

    // JSON.parse creates `__proto__` as an own enumerable property rather than
    // setting the prototype, and zod 4.4.3 skips it during its unrecognized-key
    // scan. Reject it explicitly.
    if (Object.hasOwn(raw, '__proto__')) {
      return invalid([{ field: '__proto__', code: 'unrecognized_key' }]);
    }

    const parsed = submissionSchema.safeParse(raw);
    if (!parsed.success) {
      return invalid(toFieldErrors(parsed.error));
    }

    const data = parsed.data;

    // County is derived here and nowhere else. isKnownCity() already gated the
    // slug, so this is belt-and-braces; it must still never fall through.
    const county = countyForCity(data.city);
    if (!county.ok) {
      return invalid([{ field: 'city', code: 'unknown_city' }]);
    }

    // Explicit construction, never a spread of `data`. Same rule as
    // toPublicEvent(): the output field set is written out, not inherited.
    return ok({
      type: data.type,
      title: data.title,
      description: data.description ?? null,
      date: data.date,
      time: data.time,
      city: data.city,
      county: county.value,
      address: data.address ?? null,
      signalUrl: data.signalUrl ?? null,
      recurrence: data.recurrence ?? null,
      codeNormalized: data.organizerCode,
    });
  }
  ```

  **Note for Task 12 (the submit function) and the form task:** because the schema is `.strict()`, the honeypot field described in the design (§6) will be rejected as an unrecognized key if it is posted alongside the real fields. The function must read and act on the honeypot, then delete it from the parsed body, **before** calling `validateSubmission`. Do not add the honeypot to this schema — keeping the accepted key set identical to the stored field set is what makes the mass-assignment guard readable.

---

- [ ] **Step 5: Run the test and confirm it passes**

  ```bash
    npx vitest run src/lib/event-schema.test.ts
  ```

  Expected result:

  ```
   ✓ src/lib/event-schema.test.ts (18 tests)

   Test Files  1 passed (1)
        Tests  18 passed (18)
  ```

  Then run the full suite to confirm nothing else regressed:

  ```bash
  npm test
  ```

  Expected: all test files pass, including the pre-existing `geo-utils.test.ts`, `blog-utils.test.ts` and `district-matcher.test.ts`.

---

- [ ] **Step 6: Commit**

  ```bash
    git add package.json package-lock.json src/lib/event-schema.ts src/lib/event-schema.test.ts
  git commit -m "feat(events): add strict submission schema with derived county

  Adds src/lib/event-schema.ts, the single validator for POST /api/submit-event.
  Composes sanitizeText, validateSignalUrl, normalizeCode and countyForCity
  behind one zod schema. The title/description/address caps are imported from
  sanitize-text.ts (TITLE_LIMITS, DESCRIPTION_LIMITS, ADDRESS_LIMITS), never
  retyped.

  The object is .strict(), which rejects unknown keys rather than stripping
  them. That is what stops mass assignment of the server-owned fields id,
  organizer, createdAt, revoked and codeDigest, and what rejects a submitted
  county — county is derived from city, never read from input.

  zod 4.4.3 excludes __proto__ from its unrecognized-key scan, so
  validateSubmission checks Object.hasOwn(raw, '__proto__') explicitly before
  parsing.

  Also exports publicEventSchema, the strict validator for the stored/public
  event shape (the 13 PublicEvent fields, no organizerCode). src/pages/events.astro
  imports it to re-validate the git-baked events.json at build time, so there is
  one shared schema for that shape and no local page copy that can drift.

  zod is pinned exactly (no caret) to 4.4.3, published 2026-05-04, to satisfy
  the machine-wide 30-day minimum release age gate."
  ```

---

---

---

### Task 12: submit-event function

Adds the only write path into Blobs: `POST /api/submit-event`. Everything it needs — `blob-stores.ts`, `rate-limit.ts`, `event-schema.ts`, `organizer-code.ts`, `public-event.ts`, and `dedupeKey` from `sanitize-text.ts` — was built in Tasks 1–11. Import them; do not redefine them.

Pipeline order is fixed by the design (§6) and the tests enforce it: **config check → Content-Length cap → counting-reader body cap → JSON plain-object check → honeypot drop → rate limit → validate → verify code → dedupe → write**. The cheap bounded checks come before any normalization, segmentation, or Blobs I/O.

**Files:**

- Create: `tests/functions/submit-event.test.ts`
- Create: `netlify/functions/submit-event.ts`
- Modify: `package.json` (add `@netlify/functions` devDependency)

> **Why the test lives in `tests/functions/` and not beside the source.** Netlify bundles *every* top-level file in `netlify/functions/` as a deployable function. A `netlify/functions/submit-event.test.ts` would ship to production as a function named `submit-event.test`. Function tests go in `tests/functions/`, which vitest's default `include` glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) already picks up with no config change. `src/lib/*.test.ts` stays colocated as before.

---

- [ ] **Step 1: Add the `@netlify/functions` types package**

  The repo has no Netlify function tooling yet (`node_modules/@netlify` does not exist). The `Config` and `Context` types come from this package. It is types-and-helpers only at build time; Netlify supplies the runtime.

  Run from the repo root:

  ```
  npm install --save-dev @netlify/functions
  ```

  **If the install is blocked** by the machine-wide 30-day minimum-release-age gate, the gate's error names the newest version that satisfies it. Re-run pinned to that exact version, e.g.:

  ```
  npm install --save-dev @netlify/functions@<version-the-gate-named>
  ```

  Verify:

  ```
  node -e "console.log(require('./node_modules/@netlify/functions/package.json').version)"
  ```

  Expected: a version number prints (no `MODULE_NOT_FOUND`).

  No `netlify.toml` change is needed. `netlify/functions/` is Netlify's default functions directory and TypeScript functions are bundled with esbuild with zero config.

- [ ] **Step 2: Write the failing test**

  Create `tests/functions/submit-event.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect, beforeEach, vi } from 'vitest';
  import { allCitySlugs } from '../../src/lib/jurisdictions.js';

  // --- Mocks -----------------------------------------------------------------
  // vi.mock factories are hoisted above imports, so the spies they close over
  // must be created with vi.hoisted().

  const blobs = vi.hoisted(() => {
    class ContextRefusedError extends Error {}
    return {
      ContextRefusedError,
      eventsSetJSON: vi.fn(async (_key: string, _value: unknown) => {}),
      eventsList: vi.fn(async () => ({ blobs: [] as { key: string }[], directories: [] as string[] })),
      eventsGet: vi.fn(async (_key: string, _opts?: unknown) => null as unknown),
      codesGet: vi.fn(async (_key: string, _opts?: unknown) => null as unknown),
    };
  });

  vi.mock('../../src/lib/blob-stores.js', () => ({
    ContextRefusedError: blobs.ContextRefusedError,
    eventsStore: () => ({ setJSON: blobs.eventsSetJSON, list: blobs.eventsList, get: blobs.eventsGet }),
    codesStore: () => ({ get: blobs.codesGet }),
    rateLimitStore: () => ({}),
    metaStore: () => ({}),
  }));

  const limiter = vi.hoisted(() => ({
    consume: vi.fn(async () => ({ allowed: true, used: 1, limit: 20 })),
  }));

  vi.mock('../../src/lib/rate-limit.js', () => ({
    hashSubject: (ip: string, _salt: string) => `subject:${ip}`,
    consume: limiter.consume,
  }));

  import handler, { config } from '../../netlify/functions/submit-event.js';

  // --- Helpers ---------------------------------------------------------------

  /**
   * Minimal Request stand-in. `body` is a getter so a test can prove the handler
   * never touched the stream.
   */
  function makeRequest(
    rawBody: string,
    opts: { contentLength?: string | null } = {},
  ): { req: Request; state: { bodyAccessed: boolean } } {
    const bytes = new TextEncoder().encode(rawBody);
    const state = { bodyAccessed: false };
    const declared =
      opts.contentLength === undefined ? String(bytes.byteLength) : opts.contentLength;

    const req = {
      method: 'POST',
      headers: {
        get(name: string): string | null {
          return name.toLowerCase() === 'content-length' ? declared : null;
        },
      },
      get body(): ReadableStream<Uint8Array> {
        state.bodyAccessed = true;
        return new ReadableStream<Uint8Array>({
          start(controller) {
            // Deliver in 1 KB chunks so the counting reader is genuinely exercised.
            for (let i = 0; i < bytes.byteLength; i += 1024) {
              controller.enqueue(bytes.subarray(i, Math.min(i + 1024, bytes.byteLength)));
            }
            controller.close();
          },
        });
      },
    };

    return { req: req as unknown as Request, state };
  }

  const ctx = { ip: '203.0.113.7', params: {} } as unknown as Parameters<typeof handler>[1];

  /** A date 30 days out, ISO `YYYY-MM-DD`, UTC. */
  function futureDate(): string {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function validPayload(): Record<string, unknown> {
    return {
      type: 'meetup',
      title: 'Thursday group',
      date: futureDate(),
      time: '19:00',
      city: allCitySlugs()[0],
      signalUrl: 'https://signal.group/#CjQKIExhbXBz',
      organizerCode: 'drum yoga vivid clay',
    };
  }

  const LIVE_CODE = { pseudonym: 'handle-jay', issuedAt: '2026-08-01T00:00:00Z', revoked: false };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTEXT = 'production';
    process.env.ORGANIZER_CODE_PEPPER = 'a'.repeat(64);
    process.env.RATE_LIMIT_IP_SALT = 'b'.repeat(64);
    limiter.consume.mockResolvedValue({ allowed: true, used: 1, limit: 20 });
    blobs.codesGet.mockResolvedValue(null);
    blobs.eventsSetJSON.mockResolvedValue(undefined);
    blobs.eventsList.mockResolvedValue({ blobs: [], directories: [] });
    blobs.eventsGet.mockResolvedValue(null);
  });

  // --- Tests -----------------------------------------------------------------

  describe('config', () => {
    it('declares the edge rate-limit shield at windowSize 180', () => {
      expect(config.path).toBe('/api/submit-event');
      expect(config.method).toEqual(['POST']);
      expect(config.rateLimit).toBeDefined();
      expect(config.rateLimit!.windowSize).toBe(180);
      expect(config.rateLimit!.aggregateBy).toBe('ip');
    });
  });

  describe('body caps', () => {
    it('rejects an oversized declared Content-Length without reading the body', async () => {
      const { req, state } = makeRequest('{}', { contentLength: '9000' });

      const res = await handler(req, ctx);

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: 'body_too_large' });
      expect(state.bodyAccessed).toBe(false);
      expect(limiter.consume).not.toHaveBeenCalled();
      expect(blobs.codesGet).not.toHaveBeenCalled();
      expect(blobs.eventsSetJSON).not.toHaveBeenCalled();
    });

    it('rejects a request with no Content-Length header without reading the body', async () => {
      const { req, state } = makeRequest('{}', { contentLength: null });

      const res = await handler(req, ctx);

      expect(res.status).toBe(411);
      expect(await res.json()).toEqual({ error: 'length_required' });
      expect(state.bodyAccessed).toBe(false);
    });

    it('rejects a body that exceeds the cap while streaming even when the header lies', async () => {
      const oversized = JSON.stringify({ title: 'x'.repeat(9000) });
      const { req } = makeRequest(oversized, { contentLength: '10' });

      const res = await handler(req, ctx);

      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: 'body_too_large' });
      expect(blobs.eventsSetJSON).not.toHaveBeenCalled();
    });
  });

  describe('JSON shape', () => {
    it('rejects an array body', async () => {
      const { req } = makeRequest(JSON.stringify([validPayload()]));

      const res = await handler(req, ctx);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_json' });
      expect(blobs.codesGet).not.toHaveBeenCalled();
      expect(blobs.eventsSetJSON).not.toHaveBeenCalled();
    });
  });

  describe('honeypot', () => {
    it('drops a bot that filled `website`, returning the success shape with no write', async () => {
      // A bot that fills the honeypot gets a byte-plausible 201 and is never told
      // it was caught. Nothing is written, and the code store is never consulted.
      blobs.codesGet.mockResolvedValue(LIVE_CODE);
      const payload = { ...validPayload(), website: 'http://spam.example' };

      const res = await handler(makeRequest(JSON.stringify(payload)).req, ctx);
      const body = (await res.json()) as { ok: boolean; id: string };

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.id).toMatch(/^[a-z2-7]{8}$/);
      expect(blobs.eventsSetJSON).not.toHaveBeenCalled();
      expect(blobs.codesGet).not.toHaveBeenCalled();
      expect(limiter.consume).not.toHaveBeenCalled();
    });

    it('proceeds normally when the honeypot is present but empty', async () => {
      // An empty `website` is what a real browser sends. It must be stripped
      // before the .strict() schema runs, then the submission proceeds.
      blobs.codesGet.mockResolvedValue(LIVE_CODE);
      const payload = { ...validPayload(), website: '' };

      const res = await handler(makeRequest(JSON.stringify(payload)).req, ctx);
      const body = (await res.json()) as { ok: boolean; id: string };

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(blobs.eventsSetJSON).toHaveBeenCalledTimes(1);
    });
  });

  describe('code verification', () => {
    it('rejects an unknown code with a response byte-identical to a revoked code', async () => {
      blobs.codesGet.mockResolvedValue(null);
      const unknownRes = await handler(makeRequest(JSON.stringify(validPayload())).req, ctx);
      const unknownBody = await unknownRes.text();

      blobs.codesGet.mockResolvedValue({ ...LIVE_CODE, revoked: true });
      const revokedRes = await handler(makeRequest(JSON.stringify(validPayload())).req, ctx);
      const revokedBody = await revokedRes.text();

      expect(unknownRes.status).toBe(403);
      expect(revokedRes.status).toBe(unknownRes.status);
      expect(revokedBody).toBe(unknownBody);
      expect(revokedRes.headers.get('content-type')).toBe(unknownRes.headers.get('content-type'));
      expect(revokedRes.headers.get('cache-control')).toBe(unknownRes.headers.get('cache-control'));
      expect(blobs.eventsSetJSON).not.toHaveBeenCalled();
    });
  });

  describe('successful submission', () => {
    it('writes the record under the bare id and returns { ok, id }', async () => {
      blobs.codesGet.mockResolvedValue(LIVE_CODE);
      const payload = validPayload();

      const res = await handler(makeRequest(JSON.stringify(payload)).req, ctx);
      const body = (await res.json()) as { ok: boolean; id: string };

      expect(res.status).toBe(201);
      // The success body carries exactly `ok` and `id`, nothing else.
      expect(Object.keys(body).sort()).toEqual(['id', 'ok']);
      expect(body.ok).toBe(true);
      expect(body.id).toMatch(/^[a-z2-7]{8}$/);

      expect(blobs.eventsSetJSON).toHaveBeenCalledTimes(1);
      const [key, record] = blobs.eventsSetJSON.mock.calls[0] as [string, Record<string, unknown>];
      // The blob key is the BARE id — the store is already named `events`, so an
      // `events/<id>` key would double-namespace it.
      expect(key).toBe(body.id);
      expect(record.id).toBe(body.id);
      expect(record.type).toBe('meetup');
      expect(record.title).toBe('Thursday group');
      expect(record.organizer).toBe('handle-jay');
      expect(record.hasSignalGroup).toBe(true);
      expect(record.signalUrl).toBe('https://signal.group/#CjQKIExhbXBz');
      expect(record.revoked).toBe(false);
      expect(typeof record.codeDigest).toBe('string');
      expect(record.codeDigest).toMatch(/^[0-9a-f]{64}$/);
      // county is derived, never submitted
      expect(typeof record.county).toBe('string');
      expect((record.county as string).length).toBeGreaterThan(0);
    });

    it('generates the id server-side and never takes it from the request', async () => {
      blobs.codesGet.mockResolvedValue(LIVE_CODE);
      const raw = JSON.stringify(validPayload());

      const first = (await (await handler(makeRequest(raw).req, ctx)).json()) as { id: string };
      const second = (await (await handler(makeRequest(raw).req, ctx)).json()) as { id: string };

      expect(first.id).toMatch(/^[a-z2-7]{8}$/);
      expect(second.id).toMatch(/^[a-z2-7]{8}$/);
      // Two byte-identical requests must not produce the same id.
      expect(second.id).not.toBe(first.id);
      // Neither id can be a substring the client supplied.
      expect(raw).not.toContain(first.id);
      expect(raw).not.toContain(second.id);
    });
  });

  describe('dedupe', () => {
    it('silently succeeds without writing when the semantic tuple matches a live event', async () => {
      blobs.codesGet.mockResolvedValue(LIVE_CODE);
      const payload = validPayload();
      blobs.eventsList.mockResolvedValue({ blobs: [{ key: 'existing1' }], directories: [] });
      // Same type + date + city + normalized title; a DIFFERENT Signal URL, so the
      // match is specifically on the semantic tuple.
      blobs.eventsGet.mockResolvedValue({
        id: 'existing1',
        type: payload.type,
        title: '  Thursday   group ',
        date: payload.date,
        city: payload.city,
        county: 'somewhere',
        signalUrl: 'https://signal.group/#DifferentLink',
        recurrence: null,
        revoked: false,
      });

      const res = await handler(makeRequest(JSON.stringify(payload)).req, ctx);
      const body = (await res.json()) as { ok: boolean; id: string };

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(body.id).toMatch(/^[a-z2-7]{8}$/);
      expect(blobs.eventsSetJSON).not.toHaveBeenCalled();
    });

    it('silently succeeds without writing when the Signal URL matches a live event', async () => {
      blobs.codesGet.mockResolvedValue(LIVE_CODE);
      const payload = validPayload();
      blobs.eventsList.mockResolvedValue({ blobs: [{ key: 'existing2' }], directories: [] });
      // Everything else differs; only the Signal link is shared. This is the real
      // spam shape: one link reposted across many cities.
      blobs.eventsGet.mockResolvedValue({
        id: 'existing2',
        type: 'meetup',
        title: 'A completely unrelated title',
        date: futureDate(),
        city: allCitySlugs()[1] ?? allCitySlugs()[0],
        county: 'somewhere',
        signalUrl: payload.signalUrl,
        recurrence: null,
        revoked: false,
      });

      const res = await handler(makeRequest(JSON.stringify(payload)).req, ctx);
      const body = (await res.json()) as { ok: boolean; id: string };

      expect(res.status).toBe(201);
      expect(body.ok).toBe(true);
      expect(blobs.eventsSetJSON).not.toHaveBeenCalled();
    });

    it('ignores a revoked live event when deduping and writes the new one', async () => {
      blobs.codesGet.mockResolvedValue(LIVE_CODE);
      const payload = validPayload();
      blobs.eventsList.mockResolvedValue({ blobs: [{ key: 'revoked1' }], directories: [] });
      // A revoked event is not a live match on either axis.
      blobs.eventsGet.mockResolvedValue({
        id: 'revoked1',
        type: payload.type,
        title: 'Thursday group',
        date: payload.date,
        city: payload.city,
        county: 'somewhere',
        signalUrl: payload.signalUrl,
        recurrence: null,
        revoked: true,
      });

      const res = await handler(makeRequest(JSON.stringify(payload)).req, ctx);

      expect(res.status).toBe(201);
      expect(blobs.eventsSetJSON).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] **Step 3: Run the test and confirm it fails for the right reason**

  ```
  npm test -- tests/functions/submit-event.test.ts
  ```

  Expected failure — the module under test does not exist yet:

  ```
   FAIL  tests/functions/submit-event.test.ts [ tests/functions/submit-event.test.ts ]
  Error: Failed to load url ../../netlify/functions/submit-event.js (resolved id: .../netlify/functions/submit-event.js) in .../tests/functions/submit-event.test.ts. Does the file exist?

   Test Files  1 failed (1)
        Tests  no tests
  ```

  If instead the failure names `../../src/lib/jurisdictions.js`, `blob-stores.js`, or `rate-limit.js`, Tasks 5/8/9 are not finished — stop and complete those first rather than stubbing them here.

- [ ] **Step 4: Implement the function**

  Create `netlify/functions/submit-event.ts` with exactly this content:

  ```ts
  import type { Config, Context } from '@netlify/functions';
  import { randomBytes } from 'node:crypto';

  import { ContextRefusedError, codesStore, eventsStore } from '../../src/lib/blob-stores.js';
  import { consume, hashSubject } from '../../src/lib/rate-limit.js';
  import { validateSubmission } from '../../src/lib/event-schema.js';
  import { digestCode } from '../../src/lib/organizer-code.js';
  import { dedupeKey } from '../../src/lib/sanitize-text.js';
  import type { StoredEvent } from '../../src/lib/public-event.js';

  /** Hard body cap, design §6. Bounds every downstream normalization and regex. */
  const MAX_BODY_BYTES = 8192;

  /** Per-IP-per-day budget enforced inside the function (design §8). */
  const DAILY_SUBMIT_LIMIT = 20;

  /** RFC 4648 base32, lowercased. Matches the `/^[a-z2-7]{8}$/` id check in /go/:eventId. */
  const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

  interface CodeRecord {
    pseudonym: string;
    issuedAt: string;
    revoked: boolean;
  }

  function json(status: number, payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  /**
   * Unknown code and revoked code MUST return the identical response. A
   * distinguishable rejection turns this endpoint into a code-status oracle.
   */
  function rejectCode(): Response {
    return json(403, { error: 'invalid_code' });
  }

  /**
   * 8 base32 characters from 5 CSPRNG bytes: 40 bits in, 40 bits out, so there
   * is no modulo bias and no rejection loop. Never derived from request input.
   */
  function generateEventId(): string {
    const bytes = randomBytes(5);
    let acc = 0;
    let bits = 0;
    let out = '';
    for (const byte of bytes) {
      acc = (acc << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        out += BASE32_ALPHABET[(acc >> bits) & 31];
      }
    }
    return out;
  }

  /**
   * Reads the body through a counting reader, aborting past MAX_BODY_BYTES.
   * Returns null when the cap is exceeded, so a chunked `Transfer-Encoding`
   * cannot evade the Content-Length check.
   */
  async function readCappedBody(req: Request): Promise<Uint8Array | null> {
    const stream = req.body;
    if (!stream) return new Uint8Array(0);

    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }

  function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  /** UTC day key, so the daily reset is implicit in the rate-limit blob key. */
  function utcToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Collapse a submission to its normalized semantic tuple. dedupeKey() folds
   * the title the same way on both the incoming and the stored side, so an added
   * space or zero-width character cannot slip a duplicate past the check.
   */
  function semanticKey(parts: { type: string; date: string; city: string; title: string }): string {
    return [parts.type, parts.date, parts.city, dedupeKey(parts.title)].join('\x00');
  }

  export default async (req: Request, context: Context): Promise<Response> => {
    // 0. Fail closed on missing secrets. Both are production-context-only,
    //    Functions-scoped Netlify variables; a deploy preview lands here.
    const pepper = process.env.ORGANIZER_CODE_PEPPER;
    const ipSalt = process.env.RATE_LIMIT_IP_SALT;
    if (!pepper || !ipSalt) {
      return json(503, { error: 'unavailable' });
    }

    // 1. Content-Length gate, before the body stream is touched at all.
    const declared = req.headers.get('content-length');
    if (declared === null) {
      return json(411, { error: 'length_required' });
    }
    const declaredBytes = Number(declared);
    if (!Number.isInteger(declaredBytes) || declaredBytes < 0) {
      return json(411, { error: 'length_required' });
    }
    if (declaredBytes > MAX_BODY_BYTES) {
      return json(413, { error: 'body_too_large' });
    }

    // 2. Counting reader.
    let bodyBytes: Uint8Array | null;
    try {
      bodyBytes = await readCappedBody(req);
    } catch {
      return json(400, { error: 'invalid_json' });
    }
    if (bodyBytes === null) {
      return json(413, { error: 'body_too_large' });
    }

    // 3. Parse, and reject anything that is not a plain JSON object.
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes));
    } catch {
      return json(400, { error: 'invalid_json' });
    }
    if (!isPlainObject(parsed)) {
      return json(400, { error: 'invalid_json' });
    }

    // 3b. Honeypot (design §6), acted on BEFORE the .strict() schema — which
    //     would otherwise reject `website` as an unrecognized key. A non-empty
    //     `website` is a bot: return the SAME { ok, id } success shape with a
    //     throwaway id and write nothing, so the bot never learns it was caught,
    //     and never reach the rate limiter or the code store. Then strip the key
    //     so a real (empty) submission validates.
    if (typeof parsed.website === 'string' && parsed.website.length > 0) {
      return json(201, { ok: true, id: generateEventId() });
    }
    delete parsed.website;

    // 4. Rate limit. The IP is hashed and never stored raw. Fails open on a
    //    Blobs error so an incident cannot silently kill submissions.
    const subject = hashSubject(context.ip ?? 'unknown', ipSalt);
    const verdict = await consume(subject, DAILY_SUBMIT_LIMIT, utcToday());
    if (!verdict.allowed) {
      return json(429, { error: 'rate_limited' });
    }

    // 5. Validate. `county` is derived inside the schema from `city`; a
    //    submitted `county` is a validation error, never trusted.
    const validated = validateSubmission(parsed);
    if (!validated.ok) {
      return json(400, { error: 'invalid', errors: validated.errors ?? [] });
    }
    const submission = validated.value;

    // 6. Verify the organizer code. The digest IS the blob key, so there is no
    //    comparison loop and no timing signal. codesStore() is opened with
    //    consistency: 'strong' — eventual reads keep a revoked code alive ~60s.
    const digest = digestCode(submission.codeNormalized, pepper);
    let codeRecord: CodeRecord | null;
    try {
      codeRecord = (await codesStore().get(digest, { type: 'json' })) as CodeRecord | null;
    } catch {
      return json(503, { error: 'unavailable' });
    }
    if (!codeRecord || codeRecord.revoked) {
      return rejectCode();
    }

    // 6b. Dedupe (design §6). The real spam shape here is one Signal link posted
    //     for many cities, so check TWO things against every LIVE event: the
    //     normalized semantic tuple, and the Signal URL on its own. A match is a
    //     silent success with a throwaway id and no write — never a
    //     distinguishable rejection a spammer could probe. Best-effort: a Blobs
    //     read error here must not kill a legitimate submission, so it falls
    //     through to the write.
    const incomingKey = semanticKey({
      type: submission.type,
      date: submission.date,
      city: submission.city,
      title: submission.title,
    });
    try {
      const { blobs: liveKeys } = await eventsStore().list();
      for (const entry of liveKeys) {
        const existing = (await eventsStore().get(entry.key, { type: 'json' })) as StoredEvent | null;
        if (!existing || typeof existing !== 'object' || existing.revoked) continue;
        const sameSemantics =
          semanticKey({
            type: existing.type,
            date: existing.date,
            city: existing.city,
            title: existing.title,
          }) === incomingKey;
        const sameSignal =
          submission.signalUrl !== null && existing.signalUrl === submission.signalUrl;
        if (sameSemantics || sameSignal) {
          return json(201, { ok: true, id: generateEventId() });
        }
      }
    } catch {
      // Dedupe is best-effort; a Blobs read error falls through to the write.
    }

    // 7. Write. The id and the blob key are server-generated. The key is the
    //    BARE id: the store is already named `events`, so an `events/<id>` key
    //    would double-namespace it and every reader looks it up bare.
    const id = generateEventId();
    const record: StoredEvent = {
      id,
      type: submission.type,
      title: submission.title,
      description: submission.description,
      date: submission.date,
      time: submission.time,
      city: submission.city,
      county: submission.county,
      address: submission.address,
      hasSignalGroup: submission.signalUrl !== null,
      recurrence: submission.recurrence,
      organizer: codeRecord.pseudonym,
      createdAt: new Date().toISOString(),
      signalUrl: submission.signalUrl,
      codeDigest: digest,
      revoked: false,
    };

    try {
      await eventsStore().setJSON(id, record);
    } catch (error) {
      if (error instanceof ContextRefusedError) {
        return json(503, { error: 'unavailable' });
      }
      return json(503, { error: 'unavailable' });
    }

    return json(201, { ok: true, id });
  };

  export const config: Config = {
    path: '/api/submit-event',
    method: ['POST'],
    // Edge shield only. windowSize is capped at 180s by the platform, so this
    // is a burst wall, not the daily budget — that lives in step 4 above.
    rateLimit: {
      action: 'rate_limit',
      aggregateBy: 'ip',
      windowSize: 180,
      windowLimit: 10,
    },
  };
  ```

  Three notes for the implementer:

  - `organizer` comes from the **code record's** `pseudonym`, never from the request. There is no submittable pseudonym field, so an organizer cannot post under someone else's handle.
  - `signalUrl` and `codeDigest` are written to Blobs and are *not* in the response. They are stripped again on the read path by `toPublicEvent()` (Task 7). Do not add them to the 201 body "for convenience."
  - The success body is exactly `{ ok: true, id }`. The honeypot drop and both dedupe no-ops return that identical shape (with a throwaway id) so a bot or a duplicate submitter cannot distinguish a real write from a silent discard.

- [ ] **Step 5: Run the test and confirm it passes**

  ```
  npm test -- tests/functions/submit-event.test.ts
  ```

  Expected:

  ```
   ✓ tests/functions/submit-event.test.ts (13 tests)

   Test Files  1 passed (1)
        Tests  13 passed (13)
  ```

  Then run the whole suite to confirm nothing regressed:

  ```
  npm test
  ```

  Expected: all test files pass, including `src/lib/geo-utils.test.ts`, `src/lib/blog-utils.test.ts`, `src/lib/district-matcher.test.ts`, and the Task 1–11 lib tests.

- [ ] **Step 6: Type-check**

  ```
  npx astro check
  ```

  Expected: `0 errors`. If `Config` reports that `rateLimit` is not a known property, the installed `@netlify/functions` predates the typed rate-limit config — bump to a newer version that still satisfies the 30-day release-age gate rather than casting the object to `any`.

- [ ] **Step 7: Commit**

  ```
  git add netlify/functions/submit-event.ts tests/functions/submit-event.test.ts package.json package-lock.json
  git commit -m "feat(events): add POST /api/submit-event with body cap, rate limit, code verification, honeypot and dedupe"
  ```

---

---

---

### Task 13: events read function

The public overlay endpoint. `GET /api/events` lists the `events` Blobs store, drops
revoked and long-past records, and projects every surviving record through
`toPublicEvent()` before serializing.

Read §5 ("Reading events out: `toPublicEvent()`") and §16.1 of
`docs/plans/2026-08-17-events-calendar-design.md` before starting. This endpoint is
one of the two highest-consequence rows in the attack-surface inventory: the naive
implementation (`store.list()`, return the blobs) publishes every live Signal invite
as CDN-cached machine-readable JSON to anyone who asks. The projection is the only
control on that path, so the leak test below is written first and is the reason this
task exists as its own task. The failure path carries the same invariant: on any
store error the endpoint fails safe by returning a static empty-list 503 and never a
raw or partial record, because the caught error is never inspected and the projection
runs only inside the `try`.

**Files:**

- Create: `netlify/functions/events.ts`
- Create: `tests/functions/events.test.ts`

Do **not** create the test as `netlify/functions/events.test.ts`. Netlify treats every
top-level file in the functions directory as a deployable function, so a co-located
test would ship as a live endpoint at `/.netlify/functions/events.test`. Tests for
functions live under `tests/functions/`. Vitest's default `include` glob
(`**/*.{test,spec}.?(c|m)[jt]s?(x)`, minus `node_modules`) already picks that up, so
`vitest.config.ts` needs no change.

---

- [ ] **Step 1: Verify the prerequisites from earlier tasks are in place**

  This task imports two modules built earlier in this plan and one npm package
  installed earlier in this plan. Confirm all three before writing code.

  Run, from the repo root:

  ```bash
  ls src/lib/blob-stores.ts src/lib/public-event.ts && ls node_modules/@netlify
  ```

  Expected: both file paths echo back, and the `node_modules/@netlify` listing
  contains at least `blobs` and `functions`.

  If `node_modules/@netlify` does not exist, stop. `@netlify/blobs` and
  `@netlify/functions` are installed by the earlier task that created
  `src/lib/blob-stores.ts`; go finish that task rather than installing here. (The
  machine-wide 30-day minimum-release-age gate applies to any install, so an ad-hoc
  `npm install @netlify/functions` at latest may be blocked.)

  No commit for this step.

---

- [ ] **Step 2: Write the failing test**

  Create `tests/functions/events.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
  import type { Context } from '@netlify/functions';

  // vi.mock factories are hoisted above imports, so the mock fns must be created
  // inside vi.hoisted or the factory hits a TDZ error on the outer const.
  const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    get: vi.fn(),
  }));

  vi.mock('../../src/lib/blob-stores.js', () => ({
    eventsStore: () => ({ list: mocks.list, get: mocks.get }),
  }));

  import handler, { RETENTION_DAYS, isVisible } from '../../netlify/functions/events.js';

  const NOW = '2026-08-18T12:00:00Z';

  /** Seed the mocked events store with key -> stored record. */
  function seed(records: Record<string, Record<string, unknown>>): void {
    mocks.list.mockResolvedValue({
      blobs: Object.keys(records).map((key) => ({ key, etag: `"${key}"` })),
      directories: [],
    });
    mocks.get.mockImplementation(async (key: string) =>
      Object.prototype.hasOwnProperty.call(records, key) ? structuredClone(records[key]) : null,
    );
  }

  /** A live meetup record, carrying every field that must never be published. */
  function storedRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'k7m29qxb',
      type: 'meetup',
      title: 'Thursday sign night',
      description: null,
      date: '2026-08-22',
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: null,
      hasSignalGroup: true,
      recurrence: null,
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
      // --- must never reach the response ---
      signalUrl: 'https://signal.group/#CjQKIFAKESECRETINVITEKEY',
      codeDigest: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      revoked: false,
      internalNote: 'unknown-future-field-must-not-leak',
      ...overrides,
    };
  }

  function callHandler(): Promise<Response> {
    return handler(new Request('https://deflocksc.org/api/events'), {} as unknown as Context);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    mocks.list.mockReset();
    mocks.get.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('GET /api/events — leak containment', () => {
    it('never serializes signalUrl, codeDigest, revoked, or unknown extra fields', async () => {
      seed({ k7m29qxb: storedRecord() });

      const res = await callHandler();
      const body = await res.text();

      // The four forbidden keys.
      expect(body).not.toContain('signalUrl');
      expect(body).not.toContain('codeDigest');
      expect(body).not.toContain('revoked');
      expect(body).not.toContain('internalNote');

      // And their values, in case a future refactor renames the keys.
      expect(body).not.toContain('signal.group');
      expect(body).not.toContain('FAKESECRETINVITEKEY');
      expect(body).not.toContain('a1b2c3d4e5f60718293a4b5c6d7e8f90');
      expect(body).not.toContain('unknown-future-field-must-not-leak');

      // The public fields did survive, so the assertions above are not passing
      // because the response is empty.
      const parsed = JSON.parse(body) as { events: Array<Record<string, unknown>> };
      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].id).toBe('k7m29qxb');
      expect(parsed.events[0].title).toBe('Thursday sign night');
      expect(parsed.events[0].city).toBe('greenville');
    });

    it('emits exactly the public field set and nothing else', async () => {
      seed({ k7m29qxb: storedRecord() });

      const res = await callHandler();
      const parsed = (await res.json()) as { events: Array<Record<string, unknown>> };

      expect(Object.keys(parsed.events[0]).sort()).toEqual(
        [
          'address',
          'city',
          'county',
          'createdAt',
          'date',
          'description',
          'hasSignalGroup',
          'id',
          'organizer',
          'recurrence',
          'time',
          'title',
          'type',
        ].sort(),
      );
    });
  });

  describe('GET /api/events — filtering', () => {
    it('omits revoked records', async () => {
      seed({
        live0001: storedRecord({ id: 'live0001' }),
        dead0001: storedRecord({ id: 'dead0001', revoked: true }),
      });

      const res = await callHandler();
      const parsed = (await res.json()) as { events: Array<{ id: string }> };

      expect(parsed.events.map((e) => e.id)).toEqual(['live0001']);
    });

    it('keeps a recently past event and drops one beyond the retention horizon', async () => {
      // NOW is 2026-08-18. RETENTION_DAYS is 30, so 2026-07-25 stays and
      // 2026-07-01 goes.
      seed({
        recent01: storedRecord({ id: 'recent01', date: '2026-07-25' }),
        ancient1: storedRecord({ id: 'ancient1', date: '2026-07-01' }),
      });

      const res = await callHandler();
      const parsed = (await res.json()) as { events: Array<{ id: string }> };

      expect(RETENTION_DAYS).toBe(30);
      expect(parsed.events.map((e) => e.id)).toEqual(['recent01']);
    });

    it('uses recurrence.until, not date, as the horizon for a series', async () => {
      // The series started long ago but runs until next month, so it stays.
      seed({
        series01: storedRecord({
          id: 'series01',
          date: '2026-03-05',
          recurrence: { freq: 'weekly', until: '2026-09-30' },
        }),
      });

      const res = await callHandler();
      const parsed = (await res.json()) as { events: Array<{ id: string }> };

      expect(parsed.events.map((e) => e.id)).toEqual(['series01']);
    });

    it('drops records that are not object-shaped or are missing from the store', async () => {
      mocks.list.mockResolvedValue({
        blobs: [{ key: 'good0001' }, { key: 'gone0001' }, { key: 'junk0001' }],
        directories: [],
      });
      mocks.get.mockImplementation(async (key: string) => {
        if (key === 'good0001') return storedRecord({ id: 'good0001' });
        if (key === 'gone0001') return null;
        return 'not-an-object';
      });

      const res = await callHandler();
      const parsed = (await res.json()) as { events: Array<{ id: string }> };

      expect(parsed.events.map((e) => e.id)).toEqual(['good0001']);
    });

    it('sorts by date then time', async () => {
      seed({
        third001: storedRecord({ id: 'third001', date: '2026-09-01', time: '09:00' }),
        first001: storedRecord({ id: 'first001', date: '2026-08-22', time: '09:00' }),
        second01: storedRecord({ id: 'second01', date: '2026-08-22', time: '19:00' }),
      });

      const res = await callHandler();
      const parsed = (await res.json()) as { events: Array<{ id: string }> };

      expect(parsed.events.map((e) => e.id)).toEqual(['first001', 'second01', 'third001']);
    });
  });

  describe('GET /api/events — response shape', () => {
    it('caches at the CDN for 60s but forbids browser caching', async () => {
      seed({ k7m29qxb: storedRecord() });

      const res = await callHandler();

      expect(res.status).toBe(200);
      expect(res.headers.get('Netlify-CDN-Cache-Control')).toBe(
        'public, max-age=60, stale-while-revalidate=120',
      );
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('returns 503 with no CDN caching when the store throws', async () => {
      mocks.list.mockRejectedValue(new Error('blobs unavailable'));

      const res = await callHandler();
      const parsed = (await res.json()) as { events: unknown[]; error: string };

      expect(res.status).toBe(503);
      expect(res.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(parsed.events).toEqual([]);
      expect(parsed.error).toBe('unavailable');
    });

    it('does not echo the store error message into the response', async () => {
      mocks.list.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:443'));

      const res = await callHandler();
      const body = await res.text();

      expect(body).not.toContain('ECONNREFUSED');
      expect(body).not.toContain('10.0.0.5');
    });

    it('leaks no record fields when the store throws mid-read', async () => {
      // list() succeeds and names a real key, but get() rejects before the
      // projection can run. Promise.all rejects, so the whole pipeline lands in
      // the catch. The failure envelope must still be the static empty-list 503 —
      // no raw or partial record, and none of the secret-bearing fields, may
      // reach the body even though the store held a live invite.
      mocks.list.mockResolvedValue({
        blobs: [{ key: 'k7m29qxb', etag: '"k7m29qxb"' }],
        directories: [],
      });
      mocks.get.mockRejectedValue(new Error('blobs read failed'));

      const res = await callHandler();
      const body = await res.text();

      expect(res.status).toBe(503);
      expect(body).not.toContain('signalUrl');
      expect(body).not.toContain('codeDigest');
      expect(body).not.toContain('signal.group');
      expect(body).not.toContain('FAKESECRETINVITEKEY');
      expect(body).not.toContain('a1b2c3d4e5f60718293a4b5c6d7e8f90');

      const parsed = JSON.parse(body) as { events: unknown[]; error: string };
      expect(parsed.events).toEqual([]);
      expect(parsed.error).toBe('unavailable');
    });
  });

  describe('isVisible', () => {
    const nowMs = Date.parse(NOW);

    it('rejects a revoked record regardless of date', () => {
      expect(isVisible(storedRecord({ revoked: true }) as never, nowMs)).toBe(false);
    });

    it('rejects a record whose date is not an ISO calendar date', () => {
      expect(isVisible(storedRecord({ date: 'tomorrow' }) as never, nowMs)).toBe(false);
    });

    it('accepts a future record', () => {
      expect(isVisible(storedRecord({ date: '2027-01-01' }) as never, nowMs)).toBe(true);
    });
  });
  ```

---

- [ ] **Step 3: Run the test and watch it fail for the right reason**

  ```bash
  npm test -- tests/functions/events.test.ts
  ```

  Expected failure: the whole file fails to collect, because
  `netlify/functions/events.ts` does not exist yet. Vitest prints a collection error
  of the form:

  ```
  Error: Failed to load url ../../netlify/functions/events.js (resolved id: ../../netlify/functions/events.js). Does the file exist?
  ```

  followed by `Test Files  1 failed (1)`.

  If instead you see `Cannot access 'mocks' before initialization`, the `vi.hoisted`
  wrapper was dropped from the test — restore it. If you see a passing run, you are
  in the wrong directory.

---

- [ ] **Step 4: Implement the function**

  Create `netlify/functions/events.ts` with exactly this content:

  ```ts
  import type { Config, Context } from '@netlify/functions';
  import { eventsStore } from '../../src/lib/blob-stores.js';
  import { toPublicEvent, type PublicEvent, type StoredEvent } from '../../src/lib/public-event.js';

  /**
   * How long a finished event stays in the overlay response.
   *
   * Past events remain listed on purpose (design §10) — `/go/:id` refuses to
   * resolve their Signal link, so listing them leaks nothing. Beyond this horizon
   * they are dropped so the payload does not grow without bound. The build-time
   * guard uses the same 30-day window, so a record that disappears from here is
   * also the one that fails the build if it was never folded.
   */
  export const RETENTION_DAYS = 30;

  const DAY_MS = 86_400_000;
  const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

  const CDN_CACHE = 'public, max-age=60, stale-while-revalidate=120';

  /**
   * Narrow an untyped blob payload to something worth projecting.
   *
   * This is a shape check, not validation. `toPublicEvent()` is the security
   * boundary; this only keeps garbage (nulls, strings, arrays, half-written
   * records) out of the sort and the projection.
   */
  function isStoredRecord(value: unknown): value is StoredEvent {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record.id === 'string' &&
      typeof record.date === 'string' &&
      typeof record.time === 'string'
    );
  }

  /**
   * The last calendar date a record is relevant on: the end of the series when
   * there is one, otherwise the single event date.
   */
  function lastRelevantDate(record: StoredEvent): string {
    const until = record.recurrence?.until;
    return typeof until === 'string' && until.length > 0 ? until : record.date;
  }

  /**
   * Revoked records are never published; neither are records past the retention
   * horizon. Dates are compared in UTC against the end of the last relevant day.
   */
  export function isVisible(record: StoredEvent, nowMs: number): boolean {
    if (record.revoked === true) return false;

    const last = lastRelevantDate(record);
    if (!ISO_DATE.test(last)) return false;

    const lastMs = Date.parse(`${last}T23:59:59.999Z`);
    if (Number.isNaN(lastMs)) return false;

    return lastMs >= nowMs - RETENTION_DAYS * DAY_MS;
  }

  function byDateThenTime(a: PublicEvent, b: PublicEvent): number {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.time !== b.time) return a.time < b.time ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  function jsonResponse(body: unknown, status: number, cdnCacheable: boolean): Response {
    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      // Browsers must not hold this; the CDN is the only cache tier that does.
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (cdnCacheable) headers.set('Netlify-CDN-Cache-Control', CDN_CACHE);
    return new Response(JSON.stringify(body), { status, headers });
  }

  export default async (_req: Request, _context: Context): Promise<Response> => {
    const nowMs = Date.now();

    let events: PublicEvent[];
    try {
      const store = eventsStore();
      const { blobs } = await store.list();
      const records = await Promise.all(
        blobs.map((blob: { key: string }) => store.get(blob.key, { type: 'json' })),
      );

      events = records
        .filter(isStoredRecord)
        .filter((record) => isVisible(record, nowMs))
        // The allowlist projection. Never return, spread, or delete-from a stored
        // record — see design §5. This line is why the endpoint does not publish
        // every live Signal invite.
        .map(toPublicEvent)
        .sort(byDateThenTime);
    } catch {
      // Fail soft and uncached: the baked /events HTML still renders from
      // src/data/events.json, so a Blobs outage costs the overlay, not the page.
      // The caught error is deliberately not inspected or echoed — it can carry
      // internal hostnames. The whole pipeline (list, get, projection, sort) is
      // inside this try, and Promise.all rejects on any single get failure, so a
      // mid-read fault lands here too — never a raw or partial record.
      return jsonResponse({ events: [], error: 'unavailable' }, 503, false);
    }

    return jsonResponse({ events }, 200, true);
  };

  export const config: Config = {
    path: '/api/events',
    method: ['GET'],
  };
  ```

---

- [ ] **Step 5: Run the test again and confirm it passes**

  ```bash
  npm test -- tests/functions/events.test.ts
  ```

  Expected: `Test Files  1 passed (1)` and `Tests  14 passed (14)`.

  Then run the whole suite to confirm nothing else regressed:

  ```bash
  npm test
  ```

  Expected: every test file passes, `0 failed`.

---

- [ ] **Step 6: Type-check**

  ```bash
  npx astro check
  ```

  Expected: `0 errors`. Warnings and hints from unrelated `.astro` files are
  acceptable; errors in `netlify/functions/events.ts` or `tests/functions/events.test.ts`
  are not.

  If `Cannot find module '@netlify/functions'` appears, Step 1's precondition was not
  actually satisfied — go back to it.

---

- [ ] **Step 7: Commit**

  ```bash
  git add netlify/functions/events.ts tests/functions/events.test.ts
  git commit -m "feat(events): serve the overlay via GET /api/events

  Lists the events Blobs store, drops revoked records and anything past the
  30-day retention horizon, and projects every survivor through toPublicEvent()
  so signalUrl, codeDigest, revoked, and any future stored field cannot reach
  the response. Cached 60s at the CDN, no-store in the browser."
  ```

---

---

---

### Task 14: go redirect function

The Signal invite URL exists in exactly one place a visitor can reach: the body of this function's success response. It is never in the page bundle, never in git, never in a `Location` header (Netlify function logs retain headers and paths; response bodies appear in no documented log schema). Everything about this task is about not leaking: not the invite, not which of the refusal conditions fired, and not the attacker-supplied `eventId`.

**This endpoint fails closed, without exception.** A store read that throws, times out, or returns malformed JSON serves the same refusal as an unknown id — never the invite. This is the deliberate opposite of the rate limiter, which fails open: there, a false negative merely lets one extra request through; here, a false negative would disclose an invite that was meant to be dead. When in doubt, the function must refuse. Any future edit that turns a store failure into a success (or into a distinguishable response) is a regression, and the byte-identical store-failure tests below exist to catch exactly that.

**Files:**

- Create: `netlify/functions/go.ts`
- Create: `tests/functions/go.test.ts`
- Modify: none

**Preconditions from earlier tasks** (verify before starting; do not create these here):

- `src/lib/blob-stores.ts` exports `eventsStore()`, `codesStore()`, and `linksStore()`, all opened with `{ consistency: 'strong' }` (Task 8).
- `src/lib/signal-url.ts` exports `validateSignalUrl(input: unknown)`, returning `{ ok: true, value }` on success (Task 3). This function is both the submit-time and the render-time gate for a Signal invite.
- `@netlify/functions` and `@netlify/blobs` are installed. Confirm with:
  `node -e "const p=require('./package.json');console.log(p.devDependencies['@netlify/functions'], p.dependencies['@netlify/blobs'])"`
  Expected: two version strings, neither `undefined`.

**The `intake` seam (contract #8).** The literal id `intake` is not an event. It resolves the operator's vetting-page Signal link, stored under the key `intake` in the `links` store, written by the CLI's `set-intake`. The stored value is a JSON record `{ url }` (Task 16 writes it with `linksStore().setJSON('intake', { url })`); this function reads it with `linksStore().get('intake', { type: 'json' })`, then re-validates `record.url` with `validateSignalUrl` before emitting, exactly as it does for an event's stored `signalUrl`. Both sides agree the shape is `{ url }`. It is special-cased BEFORE the 8-char id regex.

**Why the test lives in `tests/functions/` and not beside the function.** Netlify treats every file directly inside `netlify/functions/` as a deployable function. A colocated `go.test.ts` would be published as a function named `go.test` with no default export. Function tests go in `tests/functions/`, which vitest's default `include` glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) already picks up with no config change.

---

- [ ] **Step 1: Write the failing test**

Create `tests/functions/go.test.ts` with exactly this content:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Context } from '@netlify/functions';

// Hoisted so vi.mock's factory can close over them.
const mocks = vi.hoisted(() => ({
  eventsGet: vi.fn(),
  codesGet: vi.fn(),
  linksGet: vi.fn(),
}));

vi.mock('../../src/lib/blob-stores.js', () => ({
  eventsStore: () => ({ get: mocks.eventsGet }),
  codesStore: () => ({ get: mocks.codesGet }),
  linksStore: () => ({ get: mocks.linksGet }),
}));

import go, { config } from '../../netlify/functions/go.js';

const VALID_ID = 'k7m29qxb';
const LIVE_DIGEST = 'a'.repeat(64);
const SIGNAL_URL = 'https://signal.group/#CjQKIExhbXBzaGFkZQ';

/** Minimal stand-in for the Netlify Context object; only params are read. */
function ctx(eventId: unknown): Context {
  return { params: { eventId } } as unknown as Context;
}

function liveEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ID,
    type: 'meetup',
    title: 'Thursday group',
    description: null,
    date: '2026-09-10',
    time: '19:00',
    city: 'greenville',
    county: 'greenville',
    address: null,
    hasSignalGroup: true,
    recurrence: null,
    organizer: 'handle-jay',
    createdAt: '2026-08-17T14:22:00Z',
    signalUrl: SIGNAL_URL,
    codeDigest: LIVE_DIGEST,
    revoked: false,
    ...overrides,
  };
}

/** Everything a client can observe, as one comparable string. */
async function fingerprint(res: Response): Promise<string> {
  const headers = [...res.headers.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify({ status: res.status, headers, body: await res.text() });
}

/** Body + every header name and value + status, concatenated, for leak checks. */
async function everythingObservable(res: Response): Promise<string> {
  const headers = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
  return `${res.status}\n${headers}\n${await res.text()}`;
}

const req = new Request('https://deflocksc.org/go/k7m29qxb');

beforeEach(() => {
  mocks.eventsGet.mockReset();
  mocks.codesGet.mockReset();
  mocks.linksGet.mockReset();
  // A live event today is 2026-09-01; the fixture event is 2026-09-10.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('config', () => {
  it('claims the pretty path and GET only', () => {
    expect(config.path).toBe('/go/:eventId');
    expect(config.method).toEqual(['GET']);
  });
});

describe('id validation', () => {
  it('refuses a malformed id before any store lookup', async () => {
    const res = await go(req, ctx('../../codes/aaaa'));
    expect(res.status).toBe(404);
    expect(mocks.eventsGet).not.toHaveBeenCalled();
    expect(mocks.codesGet).not.toHaveBeenCalled();
  });

  it('refuses a well-formed-looking id of the wrong length before any lookup', async () => {
    const res = await go(req, ctx('k7m29qx'));
    expect(res.status).toBe(404);
    expect(mocks.eventsGet).not.toHaveBeenCalled();
  });

  it('refuses a missing id parameter', async () => {
    const res = await go(req, ctx(undefined));
    expect(res.status).toBe(404);
    expect(mocks.eventsGet).not.toHaveBeenCalled();
  });
});

describe('refusal responses are indistinguishable', () => {
  it('returns byte-identical responses for every refusal branch', async () => {
    // 1. malformed id
    const malformed = await go(req, ctx('NOT-AN-ID'));

    // 2. unknown event
    mocks.eventsGet.mockResolvedValueOnce(null);
    mocks.codesGet.mockResolvedValueOnce(null);
    const unknown = await go(req, ctx(VALID_ID));

    // 3. tombstoned event
    mocks.eventsGet.mockResolvedValueOnce(liveEvent({ revoked: true }));
    mocks.codesGet.mockResolvedValueOnce({ pseudonym: 'handle-jay', revoked: false });
    const tombstoned = await go(req, ctx(VALID_ID));

    // 4. revoked owning code
    mocks.eventsGet.mockResolvedValueOnce(liveEvent());
    mocks.codesGet.mockResolvedValueOnce({ pseudonym: 'handle-jay', revoked: true });
    const revokedCode = await go(req, ctx(VALID_ID));

    // 5. past event
    mocks.eventsGet.mockResolvedValueOnce(liveEvent({ date: '2026-08-01' }));
    mocks.codesGet.mockResolvedValueOnce({ pseudonym: 'handle-jay', revoked: false });
    const past = await go(req, ctx(VALID_ID));

    // 6. store failure
    mocks.eventsGet.mockRejectedValueOnce(new Error('blobs down'));
    const storeError = await go(req, ctx(VALID_ID));

    const prints = await Promise.all(
      [malformed, unknown, tombstoned, revokedCode, past, storeError].map(fingerprint),
    );
    for (const print of prints) {
      expect(print).toBe(prints[0]);
    }
    expect(JSON.parse(prints[0]).status).toBe(404);
  });

  it('still refuses a live event whose owning code record is gone', async () => {
    mocks.eventsGet.mockResolvedValueOnce(liveEvent());
    mocks.codesGet.mockResolvedValueOnce(null);
    const res = await go(req, ctx(VALID_ID));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('signal.group');
  });

  it('refuses a recurring series whose until date has passed', async () => {
    mocks.eventsGet.mockResolvedValueOnce(
      liveEvent({ date: '2026-03-05', recurrence: { freq: 'weekly', until: '2026-08-27' } }),
    );
    mocks.codesGet.mockResolvedValueOnce({ pseudonym: 'handle-jay', revoked: false });
    const res = await go(req, ctx(VALID_ID));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('signal.group');
  });

  it('resolves a recurring series that started in the past but has not ended', async () => {
    mocks.eventsGet.mockResolvedValueOnce(
      liveEvent({ date: '2026-03-05', recurrence: { freq: 'weekly', until: '2026-12-27' } }),
    );
    mocks.codesGet.mockResolvedValueOnce({ pseudonym: 'handle-jay', revoked: false });
    const res = await go(req, ctx(VALID_ID));
    expect(res.status).toBe(200);
  });
});

describe('fail-closed: a throwing store is indistinguishable from an unknown id', () => {
  it('returns a byte-identical refusal when the events store get() throws', async () => {
    // Baseline: the unknown-id refusal.
    mocks.eventsGet.mockResolvedValueOnce(null);
    mocks.codesGet.mockResolvedValueOnce(null);
    const unknown = await go(req, ctx(VALID_ID));

    // The events read throws before any record is seen.
    mocks.eventsGet.mockRejectedValueOnce(new Error('blobs down'));
    const eventsThrew = await go(req, ctx(VALID_ID));

    // Same status, same headers, same body — nothing distinguishes the two.
    expect(await fingerprint(eventsThrew)).toBe(await fingerprint(unknown));
  });

  it('returns a byte-identical refusal when the codes store get() throws', async () => {
    // Baseline: the unknown-id refusal.
    mocks.eventsGet.mockResolvedValueOnce(null);
    mocks.codesGet.mockResolvedValueOnce(null);
    const unknown = await go(req, ctx(VALID_ID));

    // A live event is found, but the owning-code read throws.
    mocks.eventsGet.mockResolvedValueOnce(liveEvent());
    mocks.codesGet.mockRejectedValueOnce(new Error('blobs down'));
    const codesThrew = await go(req, ctx(VALID_ID));

    // Same status, same headers, same body — the invite never surfaces on error.
    expect(await fingerprint(codesThrew)).toBe(await fingerprint(unknown));
  });
});

describe('the requested id never reaches the response', () => {
  it('does not reflect a hostile id anywhere observable', async () => {
    const hostile = '"><svg onload=alert(1)>';
    const res = await go(req, ctx(hostile));
    const observable = await everythingObservable(res);
    expect(observable).not.toContain(hostile);
    expect(observable).not.toContain('svg');
    expect(observable).not.toContain('alert');
    expect(res.headers.get('etag')).toBeNull();
    expect(res.headers.get('netlify-cache-tag')).toBeNull();
    expect(res.headers.get('cache-tag')).toBeNull();
  });

  it('does not reflect an unknown but well-formed id', async () => {
    mocks.eventsGet.mockResolvedValueOnce(null);
    mocks.codesGet.mockResolvedValueOnce(null);
    const res = await go(req, ctx('zzzz7777'));
    const observable = await everythingObservable(res);
    expect(observable).not.toContain('zzzz7777');
  });
});

describe('success response', () => {
  beforeEach(() => {
    mocks.codesGet.mockResolvedValue({ pseudonym: 'handle-jay', revoked: false });
  });

  it('preserves the invite fragment in both the refresh and the anchor', async () => {
    mocks.eventsGet.mockResolvedValueOnce(liveEvent());
    const res = await go(req, ctx(VALID_ID));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain(`content="0;url=${SIGNAL_URL}"`);
    expect(body).toContain(`href="${SIGNAL_URL}"`);
    expect(body).toContain('rel="noreferrer"');
    expect(body).toContain('<meta name="referrer" content="no-referrer">');
    // The fragment itself, intact.
    expect(body).toContain('#CjQKIExhbXBzaGFkZQ');
  });

  it('sends no-referrer and no-store headers', async () => {
    mocks.eventsGet.mockResolvedValueOnce(liveEvent());
    const res = await go(req, ctx(VALID_ID));
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  it('reads the event with the id verbatim as the blob key', async () => {
    mocks.eventsGet.mockResolvedValueOnce(liveEvent());
    await go(req, ctx(VALID_ID));
    expect(mocks.eventsGet).toHaveBeenCalledWith(VALID_ID, { type: 'json' });
    expect(mocks.codesGet).toHaveBeenCalledWith(LIVE_DIGEST, { type: 'json' });
  });

  it('refuses a stored signal url that fails re-validation instead of escaping it', async () => {
    // A tampered store slips an attribute-breakout attempt into the stored URL.
    // Re-validation — not HTML-escaping — is what stops it: validateSignalUrl
    // rejects the fragment, so the invite is refused outright rather than served
    // escaped. (design §196: re-validate at render.)
    const hostile = 'https://signal.group/#a"><script>alert(1)</scr' + 'ipt>';
    mocks.eventsGet.mockResolvedValueOnce(liveEvent({ signalUrl: hostile }));
    const res = await go(req, ctx(VALID_ID));
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(body).not.toContain('<script>');
    expect(body).not.toContain('alert(1)');
    expect(body).not.toContain('signal.group');
  });

  it('refuses when the stored record has no signal url', async () => {
    mocks.eventsGet.mockResolvedValueOnce(liveEvent({ signalUrl: null }));
    const res = await go(req, ctx(VALID_ID));
    expect(res.status).toBe(404);
  });
});

describe('stored-record hardening: a truthy-but-empty record is not live', () => {
  it('refuses identically when the code record is an empty object', async () => {
    // Baseline: the unknown-id refusal.
    mocks.eventsGet.mockResolvedValueOnce(null);
    mocks.codesGet.mockResolvedValueOnce(null);
    const unknown = await go(req, ctx(VALID_ID));

    // A live event, but the owning code record is a truthy but empty {}. Its
    // `revoked` is absent, not false, so it must NOT count as a live code —
    // otherwise a corrupted or partially written record leaks the invite.
    mocks.eventsGet.mockResolvedValueOnce(liveEvent());
    mocks.codesGet.mockResolvedValueOnce({});
    const emptyCode = await go(req, ctx(VALID_ID));

    expect(emptyCode.status).toBe(404);
    expect(await emptyCode.text()).not.toContain('signal.group');
    expect(await fingerprint(emptyCode)).toBe(await fingerprint(unknown));
  });

  it('refuses when the event record is an empty object', async () => {
    mocks.eventsGet.mockResolvedValueOnce({});
    mocks.codesGet.mockResolvedValueOnce({ pseudonym: 'handle-jay', revoked: false });
    const res = await go(req, ctx(VALID_ID));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('signal.group');
  });
});

describe('/go/intake — the operator vetting-page link', () => {
  it('resolves to the stored intake link when one is set', async () => {
    // The stored shape is a JSON record { url }, written by the CLI's set-intake.
    mocks.linksGet.mockResolvedValueOnce({ url: SIGNAL_URL });
    const res = await go(req, ctx('intake'));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain(`content="0;url=${SIGNAL_URL}"`);
    expect(body).toContain(`href="${SIGNAL_URL}"`);
    expect(mocks.linksGet).toHaveBeenCalledWith('intake', { type: 'json' });
    // The intake path never touches the event or code stores.
    expect(mocks.eventsGet).not.toHaveBeenCalled();
    expect(mocks.codesGet).not.toHaveBeenCalled();
  });

  it('refuses when the stored intake record is malformed (no url field)', async () => {
    // A record missing its `url` — or any non-{ url } shape — is invalid, not a
    // link. It must refuse exactly as an unset link does, never throw.
    mocks.linksGet.mockResolvedValueOnce({});
    const res = await go(req, ctx('intake'));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('signal.group');
  });

  it('refuses identically to an unknown id when no intake link is set', async () => {
    // Baseline: the unknown-id refusal.
    mocks.eventsGet.mockResolvedValueOnce(null);
    mocks.codesGet.mockResolvedValueOnce(null);
    const unknown = await go(req, ctx(VALID_ID));

    mocks.linksGet.mockResolvedValueOnce(null);
    const absent = await go(req, ctx('intake'));

    expect(absent.status).toBe(404);
    expect(await fingerprint(absent)).toBe(await fingerprint(unknown));
  });

  it('refuses when the stored intake link fails re-validation', async () => {
    mocks.linksGet.mockResolvedValueOnce({ url: 'https://evil.example/#CjQKIExhbXBzaGFkZQ' });
    const res = await go(req, ctx('intake'));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('evil.example');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```
npm test -- tests/functions/go.test.ts
```

Expected failure — the module under test does not exist yet, so vitest fails at collection, not at an assertion:

```
FAIL  tests/functions/go.test.ts [ tests/functions/go.test.ts ]
Error: Failed to load url ../../netlify/functions/go.js (resolved id: ../../netlify/functions/go.js) in tests/functions/go.test.ts. Does the file exist?

Test Files  1 failed (1)
     Tests  no tests
```

- [ ] **Step 3: Implement the function**

Create `netlify/functions/go.ts` with exactly this content:

```ts
import type { Config, Context } from '@netlify/functions';
import { eventsStore, codesStore, linksStore } from '../../src/lib/blob-stores.js';
import { validateSignalUrl } from '../../src/lib/signal-url.js';

/**
 * GET /go/:eventId — resolve an opaque event id to its Signal invite.
 *
 * Four rules drive everything below.
 *
 * 1. The invite is delivered in the response BODY, never a Location header.
 *    Netlify function logs cannot be disabled and are readable by any team
 *    member; response bodies appear in no documented log schema, headers do.
 *
 * 2. Every refusal — malformed id, unknown event, tombstoned event, revoked
 *    owning code, past event, a stored invite that no longer validates, or a
 *    store failure — returns ONE byte-identical response: same status, same
 *    headers, same body. Otherwise a maintainer who declines the fold prompt
 *    after a revoke leaks "this organizer was pulled" for up to a week, because
 *    the baked page still lists the event.
 *
 * 3. `context.params.eventId` is NEVER interpolated into the body, a header,
 *    an ETag, or a cache tag. "No event found for <id>" is reflected XSS on
 *    the deflocksc.org origin, delivered by a link, needing no organizer code
 *    and no stored value — and the site CSP still carries 'unsafe-inline', so
 *    nothing catches it downstream.
 *
 * 4. Nothing read from the store is trusted on shape alone. Both the event and
 *    its owning code record are shape-checked — a truthy but empty {} is NOT a
 *    live record: `revoked` must be explicitly false, not merely absent — and
 *    the stored signalUrl is re-validated with validateSignalUrl at render time
 *    (design §196). HTML-escaping is a backstop, not validation.
 *
 * The literal id `intake` is special-cased BEFORE the id regex: it resolves the
 * operator's vetting-page Signal link from the `links` store (key `intake`,
 * written by the CLI's set-intake). The events page points a click — never
 * static markup — at /go/intake, so a non-clicking scraper never sees even that
 * path. It refuses identically when the link is unset or fails re-validation.
 *
 * Every blob read is strongly consistent (the stores are opened that way in
 * src/lib/blob-stores.ts). Eventual reads would resolve a tombstoned event's
 * real invite for up to 60 seconds after revocation, which is exactly the
 * window a burned code creates.
 */

/** Opaque 8-char lowercase base32. Flat character class: no nested quantifiers. */
const ID_PATTERN = /^[a-z2-7]{8}$/;

/**
 * Server-generated stand-in used when no event record was found, so the codes
 * lookup still happens and the work stays constant-shaped across branches.
 * Never derived from user input.
 */
const ABSENT_CODE_DIGEST = '0'.repeat(64);

/** One header set for every response this function can produce. */
const HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
};

/** Static. Contains no request-derived substring of any kind. */
const REFUSAL_BODY = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Link unavailable</title>
</head>
<body>
<h1>This link is not available</h1>
<p>The group behind this link has ended, or the organizer closed it.</p>
<p><a href="/events">See the events calendar</a></p>
</body>
</html>
`;

type RefusalReason =
  | 'malformed_id'
  | 'unknown_event'
  | 'event_revoked'
  | 'code_missing'
  | 'code_revoked'
  | 'event_passed'
  | 'no_signal_url'
  | 'intake_unset'
  | 'store_error';

/**
 * The distinguishing reason goes to structured logs only. The id is
 * deliberately omitted even here: it already appears in Netlify's `path`
 * field, and repeating it buys nothing.
 */
function refuse(reason: RefusalReason): Response {
  console.log(JSON.stringify({ event: 'go_refusal', reason }));
  return new Response(REFUSAL_BODY, { status: 404, headers: HEADERS });
}

/** Narrow an unknown store read to a plain object before touching its fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** HTML attribute escaping. Lossless; a backstop applied to the stored URL. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Last date on which this event still resolves. A recurring series stays live
 * until `recurrence.until`; a one-off until its own date. ISO dates compare
 * correctly as strings. A missing or non-string date yields '' — earlier than
 * any real day — so a corrupt record fails closed as "passed".
 */
function lastActiveDate(record: Record<string, unknown>): string {
  const date = typeof record.date === 'string' ? record.date : '';
  const recurrence = record.recurrence;
  const until =
    isRecord(recurrence) && typeof recurrence.until === 'string' ? recurrence.until : undefined;
  if (until !== undefined && until > date) return until;
  return date;
}

/** Today in UTC as YYYY-MM-DD. An event resolves through the whole of its day. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function succeed(signalUrl: string): Response {
  const href = escapeAttr(signalUrl);
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="refresh" content="0;url=${href}">
<title>Opening Signal</title>
</head>
<body>
<h1>Opening Signal</h1>
<p>If nothing happens, use the link below.</p>
<p><a href="${href}" rel="noreferrer">Join the group</a></p>
</body>
</html>
`;
  return new Response(body, { status: 200, headers: HEADERS });
}

export default async (_req: Request, context: Context): Promise<Response> => {
  const eventId = context.params?.eventId;

  // Special-case the sole non-event target BEFORE the id regex. The intake link
  // is stored under `intake` in the links store as a JSON record `{ url }` (the
  // CLI's set-intake writes it with setJSON), and its url is re-validated exactly
  // like a stored event invite. Absent, malformed, or invalid → the same refusal
  // as any other.
  if (eventId === 'intake') {
    let stored: unknown;
    try {
      stored = await linksStore().get('intake', { type: 'json' });
    } catch {
      return refuse('store_error');
    }
    // The stored shape is { url }. A missing record, a non-object, or a bad url
    // all fall through validateSignalUrl to the identical refusal.
    const storedUrl = isRecord(stored) ? stored.url : undefined;
    const intake = validateSignalUrl(storedUrl);
    if (!intake.ok) return refuse('intake_unset');
    return succeed(intake.value);
  }

  // Validate the parameter BEFORE any lookup. A malformed id never becomes a
  // blob key and never reaches the store.
  if (typeof eventId !== 'string' || !ID_PATTERN.test(eventId)) {
    return refuse('malformed_id');
  }

  // Both reads happen before any branching, so the refusal branches do the
  // same amount of work as each other. They are read as `unknown`: what comes
  // back from the store is shape-checked below, never trusted by its cast.
  let record: unknown;
  let code: unknown;
  try {
    record = await eventsStore().get(eventId, { type: 'json' });
    const digest =
      isRecord(record) && typeof record.codeDigest === 'string'
        ? record.codeDigest
        : ABSENT_CODE_DIGEST;
    code = await codesStore().get(digest, { type: 'json' });
  } catch {
    return refuse('store_error');
  }

  // Shape-check BOTH records. `revoked` must be explicitly false: a truthy but
  // empty {} (revoked absent) is corrupt, not live.
  if (!isRecord(record)) return refuse('unknown_event');
  if (record.revoked !== false) return refuse('event_revoked');
  if (!isRecord(code)) return refuse('code_missing');
  if (code.revoked !== false) return refuse('code_revoked');
  if (lastActiveDate(record) < todayIso()) return refuse('event_passed');

  // Re-validate the stored invite at render (design §196). Only validateSignalUrl
  // guarantees a real signal.group URL; escapeAttr in succeed() is a backstop,
  // never the primary defense.
  const invite = validateSignalUrl(record.signalUrl);
  if (!invite.ok) return refuse('no_signal_url');

  return succeed(invite.value);
};

export const config: Config = {
  path: '/go/:eventId',
  method: ['GET'],
};
```

Details that are easy to get wrong and that the tests pin:

- `config.path` **replaces** the default `/.netlify/functions/go` URL rather than adding to it, so there is no second unprettified entry point to forget about.
- `rel="noreferrer"` on the anchor does not cover the meta-refresh navigation. The document-level `<meta name="referrer" content="no-referrer">` is what stops `signal.group` from receiving `https://deflocksc.org/` as the referrer, and the `Referrer-Policy` header backs it up.
- The stored `signalUrl` (and the intake link) is re-validated with `validateSignalUrl` before it is emitted. Because that validator only returns clean `signal.group` URLs, `escapeAttr` never has HTML-special characters to escape in practice — it stays as defense-in-depth, not as the thing standing between a tampered store and an attribute breakout.

- [ ] **Step 4: Run the test again and watch it pass**

```
npm test -- tests/functions/go.test.ts
```

Expected:

```
 ✓ tests/functions/go.test.ts (23 tests)

Test Files  1 passed (1)
     Tests  23 passed (23)
```

If the byte-identical test fails, the diff will name the branch that differs — usually because a branch returned a different status or skipped `refuse()`. Every refusal must go through `refuse()`; never construct a `Response` inline.

- [ ] **Step 5: Run the whole suite to confirm nothing else moved**

```
npm test
```

Expected: `Test Files` count increased by exactly one over its pre-task value, `0 failed`.

- [ ] **Step 6: Commit**

```
git add netlify/functions/go.ts tests/functions/go.test.ts
git commit -m "feat(events): add /go/:eventId Signal invite redirect

Resolves an opaque event id to its Signal invite via a 200 + meta-refresh,
keeping the invite out of the Location header and out of function logs.

Every refusal condition (malformed id, unknown event, tombstoned event,
revoked owning code, past event, an invite that fails re-validation, store
failure) returns one byte-identical response, so declining the post-revoke
fold does not leak which organizer was pulled. The requested eventId is
validated against /^[a-z2-7]{8}\$/ before any lookup and is never
interpolated into the body, a header, an ETag, or a cache tag.

Both stored records are shape-checked before they are trusted (a truthy {}
is not live), and the stored signalUrl is re-validated with validateSignalUrl
at render. The literal /go/intake is special-cased before the id regex to
resolve the operator vetting-page link from the links store."
```

---

---

---

### Task 15: scheduled fold

Weekly job that reads the Blobs `events` store, projects every record through `toPublicEvent()`, drops tombstoned and expired records, sorts for a stable diff, and commits `src/data/events.json` to the public repo through the GitHub contents API. The commit message is a constant plus a server-computed integer — **no submitted text ever reaches a commit message** (§6 of the design: an event title containing `#123` or `@someone` would close issues or fire mentions from the repo owner's identity).

This task also seeds an empty `src/data/events.json` (so the events-page task's import and build guard have a file), adds the build-time expiry guard (§10), and creates the manual `fold-events.yml` workflow that the organizer-codes CLI dispatches for a fast takedown.

All the logic that can be tested lives in `src/lib/fold-events.ts`. The Netlify function is a thin shell that reads env vars, reads the store, and calls into that module.

**Files:**

- Create: `src/data/events.json` (seed, exactly `[]`)
- Create: `src/lib/fold-events.ts`
- Create: `src/lib/fold-events.test.ts`
- Create: `netlify/functions/fold-events.ts`
- Create: `tests/functions/fold-events.test.ts`
- Create: `.github/workflows/fold-events.yml`

---

- [ ] **Step 1: Seed `src/data/events.json` as an empty array**

  The scheduled fold rewrites this file, and the events-page task imports it and runs a build-time schema guard against it. Neither can land before the file exists, so commit the empty seed here — the earliest task that touches it — as exactly a top-level array:

  ```bash
  printf '[]\n' > src/data/events.json
  node -e "const e=require('./src/data/events.json'); if(!Array.isArray(e)||e.length!==0){process.exit(1)}; console.log('seed ok: top-level array, length', e.length)"
  git add src/data/events.json
  git commit -m "chore(events): seed empty events.json overlay bake"
  ```

  Expected: `seed ok: top-level array, length 0`. The file is exactly `[]` followed by a newline, matching the two-space-plus-trailing-newline serialization the fold produces for a non-empty file.

- [ ] **Step 2: Preflight — confirm the Task 1-7 modules and the Netlify packages are present**

  Run from the repo root:

  ```bash
  node -e "console.log(require('fs').existsSync('src/lib/public-event.ts'), require('fs').existsSync('src/lib/blob-stores.ts'))"
  node -e "console.log(require('module').createRequire(process.cwd()+'/package.json').resolve('@netlify/blobs/package.json'))"
  ```

  Expected: the first prints `true true`. The second prints a path ending in `node_modules\@netlify\blobs\package.json`.

  If either fails, **stop** — Tasks 1-7 and the blob-store task have not landed. Do not install packages here; `@netlify/blobs` and `@netlify/functions` are dependencies of the earlier tasks, and the machine-wide 30-day minimum-release-age gate applies to any install.

  `@netlify/functions` is only ever imported `import type` in this task, so it is erased at runtime and the tests never load it.

- [ ] **Step 3: Write the failing test for `src/lib/fold-events.ts`**

  Create `src/lib/fold-events.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import {
    EVENTS_FILE_PATH,
    EXPIRY_HORIZON_DAYS,
    buildCommitMessage,
    foldStoredEvents,
    serializeEventsFile,
    countAdded,
    commitEventsJson,
    isExpired,
    pruneExpired,
    assertEventsFresh,
  } from './fold-events.js';
  import type { StoredEvent } from './public-event.js';

  const TARGET = {
    owner: 'TimSimpsonJr',
    repo: 'deflocksc-website',
    branch: 'master',
    token: 'ghp_test_token',
  };

  /** Fixed reference clock so the expiry checks never become time-bombs. */
  const NOW = new Date('2026-08-18T12:00:00Z');

  function storedEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
    return {
      id: 'k7m29qxb',
      type: 'public',
      title: 'County council meeting',
      description: 'Public comment period at the start.',
      date: '2026-09-01',
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: '301 University Ridge, Greenville',
      hasSignalGroup: true,
      recurrence: null,
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
      signalUrl: 'https://signal.group/#CjQKIExamplE',
      codeDigest: 'a'.repeat(64),
      revoked: false,
      ...overrides,
    } as StoredEvent;
  }

  /** Encodes a JS value the way the GitHub contents API returns file content. */
  function b64(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
  }

  /**
   * Builds a fetch stub over a scripted list of responses, one per call, and
   * records every call so assertions can inspect method, URL, and body.
   */
  function scriptFetch(responses: Array<{ status: number; body?: unknown }>) {
    const calls: Array<{ method: string; url: string; body: any }> = [];
    let i = 0;
    const impl = vi.fn(async (input: any, init: any = {}) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({
        method,
        url,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const next = responses[i];
      i += 1;
      if (!next) throw new Error(`unscripted fetch call #${i}: ${method} ${url}`);
      return new Response(
        next.body === undefined ? null : JSON.stringify(next.body),
        { status: next.status, headers: { 'content-type': 'application/json' } },
      );
    });
    return { impl, calls };
  }

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('buildCommitMessage', () => {
    it('is a constant plus the count, in the exact documented form', () => {
      expect(buildCommitMessage(0)).toBe('chore: fold events (0 added)');
      expect(buildCommitMessage(3)).toBe('chore: fold events (3 added)');
      expect(buildCommitMessage(41)).toBe('chore: fold events (41 added)');
    });

    it('rejects a non-integer or negative count rather than interpolating it', () => {
      expect(() => buildCommitMessage(-1)).toThrow(RangeError);
      expect(() => buildCommitMessage(1.5)).toThrow(RangeError);
      expect(() => buildCommitMessage(Number.NaN)).toThrow(RangeError);
    });
  });

  describe('foldStoredEvents', () => {
    it('drops signalUrl, codeDigest and revoked from every record', () => {
      const out = foldStoredEvents([storedEvent()]);
      const serialized = JSON.stringify(out);
      expect(serialized).not.toContain('signal.group');
      expect(serialized).not.toContain('signalUrl');
      expect(serialized).not.toContain('codeDigest');
      expect(serialized).not.toContain('revoked');
    });

    it('omits tombstoned records entirely', () => {
      const out = foldStoredEvents([
        storedEvent({ id: 'aaaaaaaa' }),
        storedEvent({ id: 'bbbbbbbb', revoked: true }),
      ]);
      expect(out.map((e) => e.id)).toEqual(['aaaaaaaa']);
    });

    it('sorts by date then id so the diff is stable regardless of store order', () => {
      const out = foldStoredEvents([
        storedEvent({ id: 'zzzzzzzz', date: '2026-09-02' }),
        storedEvent({ id: 'mmmmmmmm', date: '2026-09-01' }),
        storedEvent({ id: 'aaaaaaaa', date: '2026-09-02' }),
        storedEvent({ id: 'bbbbbbbb', date: '2026-09-01' }),
      ]);
      expect(out.map((e) => e.id)).toEqual([
        'bbbbbbbb',
        'mmmmmmmm',
        'aaaaaaaa',
        'zzzzzzzz',
      ]);
    });

    it('produces byte-identical output for the same set in a different order', () => {
      const a = storedEvent({ id: 'aaaaaaaa', date: '2026-09-01' });
      const b = storedEvent({ id: 'bbbbbbbb', date: '2026-09-03' });
      expect(serializeEventsFile(foldStoredEvents([a, b])))
        .toBe(serializeEventsFile(foldStoredEvents([b, a])));
    });
  });

  describe('isExpired', () => {
    it('exposes the single 30-day horizon', () => {
      expect(EXPIRY_HORIZON_DAYS).toBe(30);
    });

    it('flags an event whose date is more than 30 days before now', () => {
      expect(isExpired({ date: '2026-06-01', recurrence: null }, NOW)).toBe(true);
    });

    it('keeps an event only a few days past', () => {
      expect(isExpired({ date: '2026-08-10', recurrence: null }, NOW)).toBe(false);
    });

    it('keeps a future event', () => {
      expect(isExpired({ date: '2026-12-01', recurrence: null }, NOW)).toBe(false);
    });

    it('measures a recurring event from recurrence.until, not its start date', () => {
      // Start long past, but the series is still running: not expired.
      expect(
        isExpired({ date: '2026-01-01', recurrence: { freq: 'weekly', until: '2026-12-01' } }, NOW),
      ).toBe(false);
      // Series ended more than 30 days ago: expired.
      expect(
        isExpired({ date: '2026-01-01', recurrence: { freq: 'weekly', until: '2026-06-01' } }, NOW),
      ).toBe(true);
    });
  });

  describe('pruneExpired', () => {
    it('drops expired events and keeps the rest', () => {
      const kept = { id: 'aaaaaaaa', date: '2026-09-01', recurrence: null };
      const gone = { id: 'bbbbbbbb', date: '2026-06-01', recurrence: null };
      expect(pruneExpired([kept, gone], NOW)).toEqual([kept]);
    });

    it('preserves the order of the events it keeps', () => {
      const a = { id: 'aaaaaaaa', date: '2026-09-03', recurrence: null };
      const b = { id: 'bbbbbbbb', date: '2026-09-01', recurrence: null };
      expect(pruneExpired([a, b], NOW).map((e) => e.id)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
    });
  });

  describe('assertEventsFresh', () => {
    it('throws naming the stale event ids', () => {
      const events = [
        { id: 'aaaaaaaa', date: '2026-09-01', recurrence: null },
        { id: 'staleone', date: '2026-06-01', recurrence: null },
      ];
      expect(() => assertEventsFresh(events, NOW)).toThrow(/staleone/);
    });

    it('passes when every event is within the horizon', () => {
      const events = [{ id: 'aaaaaaaa', date: '2026-09-01', recurrence: null }];
      expect(() => assertEventsFresh(events, NOW)).not.toThrow();
    });

    it('passes on an empty array', () => {
      expect(() => assertEventsFresh([], NOW)).not.toThrow();
    });
  });

  describe('countAdded', () => {
    it('counts ids not already present in the committed file', () => {
      const existing = JSON.stringify([{ id: 'aaaaaaaa' }, { id: 'bbbbbbbb' }]);
      const next = foldStoredEvents([
        storedEvent({ id: 'aaaaaaaa' }),
        storedEvent({ id: 'bbbbbbbb' }),
        storedEvent({ id: 'cccccccc' }),
      ]);
      expect(countAdded(existing, next)).toBe(2 + 1 - 2);
    });

    it('treats every event as added when the file does not exist yet', () => {
      const next = foldStoredEvents([storedEvent({ id: 'aaaaaaaa' })]);
      expect(countAdded(null, next)).toBe(1);
    });

    it('treats every event as added when the committed file is unparseable', () => {
      const next = foldStoredEvents([storedEvent({ id: 'aaaaaaaa' })]);
      expect(countAdded('{ not json', next)).toBe(1);
    });
  });

  describe('commitEventsJson', () => {
    it('always writes to src/data/events.json on both GET and PUT', async () => {
      const { impl, calls } = scriptFetch([
        { status: 200, body: { sha: 'sha-old', content: b64('[]\n') } },
        { status: 200, body: { commit: { sha: 'sha-new' } } },
      ]);
      globalThis.fetch = impl as unknown as typeof fetch;

      await commitEventsJson(TARGET, foldStoredEvents([storedEvent()]));

      expect(EVENTS_FILE_PATH).toBe('src/data/events.json');
      expect(calls).toHaveLength(2);
      expect(calls[0].method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://api.github.com/repos/TimSimpsonJr/deflocksc-website/contents/src/data/events.json?ref=master',
      );
      expect(calls[1].method).toBe('PUT');
      expect(calls[1].url).toBe(
        'https://api.github.com/repos/TimSimpsonJr/deflocksc-website/contents/src/data/events.json',
      );
    });

    it('builds a commit message that ignores every text field of the events', async () => {
      const hostile = [
        storedEvent({
          id: 'aaaaaaaa',
          title: 'Closes #123 cc @someone',
          description: 'BREAKING CHANGE: see @octocat and #456',
          address: '#1 @evil Street',
          organizer: '@nobody',
        }),
        storedEvent({ id: 'bbbbbbbb', date: '2026-09-05' }),
      ];
      const benign = [
        storedEvent({ id: 'aaaaaaaa' }),
        storedEvent({ id: 'bbbbbbbb', date: '2026-09-05' }),
      ];

      const messages: string[] = [];
      for (const records of [hostile, benign]) {
        const { impl, calls } = scriptFetch([
          { status: 200, body: { sha: 'sha-old', content: b64('[]\n') } },
          { status: 200, body: { commit: { sha: 'sha-new' } } },
        ]);
        globalThis.fetch = impl as unknown as typeof fetch;
        await commitEventsJson(TARGET, foldStoredEvents(records));
        messages.push(calls[1].body.message);
      }

      expect(messages[0]).toBe('chore: fold events (2 added)');
      expect(messages[0]).toBe(messages[1]);
      expect(messages[0]).not.toContain('#');
      expect(messages[0]).not.toContain('@');
      expect(messages[0]).not.toContain('Street');
    });

    it('omits author and committer so the token identity is used', async () => {
      const { impl, calls } = scriptFetch([
        { status: 200, body: { sha: 'sha-old', content: b64('[]\n') } },
        { status: 200, body: { commit: { sha: 'sha-new' } } },
      ]);
      globalThis.fetch = impl as unknown as typeof fetch;

      await commitEventsJson(TARGET, foldStoredEvents([storedEvent()]));

      expect(calls[1].body).not.toHaveProperty('author');
      expect(calls[1].body).not.toHaveProperty('committer');
      expect(calls[1].body.branch).toBe('master');
      expect(calls[1].body.sha).toBe('sha-old');
    });

    it('re-reads the sha and retries the PUT exactly once on a 409', async () => {
      const { impl, calls } = scriptFetch([
        { status: 200, body: { sha: 'sha-old', content: b64('[]\n') } },
        { status: 409, body: { message: 'is at 111 but expected 222' } },
        { status: 200, body: { sha: 'sha-fresh', content: b64('[]\n') } },
        { status: 200, body: { commit: { sha: 'sha-new' } } },
      ]);
      globalThis.fetch = impl as unknown as typeof fetch;

      const result = await commitEventsJson(TARGET, foldStoredEvents([storedEvent()]));

      expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'GET', 'PUT']);
      expect(calls[1].body.sha).toBe('sha-old');
      expect(calls[3].body.sha).toBe('sha-fresh');
      expect(calls[3].body.message).toBe(calls[1].body.message);
      expect(result.committed).toBe(true);
    });

    it('gives up after the single retry when the second PUT also 409s', async () => {
      const { impl, calls } = scriptFetch([
        { status: 200, body: { sha: 'sha-old', content: b64('[]\n') } },
        { status: 409, body: { message: 'conflict' } },
        { status: 200, body: { sha: 'sha-fresh', content: b64('[]\n') } },
        { status: 409, body: { message: 'conflict' } },
      ]);
      globalThis.fetch = impl as unknown as typeof fetch;

      await expect(
        commitEventsJson(TARGET, foldStoredEvents([storedEvent()])),
      ).rejects.toThrow(/409/);
      expect(calls).toHaveLength(4);
    });

    it('treats a 404 on the GET as an empty file and PUTs with no sha', async () => {
      const { impl, calls } = scriptFetch([
        { status: 404, body: { message: 'Not Found' } },
        { status: 200, body: { commit: { sha: 'sha-new' } } },
      ]);
      globalThis.fetch = impl as unknown as typeof fetch;

      const result = await commitEventsJson(TARGET, foldStoredEvents([storedEvent()]));

      expect(calls[1].body).not.toHaveProperty('sha');
      expect(calls[1].body.message).toBe('chore: fold events (1 added)');
      expect(result.added).toBe(1);
    });

    it('skips the PUT entirely when the committed content is already identical', async () => {
      const events = foldStoredEvents([storedEvent()]);
      const { impl, calls } = scriptFetch([
        { status: 200, body: { sha: 'sha-old', content: b64(serializeEventsFile(events)) } },
      ]);
      globalThis.fetch = impl as unknown as typeof fetch;

      const result = await commitEventsJson(TARGET, events);

      expect(calls).toHaveLength(1);
      expect(result).toEqual({ committed: false, added: 0, message: null });
    });

    it('sends the content base64-encoded and round-trippable', async () => {
      const events = foldStoredEvents([storedEvent()]);
      const { impl, calls } = scriptFetch([
        { status: 200, body: { sha: 'sha-old', content: b64('[]\n') } },
        { status: 200, body: { commit: { sha: 'sha-new' } } },
      ]);
      globalThis.fetch = impl as unknown as typeof fetch;

      await commitEventsJson(TARGET, events);

      const decoded = Buffer.from(calls[1].body.content, 'base64').toString('utf8');
      expect(decoded).toBe(serializeEventsFile(events));
      expect(decoded.endsWith('\n')).toBe(true);
    });
  });
  ```

- [ ] **Step 4: Run the test and confirm it fails for the right reason**

  ```bash
  npm test -- src/lib/fold-events.test.ts
  ```

  Expected failure — the module does not exist yet:

  ```
  Error: Failed to load url ./fold-events.js (resolved id: ./fold-events.js) in
  src/lib/fold-events.test.ts.
  Does the file exist?
  ```

  Vitest reports `Test Files  1 failed (1)` with `Tests  no tests`. If instead you see a failure about `./public-event.js`, Task 7 has not landed — stop and go back.

- [ ] **Step 5: Implement `src/lib/fold-events.ts`**

  Create `src/lib/fold-events.ts` with exactly this content:

  ```ts
  import { toPublicEvent } from './public-event.js';
  import type { PublicEvent, StoredEvent } from './public-event.js';

  /**
   * The one and only path the fold ever writes. Deliberately a module constant
   * and never a function parameter: nothing a caller or a stored record carries
   * can redirect the commit at another file in the repo.
   */
  export const EVENTS_FILE_PATH = 'src/data/events.json';

  const GITHUB_API = 'https://api.github.com';

  export interface CommitTarget {
    owner: string;
    repo: string;
    branch: string;
    token: string;
  }

  export interface CommitResult {
    /** false when the committed file already matched, so no deploy was spent. */
    committed: boolean;
    added: number;
    message: string | null;
  }

  /**
   * The commit message is a constant plus a server-computed integer. No event
   * field is ever interpolated. GitHub interprets commit messages on the default
   * branch, so a title containing `#123` or `@someone` would close an issue or
   * fire a mention from the repo owner's identity.
   */
  export function buildCommitMessage(addedCount: number): string {
    if (!Number.isInteger(addedCount) || addedCount < 0) {
      throw new RangeError('buildCommitMessage: addedCount must be a non-negative integer');
    }
    return `chore: fold events (${addedCount} added)`;
  }

  /**
   * Projects stored records to the public field set, drops tombstones, and sorts
   * by date then id. The sort is what makes the weekly diff stable: the Blobs
   * `list()` order is not guaranteed, and an unsorted file would churn every row
   * on every fold. Expiry pruning is a separate pass (`pruneExpired`) so the
   * caller supplies the clock and the projection stays a pure function of its
   * argument.
   */
  export function foldStoredEvents(records: readonly StoredEvent[]): PublicEvent[] {
    return records
      .filter((record) => record.revoked !== true)
      .map((record) => toPublicEvent(record))
      .sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      });
  }

  // --- expiry (design §10) -----------------------------------------------------

  /** One horizon, used by both the fold's pruning and the build-time guard. */
  export const EXPIRY_HORIZON_DAYS = 30;
  const EXPIRY_HORIZON_MS = EXPIRY_HORIZON_DAYS * 24 * 60 * 60 * 1000;

  type EventRecurrence = { readonly freq: 'weekly' | 'monthly_nth'; readonly until: string } | null;

  interface DatedEvent {
    readonly date: string;
    readonly recurrence: EventRecurrence;
  }

  /** The last day an event is active: recurrence.until when it recurs, else its own date. */
  export function finalDateOf(event: DatedEvent): string {
    return event.recurrence ? event.recurrence.until : event.date;
  }

  /**
   * True when an event's final date is more than EXPIRY_HORIZON_DAYS before `now`.
   * The horizon is measured from the end of that calendar day in UTC, so an event
   * is not counted expired on the very day it turns 30 days old. `now` is passed
   * in rather than read from the clock so both the fold and the build guard are
   * deterministic. An unparseable date is never treated as expired — the strict
   * schema guard, not this predicate, is what rejects a malformed date.
   */
  export function isExpired(event: DatedEvent, now: Date): boolean {
    const end = Date.parse(`${finalDateOf(event)}T23:59:59.999Z`);
    if (Number.isNaN(end)) return false;
    return now.getTime() - end > EXPIRY_HORIZON_MS;
  }

  /**
   * Drop every event past the expiry horizon. The fold applies this so
   * events.json cannot grow without bound as events age out (single 30-day
   * horizon, design §10).
   */
  export function pruneExpired<T extends DatedEvent>(events: readonly T[], now: Date): T[] {
    return events.filter((event) => !isExpired(event, now));
  }

  /**
   * Build-time expiry guard (design §10). The events-page task calls this in
   * events.astro frontmatter, after schema-parsing src/data/events.json, so a
   * neglected calendar fails the deploy instead of rotting silently. The weekly
   * fold already prunes expired records, so in normal operation nothing here
   * fires; it catches a hand-edited or fold-stalled file.
   */
  export function assertEventsFresh(
    events: readonly (DatedEvent & { readonly id: string })[],
    now: Date,
  ): void {
    const stale = events.filter((event) => isExpired(event, now));
    if (stale.length > 0) {
      const ids = stale.map((event) => event.id).join(', ');
      throw new Error(
        `assertEventsFresh: ${stale.length} event(s) are more than ${EXPIRY_HORIZON_DAYS} days ` +
          `past their final date and were never expired: ${ids}. Run the fold ` +
          `(.github/workflows/fold-events.yml) or resubmit/expire them.`,
      );
    }
  }

  /** Two-space JSON with a trailing newline, matching the repo's other data files. */
  export function serializeEventsFile(events: readonly PublicEvent[]): string {
    return `${JSON.stringify(events, null, 2)}\n`;
  }

  /**
   * How many ids in the new set are absent from the committed file. An
   * unreadable or missing file counts everything as added rather than throwing:
   * the fold's job is to publish, and a wrong count is a cosmetic defect while a
   * thrown fold is a stalled calendar.
   */
  export function countAdded(
    existingJson: string | null,
    next: readonly PublicEvent[],
  ): number {
    const known = new Set<string>();
    if (existingJson !== null) {
      try {
        const parsed: unknown = JSON.parse(existingJson);
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string') {
              known.add((entry as { id: string }).id);
            }
          }
        }
      } catch {
        // Unparseable committed file: fall through with an empty known set.
      }
    }
    let added = 0;
    for (const event of next) {
      if (!known.has(event.id)) added += 1;
    }
    return added;
  }

  function githubHeaders(token: string): Record<string, string> {
    return {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'deflocksc-fold-events',
      'x-github-api-version': '2022-11-28',
    };
  }

  interface FileState {
    sha: string | null;
    content: string | null;
  }

  async function readEventsFile(target: CommitTarget): Promise<FileState> {
    const url =
      `${GITHUB_API}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}` +
      `/contents/${EVENTS_FILE_PATH}?ref=${encodeURIComponent(target.branch)}`;
    const res = await fetch(url, { method: 'GET', headers: githubHeaders(target.token) });
    if (res.status === 404) return { sha: null, content: null };
    if (!res.ok) {
      throw new Error(`fold-events: GitHub GET ${EVENTS_FILE_PATH} failed with ${res.status}`);
    }
    const body = (await res.json()) as { sha?: unknown; content?: unknown };
    const content =
      typeof body.content === 'string'
        ? Buffer.from(body.content, 'base64').toString('utf8')
        : null;
    return { sha: typeof body.sha === 'string' ? body.sha : null, content };
  }

  async function putEventsFile(
    target: CommitTarget,
    payload: { message: string; contentBase64: string; sha: string | null },
  ): Promise<Response> {
    const url =
      `${GITHUB_API}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}` +
      `/contents/${EVENTS_FILE_PATH}`;
    // `author` and `committer` are deliberately absent so GitHub attributes the
    // commit to the token identity.
    const body: Record<string, string> = {
      message: payload.message,
      content: payload.contentBase64,
      branch: target.branch,
    };
    if (payload.sha !== null) body.sha = payload.sha;
    return fetch(url, {
      method: 'PUT',
      headers: githubHeaders(target.token),
      body: JSON.stringify(body),
    });
  }

  /**
   * GET for the sha, PUT with that sha, retry once on 409. A 409 means another
   * writer (the camera-refresh automation, or a human) touched the file between
   * the read and the write; re-reading the sha and replaying the same message is
   * the whole recovery. One retry, then fail loudly.
   */
  export async function commitEventsJson(
    target: CommitTarget,
    events: readonly PublicEvent[],
  ): Promise<CommitResult> {
    const nextContent = serializeEventsFile(events);
    let state = await readEventsFile(target);

    if (state.content === nextContent) {
      return { committed: false, added: 0, message: null };
    }

    const added = countAdded(state.content, events);
    const message = buildCommitMessage(added);
    const contentBase64 = Buffer.from(nextContent, 'utf8').toString('base64');

    let res = await putEventsFile(target, { message, contentBase64, sha: state.sha });
    if (res.status === 409) {
      state = await readEventsFile(target);
      res = await putEventsFile(target, { message, contentBase64, sha: state.sha });
    }
    if (!res.ok) {
      throw new Error(`fold-events: GitHub PUT ${EVENTS_FILE_PATH} failed with ${res.status}`);
    }

    return { committed: true, added, message };
  }
  ```

- [ ] **Step 6: Run the test again and confirm it passes**

  ```bash
  npm test -- src/lib/fold-events.test.ts
  ```

  Expected: `Test Files  1 passed (1)` and `Tests  27 passed (27)`.

- [ ] **Step 7: Commit the fold library**

  ```bash
  git add src/lib/fold-events.ts src/lib/fold-events.test.ts
  git commit -m "feat(events): fold library that commits events.json via the GitHub contents API"
  ```

- [ ] **Step 8: Write the failing test for the scheduled function**

  Create `tests/functions/fold-events.test.ts` with exactly this content. Function tests live under `tests/functions/`, never beside the function in `netlify/functions/`; the relative import reaches back into `netlify/functions/` and `src/lib/`. The clock is frozen so the expiry pruning is deterministic:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import type { StoredEvent } from '../../src/lib/public-event.js';

  const listMock = vi.fn();
  const getMock = vi.fn();

  vi.mock('../../src/lib/blob-stores.js', () => ({
    eventsStore: () => ({ list: listMock, get: getMock }),
  }));

  function storedEvent(overrides: Partial<StoredEvent> = {}): StoredEvent {
    return {
      id: 'k7m29qxb',
      type: 'public',
      title: 'County council meeting',
      description: 'Public comment period at the start.',
      date: '2026-09-01',
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: '301 University Ridge, Greenville',
      hasSignalGroup: true,
      recurrence: null,
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
      signalUrl: 'https://signal.group/#CjQKIExamplE',
      codeDigest: 'a'.repeat(64),
      revoked: false,
      ...overrides,
    } as StoredEvent;
  }

  function b64(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
  }

  let originalFetch: typeof globalThis.fetch;
  const calls: Array<{ method: string; url: string; body: any }> = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls.length = 0;
    listMock.mockReset();
    getMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T12:00:00Z'));
    process.env.GITHUB_FOLD_TOKEN = 'ghp_test_token';
    process.env.GITHUB_FOLD_REPO = 'TimSimpsonJr/deflocksc-website';
    process.env.GITHUB_FOLD_BRANCH = 'master';

    const responses: Array<{ status: number; body?: unknown }> = [
      { status: 200, body: { sha: 'sha-old', content: b64('[]\n') } },
      { status: 200, body: { commit: { sha: 'sha-new' } } },
    ];
    let i = 0;
    globalThis.fetch = vi.fn(async (input: any, init: any = {}) => {
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({
        method,
        url: String(input),
        body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const next = responses[i];
      i += 1;
      if (!next) throw new Error('unscripted fetch call');
      return new Response(
        next.body === undefined ? null : JSON.stringify(next.body),
        { status: next.status, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    delete process.env.GITHUB_FOLD_TOKEN;
    delete process.env.GITHUB_FOLD_REPO;
    delete process.env.GITHUB_FOLD_BRANCH;
    vi.restoreAllMocks();
  });

  describe('fold-events scheduled function', () => {
    it('declares the Sunday 04:00 UTC schedule', async () => {
      const mod = await import('../../netlify/functions/fold-events.js');
      expect(mod.config.schedule).toBe('0 4 * * 0');
    });

    it('reads the store, commits to src/data/events.json, and returns 200', async () => {
      listMock.mockResolvedValue({
        blobs: [{ key: 'aaaaaaaa' }, { key: 'bbbbbbbb' }],
      });
      getMock.mockImplementation(async (key: string) =>
        storedEvent({ id: key, date: key === 'aaaaaaaa' ? '2026-09-03' : '2026-09-01' }),
      );

      const mod = await import('../../netlify/functions/fold-events.js');
      const res = await mod.default(new Request('https://deflocksc.org/'), {} as any);

      expect(res.status).toBe(200);
      expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
      expect(calls[0].url).toContain('/contents/src/data/events.json?ref=master');
      expect(calls[1].url.endsWith('/contents/src/data/events.json')).toBe(true);
      expect(calls[1].body.message).toBe('chore: fold events (2 added)');

      const committed = JSON.parse(
        Buffer.from(calls[1].body.content, 'base64').toString('utf8'),
      );
      expect(committed.map((e: any) => e.id)).toEqual(['bbbbbbbb', 'aaaaaaaa']);
      expect(JSON.stringify(committed)).not.toContain('signal.group');
    });

    it('drops an event more than 30 days past its final date before committing', async () => {
      listMock.mockResolvedValue({
        blobs: [{ key: 'aaaaaaaa' }, { key: 'oldoldol' }],
      });
      getMock.mockImplementation(async (key: string) =>
        key === 'aaaaaaaa'
          ? storedEvent({ id: key, date: '2026-09-01' })
          : storedEvent({ id: key, date: '2026-06-01' }),
      );

      const mod = await import('../../netlify/functions/fold-events.js');
      const res = await mod.default(new Request('https://deflocksc.org/'), {} as any);

      expect(res.status).toBe(200);
      const committed = JSON.parse(
        Buffer.from(calls[1].body.content, 'base64').toString('utf8'),
      );
      expect(committed.map((e: any) => e.id)).toEqual(['aaaaaaaa']);
      expect(calls[1].body.message).toBe('chore: fold events (1 added)');
    });

    it('fails closed with a 500 when the GitHub credential is missing', async () => {
      delete process.env.GITHUB_FOLD_TOKEN;
      listMock.mockResolvedValue({ blobs: [] });

      const mod = await import('../../netlify/functions/fold-events.js');
      const res = await mod.default(new Request('https://deflocksc.org/'), {} as any);

      expect(res.status).toBe(500);
      expect(calls).toHaveLength(0);
    });

    it('skips records the store cannot resolve rather than aborting the fold', async () => {
      listMock.mockResolvedValue({
        blobs: [{ key: 'aaaaaaaa' }, { key: 'ffffffff' }],
      });
      getMock.mockImplementation(async (key: string) =>
        key === 'aaaaaaaa' ? storedEvent({ id: key }) : null,
      );

      const mod = await import('../../netlify/functions/fold-events.js');
      const res = await mod.default(new Request('https://deflocksc.org/'), {} as any);

      expect(res.status).toBe(200);
      expect(calls[1].body.message).toBe('chore: fold events (1 added)');
    });
  });
  ```

- [ ] **Step 9: Run the function test and confirm it fails for the right reason**

  ```bash
  npm test -- tests/functions/fold-events.test.ts
  ```

  Expected failure — the function does not exist yet:

  ```
  Error: Failed to load url ../../netlify/functions/fold-events.js
  (resolved id: .../netlify/functions/fold-events.js) in
  tests/functions/fold-events.test.ts.
  Does the file exist?
  ```

  All five cases fail with that message; Vitest reports `Tests  5 failed (5)`.

- [ ] **Step 10: Implement `netlify/functions/fold-events.ts`**

  Create `netlify/functions/fold-events.ts` with exactly this content. It composes the two pure passes — `foldStoredEvents` (projection, tombstone drop, sort) then `pruneExpired` (age-out) — so the committed file carries neither revoked nor expired events:

  ```ts
  import type { Config, Context } from '@netlify/functions';
  import { eventsStore } from '../../src/lib/blob-stores.js';
  import type { StoredEvent } from '../../src/lib/public-event.js';
  import { commitEventsJson, foldStoredEvents, pruneExpired } from '../../src/lib/fold-events.js';
  import type { CommitTarget } from '../../src/lib/fold-events.js';

  export const config: Config = {
    schedule: '0 4 * * 0',
  };

  function requireEnv(name: string): string {
    const raw = process.env[name];
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new Error(`fold-events: missing required environment variable ${name}`);
    }
    return raw.trim();
  }

  /**
   * The GitHub credential is production-context-only (design §7). On a deploy
   * preview or branch deploy these are unset and the fold fails closed here,
   * before it can touch either the store or the repo.
   */
  function resolveTarget(): CommitTarget {
    const token = requireEnv('GITHUB_FOLD_TOKEN');
    const slug = requireEnv('GITHUB_FOLD_REPO');
    const parts = slug.split('/');
    if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
      throw new Error('fold-events: GITHUB_FOLD_REPO must be in "owner/repo" form');
    }
    const branch = process.env.GITHUB_FOLD_BRANCH?.trim() || 'master';
    return { owner: parts[0], repo: parts[1], branch, token };
  }

  async function readAllStoredEvents(): Promise<StoredEvent[]> {
    const store = eventsStore();
    const listing = (await store.list()) as { blobs: Array<{ key: string }> };
    const records = await Promise.all(
      listing.blobs.map(async (blob) => {
        const record = (await store.get(blob.key, { type: 'json' })) as StoredEvent | null;
        return record;
      }),
    );
    // A key that lists but does not resolve is a transient store read, not a
    // reason to stall the whole week's fold.
    return records.filter((record): record is StoredEvent => record !== null && record !== undefined);
  }

  export default async (_req: Request, _context: Context): Promise<Response> => {
    try {
      const target = resolveTarget();
      const now = new Date();
      const events = pruneExpired(foldStoredEvents(await readAllStoredEvents()), now);
      const result = await commitEventsJson(target, events);
      return Response.json(
        { ok: true, total: events.length, committed: result.committed, added: result.added },
        { status: 200 },
      );
    } catch (error) {
      // Log the reason for the maintainer; never echo stored event text.
      console.error('fold-events failed:', error instanceof Error ? error.message : 'unknown error');
      return Response.json({ ok: false }, { status: 500 });
    }
  };
  ```

- [ ] **Step 11: Run both test files and confirm they pass**

  ```bash
  npm test -- src/lib/fold-events.test.ts tests/functions/fold-events.test.ts
  ```

  Expected: `Test Files  2 passed (2)` and `Tests  32 passed (32)`.

  Then run the whole suite to confirm nothing regressed:

  ```bash
  npm test
  ```

  Expected: all test files pass, exit code 0.

- [ ] **Step 12: Typecheck**

  ```bash
  npx astro check
  ```

  Expected: `0 errors`. Warnings about unused `_req` / `_context` are not errors; if `astro check` flags them, they are prefixed with `_` and the strict config permits that.

- [ ] **Step 13: Commit the scheduled function**

  ```bash
  git add netlify/functions/fold-events.ts tests/functions/fold-events.test.ts
  git commit -m "feat(events): weekly scheduled fold of the Blobs overlay into events.json"
  ```

- [ ] **Step 14: Create the manual fold workflow `.github/workflows/fold-events.yml`**

  The scheduled function folds every Sunday. A revocation, though, needs the baked `/events` listing refreshed on demand — the organizer-codes CLI's `--fold` path runs `gh workflow run fold-events.yml` for exactly this. Give it a target.

  This workflow is **manual only** (`workflow_dispatch`) and it is **the one and only place a hook triggers a Netlify deploy**. Design §15 forbids a build hook anywhere near a submission handler (a submission-triggered deploy would let a code-holder burn 1,500 credits a day); this hook is fired by a human, from the Actions UI or `gh`, never from request-handling code.

  Create `.github/workflows/fold-events.yml` with exactly this content:

  ```yaml
  name: fold-events

  # Manual only. This is the ONE place a hook triggers a Netlify deploy (design
  # §15 forbids a build hook near any submission handler). It POSTs the Netlify
  # build hook, starting a production deploy so a freshly folded src/data/events.json
  # reaches the CDN on demand instead of waiting for the Sunday scheduled fold.
  # Never call this from request-handling code.
  on:
    workflow_dispatch: {}

  permissions:
    contents: read

  jobs:
    trigger-fold-deploy:
      runs-on: ubuntu-latest
      steps:
        - name: Trigger the Netlify production build hook
          env:
            FOLD_BUILD_HOOK: ${{ secrets.NETLIFY_FOLD_BUILD_HOOK }}
          run: |
            if [ -z "${FOLD_BUILD_HOOK}" ]; then
              echo "NETLIFY_FOLD_BUILD_HOOK is not set. Add the Netlify build hook URL" >&2
              echo "as a repository secret before dispatching this workflow." >&2
              exit 1
            fi
            curl --fail --silent --show-error -X POST -d '{}' "${FOLD_BUILD_HOOK}"
  ```

  Provision the secret it reads:

  1. In the Netlify UI: **Site configuration → Build & deploy → Build hooks → Add build hook**, branch `master`, name `fold-events manual`. Copy the URL.
  2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name `NETLIFY_FOLD_BUILD_HOOK`, value the URL from step 1.

  Commit the workflow (pushing a file under `.github/workflows/` needs the `workflow` OAuth scope: `gh auth refresh --hostname github.com --scopes workflow`):

  ```bash
  git add .github/workflows/fold-events.yml
  git commit -m "ci(events): manual fold-events workflow (build-hook deploy, dispatch only)"
  ```

- [ ] **Step 15: Manual verification — the fold GitHub PAT env vars (not unit-testable)**

  In the Netlify UI at **Site configuration → Environment variables**, create three variables. Each must be scoped **Functions only** and set to **Production context only**, leaving deploy-preview and branch-deploy unset so those runtimes hit the fail-closed path in `resolveTarget()`:

  | Key | Value | Secret |
  |---|---|---|
  | `GITHUB_FOLD_TOKEN` | a fine-grained PAT on `TimSimpsonJr/deflocksc-website` with **Contents: Read and write** and nothing else | yes |
  | `GITHUB_FOLD_REPO` | `TimSimpsonJr/deflocksc-website` | no |
  | `GITHUB_FOLD_BRANCH` | `master` | no |

  Verify the token scope before saving it — this is the only credential in the system that can write to the repo (design §16.1). Confirm the token page lists exactly one repository and exactly one permission.

- [ ] **Step 16: Manual verification — provision the submit/rate-limit secrets (not unit-testable)**

  The submit function and the rate limiter fail closed without their secrets — a submit with no pepper returns 503, safe but dead — so this is required for the feature to work at all. Mirror the fold-token step above: in the Netlify UI at **Site configuration → Environment variables**, create two more variables, each scoped **Functions only**, set to **Production context only**, and marked **sensitive**:

  | Key | Value | Secret |
  |---|---|---|
  | `ORGANIZER_CODE_PEPPER` | 32 random bytes as hex (`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`); the HMAC pepper for organizer codes | yes |
  | `RATE_LIMIT_IP_SALT` | 32 random bytes as hex, generated the same way; salts hashed client IPs in the rate limiter | yes |

  `ORGANIZER_CODE_PEPPER` must be **byte-identical** to the value the organizer-codes CLI reads from `.env` — the CLI's pepper canary refuses to issue on drift (design §7). Leaving both unset on deploy-preview and branch-deploy is deliberate: those contexts must not share production's pepper. Record that these two are provisioned so the submit and rate-limit tasks can rely on them.

- [ ] **Step 17: Manual verification — the deployed function runs and commits**

  After the branch is deployed to production, invoke the scheduled function once by hand from the Netlify UI: **Project → Logs → Functions → `fold-events` → Test function** (a scheduled function accepts a manual invocation with an empty payload).

  Expected observable results, in order:

  1. The function log shows a 200 and a JSON body of the shape `{"ok":true,"total":N,"committed":true,"added":N}`.
  2. `git fetch origin && git log origin/master -1 --format='%s%n%an'` prints exactly:
     ```
     chore: fold events (N added)
     ```
     followed by the token's identity on the second line — **not** a hardcoded author.
  3. `git show origin/master --stat -1` lists `src/data/events.json` and no other file.
  4. `git show origin/master:src/data/events.json | grep -c 'signal.group'` prints `0`.
  5. Netlify starts one deploy whose `deploy_source` is `api`. (Design §18 item 4 flags "does a GitHub-API commit trigger a Netlify build" as unverified — this step is that verification. If no deploy starts, record it in the design doc's open items and add a build-hook call guarded by the fold's own `CommitResult` — reuse the `NETLIFY_FOLD_BUILD_HOOK` from Step 14, scoped Functions-only/production-only — and do **not** move the build-hook call anywhere near the submit handler.)

  Then invoke it a second time with no new submissions. Expected: the log shows `{"ok":true,...,"committed":false,"added":0}`, `git fetch && git log origin/master -1` shows the **same** commit sha as before, and no second deploy starts. That is the no-op path protecting the 15-credit-per-deploy budget.

- [ ] **Step 18: Wire the build-time expiry guard into the events page (interface note)**

  `assertEventsFresh(events, now)` and `isExpired` are exported from `src/lib/fold-events.ts` and unit-tested above, but a build only fails where the build actually reads `events.json` — the events-page task's `events.astro` frontmatter, which already parses `src/data/events.json` with the shared strict Zod schema (design §5, contract §10). The events-page task MUST, after that schema parse and before rendering, call:

  ```ts
  import { assertEventsFresh } from '../lib/fold-events.js';
  // ...after parsing events.json into the validated PublicEvent[] `bakedEvents`:
  assertEventsFresh(bakedEvents, new Date());
  ```

  A `PublicEvent[]` satisfies the guard's parameter type (it carries `id`, `date`, and `recurrence`), so a hand-edited or fold-stalled `events.json` holding an event more than 30 days past its final date fails the deploy (design §10) instead of rotting silently. The weekly fold prunes expired records with the same `EXPIRY_HORIZON_DAYS` horizon, so this guard fires only on neglect. This is a documented seam, not a change to `events.astro` in this task; confirm the events-page task carries the call.

---

---

### Task 16: organizer-codes CLI

The maintainer-only CLI that issues, revokes, lists organizer codes, and sets the intake Signal link against the **production** Netlify Blobs stores. It is the only writer to the `codes` store, so it fails closed on every missing prerequisite, verifies the pepper canary before any write, and never lets a plaintext code touch a file, a log, or `process.argv`.

**The CLI is split in two, and that split is the only reason it is testable at all:** `src/lib/organizer-cli.ts` holds every decision the CLI makes as a pure function (argument parsing, the canary check, the record shapes, all output formatting) with no I/O, no `process.exit`, and no `console`, so it can be unit tested directly; `scripts/organizer-codes.ts` is a thin shell that reads the environment, wires stdin/stdout, calls into that module, and sets exit codes.

**Subcommands:** `list [--json]`, `issue <pseudonym> [--clip]`, `revoke <pseudonym> [--digest <64-hex>] [--fold|--no-fold]`, and `set-intake <signal-url>`. `set-intake` writes the `/go/intake` target (design §9): it validates the URL with the same `validateSignalUrl` the submit path uses and stores it under the `links` store's `intake` key, which `/go/intake` reads at request time. `list` reports **whether** an intake link is set, never the URL itself.

**How it runs.** Bare `node` cannot execute it. Both facts below were confirmed empirically on Node v22.22.3 (the version pinned in `netlify.toml`):

1. `node --experimental-strip-types scripts/organizer-codes.ts` **fails**. Every module in `src/lib` imports its siblings with an explicit `.js` extension (`import { ok } from './text-result.js'`), which is this repo's convention, and Node's type stripping does **not** remap a relative `./x.js` specifier to `./x.ts`. You get `ERR_MODULE_NOT_FOUND: Cannot find module .../text-result.js`.
2. `esbuild` — already in `node_modules/.bin` transitively, no new dependency — **does** resolve those specifiers correctly. Bundling the entry point to a single `.mjs` and running that works.

So the `codes` npm script bundles first, then runs. The bundle takes roughly 10 ms and lands in `node_modules/.cache/`, which is already gitignored. One consequence to keep in mind while writing the shell: after bundling, `import.meta.url` points into `node_modules/.cache/`, so the shell must resolve every on-disk path from `process.cwd()` (which `npm run` sets to the repo root), never from the module URL.

Bundling also inlines the `src/lib` sources, which is why this task creates no module-resolution hook.

**Prerequisite:** `@netlify/blobs` must already be installed and `src/lib/blob-stores.ts` must already exist (from the Blobs store task), and `src/lib/signal-url.ts` must exist (from the Signal-URL validator task). Confirm before starting:

```
cd /c/Users/tim/workspace/deflocksc-website && node -e "require.resolve('@netlify/blobs')" && ls node_modules/.bin/esbuild && node -e "require('fs').existsSync('src/lib/signal-url.ts')||process.exit(1)"
```

All must succeed. If `require.resolve` throws, the Blobs task is not done. If `esbuild` is absent, stop and report it rather than adding a dependency. If `signal-url.ts` is missing, the Signal-URL validator task has not landed.

**Files:**

- Create `src/lib/organizer-cli.ts` — the pure half: argv parsing, the code-in-argv refusal, environment validation, the canary decision, the stored-record shapes, the wordlist parser, the intake-status formatters, and every string the CLI prints
- Create `src/lib/organizer-cli.test.ts` — colocated unit tests for the pure half
- Create `src/lib/wordlist-file.test.ts` — checksum + structure guard on the committed wordlist
- Create `scripts/organizer-codes.ts` — the thin shell: env, stdin/stdout, Blobs calls, exit codes
- Create `scripts/build-wordlist.ts` — downloads, validates, and checksums the wordlist
- Create `scripts/data/SOURCES.md`
- Create `scripts/data/eff-short-wordlist-2.txt` (generated by `build-wordlist`, committed)
- Create `scripts/data/eff-short-wordlist-2.sha256` (generated by `build-wordlist`, committed)
- Modify `package.json` — add the `codes` and `build-wordlist` scripts
- Modify `.env.example` — document the three required secrets
- Modify `src/lib/blob-stores.ts` — comment only: its doc comment names `scripts/organizer-codes.mjs`; change that string to `scripts/organizer-codes.ts`

---

- [ ] **Step 1: Write the failing test for the pure half**

  Create `src/lib/organizer-cli.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { digestCode } from './organizer-code.js';
  import {
    CANARY_KEY,
    CANARY_SUBJECT,
    CLI_ARG_MESSAGES,
    ENV_MESSAGES,
    FOLD_WORKFLOW,
    USAGE,
    WORDLIST_SIZE,
    buildBlobsContext,
    buildCodeRecord,
    canaryDigest,
    checkWordlistChecksum,
    decideCanary,
    formatAmbiguousRevoke,
    formatBadIntakeUrl,
    formatFoldReminder,
    formatIntakeStatus,
    formatIntakeUpdated,
    formatIssueBanner,
    formatListTable,
    formatNoCodeFound,
    formatRevokeSummary,
    isValidPseudonym,
    looksLikeCode,
    parseCliArgs,
    parseEnv,
    parseFoldAnswer,
    parseWordlist,
    revokeRecord,
    selectRevocationTarget,
    shouldTombstone,
    toListJson,
    toListRow,
    tombstoneEvent,
  } from './organizer-cli.js';

  const rows = [
    { digest: 'a'.repeat(64), pseudonym: 'handle-jay', issuedAt: '2026-08-17T14:22:00Z', revoked: false },
    { digest: 'b'.repeat(64), pseudonym: 'pier', issuedAt: '2026-07-02T09:00:00Z', revoked: true },
  ];

  const fullEnv = {
    ORGANIZER_CODE_PEPPER: 'pepper-value',
    NETLIFY_AUTH_TOKEN: 'token-value',
    NETLIFY_SITE_ID: 'site-value',
  };

  // Build a synthetic wordlist that satisfies every structural rule.
  function syntheticWordlist(count = WORDLIST_SIZE): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const lines: string[] = [];
    for (let i = 0; i < count; i += 1) {
      // Unique 3-char prefix per entry: base-26 over three positions (26^3 = 17576 >= 1296).
      const prefix =
        alphabet[Math.floor(i / 676) % 26] + alphabet[Math.floor(i / 26) % 26] + alphabet[i % 26];
      const dice = `${(i % 6) + 1}${((i >> 2) % 6) + 1}${((i >> 4) % 6) + 1}${((i >> 6) % 6) + 1}`;
      lines.push(`${dice}\t${prefix}word`);
    }
    return lines.join('\n') + '\n';
  }

  describe('looksLikeCode', () => {
    it('flags a space-separated four-word code', () => {
      expect(looksLikeCode('Drum Yoga Vivid Clay')).toBe(true);
    });

    it('flags a hyphen-separated four-word code', () => {
      expect(looksLikeCode('drum-yoga-vivid-clay')).toBe(true);
    });

    it('flags a code padded with punctuation and digits', () => {
      expect(looksLikeCode('  drum2yoga.vivid_clay  ')).toBe(true);
    });

    it('does not flag a two-part pseudonym', () => {
      expect(looksLikeCode('handle-jay')).toBe(false);
    });

    it('does not flag a subcommand or a flag', () => {
      expect(looksLikeCode('revoke')).toBe(false);
      expect(looksLikeCode('--no-fold')).toBe(false);
    });

    it('does not flag a 64-char hex digest', () => {
      expect(looksLikeCode('a1b2c3d4'.repeat(8))).toBe(false);
    });
  });

  describe('isValidPseudonym', () => {
    it('accepts up to three hyphen-separated segments', () => {
      expect(isValidPseudonym('pier')).toBe(true);
      expect(isValidPseudonym('handle-jay')).toBe(true);
      expect(isValidPseudonym('handle-jay-2')).toBe(true);
    });

    it('rejects four segments, uppercase, spaces, empty segments, and overlong values', () => {
      expect(isValidPseudonym('a-b-c-d')).toBe(false);
      expect(isValidPseudonym('Handle')).toBe(false);
      expect(isValidPseudonym('handle jay')).toBe(false);
      expect(isValidPseudonym('handle--jay')).toBe(false);
      expect(isValidPseudonym('a')).toBe(false);
      expect(isValidPseudonym('a'.repeat(41))).toBe(false);
    });
  });

  describe('parseCliArgs', () => {
    it('parses issue with and without --clip', () => {
      expect(parseCliArgs(['issue', 'handle-jay'])).toEqual({
        ok: true,
        value: { name: 'issue', pseudonym: 'handle-jay', clip: false },
      });
      expect(parseCliArgs(['issue', 'handle-jay', '--clip'])).toEqual({
        ok: true,
        value: { name: 'issue', pseudonym: 'handle-jay', clip: true },
      });
    });

    it('parses revoke with digest and fold flags', () => {
      expect(parseCliArgs(['revoke', 'pier'])).toEqual({
        ok: true,
        value: { name: 'revoke', pseudonym: 'pier', digest: null, fold: 'prompt' },
      });
      expect(parseCliArgs(['revoke', 'pier', '--digest', 'c'.repeat(64), '--no-fold'])).toEqual({
        ok: true,
        value: { name: 'revoke', pseudonym: 'pier', digest: 'c'.repeat(64), fold: 'no' },
      });
      expect(parseCliArgs(['revoke', 'pier', '--fold'])).toEqual({
        ok: true,
        value: { name: 'revoke', pseudonym: 'pier', digest: null, fold: 'yes' },
      });
    });

    it('parses list with and without --json', () => {
      expect(parseCliArgs(['list'])).toEqual({ ok: true, value: { name: 'list', json: false } });
      expect(parseCliArgs(['list', '--json'])).toEqual({ ok: true, value: { name: 'list', json: true } });
    });

    it('parses set-intake with a signal url that would otherwise trip the code scan', () => {
      expect(parseCliArgs(['set-intake', 'https://signal.group/#CjQKIExamplE'])).toEqual({
        ok: true,
        value: { name: 'set-intake', signalUrl: 'https://signal.group/#CjQKIExamplE' },
      });
    });

    it('refuses an organizer code passed as an argument', () => {
      expect(parseCliArgs(['revoke', 'drum-yoga-vivid-clay'])).toEqual({
        ok: false,
        code: 'looks_like_code',
      });
      expect(parseCliArgs(['issue', 'Drum Yoga Vivid Clay'])).toEqual({
        ok: false,
        code: 'looks_like_code',
      });
    });

    it('refuses the code before it decides whether the subcommand is even real', () => {
      expect(parseCliArgs(['rotate', 'drum-yoga-vivid-clay'])).toEqual({
        ok: false,
        code: 'looks_like_code',
      });
    });

    it('reports the remaining argument errors', () => {
      expect(parseCliArgs([])).toEqual({ ok: false, code: 'no_command' });
      expect(parseCliArgs(['rotate'])).toEqual({ ok: false, code: 'unknown_command' });
      expect(parseCliArgs(['issue'])).toEqual({ ok: false, code: 'missing_pseudonym' });
      expect(parseCliArgs(['issue', 'Handle'])).toEqual({ ok: false, code: 'invalid_pseudonym' });
      expect(parseCliArgs(['issue', 'pier', '--quiet'])).toEqual({ ok: false, code: 'unknown_flag' });
      expect(parseCliArgs(['issue', 'pier', 'extra'])).toEqual({ ok: false, code: 'extra_argument' });
      expect(parseCliArgs(['revoke', 'pier', '--digest'])).toEqual({ ok: false, code: 'invalid_digest' });
      expect(parseCliArgs(['revoke', 'pier', '--digest', 'nothex'])).toEqual({
        ok: false,
        code: 'invalid_digest',
      });
      expect(parseCliArgs(['set-intake'])).toEqual({ ok: false, code: 'missing_url' });
      expect(parseCliArgs(['set-intake', 'https://signal.group/#a', 'extra'])).toEqual({
        ok: false,
        code: 'extra_argument',
      });
    });

    it('has a message for every argument error code', () => {
      const codes = [
        'no_command',
        'unknown_command',
        'looks_like_code',
        'missing_pseudonym',
        'invalid_pseudonym',
        'invalid_digest',
        'missing_url',
        'unknown_flag',
        'extra_argument',
      ] as const;
      for (const code of codes) {
        expect(typeof CLI_ARG_MESSAGES[code]).toBe('string');
        expect(CLI_ARG_MESSAGES[code].length).toBeGreaterThan(0);
      }
    });
  });

  describe('USAGE', () => {
    it('documents the npm invocation, not a bare node invocation', () => {
      expect(USAGE).toContain('npm run codes -- issue <pseudonym>');
      expect(USAGE).not.toContain('node scripts/organizer-codes');
    });

    it('documents set-intake', () => {
      expect(USAGE).toContain('set-intake <signal-url>');
    });

    it('states the never-an-argument rule', () => {
      expect(USAGE).toContain('never accepted as arguments');
    });
  });

  describe('parseEnv', () => {
    it('accepts a fully configured environment and defaults the region', () => {
      expect(parseEnv(fullEnv)).toEqual({
        ok: true,
        value: {
          pepper: 'pepper-value',
          token: 'token-value',
          siteId: 'site-value',
          region: 'us-east-1',
        },
      });
    });

    it('honours an explicit region', () => {
      const result = parseEnv({ ...fullEnv, NETLIFY_BLOBS_REGION: 'us-west-2' });
      expect(result.ok && result.value.region).toBe('us-west-2');
    });

    it('fails closed on each missing secret, in order', () => {
      expect(parseEnv({})).toEqual({ ok: false, code: 'missing_pepper' });
      expect(parseEnv({ ...fullEnv, ORGANIZER_CODE_PEPPER: '   ' })).toEqual({
        ok: false,
        code: 'missing_pepper',
      });
      expect(parseEnv({ ...fullEnv, NETLIFY_AUTH_TOKEN: '' })).toEqual({
        ok: false,
        code: 'missing_token',
      });
      expect(parseEnv({ ...fullEnv, NETLIFY_SITE_ID: '' })).toEqual({
        ok: false,
        code: 'missing_site_id',
      });
    });

    it('has a message for every environment error code', () => {
      for (const code of ['missing_pepper', 'missing_token', 'missing_site_id'] as const) {
        expect(ENV_MESSAGES[code].length).toBeGreaterThan(0);
      }
      expect(ENV_MESSAGES.missing_token).toContain('Refusing to fall back');
    });
  });

  describe('buildBlobsContext', () => {
    it('encodes the site id, token, and region as base64 JSON', () => {
      const encoded = buildBlobsContext({
        pepper: 'p',
        token: 't',
        siteId: 's',
        region: 'us-east-1',
      });
      expect(JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))).toEqual({
        siteID: 's',
        token: 't',
        primaryRegion: 'us-east-1',
      });
    });

    it('never encodes the pepper', () => {
      const encoded = buildBlobsContext({
        pepper: 'super-secret-pepper',
        token: 't',
        siteId: 's',
        region: 'us-east-1',
      });
      expect(Buffer.from(encoded, 'base64').toString('utf-8')).not.toContain('super-secret-pepper');
    });
  });

  describe('canaryDigest and decideCanary', () => {
    it('digests the fixed canary subject with the given pepper', () => {
      expect(CANARY_SUBJECT).toBe('deflocksc-canary');
      expect(CANARY_KEY).toBe('pepper-canary');
      expect(canaryDigest('pepper-value')).toBe(digestCode(CANARY_SUBJECT, 'pepper-value'));
    });

    it('writes the canary the first time, for either strictness', () => {
      for (const strict of [true, false]) {
        const decision = decideCanary(null, 'expected-digest', strict);
        expect(decision.action).toBe('write');
        if (decision.action === 'write') {
          expect(decision.value).toBe('expected-digest');
          expect(decision.note).toContain('pepper-canary');
        }
      }
      expect(decideCanary(undefined, 'expected-digest', true).action).toBe('write');
    });

    it('accepts a matching canary', () => {
      expect(decideCanary('same', 'same', true)).toEqual({ action: 'accept' });
      expect(decideCanary('same', 'same', false)).toEqual({ action: 'accept' });
    });

    it('refuses a mismatch when strict and only warns when not', () => {
      const strict = decideCanary('stored', 'expected', true);
      expect(strict.action).toBe('refuse');
      const lenient = decideCanary('stored', 'expected', false);
      expect(lenient.action).toBe('warn');
      if (strict.action === 'refuse' && lenient.action === 'warn') {
        expect(strict.message).toBe(lenient.message);
        expect(strict.message).toContain('ORGANIZER_CODE_PEPPER');
      }
    });

    it('never puts either digest into the mismatch message', () => {
      const decision = decideCanary('stored-digest-value', 'expected-digest-value', true);
      expect(decision.action).toBe('refuse');
      if (decision.action === 'refuse') {
        expect(decision.message).not.toContain('stored-digest-value');
        expect(decision.message).not.toContain('expected-digest-value');
      }
    });
  });

  describe('record shapes', () => {
    it('buildCodeRecord emits exactly the three stored fields', () => {
      const record = buildCodeRecord('handle-jay', '2026-08-17T14:22:00Z');
      expect(record).toEqual({
        pseudonym: 'handle-jay',
        issuedAt: '2026-08-17T14:22:00Z',
        revoked: false,
      });
      expect(Object.keys(record).sort()).toEqual(['issuedAt', 'pseudonym', 'revoked']);
    });

    it('revokeRecord rebuilds the record with revoked flipped, dropping stray fields', () => {
      expect(revokeRecord({ ...rows[0], revoked: false })).toEqual({
        pseudonym: 'handle-jay',
        issuedAt: '2026-08-17T14:22:00Z',
        revoked: true,
      });
    });

    it('toListRow tolerates a malformed stored record', () => {
      expect(toListRow('d'.repeat(64), { pseudonym: 'pier', issuedAt: '2026-01-01T00:00:00Z' })).toEqual(
        { digest: 'd'.repeat(64), pseudonym: 'pier', issuedAt: '2026-01-01T00:00:00Z', revoked: false },
      );
      expect(toListRow('e'.repeat(64), null)).toEqual({
        digest: 'e'.repeat(64),
        pseudonym: '(unknown)',
        issuedAt: '',
        revoked: false,
      });
      expect(toListRow('f'.repeat(64), { pseudonym: 42, revoked: 'yes' })).toEqual({
        digest: 'f'.repeat(64),
        pseudonym: '(unknown)',
        issuedAt: '',
        revoked: false,
      });
    });

    it('shouldTombstone matches on codeDigest and skips already-tombstoned events', () => {
      expect(shouldTombstone({ codeDigest: 'x', revoked: false }, 'x')).toBe(true);
      expect(shouldTombstone({ codeDigest: 'x' }, 'x')).toBe(true);
      expect(shouldTombstone({ codeDigest: 'x', revoked: true }, 'x')).toBe(false);
      expect(shouldTombstone({ codeDigest: 'y' }, 'x')).toBe(false);
      expect(shouldTombstone(null, 'x')).toBe(false);
    });

    it('tombstoneEvent preserves the event record and sets revoked', () => {
      expect(tombstoneEvent({ id: 'ab12cd34', title: 'Meeting', codeDigest: 'x' })).toEqual({
        id: 'ab12cd34',
        title: 'Meeting',
        codeDigest: 'x',
        revoked: true,
      });
    });
  });

  describe('selectRevocationTarget', () => {
    const many = [
      rows[0],
      { digest: 'c'.repeat(64), pseudonym: 'handle-jay', issuedAt: '2026-08-01T00:00:00Z', revoked: false },
    ];

    it('finds a single match by pseudonym', () => {
      expect(selectRevocationTarget(rows, 'pier', null)).toEqual({ kind: 'one', row: rows[1] });
    });

    it('reports no match', () => {
      expect(selectRevocationTarget(rows, 'nobody', null)).toEqual({ kind: 'none' });
    });

    it('reports ambiguity when one pseudonym holds several codes', () => {
      const selection = selectRevocationTarget(many, 'handle-jay', null);
      expect(selection.kind).toBe('many');
      if (selection.kind === 'many') expect(selection.rows).toHaveLength(2);
    });

    it('disambiguates with an explicit digest', () => {
      expect(selectRevocationTarget(many, 'handle-jay', 'c'.repeat(64))).toEqual({
        kind: 'one',
        row: many[1],
      });
    });

    it('treats a digest that belongs to another pseudonym as no match', () => {
      expect(selectRevocationTarget(rows, 'pier', 'a'.repeat(64))).toEqual({ kind: 'none' });
    });
  });

  describe('formatListTable', () => {
    it('prints pseudonym, issue date, and revoked state', () => {
      const table = formatListTable(rows);
      expect(table).toContain('PSEUDONYM');
      expect(table).toContain('handle-jay');
      expect(table).toContain('2026-08-17');
      expect(table).toContain('pier');
      expect(table).toContain('2026-07-02');
    });

    it('sorts oldest first', () => {
      const table = formatListTable(rows);
      expect(table.indexOf('pier')).toBeLessThan(table.indexOf('handle-jay'));
    });

    it('never leaks a digest', () => {
      const table = formatListTable(rows);
      expect(table).not.toContain('a'.repeat(64));
      expect(table).not.toContain('b'.repeat(64));
      expect(table).not.toContain('aaaaaaaa');
    });

    it('handles an empty store', () => {
      expect(formatListTable([])).toBe('No codes issued.');
    });
  });

  describe('toListJson', () => {
    it('emits exactly the four allowlisted fields', () => {
      const parsedJson = JSON.parse(toListJson(rows)) as Record<string, unknown>[];
      expect(parsedJson).toHaveLength(2);
      for (const row of parsedJson) {
        expect(Object.keys(row).sort()).toEqual(['digest', 'issuedAt', 'pseudonym', 'revoked']);
      }
    });

    it('drops any extra field present on the input record', () => {
      const withExtra = [{ ...rows[0], secretNote: 'do not publish' } as never];
      expect(toListJson(withExtra)).not.toContain('secretNote');
    });
  });

  describe('the remaining output formatters', () => {
    it('formatIssueBanner shows the code once and says so', () => {
      const banner = formatIssueBanner('handle-jay', 'drum-yoga-vivid-clay');
      expect(banner).toContain('handle-jay');
      expect(banner).toContain('drum-yoga-vivid-clay');
      expect(banner).toContain('only time it is shown');
      expect(banner.split('drum-yoga-vivid-clay')).toHaveLength(2);
    });

    it('formatRevokeSummary truncates the digest and counts the cascade', () => {
      const summary = formatRevokeSummary('pier', 'b'.repeat(64), 3);
      expect(summary).toContain('Revoked pier');
      expect(summary).toContain('Tombstoned 3 event(s)');
      expect(summary).not.toContain('b'.repeat(64));
    });

    it('formatFoldReminder names the workflow', () => {
      expect(FOLD_WORKFLOW).toBe('fold-events.yml');
      expect(formatFoldReminder()).toContain(`gh workflow run ${FOLD_WORKFLOW}`);
    });

    it('formatAmbiguousRevoke lists each digest with its issue date', () => {
      const text = formatAmbiguousRevoke('handle-jay', rows);
      expect(text).toContain('--digest');
      expect(text).toContain('a'.repeat(64));
      expect(text).toContain('2026-08-17');
    });

    it('formatNoCodeFound names the pseudonym', () => {
      expect(formatNoCodeFound('ghost')).toContain('"ghost"');
    });
  });

  describe('intake formatters', () => {
    it('formatIntakeStatus reports set/not set and never a URL', () => {
      expect(formatIntakeStatus(true)).toContain('set');
      expect(formatIntakeStatus(false)).toContain('not set');
      expect(formatIntakeStatus(true)).not.toContain('signal.group');
      expect(formatIntakeStatus(true)).not.toContain('http');
    });

    it('formatIntakeUpdated confirms without echoing the URL', () => {
      const text = formatIntakeUpdated();
      expect(text).toContain('Intake link updated');
      expect(text).not.toContain('signal.group');
    });

    it('formatBadIntakeUrl names the validation code but not a raw URL', () => {
      const text = formatBadIntakeUrl('bad_protocol');
      expect(text).toContain('bad_protocol');
      expect(text).toContain('signal.group');
    });
  });

  describe('parseFoldAnswer', () => {
    it('treats only y and yes as consent', () => {
      expect(parseFoldAnswer('y')).toBe(true);
      expect(parseFoldAnswer(' YES ')).toBe(true);
      expect(parseFoldAnswer('')).toBe(false);
      expect(parseFoldAnswer('n')).toBe(false);
      expect(parseFoldAnswer('yep')).toBe(false);
    });
  });

  describe('checkWordlistChecksum', () => {
    const hash = '9'.repeat(64);

    it('accepts a matching sha256sum-format record', () => {
      expect(checkWordlistChecksum(hash, `${hash}  eff-short-wordlist-2.txt\n`)).toEqual({
        ok: true,
        value: hash,
      });
    });

    it('rejects a mismatch', () => {
      expect(checkWordlistChecksum('8'.repeat(64), `${hash}  eff-short-wordlist-2.txt\n`)).toEqual({
        ok: false,
        code: 'mismatch',
      });
    });

    it('rejects a malformed or misnamed record', () => {
      expect(checkWordlistChecksum(hash, hash)).toEqual({ ok: false, code: 'bad_record' });
      expect(checkWordlistChecksum(hash, `nothex  eff-short-wordlist-2.txt\n`)).toEqual({
        ok: false,
        code: 'bad_record',
      });
      expect(checkWordlistChecksum(hash, `${hash}  some-other-list.txt\n`)).toEqual({
        ok: false,
        code: 'bad_record',
      });
    });
  });

  describe('parseWordlist', () => {
    it('accepts a well-formed 1296-entry list', () => {
      const result = parseWordlist(syntheticWordlist());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(WORDLIST_SIZE);
        expect(result.value[0]).toBe('aaaword');
      }
    });

    it('tolerates CRLF line endings and a trailing blank line', () => {
      const crlf = syntheticWordlist().replace(/\n/g, '\r\n') + '\r\n';
      expect(parseWordlist(crlf).ok).toBe(true);
    });

    it('rejects the wrong entry count', () => {
      expect(parseWordlist(syntheticWordlist(10))).toEqual({ ok: false, code: 'bad_count' });
    });

    it('rejects a line without a tab separator', () => {
      expect(parseWordlist('1111 aardvark\n')).toEqual({ ok: false, code: 'bad_line' });
    });

    it('rejects a dice column that is not four digits 1-6', () => {
      expect(parseWordlist('1117\taardvark\n')).toEqual({ ok: false, code: 'bad_line' });
      expect(parseWordlist('111\taardvark\n')).toEqual({ ok: false, code: 'bad_line' });
    });

    it('rejects a non-lowercase-ascii word', () => {
      expect(parseWordlist('1111\tAardvark\n')).toEqual({ ok: false, code: 'bad_word' });
      expect(parseWordlist('1111\tab\n')).toEqual({ ok: false, code: 'bad_word' });
    });

    it('rejects duplicate words and duplicate three-character prefixes', () => {
      expect(parseWordlist('1111\taardvark\n1112\taardvark\n')).toEqual({
        ok: false,
        code: 'duplicate_word',
      });
      expect(parseWordlist('1111\taardvark\n1112\taardwolf\n')).toEqual({
        ok: false,
        code: 'duplicate_prefix',
      });
    });
  });
  ```

  Run it:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npx vitest run src/lib/organizer-cli.test.ts
  ```

  Expected failure — the module does not exist yet:

  ```
  Error: Failed to load url ./organizer-cli.js (resolved id: ./organizer-cli.js) in src/lib/organizer-cli.test.ts. Does the file exist?
  ```

- [ ] **Step 2: Implement the pure half — constants, argument parsing, environment**

  Create `src/lib/organizer-cli.ts` with this content. Step 3 appends the rest of the file; do not run the test until both halves are in place.

  ```ts
  /**
   * The pure half of the organizer-codes CLI.
   *
   * `scripts/organizer-codes.ts` is a thin shell that does I/O and sets exit
   * codes; every decision it makes lives here as a pure function, which is the
   * only reason any of it is testable. Nothing in this file touches the network,
   * the filesystem, `process`, `console`, or the clock — callers pass in the
   * environment object, the file contents, and the timestamp.
   *
   * Three rules from the design are enforced here:
   *
   *   1. A plaintext organizer code must never appear in argv (it would land in
   *      shell history), so anything that looks like one is rejected before the
   *      subcommand is even identified. `set-intake` is the one subcommand whose
   *      argument is a URL rather than a code, so it is handled ahead of that
   *      scan (a signal.group URL would false-positive it).
   *   2. Missing credentials are a hard failure, never a fallback: a code issued
   *      into a local development store looks like success and fails in
   *      production.
   *   3. Anything that leaves the process is an explicit field projection, never
   *      a spread of a stored record, for the same reason toPublicEvent() is.
   */
  import { ok, err, type Ok, type Err } from './text-result.js';
  import { digestCode } from './organizer-code.js';

  /** HMAC subject for the pepper canary. Already in normalized form (lowercase a-z plus hyphens). */
  export const CANARY_SUBJECT = 'deflocksc-canary';

  /** Key the canary lives under in the `meta` Blobs store. */
  export const CANARY_KEY = 'pepper-canary';

  /** EFF Short Wordlist #2 is exactly 1296 entries (6^4). */
  export const WORDLIST_SIZE = 1296;

  /** Filename of the GitHub Actions workflow that rebakes /events. */
  export const FOLD_WORKFLOW = 'fold-events.yml';

  /** Repo-relative paths to the committed wordlist, resolved by the shell against cwd. */
  export const WORDLIST_TXT_REL = 'scripts/data/eff-short-wordlist-2.txt';
  export const WORDLIST_SHA_REL = 'scripts/data/eff-short-wordlist-2.sha256';

  const DIGEST_RE = /^[0-9a-f]{64}$/;
  const SEGMENT_RE = /^[a-z0-9]+$/;
  const WORD_RE = /^[a-z]+$/;
  const DICE_RE = /^[1-6]{4}$/;
  const NON_LETTER_RE = /[^a-z]+/;

  export const USAGE = `organizer-codes — issue, revoke, list codes and set the intake link

  Usage:
    npm run codes -- list [--json]
    npm run codes -- issue <pseudonym> [--clip]
    npm run codes -- revoke <pseudonym> [--digest <64-hex>] [--fold|--no-fold]
    npm run codes -- set-intake <signal-url>

  Arguments:
    <pseudonym>   2-40 chars, lowercase a-z0-9, at most three hyphen-separated
                  segments (for example: handle-jay). Never a real name.
    <signal-url>  the https://signal.group/#... invite that /go/intake redirects to.

  Flags:
    --clip        copy the freshly issued code to the clipboard
    --json        machine-readable list output, for the offline backup
    --digest      disambiguate when one pseudonym holds more than one code
    --fold        trigger the fold without prompting
    --no-fold     skip the fold prompt entirely

  Codes are never accepted as arguments — they would land in your shell history.
  Requires ORGANIZER_CODE_PEPPER, NETLIFY_AUTH_TOKEN, and NETLIFY_SITE_ID in .env.

  The npm script bundles this CLI with esbuild before running it. Plain
  \`node scripts/organizer-codes.ts\` does not work: Node's type stripping will not
  resolve this repo's './x.js' imports to x.ts.
  `;

  // --- argument parsing --------------------------------------------------------

  export type FoldMode = 'prompt' | 'yes' | 'no';

  export type CliCommand =
    | { name: 'issue'; pseudonym: string; clip: boolean }
    | { name: 'revoke'; pseudonym: string; digest: string | null; fold: FoldMode }
    | { name: 'list'; json: boolean }
    | { name: 'set-intake'; signalUrl: string };

  export type CliArgCode =
    | 'no_command'
    | 'unknown_command'
    | 'looks_like_code'
    | 'missing_pseudonym'
    | 'invalid_pseudonym'
    | 'invalid_digest'
    | 'missing_url'
    | 'unknown_flag'
    | 'extra_argument';

  export const CLI_ARG_MESSAGES: Record<CliArgCode, string> = {
    no_command: 'no subcommand given.',
    unknown_command: 'unknown subcommand. Expected issue, revoke, list, or set-intake.',
    looks_like_code:
      'refusing to run: an argument looks like an organizer code. Codes are never passed on the command line — they would land in your shell history. Pass the pseudonym instead.',
    missing_pseudonym: 'missing pseudonym.',
    invalid_pseudonym:
      'invalid pseudonym. Use 2-40 characters, lowercase a-z and 0-9, at most three hyphen-separated segments (for example: handle-jay).',
    invalid_digest: '--digest requires a 64-character lowercase hex value.',
    missing_url: 'set-intake requires a Signal group URL argument.',
    unknown_flag: 'unknown flag.',
    extra_argument: 'unexpected extra argument.',
  };

  /**
   * True when a string plausibly is a four-word organizer code.
   *
   * Deliberately loose: it counts runs of a-z after lowercasing, so
   * "Drum Yoga Vivid Clay", "drum-yoga-vivid-clay", and "drum2yoga.vivid_clay"
   * all trip it. A 64-char hex digest is exempted first, because stripping its
   * digits would otherwise leave four-plus letter runs.
   */
  export function looksLikeCode(value: string): boolean {
    const trimmed = value.trim();
    if (DIGEST_RE.test(trimmed)) return false;
    const tokens = trimmed
      .toLowerCase()
      .split(NON_LETTER_RE)
      .filter((token) => token.length > 0);
    return tokens.length >= 4;
  }

  /**
   * Pseudonym shape. Capped at three hyphen-separated segments, which is also
   * what keeps a four-word code from being mistaken for a pseudonym.
   */
  export function isValidPseudonym(value: string): boolean {
    if (value.length < 2 || value.length > 40) return false;
    const parts = value.split('-');
    if (parts.length > 3) return false;
    return parts.every((part) => part.length > 0 && SEGMENT_RE.test(part));
  }

  export function parseCliArgs(argv: readonly string[]): Ok<CliCommand> | Err<CliArgCode> {
    const name = argv[0];
    if (name === undefined) return err('no_command');

    // set-intake carries a Signal URL argument, not a secret code. A signal.group
    // URL has four-plus letter runs and would trip the looksLikeCode scan below,
    // so it is handled before the scan. The URL itself is validated by
    // validateSignalUrl in the shell, never here.
    if (name === 'set-intake') {
      const rest = argv.slice(1);
      if (rest.length === 0) return err('missing_url');
      if (rest.length > 1) return err('extra_argument');
      return ok({ name: 'set-intake', signalUrl: rest[0] });
    }

    // A plaintext organizer code in argv is fatal for every other subcommand,
    // decided before the subcommand itself is validated.
    for (const raw of argv) {
      if (looksLikeCode(raw)) return err('looks_like_code');
    }

    const rest = argv.slice(1);

    if (name === 'issue') {
      let pseudonym: string | null = null;
      let clip = false;
      for (const arg of rest) {
        if (arg === '--clip') {
          clip = true;
          continue;
        }
        if (arg.startsWith('--')) return err('unknown_flag');
        if (pseudonym !== null) return err('extra_argument');
        pseudonym = arg;
      }
      if (pseudonym === null) return err('missing_pseudonym');
      if (!isValidPseudonym(pseudonym)) return err('invalid_pseudonym');
      return ok({ name: 'issue', pseudonym, clip });
    }

    if (name === 'revoke') {
      let pseudonym: string | null = null;
      let digest: string | null = null;
      let fold: FoldMode = 'prompt';
      for (let i = 0; i < rest.length; i += 1) {
        const arg = rest[i];
        if (arg === '--fold') {
          fold = 'yes';
          continue;
        }
        if (arg === '--no-fold') {
          fold = 'no';
          continue;
        }
        if (arg === '--digest') {
          const value = rest[i + 1];
          if (value === undefined || !DIGEST_RE.test(value)) return err('invalid_digest');
          digest = value;
          i += 1;
          continue;
        }
        if (arg.startsWith('--')) return err('unknown_flag');
        if (pseudonym !== null) return err('extra_argument');
        pseudonym = arg;
      }
      if (pseudonym === null) return err('missing_pseudonym');
      if (!isValidPseudonym(pseudonym)) return err('invalid_pseudonym');
      return ok({ name: 'revoke', pseudonym, digest, fold });
    }

    if (name === 'list') {
      let json = false;
      for (const arg of rest) {
        if (arg === '--json') {
          json = true;
          continue;
        }
        return err(arg.startsWith('--') ? 'unknown_flag' : 'extra_argument');
      }
      return ok({ name: 'list', json });
    }

    return err('unknown_command');
  }

  // --- environment -------------------------------------------------------------

  export type EnvCode = 'missing_pepper' | 'missing_token' | 'missing_site_id';

  export const ENV_MESSAGES: Record<EnvCode, string> = {
    missing_pepper:
      'ORGANIZER_CODE_PEPPER is not set. Put it in .env (see .env.example). It must be byte-identical to the Functions-scoped, production-context value in the Netlify UI, or every code you issue will fail to validate.',
    missing_token:
      'NETLIFY_AUTH_TOKEN is not set. Create a personal access token at https://app.netlify.com/user/applications and put it in .env. Refusing to fall back to a local Blobs store — a code issued there would look like success and fail in production.',
    missing_site_id:
      'NETLIFY_SITE_ID is not set. Find it under Site configuration -> General -> Site information -> Site ID, and put it in .env.',
  };

  export interface CliEnv {
    pepper: string;
    token: string;
    siteId: string;
    region: string;
  }

  /**
   * Validate the three required secrets. Pure: the shell hands in a plain object
   * so the fail-closed behaviour is unit tested rather than shell-tested.
   */
  export function parseEnv(
    env: Readonly<Record<string, string | undefined>>,
  ): Ok<CliEnv> | Err<EnvCode> {
    const pepper = (env.ORGANIZER_CODE_PEPPER ?? '').trim();
    if (pepper.length === 0) return err('missing_pepper');

    const token = (env.NETLIFY_AUTH_TOKEN ?? '').trim();
    if (token.length === 0) return err('missing_token');

    const siteId = (env.NETLIFY_SITE_ID ?? '').trim();
    if (siteId.length === 0) return err('missing_site_id');

    const region = (env.NETLIFY_BLOBS_REGION ?? '').trim() || 'us-east-1';
    return ok({ pepper, token, siteId, region });
  }

  /**
   * @netlify/blobs takes its credentials from NETLIFY_BLOBS_CONTEXT when it is not
   * running inside a Netlify deploy. Building the value here lets blob-stores.ts
   * keep its zero-argument factory signature, shared with the functions. The
   * pepper is deliberately absent: it never leaves this process.
   */
  export function buildBlobsContext(env: CliEnv): string {
    return Buffer.from(
      JSON.stringify({ siteID: env.siteId, token: env.token, primaryRegion: env.region }),
      'utf-8',
    ).toString('base64');
  }
  ```

- [ ] **Step 3: Finish the pure half — canary, record shapes, formatting, wordlist**

  Append this to the end of `src/lib/organizer-cli.ts`:

  ```ts
  // --- the pepper canary -------------------------------------------------------

  export const CANARY_MISMATCH_MESSAGE =
    'pepper canary mismatch. ORGANIZER_CODE_PEPPER does not match the pepper that issued the existing codes. Fix .env to match the Netlify Functions-scoped production value before issuing anything.';

  export type CanaryDecision =
    | { action: 'write'; value: string; note: string }
    | { action: 'accept' }
    | { action: 'refuse'; message: string }
    | { action: 'warn'; message: string };

  /** The digest the canary key should hold for a given pepper. */
  export function canaryDigest(pepper: string): string {
    return digestCode(CANARY_SUBJECT, pepper);
  }

  /**
   * The canary decision, as a pure function of what is stored and what is
   * expected. The CLI reads ORGANIZER_CODE_PEPPER from .env; production reads it
   * from a Functions-scoped Netlify variable. If those diverge, every newly
   * issued code fails validation and nothing announces it.
   *
   * `issue` is strict: a mismatch means the code would be born dead, so refuse.
   * `revoke` only warns: a revocation is a takedown, and it must still work even
   * when the local pepper is wrong.
   *
   * Neither digest appears in the message. A digest is one-way, but there is no
   * reason to put one on a maintainer's terminal.
   */
  export function decideCanary(
    stored: string | null | undefined,
    expected: string,
    strict: boolean,
  ): CanaryDecision {
    if (stored === null || stored === undefined || stored.length === 0) {
      return {
        action: 'write',
        value: expected,
        note: `note: wrote the pepper canary for the first time (meta/${CANARY_KEY}).\n`,
      };
    }
    if (stored === expected) return { action: 'accept' };
    return strict
      ? { action: 'refuse', message: CANARY_MISMATCH_MESSAGE }
      : { action: 'warn', message: CANARY_MISMATCH_MESSAGE };
  }

  // --- stored record shapes ----------------------------------------------------

  /** The full shape of a record in the `codes` store. Three fields, no more. */
  export interface CodeRecord {
    pseudonym: string;
    issuedAt: string;
    revoked: boolean;
  }

  export function buildCodeRecord(pseudonym: string, issuedAt: string): CodeRecord {
    return { pseudonym, issuedAt, revoked: false };
  }

  export interface ListRow {
    digest: string;
    pseudonym: string;
    issuedAt: string;
    revoked: boolean;
  }

  /** Defensive read of a stored code record into a row. A malformed blob must not crash `list`. */
  export function toListRow(digest: string, record: unknown): ListRow {
    const source =
      record !== null && typeof record === 'object' ? (record as Record<string, unknown>) : {};
    return {
      digest,
      pseudonym: typeof source.pseudonym === 'string' ? source.pseudonym : '(unknown)',
      issuedAt: typeof source.issuedAt === 'string' ? source.issuedAt : '',
      revoked: source.revoked === true,
    };
  }

  /**
   * Rebuild a code record with `revoked` set. Explicit reconstruction rather than
   * a spread: the `codes` store owns exactly three fields, and a stray field that
   * somehow got written should not be preserved by a revocation.
   */
  export function revokeRecord(row: ListRow): CodeRecord {
    return { pseudonym: row.pseudonym, issuedAt: row.issuedAt, revoked: true };
  }

  /** True when this event belongs to the revoked code and is not already tombstoned. */
  export function shouldTombstone(event: unknown, digest: string): boolean {
    if (event === null || typeof event !== 'object') return false;
    const source = event as Record<string, unknown>;
    return source.codeDigest === digest && source.revoked !== true;
  }

  /**
   * Flip one field on an event record. Unlike a code record, the event record's
   * shape is owned by the submit path, so this preserves it and spreads.
   */
  export function tombstoneEvent(event: Record<string, unknown>): Record<string, unknown> {
    return { ...event, revoked: true };
  }

  export type RevokeSelection =
    | { kind: 'one'; row: ListRow }
    | { kind: 'none' }
    | { kind: 'many'; rows: ListRow[] };

  export function selectRevocationTarget(
    rows: readonly ListRow[],
    pseudonym: string,
    digest: string | null,
  ): RevokeSelection {
    const matches = rows.filter(
      (row) => row.pseudonym === pseudonym && (digest === null || row.digest === digest),
    );
    if (matches.length === 0) return { kind: 'none' };
    if (matches.length === 1) return { kind: 'one', row: matches[0] };
    return { kind: 'many', rows: matches };
  }

  // --- output formatting -------------------------------------------------------

  /**
   * Human-readable `list` output: pseudonym, issue date, revoked state. No
   * digest column — the terminal is the least controlled place a digest can end
   * up, and nothing in the day-to-day workflow needs it. No code column either,
   * because the code is not stored and could not be printed even by mistake.
   */
  export function formatListTable(rows: readonly ListRow[]): string {
    if (rows.length === 0) return 'No codes issued.';
    const sorted = [...rows].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
    const width = Math.max(9, ...sorted.map((row) => row.pseudonym.length));
    const header = `${'PSEUDONYM'.padEnd(width)}  ${'ISSUED'.padEnd(10)}  REVOKED`;
    const lines = sorted.map(
      (row) =>
        `${row.pseudonym.padEnd(width)}  ${row.issuedAt.slice(0, 10).padEnd(10)}  ${row.revoked ? 'yes' : 'no'}`,
    );
    return [header, ...lines].join('\n');
  }

  /**
   * `list --json` output, used for the offline backup of the codes store (§5:
   * the codes store has no backup and a delete there is unrecoverable). The
   * digest is included here — and only here — because without it the backup
   * cannot restore anything. It is a one-way value, not a code.
   *
   * Explicit projection, not a spread: an extra field added to the stored record
   * later must not silently start appearing in a file the maintainer keeps.
   */
  export function toListJson(rows: readonly ListRow[]): string {
    const projected = rows.map((row) => ({
      digest: row.digest,
      pseudonym: row.pseudonym,
      issuedAt: row.issuedAt,
      revoked: row.revoked,
    }));
    return JSON.stringify(projected, null, 2) + '\n';
  }

  /** The one and only time a plaintext code is rendered anywhere. */
  export function formatIssueBanner(pseudonym: string, code: string): string {
    return [
      '',
      `  Code for ${pseudonym}:`,
      '',
      `      ${code}`,
      '',
      '  This is the only time it is shown. It is not stored, not logged, and',
      '  cannot be recovered — only revoked and reissued. Hand it over out of',
      '  band, then clear your scrollback.',
      '',
      '',
    ].join('\n');
  }

  export function formatRevokeSummary(
    pseudonym: string,
    digest: string,
    tombstoned: number,
  ): string {
    return `Revoked ${pseudonym} (${digest.slice(0, 8)}...). Tombstoned ${tombstoned} event(s).\n`;
  }

  export function formatFoldReminder(): string {
    return (
      'The overlay is already correct. The baked /events page still lists the tombstoned events until the next fold. Run the fold when you are ready:\n' +
      `  gh workflow run ${FOLD_WORKFLOW}\n`
    );
  }

  export function formatAmbiguousRevoke(pseudonym: string, rows: readonly ListRow[]): string {
    const lines = rows.map(
      (row) => `  ${row.digest}  issued ${row.issuedAt.slice(0, 10)}  revoked=${row.revoked}`,
    );
    return [
      `${rows.length} codes are issued to "${pseudonym}". Re-run with --digest <one of>:`,
      ...lines,
      '',
    ].join('\n');
  }

  export function formatNoCodeFound(pseudonym: string): string {
    return `no code found for pseudonym "${pseudonym}"`;
  }

  // --- intake link (design §9) -------------------------------------------------

  /**
   * Whether the /go/intake redirect currently has a stored target. `list` reports
   * this so a maintainer can confirm the link is configured. It never prints the
   * URL itself — the whole point of /go/intake is that the invite is absent from
   * markup, the search index, and scrollback.
   */
  export function formatIntakeStatus(isSet: boolean): string {
    return `Intake link: ${isSet ? 'set' : 'not set'}\n`;
  }

  /** Confirmation after set-intake writes links/intake. Never echoes the URL. */
  export function formatIntakeUpdated(): string {
    return 'Intake link updated. It is served only through /go/intake and never appears in page markup.\n';
  }

  /**
   * Refusal when a set-intake URL fails Signal-link validation. `code` is the
   * machine-readable SignalUrlCode from validateSignalUrl; the offending URL is
   * not echoed back.
   */
  export function formatBadIntakeUrl(code: string): string {
    return `refusing to set intake: the URL failed Signal-link validation (${code}). It must be an https://signal.group/#... invite.`;
  }

  /** Only an explicit y/yes triggers the fold. Anything else, including EOF, does not. */
  export function parseFoldAnswer(answer: string): boolean {
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  // --- wordlist ----------------------------------------------------------------

  export type ChecksumCode = 'bad_record' | 'mismatch';

  /** Compare a freshly computed hash against the committed sha256sum-format record. */
  export function checkWordlistChecksum(
    actualHex: string,
    record: string,
  ): Ok<string> | Err<ChecksumCode> {
    const fields = record.trim().split(/\s+/);
    if (fields.length < 2) return err('bad_record');
    const [recorded, name] = fields;
    if (!DIGEST_RE.test(recorded)) return err('bad_record');
    if (!name.endsWith('eff-short-wordlist-2.txt')) return err('bad_record');
    if (recorded !== actualHex.toLowerCase()) return err('mismatch');
    return ok(recorded);
  }

  export type WordlistCode =
    | 'bad_line'
    | 'bad_word'
    | 'duplicate_word'
    | 'duplicate_prefix'
    | 'bad_count';

  /**
   * Parse and structurally validate an EFF short wordlist file.
   *
   * Format: 1296 lines of "<4 dice digits>\t<word>". The structural rules below
   * are documented properties of EFF Short Wordlist #2, so passing them is
   * evidence the right file was downloaded — not just an intact one.
   */
  export function parseWordlist(text: string): Ok<string[]> | Err<WordlistCode> {
    const lines = text
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    const words: string[] = [];
    const seenWords = new Set<string>();
    const seenPrefixes = new Set<string>();

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length !== 2) return err('bad_line');
      const [dice, word] = parts;
      if (!DICE_RE.test(dice)) return err('bad_line');
      if (!WORD_RE.test(word) || word.length < 3 || word.length > 15) return err('bad_word');
      if (seenWords.has(word)) return err('duplicate_word');
      const prefix = word.slice(0, 3);
      if (seenPrefixes.has(prefix)) return err('duplicate_prefix');
      seenWords.add(word);
      seenPrefixes.add(prefix);
      words.push(word);
    }

    if (words.length !== WORDLIST_SIZE) return err('bad_count');
    return ok(words);
  }
  ```

  Run the test again:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npx vitest run src/lib/organizer-cli.test.ts
  ```

  Expected: `Test Files  1 passed (1)`, every assertion green.

  Commit:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && git add src/lib/organizer-cli.ts src/lib/organizer-cli.test.ts && git commit -m "feat(events): pure half of the organizer-codes CLI"
  ```

- [ ] **Step 4: Write the failing wordlist integrity test**

  This test guards the committed wordlist file against silent drift: a checksum recorded at download time, plus the structural invariants re-checked from the real bytes.

  Create `src/lib/wordlist-file.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { createHash } from 'node:crypto';
  import { dirname, join } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { checkWordlistChecksum, parseWordlist, WORDLIST_SIZE } from './organizer-cli.js';

  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'data');
  const wordlistPath = join(dataDir, 'eff-short-wordlist-2.txt');
  const checksumPath = join(dataDir, 'eff-short-wordlist-2.sha256');

  describe('committed EFF short wordlist #2', () => {
    it('matches the recorded sha256 checksum', () => {
      const bytes = readFileSync(wordlistPath);
      const actual = createHash('sha256').update(bytes).digest('hex');
      const record = readFileSync(checksumPath, 'utf-8');
      expect(checkWordlistChecksum(actual, record)).toEqual({ ok: true, value: actual });
    });

    it('names the wordlist file in the checksum record', () => {
      const record = readFileSync(checksumPath, 'utf-8').trim();
      expect(record).toContain('eff-short-wordlist-2.txt');
    });

    it('still satisfies every structural rule', () => {
      const result = parseWordlist(readFileSync(wordlistPath, 'utf-8'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(WORDLIST_SIZE);
        expect(result.value[0]).toBe('aardvark');
        expect(result.value[WORDLIST_SIZE - 1]).toBe('zucchini');
      }
    });

    it('uses LF line endings only', () => {
      expect(readFileSync(wordlistPath, 'utf-8')).not.toContain('\r');
    });
  });
  ```

  Run it:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npx vitest run src/lib/wordlist-file.test.ts
  ```

  Expected failure — the wordlist is not downloaded yet:

  ```
  Error: ENOENT: no such file or directory, open 'scripts\data\eff-short-wordlist-2.txt'
  ```

- [ ] **Step 5: Add the wordlist generator**

  Create `scripts/build-wordlist.ts` with exactly this content:

  ```ts
  #!/usr/bin/env node
  /**
   * Download, verify, and commit the EFF Short Wordlist #2.
   *
   * Source:  https://www.eff.org/files/2016/09/08/eff_short_wordlist_2_0.txt
   * Linked from https://www.eff.org/dice as "EFF's Short Wordlist #2".
   * Format:  1296 lines of "<4 dice digits>\t<word>", tab separated.
   *
   * The list is committed to the repo so code generation is auditable and so the
   * CLI never depends on a network fetch. This script exists so that fact is
   * reproducible: run it again and you should get a byte-identical file.
   *
   * Run:  npm run build-wordlist
   *
   * Like the codes CLI, this is bundled by esbuild before it runs, because Node's
   * type stripping cannot resolve this repo's './x.js' -> x.ts imports. All paths
   * are therefore resolved from process.cwd() (npm sets it to the repo root), not
   * from import.meta.url, which after bundling points into node_modules/.cache.
   *
   * If the URL 404s, find the current link on https://www.eff.org/dice, update
   * SOURCE_URL below and scripts/data/SOURCES.md, and re-run. Do not substitute a
   * different list: the whole point of #2 is unique 3-character prefixes and an
   * edit distance of at least 3, which is what survives being read aloud over a
   * bad phone line.
   */
  import { createHash } from 'node:crypto';
  import { mkdirSync, writeFileSync } from 'node:fs';
  import { dirname, join } from 'node:path';

  import {
    WORDLIST_SHA_REL,
    WORDLIST_SIZE,
    WORDLIST_TXT_REL,
    parseWordlist,
  } from '../src/lib/organizer-cli.js';

  const SOURCE_URL = 'https://www.eff.org/files/2016/09/08/eff_short_wordlist_2_0.txt';
  const PROJECT_ROOT = process.cwd();
  const TXT_PATH = join(PROJECT_ROOT, WORDLIST_TXT_REL);
  const SHA_PATH = join(PROJECT_ROOT, WORDLIST_SHA_REL);

  function die(message: string): never {
    process.stderr.write(`build-wordlist: ${message}\n`);
    process.exit(1);
  }

  /** Levenshtein distance, capped: returns min(distance, cap). */
  function distanceUpTo(a: string, b: string, cap: number): number {
    if (Math.abs(a.length - b.length) >= cap) return cap;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const row = new Array<number>(b.length + 1);
      row[0] = i;
      let best = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        if (row[j] < best) best = row[j];
      }
      if (best >= cap) return cap;
      prev = row;
    }
    return Math.min(prev[b.length], cap);
  }

  async function main(): Promise<void> {
    process.stdout.write(`Fetching ${SOURCE_URL}\n`);
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      die(
        `HTTP ${response.status} ${response.statusText}. Check https://www.eff.org/dice for the current link.`,
      );
    }

    // Normalize to LF and guarantee exactly one trailing newline, so the checksum
    // is stable across platforms and git's autocrlf settings.
    const normalized = (await response.text()).replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';

    const parsed = parseWordlist(normalized);
    if (!parsed.ok) {
      die(
        `downloaded file failed structural validation (${parsed.code}). Wrong file, or the format changed.`,
      );
    }
    const words = parsed.value;
    if (words.length !== WORDLIST_SIZE) die('unreachable: count changed after validation');
    process.stdout.write(
      `OK: ${words.length} words, all lowercase a-z, unique, unique 3-char prefixes.\n`,
    );

    // Advisory check. EFF documents an edit distance of at least 3 between words
    // in this list; a nonzero count here means you almost certainly downloaded a
    // different list. Not fatal, because the property is documented rather than
    // guaranteed, and the checks above are the ones that matter for correctness.
    let closePairs = 0;
    for (let i = 0; i < words.length; i += 1) {
      for (let j = i + 1; j < words.length; j += 1) {
        if (distanceUpTo(words[i], words[j], 3) < 3) closePairs += 1;
      }
    }
    process.stdout.write(`Edit-distance check: ${closePairs} pair(s) closer than 3 (expected 0).\n`);

    mkdirSync(dirname(TXT_PATH), { recursive: true });
    writeFileSync(TXT_PATH, normalized, 'utf-8');
    const digest = createHash('sha256').update(Buffer.from(normalized, 'utf-8')).digest('hex');
    writeFileSync(SHA_PATH, `${digest}  eff-short-wordlist-2.txt\n`, 'utf-8');

    process.stdout.write(`Wrote ${TXT_PATH}\n`);
    process.stdout.write(`Wrote ${SHA_PATH}\n`);
    process.stdout.write(`sha256 ${digest}\n`);
  }

  await main();
  ```

  Create `scripts/data/SOURCES.md` with exactly this content:

  ```markdown
  # Third-party data files in this directory

  ## `eff-short-wordlist-2.txt`

  - **What:** EFF's Short Wordlist #2 — 1296 words (6^4), each with a unique
    3-character prefix and an edit distance of at least 3 from every other word.
  - **Source URL:** <https://www.eff.org/files/2016/09/08/eff_short_wordlist_2_0.txt>
  - **Linked from:** <https://www.eff.org/dice> ("EFF's Short Wordlist #2")
  - **Format:** 1296 lines of `<4 dice digits>\t<word>`, tab separated, LF endings.
  - **Regenerate with:** `npm run build-wordlist`
  - **Integrity:** `eff-short-wordlist-2.sha256` holds a `sha256sum`-format record.
    `src/lib/wordlist-file.test.ts` re-checks the checksum and every structural
    rule on each test run, so a hand-edited or corrupted list fails CI.

  Used by `scripts/organizer-codes.ts` to generate 4-word organizer codes
  (1296^4 ~ 2^41.4). It is committed rather than fetched at runtime so code
  generation is auditable and reproducible, and so issuing a code never depends
  on eff.org being reachable.
  ```

- [ ] **Step 6: Add the npm scripts and generate the wordlist**

  Apply this diff to `package.json`. The `codes` line is exact and load-bearing: `esbuild` is already present in `node_modules/.bin` (transitively, via the Astro/Vite toolchain), so this adds no dependency. Plain `node` — including `node --experimental-strip-types` — cannot run either script, because Node does not remap this repo's relative `./x.js` specifiers to `x.ts`; esbuild does. `node_modules/.cache/` is already gitignored, so the build output needs no `.gitignore` change.

  ```diff
       "astro": "astro",
       "sync-data": "node scripts/sync-open-civics.mjs",
  +    "build-wordlist": "esbuild scripts/build-wordlist.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/build-wordlist.mjs && node node_modules/.cache/build-wordlist.mjs",
  +    "codes": "esbuild scripts/organizer-codes.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/organizer-codes.mjs && node node_modules/.cache/organizer-codes.mjs",
       "test": "vitest run",
       "test:watch": "vitest"
  ```

  Invoke the CLI as `npm run codes -- issue "handle-jay"`. The `--` matters: npm appends everything after it to the end of the script string, which is the `node` command.

  Run the generator:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run build-wordlist
  ```

  Expected output (the sha256 value will be whatever the real file hashes to — record it, do not invent it):

  ```
  Fetching https://www.eff.org/files/2016/09/08/eff_short_wordlist_2_0.txt
  OK: 1296 words, all lowercase a-z, unique, unique 3-char prefixes.
  Edit-distance check: 0 pair(s) closer than 3 (expected 0).
  Wrote scripts\data\eff-short-wordlist-2.txt
  Wrote scripts\data\eff-short-wordlist-2.sha256
  sha256 <64 hex characters>
  ```

  If you instead get `ERR_MODULE_NOT_FOUND` for `./text-result.js`, you ran `node scripts/build-wordlist.ts` directly rather than through `npm run build-wordlist`. That is exactly the failure the esbuild step exists to prevent.

  Now re-run the integrity test:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npx vitest run src/lib/wordlist-file.test.ts
  ```

  Expected: `Test Files  1 passed (1)`, 4 tests passed.

  Commit:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && git add scripts/build-wordlist.ts scripts/data/SOURCES.md scripts/data/eff-short-wordlist-2.txt scripts/data/eff-short-wordlist-2.sha256 src/lib/wordlist-file.test.ts package.json && git commit -m "feat(events): commit and checksum the EFF short wordlist #2"
  ```

- [ ] **Step 7: Write the shell — imports, helpers, subcommands**

  Create `scripts/organizer-codes.ts` with this content. Step 8 appends the entry point; the file is not runnable until both halves are in place.

  ```ts
  #!/usr/bin/env node
  /**
   * Organizer code CLI: issue / revoke / list / set-intake.
   *
   *   npm run codes -- list [--json]
   *   npm run codes -- issue <pseudonym> [--clip]
   *   npm run codes -- revoke <pseudonym> [--digest <64-hex>] [--fold|--no-fold]
   *   npm run codes -- set-intake <signal-url>
   *
   * This is the THIN SHELL. It reads the environment, wires stdin/stdout, talks to
   * Netlify Blobs, and sets exit codes. Every decision — argument parsing, the
   * canary check, the record shapes, all output text — lives in
   * src/lib/organizer-cli.ts, which is pure and unit tested.
   *
   * `npm run codes` bundles this file with esbuild and runs the bundle. Bare
   * `node scripts/organizer-codes.ts` does not work: Node's type stripping will
   * not resolve this repo's './x.js' imports to x.ts. Because the bundle lives in
   * node_modules/.cache, import.meta.url is useless for locating repo files — all
   * paths below are resolved from process.cwd(), which npm sets to the repo root.
   *
   * This writes to the PRODUCTION Netlify Blobs stores. There is no dry run and
   * no local fallback: a code issued into a local development store looks like
   * success and then fails in production, so a missing credential is a hard
   * error, never a fallback.
   *
   * Invariants this script must never break:
   *   - never write a plaintext code to a file
   *   - never log a plaintext code
   *   - never accept a code as a command-line argument
   *   - never print a code during `list`
   *   - never print the intake URL during `list`
   *   - never commit anything
   */
  import { createHash, randomInt } from 'node:crypto';
  import { spawnSync } from 'node:child_process';
  import { existsSync, readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { createInterface } from 'node:readline/promises';
  import { stderr, stdin, stdout } from 'node:process';

  import { type Store } from '@netlify/blobs';

  import * as cli from '../src/lib/organizer-cli.js';
  import { digestCode, generateCode, normalizeCode } from '../src/lib/organizer-code.js';
  import { validateSignalUrl } from '../src/lib/signal-url.js';
  import {
    ContextRefusedError,
    codesStore,
    eventsStore,
    linksStore,
    metaStore,
  } from '../src/lib/blob-stores.js';

  const PROJECT_ROOT = process.cwd();
  const WORDLIST_TXT = join(PROJECT_ROOT, cli.WORDLIST_TXT_REL);
  const WORDLIST_SHA = join(PROJECT_ROOT, cli.WORDLIST_SHA_REL);
  const FOLD_WORKFLOW_PATH = join(PROJECT_ROOT, '.github', 'workflows', cli.FOLD_WORKFLOW);
  const ENV_FILE = join(PROJECT_ROOT, '.env');

  function fail(message: string): never {
    stderr.write(`organizer-codes: ${message}\n`);
    process.exit(1);
  }

  function readWordlist(): string[] {
    if (!existsSync(WORDLIST_TXT)) {
      fail(`missing ${WORDLIST_TXT}. Run: npm run build-wordlist`);
    }
    const bytes = readFileSync(WORDLIST_TXT);
    const actual = createHash('sha256').update(bytes).digest('hex');
    const checked = cli.checkWordlistChecksum(actual, readFileSync(WORDLIST_SHA, 'utf-8'));
    if (!checked.ok) {
      fail(
        checked.code === 'mismatch'
          ? `wordlist checksum mismatch. The word source for every code you issue is not what was audited. Restore it with: git checkout -- ${cli.WORDLIST_TXT_REL}`
          : `${cli.WORDLIST_SHA_REL} is not a valid sha256sum record for the wordlist. Regenerate both with: npm run build-wordlist`,
      );
    }
    const list = cli.parseWordlist(bytes.toString('utf-8'));
    if (!list.ok) fail(`wordlist failed structural validation (${list.code})`);
    return list.value;
  }

  async function enforceCanary(pepper: string, strict: boolean): Promise<void> {
    const meta = metaStore();
    const stored = (await meta.get(cli.CANARY_KEY, { type: 'text' })) as string | null;
    const decision = cli.decideCanary(stored, cli.canaryDigest(pepper), strict);
    if (decision.action === 'write') {
      await meta.set(cli.CANARY_KEY, decision.value);
      stdout.write(decision.note);
      return;
    }
    if (decision.action === 'refuse') fail(decision.message);
    if (decision.action === 'warn') stderr.write(`organizer-codes: warning: ${decision.message}\n`);
  }

  function copyToClipboard(text: string): boolean {
    const platform = process.platform;
    const tool =
      platform === 'win32'
        ? { file: 'clip', args: [] as string[] }
        : platform === 'darwin'
          ? { file: 'pbcopy', args: [] as string[] }
          : { file: 'xclip', args: ['-selection', 'clipboard'] };
    // Passed on stdin, never as an argument: the code must not reach argv or
    // shell history even for the clipboard hop.
    const result = spawnSync(tool.file, tool.args, {
      input: text,
      shell: platform === 'win32',
    });
    return result.status === 0;
  }

  async function listCodeRows(store: Store): Promise<cli.ListRow[]> {
    const { blobs } = await store.list();
    const rows: cli.ListRow[] = [];
    for (const blob of blobs) {
      const record = await store.get(blob.key, { type: 'json' });
      if (record === null || record === undefined) continue;
      rows.push(cli.toListRow(blob.key, record));
    }
    return rows;
  }

  async function runIssue(
    command: { pseudonym: string; clip: boolean },
    pepper: string,
  ): Promise<void> {
    await enforceCanary(pepper, true);
    const words = readWordlist();

    const code = generateCode(words, (maxExclusive) => randomInt(maxExclusive));
    const normalized = normalizeCode(code);
    if (!normalized.ok) {
      fail(`generated code failed normalizeCode (${normalized.code}) — this is a bug`);
    }
    const digest = digestCode(normalized.value, pepper);

    const codes = codesStore();
    if ((await codes.get(digest, { type: 'json' })) !== null) {
      fail('the generated code collides with an existing code. Run issue again.');
    }
    await codes.setJSON(digest, cli.buildCodeRecord(command.pseudonym, new Date().toISOString()));

    stdout.write(cli.formatIssueBanner(command.pseudonym, code));

    if (command.clip) {
      stdout.write(
        copyToClipboard(code)
          ? '  Copied to the clipboard.\n\n'
          : '  Could not reach a clipboard tool; copy it by hand.\n\n',
      );
    }
  }

  async function runRevoke(
    command: { pseudonym: string; digest: string | null; fold: cli.FoldMode },
    pepper: string,
  ): Promise<void> {
    await enforceCanary(pepper, false);

    const codes = codesStore();
    const selection = cli.selectRevocationTarget(
      await listCodeRows(codes),
      command.pseudonym,
      command.digest,
    );

    if (selection.kind === 'none') fail(cli.formatNoCodeFound(command.pseudonym));
    if (selection.kind === 'many') {
      stderr.write(`organizer-codes: ${cli.formatAmbiguousRevoke(command.pseudonym, selection.rows)}`);
      process.exit(1);
    }

    const target = selection.row;
    await codes.setJSON(target.digest, cli.revokeRecord(target));

    // Cascade: tombstone every event this code created.
    const events = eventsStore();
    const { blobs } = await events.list();
    let tombstoned = 0;
    for (const blob of blobs) {
      const event = await events.get(blob.key, { type: 'json' });
      if (!cli.shouldTombstone(event, target.digest)) continue;
      await events.setJSON(blob.key, cli.tombstoneEvent(event as Record<string, unknown>));
      tombstoned += 1;
    }

    stdout.write(cli.formatRevokeSummary(command.pseudonym, target.digest, tombstoned));
    await maybeTriggerFold(command.fold);
  }

  async function maybeTriggerFold(mode: cli.FoldMode): Promise<void> {
    let go = mode === 'yes';

    if (mode === 'no') {
      stdout.write(cli.formatFoldReminder());
      return;
    }

    if (mode === 'prompt') {
      if (!stdin.isTTY) {
        stdout.write(cli.formatFoldReminder());
        return;
      }
      const rl = createInterface({ input: stdin, output: stdout });
      const answer = await rl.question(
        'Trigger the fold now, so the takedown reaches the static HTML in ~2 minutes? [y/N] ',
      );
      rl.close();
      go = cli.parseFoldAnswer(answer);
    }

    if (!go) {
      stdout.write(cli.formatFoldReminder());
      return;
    }

    if (!existsSync(FOLD_WORKFLOW_PATH)) {
      fail(
        `cannot trigger the fold: ${FOLD_WORKFLOW_PATH} does not exist. If the fold workflow was renamed, update FOLD_WORKFLOW in src/lib/organizer-cli.ts.`,
      );
    }

    const result = spawnSync('gh', ['workflow', 'run', cli.FOLD_WORKFLOW], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      stderr.write('organizer-codes: `gh workflow run` failed.\n');
      stdout.write(cli.formatFoldReminder());
      return;
    }
    stdout.write(`Fold dispatched. Watch it with: gh run list --workflow ${cli.FOLD_WORKFLOW}\n`);
  }

  async function runSetIntake(command: { signalUrl: string }): Promise<void> {
    const validated = validateSignalUrl(command.signalUrl);
    if (!validated.ok) fail(cli.formatBadIntakeUrl(validated.code));
    // Stored as a JSON record { url }, using the normalized href. The /go/intake
    // reader (Task 14) reads it with { type: 'json' } and validates record.url,
    // so both sides agree on the { url } shape.
    await linksStore().setJSON('intake', { url: validated.value });
    stdout.write(cli.formatIntakeUpdated());
  }

  async function runList(command: { json: boolean }): Promise<void> {
    const rows = await listCodeRows(codesStore());
    if (command.json) {
      stdout.write(cli.toListJson(rows));
      return;
    }
    // Whether /go/intake is configured — never the URL itself.
    const intake = await linksStore().get('intake', { type: 'text' });
    stdout.write(`${cli.formatListTable(rows)}\n`);
    stdout.write(cli.formatIntakeStatus(typeof intake === 'string' && intake.length > 0));
  }
  ```

- [ ] **Step 8: Finish the shell — the entry point**

  Append this to the end of `scripts/organizer-codes.ts`:

  ```ts
  async function main(): Promise<void> {
    const rawArgs = process.argv.slice(2);
    if (
      rawArgs.length === 0 ||
      rawArgs[0] === 'help' ||
      rawArgs.includes('--help') ||
      rawArgs.includes('-h')
    ) {
      stdout.write(cli.USAGE);
      process.exit(0);
    }

    // Parse before touching the environment, so the code-in-argv refusal fires
    // even on a machine with nothing configured.
    const parsed = cli.parseCliArgs(rawArgs);
    if (!parsed.ok) {
      stderr.write(`organizer-codes: ${cli.CLI_ARG_MESSAGES[parsed.code]}\n\n${cli.USAGE}`);
      process.exit(1);
    }
    const command = parsed.value;

    // The npm script cannot pass --env-file (it runs a bundle, not this path), so
    // the .env file is loaded here. loadEnvFile does not override a variable that
    // is already set, which is what keeps `FOO= npm run codes` meaningful.
    if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

    const env = cli.parseEnv(process.env);
    if (!env.ok) fail(cli.ENV_MESSAGES[env.code]);

    process.env.NETLIFY_BLOBS_CONTEXT = cli.buildBlobsContext(env.value);

    // blob-stores.ts refuses every write unless CONTEXT === 'production'. That
    // guard exists to stop deploy previews and branch deploys from writing to the
    // shared stores. This CLI is the one caller that is *supposed* to write to
    // production — run deliberately, from a maintainer's machine, with a
    // production token — so it opts in here, explicitly and in one visible place.
    // Both variables are read lazily by the store factories, so setting them
    // after the imports is correct.
    process.env.CONTEXT = 'production';

    if (command.name === 'issue') await runIssue(command, env.value.pepper);
    else if (command.name === 'revoke') await runRevoke(command, env.value.pepper);
    else if (command.name === 'set-intake') await runSetIntake(command);
    else await runList(command);
  }

  try {
    await main();
  } catch (error) {
    if (error instanceof ContextRefusedError) {
      fail(
        `the Blobs store refused a write: ${error.message}. This CLI sets CONTEXT=production before calling any store factory — if you are seeing this, that ordering broke.`,
      );
    }
    fail(error instanceof Error ? error.message : String(error));
  }
  ```

- [ ] **Step 9: Update `.env.example` and the stale comment in `blob-stores.ts`**

  Apply this diff to `.env.example` (append at the end of the file):

  ```diff
   # Only set this if self-hosting Umami (Umami Cloud is used by default)
   # PUBLIC_UMAMI_SRC=https://your-self-hosted-umami.example.com/script.js
  +
  +# --- Organizer codes CLI (scripts/organizer-codes.ts) ------------------------
  +# Maintainer-only. These are NOT build variables and must never be exposed to
  +# the client bundle. `.env` is gitignored; keep it that way.
  +#
  +# Run the CLI with: npm run codes -- list
  +
  +# HMAC pepper for organizer codes. 32 random bytes, hex:
  +#   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
  +# Must be byte-identical to the Netlify variable of the same name, which is
  +# scoped to Functions only and to the production context only. If they diverge,
  +# newly issued codes fail silently — the CLI's pepper canary catches this.
  +ORGANIZER_CODE_PEPPER=
  +
  +# Netlify personal access token, from https://app.netlify.com/user/applications
  +# Used only by the local CLI to reach the production Blobs stores.
  +NETLIFY_AUTH_TOKEN=
  +
  +# Site configuration -> General -> Site information -> Site ID
  +NETLIFY_SITE_ID=
  ```

  Then fix the one stale filename in the `src/lib/blob-stores.ts` doc comment. This is a comment-only edit:

  ```diff
  -   * One sanctioned bypass: the maintainer CLI (`scripts/organizer-codes.mjs`)
  +   * One sanctioned bypass: the maintainer CLI (`scripts/organizer-codes.ts`)
  ```

  Confirm nothing else still points at the old name:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && grep -rn "organizer-codes.mjs\|ts-import-hooks" --include="*.ts" --include="*.mjs" --include="*.json" --include="*.md" src scripts package.json
  ```

  Expected: no output.

- [ ] **Step 10: Verify the fail-closed paths (no credentials, no network)**

  These checks need no `.env`, no token, and no network. Run each and confirm the exact behavior. Every invocation goes through `npm run codes`; the esbuild step adds roughly 10 ms.

  **10a — help exits 0:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- --help; echo "exit=$?"
  ```

  Expected: the usage block prints (including the `set-intake <signal-url>` line), ending with `exit=0`.

  **10b — a code passed as an argument is refused before anything else happens:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- revoke "drum yoga vivid clay"; echo "exit=$?"
  ```

  Expected first line, followed by the usage block and a nonzero `exit=`:

  ```
  organizer-codes: refusing to run: an argument looks like an organizer code. Codes are never passed on the command line — they would land in your shell history. Pass the pseudonym instead.
  ```

  Repeat with the hyphenated form and confirm identical output:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- revoke drum-yoga-vivid-clay; echo "exit=$?"
  ```

  **10c — a missing pepper is a hard error, not a fallback:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && ORGANIZER_CODE_PEPPER= NETLIFY_AUTH_TOKEN= NETLIFY_SITE_ID= npm run codes -- list; echo "exit=$?"
  ```

  Expected: one line beginning `organizer-codes: ORGANIZER_CODE_PEPPER is not set.` and a nonzero `exit=`. No Blobs call is attempted.

  **10d — a missing Netlify token is a hard error:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && ORGANIZER_CODE_PEPPER=deadbeef NETLIFY_AUTH_TOKEN= NETLIFY_SITE_ID= npm run codes -- list; echo "exit=$?"
  ```

  Expected: one line beginning `organizer-codes: NETLIFY_AUTH_TOKEN is not set.` and a nonzero `exit=`.

  **10e — a missing site id is a hard error:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && ORGANIZER_CODE_PEPPER=deadbeef NETLIFY_AUTH_TOKEN=fake NETLIFY_SITE_ID= npm run codes -- list; echo "exit=$?"
  ```

  Expected: one line beginning `organizer-codes: NETLIFY_SITE_ID is not set.` and a nonzero `exit=`.

  **10f — set-intake refuses a bad URL before any store write (needs env, no network write):**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && ORGANIZER_CODE_PEPPER=deadbeef NETLIFY_AUTH_TOKEN=fake NETLIFY_SITE_ID=fake npm run codes -- set-intake "https://evil.example/#x"; echo "exit=$?"
  ```

  Expected: one line beginning `organizer-codes: refusing to set intake: the URL failed Signal-link validation (` and a nonzero `exit=`. The refusal is decided by `validateSignalUrl` before the `links` store is touched.

  **10g — confirm bare node still fails, so the npm script is not optional:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && node --experimental-strip-types scripts/organizer-codes.ts --help; echo "exit=$?"
  ```

  Expected: `ERR_MODULE_NOT_FOUND` naming a `.js` specifier under `src/lib`, and a nonzero `exit=`. This is the documented reason the `codes` script bundles first; do not "fix" it by rewriting the `src/lib` import extensions.

  Confirm the full unit suite is green:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm test
  ```

  Expected: all test files pass, including `src/lib/organizer-cli.test.ts` and `src/lib/wordlist-file.test.ts`.

- [ ] **Step 11: Verify against the production Blobs stores**

  This step touches production data. Do it once, deliberately, and read each expected result before moving on.

  First create the local `.env` (it is gitignored; never commit it):

  ```
  cd /c/Users/tim/workspace/deflocksc-website && cp .env.example .env
  ```

  Fill in `ORGANIZER_CODE_PEPPER` (the exact value set as a Functions-scoped, production-context-only Netlify variable), `NETLIFY_AUTH_TOKEN`, and `NETLIFY_SITE_ID`.

  **11a — read-only connectivity check first:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- list
  ```

  Expected on an empty store: `No codes issued.` followed by `Intake link: not set`.

  If you get `MissingBlobsEnvironmentError` or a region complaint, the object built by `buildBlobsContext` does not match the installed `@netlify/blobs` version. Check the version with `node -p "require('@netlify/blobs/package.json').version"` and adjust `buildBlobsContext` in `src/lib/organizer-cli.ts` (updating its unit test alongside) rather than weakening the store factory.

  **11b — issue a throwaway code and watch the canary get written:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- issue test-cli
  ```

  Expected, in order:

  ```
  note: wrote the pepper canary for the first time (meta/pepper-canary).

    Code for test-cli:

        <four words>

    This is the only time it is shown. ...
  ```

  **11c — confirm `list` shows the record and never the code:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- list
  ```

  Expected: a table with `PSEUDONYM / ISSUED / REVOKED` headers, one row `test-cli`, today's date, `no`, then `Intake link: not set`. No four-word string anywhere in the output, and no 64-character hex value.

  **11d — set and confirm the intake link, without leaking it:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- set-intake "https://signal.group/#CjQKIExamplE"
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- list
  ```

  Expected: the first prints `Intake link updated. ...`; the second now ends with `Intake link: set`. Neither prints the URL. A real intake invite belongs here; the example above is a placeholder — replace it before relying on `/go/intake`.

  **11e — confirm the canary now guards a wrong pepper:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && ORGANIZER_CODE_PEPPER=00000000 npm run codes -- issue test-canary; echo "exit=$?"
  ```

  The shell-set `ORGANIZER_CODE_PEPPER` wins because `process.loadEnvFile` does not override a variable that is already set; the token and site id still come from `.env`.

  Expected: `organizer-codes: pepper canary mismatch. ...` and a nonzero `exit=`. No new record is written — re-run `npm run codes -- list` and confirm `test-canary` is absent.

  **11f — revoke, and confirm the cascade and the fold reminder:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- revoke test-cli --no-fold
  ```

  Expected:

  ```
  Revoked test-cli (<8 hex chars>...). Tombstoned 0 event(s).
  The overlay is already correct. The baked /events page still lists the tombstoned events until the next fold. Run the fold when you are ready:
    gh workflow run fold-events.yml
  ```

  Then `npm run codes -- list` shows `test-cli` with `REVOKED` = `yes`.

  **11g — confirm the JSON backup shape:**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && npm run codes -- list --json
  ```

  Expected: a JSON array whose objects have exactly the keys `digest`, `pseudonym`, `issuedAt`, `revoked` — nothing else, and no intake line (the `--json` backup is the codes store only).

  Leave the revoked `test-cli` record in place, or delete it manually from the Netlify UI. Do not add a delete subcommand: the `codes` store has no backup, and a delete there is the one unrecoverable operation in the system.

- [ ] **Step 12: Commit**

  ```
  cd /c/Users/tim/workspace/deflocksc-website && git status --short
  ```

  Confirm `.env` is **not** listed (it is covered by the existing `.gitignore` rule) and that nothing under `node_modules/` appears. Then:

  ```
  cd /c/Users/tim/workspace/deflocksc-website && git add scripts/organizer-codes.ts src/lib/blob-stores.ts package.json .env.example && git commit -m "feat(events): organizer-codes CLI shell over the pure CLI module"
  ```

---

---

---

### Task 17: city centroids build script

**Files:**

- Create: `scripts/build-city-centroids.py`
- Create: `scripts/data/city-centroid-overrides.json`
- Create: `src/data/city-centroids.test.ts`
- Create (generated, committed): `src/data/city-centroids.json`
- Modify: `.gitignore`

**Why this does not use `/api/geocode`.** Design §11 says to geocode each place through the existing `/api/geocode` Census proxy. That proxy forwards to `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress` (see `netlify.toml`), which is a street-address matcher and returns **zero** matches for a bare city name. Verified before writing this task:

```bash
python -c "
import json,urllib.parse,urllib.request
for a in ['Greenville, SC','Greenville, South Carolina','Greenville SC 29601','Mount Pleasant, SC','St. Matthews, SC']:
    p=urllib.parse.urlencode({'address':a,'benchmark':'Public_AR_Current','vintage':'Current_Current','format':'json'})
    d=json.loads(urllib.request.urlopen('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?'+p,timeout=30).read())
    print(repr(a),'->',len(d['result']['addressMatches']),'matches')
"
```

Every line prints `-> 0 matches`. The working Census source is the TIGERweb **Incorporated Places** layer, which publishes a `CENTLAT`/`CENTLON` centroid for all 271 South Carolina places in a single request, and which resolves all 50 registry place slugs by exact `BASENAME` match (verified). The script below uses that, keeps the one-request result in a local cache, and keeps a committed override file as the documented escape hatch when a slug ever fails to resolve.

---

- [ ] **Step 1: scaffold the override file and ignore the cache directory**

  Create `scripts/data/city-centroid-overrides.json` with exactly this content (an empty object — it exists so the failure path in Step 5 has somewhere to point):

  ```json
  {}
  ```

  Then append this block to the end of `.gitignore`:

  ```diff
   # brainstorming visual companion mockups (not committed)
   .superpowers/
  +
  +# TIGERweb response cache for scripts/build-city-centroids.py (not committed)
  +scripts/.cache/
  ```

- [ ] **Step 2: write the failing guard test**

  Create `src/data/city-centroids.test.ts` with exactly this content. It asserts the property the task requires: every slug from `registry.json` places has a centroid, and nothing else does.

  ```ts
  import { describe, it, expect } from 'vitest';
  import { existsSync, readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';

  // Guard test for the generated file. Regenerate with:
  //   python scripts/build-city-centroids.py
  const CENTROIDS_PATH = fileURLToPath(new URL('./city-centroids.json', import.meta.url));
  const REGISTRY_PATH = fileURLToPath(new URL('./registry.json', import.meta.url));

  // Same box scripts/build-camera-counts.py uses to pre-filter cameras.
  const SC_BOUNDS = { minLon: -84.0, maxLon: -78.0, minLat: 31.5, maxLat: 35.5 };

  function readJson(path: string): any {
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  const placeSlugs: string[] = readJson(REGISTRY_PATH)
    .jurisdictions.filter((j: any) => j.type === 'place')
    .map((j: any) => j.id.split(':')[1])
    .sort();

  describe('city-centroids.json', () => {
    it('exists (run: python scripts/build-city-centroids.py)', () => {
      expect(existsSync(CENTROIDS_PATH)).toBe(true);
    });

    it('has exactly one centroid per registry place slug, and no extras', () => {
      const centroids = readJson(CENTROIDS_PATH);
      expect(Object.keys(centroids).sort()).toEqual(placeSlugs);
    });

    it('stores every centroid as a [lon, lat] pair inside South Carolina', () => {
      const centroids = readJson(CENTROIDS_PATH);
      for (const slug of placeSlugs) {
        const point = centroids[slug];
        expect(Array.isArray(point), `${slug} is not an array`).toBe(true);
        expect(point.length, `${slug} is not a 2-element pair`).toBe(2);
        const [lon, lat] = point;
        expect(typeof lon, `${slug} lon is not a number`).toBe('number');
        expect(typeof lat, `${slug} lat is not a number`).toBe('number');
        expect(lon >= SC_BOUNDS.minLon && lon <= SC_BOUNDS.maxLon, `${slug} lon ${lon} outside SC`).toBe(true);
        expect(lat >= SC_BOUNDS.minLat && lat <= SC_BOUNDS.maxLat, `${slug} lat ${lat} outside SC`).toBe(true);
      }
    });
  });
  ```

- [ ] **Step 3: run the test and watch it fail**

  ```bash
  npx vitest run src/data/city-centroids.test.ts
  ```

  Expected failure — 3 of 3 tests fail because `src/data/city-centroids.json` does not exist yet:

  ```
   FAIL  src/data/city-centroids.test.ts > city-centroids.json > exists (run: python scripts/build-city-centroids.py)
  AssertionError: expected false to be true

   FAIL  src/data/city-centroids.test.ts > city-centroids.json > has exactly one centroid per registry place slug, and no extras
  Error: ENOENT: no such file or directory, open '...\src\data\city-centroids.json'

   FAIL  src/data/city-centroids.test.ts > city-centroids.json > stores every centroid as a [lon, lat] pair inside South Carolina
  Error: ENOENT: no such file or directory, open '...\src\data\city-centroids.json'

   Test Files  1 failed (1)
        Tests  3 failed (3)
  ```

  If you see `1 passed`, a stale `src/data/city-centroids.json` is present — delete it and re-run before continuing.

- [ ] **Step 4: write the build script**

  Create `scripts/build-city-centroids.py` with exactly this content. It follows `scripts/build-camera-counts.py` conventions (module docstring with Usage, `SCRIPT_DIR`/`PROJECT_ROOT` path constants, the same `SC_BOUNDS` box, one `main()`, per-item progress lines) and `scripts/validate-bills.py` conventions (collect errors, report, `sys.exit(1)`). Stdlib only — no `pip install` step.

  ```python
  """
  Build city centroid coordinates for the events map.

  Resolves every allowlisted place slug in src/data/registry.json to a single
  [lon, lat] point and writes src/data/city-centroids.json.

  Coordinates come from the Census TIGERweb "Incorporated Places" layer, which
  publishes a CENTLAT/CENTLON centroid for every South Carolina place in one
  request. The Census one-line address geocoder behind /api/geocode is an
  address matcher: it returns zero matches for a bare city name (verified for
  "Greenville, SC", "Greenville, South Carolina", "Greenville SC 29601"), so it
  cannot resolve city centroids.

  Idempotent: same registry + same cache produces a byte-identical output file.
  Fails loudly (exit 1) on any slug it cannot resolve, and never writes a
  partial file.

  Stdlib only. No third-party dependencies.

  Usage:
      python scripts/build-city-centroids.py            # use cache if present
      python scripts/build-city-centroids.py --refresh  # re-fetch from Census
      python scripts/build-city-centroids.py --check    # verify only, write nothing

  Exit code 0 = all place slugs resolved and verified, 1 = failure.
  """

  import json
  import os
  import re
  import sys
  import urllib.parse
  import urllib.request

  SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
  PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
  REGISTRY_PATH = os.path.join(PROJECT_ROOT, "src", "data", "registry.json")
  OUTPUT_PATH = os.path.join(PROJECT_ROOT, "src", "data", "city-centroids.json")
  OVERRIDES_PATH = os.path.join(SCRIPT_DIR, "data", "city-centroid-overrides.json")
  CACHE_PATH = os.path.join(SCRIPT_DIR, ".cache", "tigerweb-sc-places.json")

  TIGERWEB_URL = (
      "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
      "Places_CouSub_ConCity_SubMCD/MapServer/4/query"
  )
  SC_STATE_FIPS = "45"
  USER_AGENT = "deflocksc-website build-city-centroids (https://deflocksc.org)"

  # Same box build-camera-counts.py uses to pre-filter cameras.
  SC_BOUNDS = {"min_lat": 31.5, "max_lat": 35.5, "min_lon": -84.0, "max_lon": -78.0}

  COUNCIL_SUFFIX = re.compile(r"\s+(?:City|Town)\s+Council$")


  def city_name(entry):
      """'Hilton Head Island Town Council' -> 'Hilton Head Island'."""
      return COUNCIL_SUFFIX.sub("", entry["name"]).strip()


  def load_places():
      """Return [(slug, city_name)] for every type=place entry, sorted by slug."""
      with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
          registry = json.load(f)
      places = []
      for entry in registry.get("jurisdictions", []):
          if entry.get("type") != "place":
              continue
          slug = entry["id"].split(":", 1)[1]
          places.append((slug, city_name(entry)))
      return sorted(places)


  def load_overrides():
      if not os.path.exists(OVERRIDES_PATH):
          return {}
      with open(OVERRIDES_PATH, "r", encoding="utf-8") as f:
          return json.load(f)


  def fetch_tigerweb():
      """Fetch every SC incorporated place. Returns {lowercase name: [lon, lat]}."""
      query = urllib.parse.urlencode({
          "where": "STATE='%s'" % SC_STATE_FIPS,
          "outFields": "BASENAME,CENTLAT,CENTLON",
          "returnGeometry": "false",
          "f": "json",
      })
      request = urllib.request.Request(
          TIGERWEB_URL + "?" + query, headers={"User-Agent": USER_AGENT}
      )
      with urllib.request.urlopen(request, timeout=120) as response:
          payload = json.loads(response.read().decode("utf-8"))

      if "error" in payload:
          raise RuntimeError("TIGERweb error: %s" % payload["error"])

      features = payload.get("features", [])
      if not features:
          raise RuntimeError("TIGERweb returned no features for STATE=45")

      table = {}
      for feature in features:
          attrs = feature["attributes"]
          lon = round(float(attrs["CENTLON"]), 6)
          lat = round(float(attrs["CENTLAT"]), 6)
          table[attrs["BASENAME"].strip().lower()] = [lon, lat]
      return table


  def load_cache(refresh):
      if not refresh and os.path.exists(CACHE_PATH):
          print("Using cached TIGERweb data: %s" % CACHE_PATH)
          with open(CACHE_PATH, "r", encoding="utf-8") as f:
              return json.load(f)

      print("Fetching SC incorporated places from Census TIGERweb...")
      table = fetch_tigerweb()
      os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
      with open(CACHE_PATH, "w", encoding="utf-8") as f:
          json.dump(table, f, indent=2, sort_keys=True)
      print("Cached %d places to %s" % (len(table), CACHE_PATH))
      return table


  def in_sc(point):
      lon, lat = point
      return (
          SC_BOUNDS["min_lon"] <= lon <= SC_BOUNDS["max_lon"]
          and SC_BOUNDS["min_lat"] <= lat <= SC_BOUNDS["max_lat"]
      )


  def verify(centroids, places):
      """Return a list of error strings. Empty list means the file is good."""
      errors = []
      expected = set(slug for slug, _ in places)
      actual = set(centroids)

      for slug in sorted(expected - actual):
          errors.append("missing centroid for place slug '%s'" % slug)
      for slug in sorted(actual - expected):
          errors.append("centroid '%s' is not a place slug in registry.json" % slug)

      for slug in sorted(expected & actual):
          point = centroids[slug]
          numeric = (
              isinstance(point, list)
              and len(point) == 2
              and all(isinstance(n, (int, float)) and not isinstance(n, bool) for n in point)
          )
          if not numeric:
              errors.append("'%s' is not a [lon, lat] pair: %r" % (slug, point))
          elif not in_sc(point):
              errors.append("'%s' falls outside South Carolina: %r" % (slug, point))
      return errors


  def main():
      refresh = "--refresh" in sys.argv
      check_only = "--check" in sys.argv

      places = load_places()
      print("Registry lists %d place slugs" % len(places))

      if check_only:
          if not os.path.exists(OUTPUT_PATH):
              print("\nERROR: %s does not exist. Run without --check first." % OUTPUT_PATH)
              sys.exit(1)
          with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
              centroids = json.load(f)
      else:
          table = load_cache(refresh)
          overrides = load_overrides()
          if overrides:
              print("Loaded %d manual override(s)" % len(overrides))

          centroids = {}
          unresolved = []
          for slug, name in places:
              if slug in overrides:
                  centroids[slug] = [round(float(n), 6) for n in overrides[slug]]
                  print("  %-18s %-24s override" % (slug, name))
                  continue
              point = table.get(name.lower())
              if point is None:
                  unresolved.append((slug, name))
                  continue
              centroids[slug] = point
              print("  %-18s %-24s %s" % (slug, name, point))

          if unresolved:
              print("\nERROR: %d place slug(s) could not be resolved:" % len(unresolved))
              for slug, name in unresolved:
                  print("  %s  (searched TIGERweb BASENAME '%s')" % (slug, name))
              print("\nFix: add each slug to %s as \"slug\": [lon, lat], then re-run." % OVERRIDES_PATH)
              print("Nothing was written.")
              sys.exit(1)

      errors = verify(centroids, places)
      if errors:
          print("\nVerification FAILED (%d error(s)):" % len(errors))
          for message in errors:
              print("  ERROR: %s" % message)
          print("\nNothing was written.")
          sys.exit(1)

      if check_only:
          print("\nVerified %s: %d/%d place slugs have a centroid."
                % (OUTPUT_PATH, len(centroids), len(places)))
          sys.exit(0)

      with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
          json.dump(centroids, f, indent=2, sort_keys=True)
          f.write("\n")

      print("\nWrote %s (%d entries)" % (OUTPUT_PATH, len(centroids)))
      print("Verified: every place slug in registry.json has a centroid.")
      sys.exit(0)


  if __name__ == "__main__":
      main()
  ```

- [ ] **Step 5: run the script and generate the data**

  ```bash
  python scripts/build-city-centroids.py
  ```

  Expected output (50 per-slug lines; the elision below is terminal output, not the file):

  ```
  Registry lists 50 place slugs
  Fetching SC incorporated places from Census TIGERweb...
  Cached 271 places to scripts\.cache\tigerweb-sc-places.json
    abbeville          Abbeville                [-82.377423, 34.178694]
    aiken              Aiken                    [-81.725859, 33.531495]
    allendale          Allendale                [-81.309164, 33.008047]
    anderson           Anderson                 [-82.644335, 34.520428]
    bamberg            Bamberg                  [-81.03223, 33.299592]
  [ ...44 more slugs, one line each, alphabetical... ]
    winnsboro          Winnsboro                [-81.083617, 34.352353]

  Wrote src\data\city-centroids.json (50 entries)
  Verified: every place slug in registry.json has a centroid.
  ```

  Spot-check four values against the run above: `greenville` → `[-82.365094, 34.835631]`, `charleston` → `[-79.967828, 32.816236]`, `hilton-head` → `[-80.740457, 32.188323]`, `mount-pleasant` → `[-79.822151, 32.851287]`. Exit code must be `0`.

  If any slug fails to resolve, the script exits 1, writes nothing, and names the slug plus the `BASENAME` it searched. The fix is to add that slug to `scripts/data/city-centroid-overrides.json` as `"slug": [lon, lat]` and re-run — never to delete the slug from the registry or let it be omitted.

- [ ] **Step 6: re-run the test and watch it pass**

  ```bash
  npx vitest run src/data/city-centroids.test.ts
  ```

  Expected:

  ```
   ✓ src/data/city-centroids.test.ts (3 tests)

   Test Files  1 passed (1)
        Tests  3 passed (3)
  ```

  Then confirm nothing else broke:

  ```bash
  npm test
  ```

  Every existing suite (including `src/lib/geo-utils.test.ts`) must still pass.

- [ ] **Step 7: verify idempotency, `--check`, and the cache path (manual)**

  Three commands, three exact results.

  **Idempotent** — a second run must produce a byte-identical file:

  ```bash
  md5sum src/data/city-centroids.json && python scripts/build-city-centroids.py > /dev/null && md5sum src/data/city-centroids.json
  ```

  The two hashes printed must be identical, and `git status --porcelain src/data/city-centroids.json` must show no modification after the file is staged.

  **Cache is used** — the second run must not hit the network. Its third line must read `Using cached TIGERweb data: ...\scripts\.cache\tigerweb-sc-places.json` instead of `Fetching SC incorporated places from Census TIGERweb...`. Confirm with:

  ```bash
  python scripts/build-city-centroids.py | head -3
  ```

  **Verification-only mode:**

  ```bash
  python scripts/build-city-centroids.py --check
  ```

  Expected output, exit code 0:

  ```
  Registry lists 50 place slugs

  Verified src\data\city-centroids.json: 50/50 place slugs have a centroid.
  ```

  **Failure is loud** — prove the guard actually fires. Temporarily delete one key from `src/data/city-centroids.json` (for example the `"greenville"` line), then run `python scripts/build-city-centroids.py --check`. Expected: exit code 1 and

  ```
  Verification FAILED (1 error(s)):
    ERROR: missing centroid for place slug 'greenville'

  Nothing was written.
  ```

  Restore the file by re-running `python scripts/build-city-centroids.py` before committing.

- [ ] **Step 8: commit**

  Confirm `scripts/.cache/` is untracked (`git status --porcelain | grep -c '.cache'` prints `0`), then:

  ```bash
  git add scripts/build-city-centroids.py scripts/data/city-centroid-overrides.json src/data/city-centroids.json src/data/city-centroids.test.ts .gitignore
  git commit -m "feat(events): build committed city centroids for the events map

  Resolve all 50 registry place slugs to [lon, lat] via the Census TIGERweb
  Incorporated Places layer and commit src/data/city-centroids.json. The
  /api/geocode Census proxy is an address matcher and returns zero matches
  for a bare city name, so it cannot supply city centroids.

  The script is idempotent, caches the single TIGERweb response under
  scripts/.cache/ (gitignored), and exits 1 naming any slug it cannot
  resolve rather than silently omitting it. A vitest guard asserts every
  registry place slug has a centroid inside the SC bounding box."
  ```

---

---

---

### Task 18: Modular map core and camera layer

`src/scripts/camera-map.ts` is one 403-line module that owns a single module-scope `let map` plus every camera concern. Split it into a reusable core and a camera layer so a second map can exist on a page. **This is a pure refactor with one in-scope security fix: no new user-visible behaviour.**

**Do not turn this into a framework.** No layer registry, no plugin lifecycle hooks, no config-driven layer composition, no wrapper over MapLibre's own `addSource`/`addLayer`. Two consumers do not justify one. `addCameraLayers(map, geojson)` calls MapLibre directly and that is the intended end state — a later reader should extend it by writing a second `layers/*.ts` file, not by generalising this one.

**Two corrections to the brief, both verified before writing this task:**

1. **There is no glow-frame binding to move.** The brief assigns `core.ts` ownership of "the glow-frame pointermove binding." It does not exist. `grep -rn "glow-frame\|pointermove" src/` returns nothing, and `git log -S"glow-frame" -- src/styles/global.css` shows it was removed at `6c811db` ("a11y fixes, contrast bump, heading hierarchy, sidebar gaps, hamburger nav"). `core.ts` therefore does not include it, and the smoke checklist substitutes a live check that does exist (Step 10, item 6). Do not re-add a glow frame here — that is a design change, not a refactor.

2. **The two `escapeHtml` copies are byte-identical.** `src/scripts/camera-map.ts:123-127` and `src/scripts/action-modal/results-renderer.ts:7-11` diff clean, so there is no "safer copy" to choose between when merging them into `src/lib/escape-html.ts`. The merged helper is *not* copied verbatim, though — it is hardened (see next paragraph).

**Quote escaping is fixed here, on purpose.** The old `escapeHtml` escaped via `textContent`/`innerHTML`, so it escaped `&`, `<`, `>` but **not** quote characters. `showCameraPopup` interpolates its output into HTML *attributes* (`src="${escapeHtml(imageUrl)}"`, `alt="${label}"`) fed by third-party OSM tags, so a `"` in a `manufacturer` tag closes the attribute — and under this repo's `script-src 'unsafe-inline'` the injected `onerror=` runs. That is stored XSS, in scope for this refactor. The merged `src/lib/escape-html.ts` therefore escapes `&`, `<`, `>`, `"` and `'` with a single-pass static-map replace (no DOM, so it also runs under vitest's node environment), precisely because its output lands in attribute context.

**Files:**

- Create: `src/lib/escape-html.ts`
- Create: `src/lib/escape-html.test.ts`
- Create: `src/scripts/map/core.ts`
- Create: `src/scripts/map/layers/cameras.ts`
- Create: `src/scripts/map/layers/cameras.test.ts` (written first at `src/scripts/camera-map.test.ts`, moved in Step 6)
- Delete: `src/scripts/camera-map.ts`
- Modify: `src/scripts/action-modal/results-renderer.ts`
- Modify: `src/components/MapSection.astro`
- Modify: `src/styles/global.css`

---

- [ ] **Step 1: export the pure helpers from today's `camera-map.ts`**

  The safety net has to bind to the code *before* the move, so the same assertions run on both sides of it. Three one-word edits to `src/scripts/camera-map.ts`. Nothing else in the file changes.

  ```diff
  -function wikimediaThumbnailUrl(filename: string): string {
  +export function wikimediaThumbnailUrl(filename: string): string {
     const clean = filename.replace(/^File:/, '').replace(/ /g, '_');
  ```

  ```diff
  -function parseDirection(tags: Record<string, string> | undefined): number | null {
  +export function parseDirection(tags: Record<string, string> | undefined): number | null {
     if (!tags) return null;
  ```

  ```diff
  -function createConeImage(): { width: number; height: number; data: Uint8ClampedArray } {
  +export function createConeImage(): { width: number; height: number; data: Uint8ClampedArray } {
     const coneSize = 80;
  ```

- [ ] **Step 2: write the safety net and watch it pass BEFORE anything moves**

  This is the point of the task's ordering. These 28 assertions pass against the current `camera-map.ts` and must still pass, unchanged, against `cameras.ts` after the move. If any of them go red between Step 2 and Step 9, the move changed behaviour and you back it out rather than editing the test.

  `vitest.config.ts` sets `environment: 'node'`, and `createConeImage` rasterises through a canvas 2D context that node does not have. Rather than add jsdom plus a native canvas backend for one function, the cone tests install a recording stub and assert the *draw program* — geometry constants, colours, read-back size. State plainly what that does and does not buy you: it catches an accidental edit to the cone during the move; it does not prove pixels were painted. The "cones actually render" check lives in Step 10. `getVendorImageUrl` reads the module-scope `vendorImages` map populated by a `fetch`, so it is not unit-testable without either exposing an inner helper (extra API this task does not want) or mocking the network (testing the mock); it goes to Step 10 as well.

  Create `src/scripts/camera-map.test.ts` with exactly this content:

  ```ts
  import { describe, it, expect, vi, afterEach } from 'vitest';
  import { parseDirection, wikimediaThumbnailUrl, createConeImage } from './camera-map.js';

  describe('parseDirection', () => {
    it('returns null for undefined tags', () => {
      expect(parseDirection(undefined)).toBe(null);
    });

    it('returns null when no direction tag is present', () => {
      expect(parseDirection({ manufacturer: 'Flock Safety' })).toBe(null);
    });

    it('returns null for an empty direction value', () => {
      expect(parseDirection({ direction: '' })).toBe(null);
    });

    it('parses plain numeric degrees', () => {
      expect(parseDirection({ direction: '90' })).toBe(90);
    });

    it('parses zero degrees', () => {
      expect(parseDirection({ direction: '0' })).toBe(0);
    });

    it('parses fractional degrees', () => {
      expect(parseDirection({ direction: '112.5' })).toBe(112.5);
    });

    it('falls back to camera:direction', () => {
      expect(parseDirection({ 'camera:direction': '45' })).toBe(45);
    });

    it('prefers direction over camera:direction', () => {
      expect(parseDirection({ direction: '10', 'camera:direction': '200' })).toBe(10);
    });

    it('takes the midpoint of a range', () => {
      expect(parseDirection({ direction: '138-183' })).toBe(160.5);
    });

    it('takes the first value of a semicolon list', () => {
      expect(parseDirection({ direction: '90;270' })).toBe(90);
    });

    it('trims surrounding whitespace', () => {
      expect(parseDirection({ direction: '  225  ' })).toBe(225);
    });

    it('maps cardinal directions', () => {
      expect(parseDirection({ direction: 'N' })).toBe(0);
      expect(parseDirection({ direction: 'E' })).toBe(90);
      expect(parseDirection({ direction: 'S' })).toBe(180);
      expect(parseDirection({ direction: 'W' })).toBe(270);
    });

    it('maps intercardinal directions', () => {
      expect(parseDirection({ direction: 'NNE' })).toBe(22.5);
      expect(parseDirection({ direction: 'SW' })).toBe(225);
      expect(parseDirection({ direction: 'WNW' })).toBe(292.5);
    });

    it('is case-insensitive for cardinals', () => {
      expect(parseDirection({ direction: 'nw' })).toBe(315);
    });

    it('returns null for unparseable text', () => {
      expect(parseDirection({ direction: 'sideways' })).toBe(null);
    });
  });

  describe('wikimediaThumbnailUrl', () => {
    it('strips a leading File: prefix', () => {
      expect(wikimediaThumbnailUrl('File:Flock_camera.jpg')).toBe(
        'https://commons.wikimedia.org/w/thumb.php?f=Flock_camera.jpg&w=300',
      );
    });

    it('converts spaces to underscores', () => {
      expect(wikimediaThumbnailUrl('Flock camera front.jpg')).toBe(
        'https://commons.wikimedia.org/w/thumb.php?f=Flock_camera_front.jpg&w=300',
      );
    });

    it('strips the prefix and converts spaces together', () => {
      expect(wikimediaThumbnailUrl('File:Flock Safety Falcon.jpg')).toBe(
        'https://commons.wikimedia.org/w/thumb.php?f=Flock_Safety_Falcon.jpg&w=300',
      );
    });

    it('percent-encodes reserved and non-ASCII characters', () => {
      expect(wikimediaThumbnailUrl('Cam&ra é.jpg')).toBe(
        'https://commons.wikimedia.org/w/thumb.php?f=Cam%26ra_%C3%A9.jpg&w=300',
      );
    });

    it('strips only the first File: prefix', () => {
      expect(wikimediaThumbnailUrl('File:File:a.jpg')).toBe(
        'https://commons.wikimedia.org/w/thumb.php?f=File%3Aa.jpg&w=300',
      );
    });
  });

  // createConeImage rasterises through a canvas 2D context, which vitest's
  // `environment: 'node'` does not provide. Rather than add jsdom + a native
  // canvas backend for one function, these tests install a recording stub and
  // assert the draw program: the geometry constants, the colours, and the
  // read-back size. That catches an accidental edit to the cone during a move.
  // It does NOT prove pixels were painted — the "cones actually render" check
  // lives in the manual smoke checklist in Step 10.

  type DrawOp = {
    op: string;
    args: number[];
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
  };

  function installCanvasRecorder(): { ops: DrawOp[]; canvas: { width: number; height: number } } {
    const ops: DrawOp[] = [];

    const ctx: any = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      getImageData: (...args: number[]) => {
        record('getImageData', args);
        return { data: new Uint8ClampedArray(args[2] * args[3] * 4) };
      },
    };

    function record(op: string, args: number[]): void {
      ops.push({
        op,
        args,
        fillStyle: ctx.fillStyle,
        strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth,
      });
    }

    for (const name of ['beginPath', 'moveTo', 'arc', 'closePath', 'fill', 'stroke']) {
      ctx[name] = (...args: number[]) => record(name, args);
    }

    const canvas = { width: 0, height: 0, getContext: () => ctx };
    vi.stubGlobal('document', { createElement: () => canvas });

    return { ops, canvas };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createConeImage', () => {
    it('returns an 80x80 RGBA buffer', () => {
      installCanvasRecorder();
      const img = createConeImage();
      expect(img.width).toBe(80);
      expect(img.height).toBe(80);
      expect(img.data.length).toBe(80 * 80 * 4);
    });

    it('sizes the backing canvas to match the returned image', () => {
      const { canvas } = installCanvasRecorder();
      const img = createConeImage();
      expect(canvas.width).toBe(img.width);
      expect(canvas.height).toBe(img.height);
    });

    it('reads back the whole canvas', () => {
      const { ops } = installCanvasRecorder();
      createConeImage();
      const read = ops.find((o) => o.op === 'getImageData')!;
      expect(read.args).toEqual([0, 0, 80, 80]);
    });

    it('draws a 50-degree wedge centred on north', () => {
      const { ops } = installCanvasRecorder();
      createConeImage();
      const wedge = ops.filter((o) => o.op === 'arc')[0];
      const [cx, cy, radius, startAngle, endAngle] = wedge.args;
      expect([cx, cy]).toEqual([40, 40]);
      expect(radius).toBe(36);
      expect(endAngle - startAngle).toBeCloseTo(50 * (Math.PI / 180), 10);
      expect((startAngle + endAngle) / 2).toBeCloseTo(-Math.PI / 2, 10);
    });

    it('fills the wedge with translucent red', () => {
      const { ops } = installCanvasRecorder();
      createConeImage();
      expect(ops.filter((o) => o.op === 'fill')[0].fillStyle).toBe('rgba(239, 68, 68, 0.45)');
    });

    it('draws a solid centre dot inside the wedge radius', () => {
      const { ops } = installCanvasRecorder();
      createConeImage();
      const dot = ops.filter((o) => o.op === 'arc')[1];
      const [cx, cy, radius, start, end] = dot.args;
      expect([cx, cy]).toEqual([40, 40]);
      expect(radius).toBe(7);
      expect(radius).toBeLessThan(36);
      expect(end - start).toBeCloseTo(Math.PI * 2, 10);
      expect(ops.filter((o) => o.op === 'fill')[1].fillStyle).toBe('#ef4444');
    });

    it('outlines the centre dot with a darker red hairline', () => {
      const { ops } = installCanvasRecorder();
      createConeImage();
      const stroke = ops.find((o) => o.op === 'stroke')!;
      expect(stroke.strokeStyle).toBe('#991b1b');
      expect(stroke.lineWidth).toBe(1);
    });

    it('keeps the whole cone inside the image bounds', () => {
      const { ops } = installCanvasRecorder();
      const img = createConeImage();
      const [cx, cy, radius] = ops.filter((o) => o.op === 'arc')[0].args;
      expect(cx + radius).toBeLessThanOrEqual(img.width);
      expect(cy + radius).toBeLessThanOrEqual(img.height);
      expect(cx - radius).toBeGreaterThanOrEqual(0);
      expect(cy - radius).toBeGreaterThanOrEqual(0);
    });
  });
  ```

  Run it and confirm green before touching anything else:

  ```bash
  node node_modules/vitest/vitest.mjs run src/scripts/camera-map.test.ts
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 28 passed (28)`.

- [ ] **Step 3: extract a hardened `escapeHtml`, test it, and point both callers at it**

  Create `src/lib/escape-html.ts` with exactly this content. Unlike the two copies it replaces, this version escapes quote characters too — see the intro: its output is interpolated into HTML attributes, so leaving `"`/`'` raw is a stored-XSS breakout. A single-pass static-map replace needs no DOM, so it also runs under vitest's `environment: 'node'`.

  ```ts
  /**
   * Escape a string for interpolation into HTML, including quoted-attribute
   * context.
   *
   * Escapes the five characters that are unsafe in element text AND in a
   * double- or single-quoted attribute value: `&`, `<`, `>`, `"`, `'`.
   * Quote escaping is included on purpose: callers interpolate the output into
   * attributes fed by third-party data (e.g. `src="${escapeHtml(url)}"`,
   * `alt="${escapeHtml(name)}"`), where a raw `"` would close the attribute and,
   * under a `script-src 'unsafe-inline'` policy, execute an injected handler.
   *
   * Implemented as a single-pass character-class replace with a static map, so
   * it needs no DOM and runs in a node test environment. `&` is in the class,
   * so each source character is rewritten exactly once — there is no double
   * escaping of the entities this function itself emits.
   */
  const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  export function escapeHtml(str: string): string {
    return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
  }
  ```

  Create `src/lib/escape-html.test.ts` with exactly this content. It asserts every one of the five characters is escaped, and pins the attribute-breakout case: a manufacturer-style payload must contain no raw double quote after escaping, and must be inert in attribute context.

  ```ts
  import { describe, it, expect } from 'vitest';
  import { escapeHtml } from './escape-html.js';

  describe('escapeHtml', () => {
    it('escapes the ampersand', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes the less-than sign', () => {
      expect(escapeHtml('1 < 2')).toBe('1 &lt; 2');
    });

    it('escapes the greater-than sign', () => {
      expect(escapeHtml('2 > 1')).toBe('2 &gt; 1');
    });

    it('escapes the double quote', () => {
      expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
    });

    it('escapes the single quote', () => {
      expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('escapes each source character exactly once (no double escaping)', () => {
      // The literal text `&lt;` must become `&amp;lt;`, not stay `&lt;`.
      expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });

    it('leaves a string with no special characters untouched', () => {
      expect(escapeHtml('Flock Safety Falcon')).toBe('Flock Safety Falcon');
    });

    it('neutralises an attribute-breakout payload from an OSM manufacturer tag', () => {
      const payload = 'Flock" onerror="alert(1)';
      const escaped = escapeHtml(payload);

      // No raw double quote survives, so the payload cannot close a
      // src="..." / alt="..." attribute and inject a new one.
      expect(escaped).not.toContain('"');
      expect(escaped).toBe('Flock&quot; onerror=&quot;alert(1)');

      // In attribute context the payload is inert text, not markup.
      expect(`<img alt="${escaped}">`).toBe(
        '<img alt="Flock&quot; onerror=&quot;alert(1)">',
      );
    });
  });
  ```

  Run both and confirm green:

  ```bash
  node node_modules/vitest/vitest.mjs run src/lib/escape-html.test.ts
  ```

  Expected: `Test Files 1 passed (1)` / `Tests 8 passed (8)`.

  Then replace the duplicate in `src/scripts/action-modal/results-renderer.ts` (its own HTML building also benefits from the tighter escaping):

  ```diff
   import type { RepGroup, LocalCouncils } from './types.js';
  +import { escapeHtml } from '../../lib/escape-html.js';

   declare const umami: { track: (event: string) => void } | undefined;

   let currentGroups: RepGroup[] | null = null;

  -function escapeHtml(str: string): string {
  -  const div = document.createElement('div');
  -  div.textContent = str;
  -  return div.innerHTML;
  -}
  -
   function buildMailto(emails: string[], subject: string, body: string): string {
  ```

  Leave the copy in `camera-map.ts` alone for now — it disappears with the file in Step 6, and `cameras.ts` imports the shared helper.

- [ ] **Step 4: create `src/scripts/map/core.ts`**

  Note the one intentional difference from the original: the Ctrl-key listeners were registered inside `map.on('load')` via `setupScrollBehavior()`, so they only armed after the camera fetch resolved. Here they arm at construction. The only observable effect is that Ctrl-scroll works during the brief load window instead of being inert. Nothing regresses.

  Create the file with exactly this content:

  ```ts
  /**
   * MapLibre map core.
   *
   * Owns instantiation, the navigation control, resize, and the scroll-zoom
   * lock. Knows nothing about cameras or any other layer. The map instance
   * lives in the returned handle rather than in module scope, so two maps can
   * coexist on one page.
   */

  import maplibregl from 'maplibre-gl';

  export interface MapCoreOptions {
    container: string;
    style: string;
    center: [number, number];
    zoom: number;
    interactive?: boolean;
  }

  export interface MapHandle {
    map: maplibregl.Map;
    destroy(): void;
    resize(): void;
    toggleScrollZoom(): boolean;
  }

  export function createMap(opts: MapCoreOptions): MapHandle {
    const map = new maplibregl.Map({
      container: opts.container,
      style: opts.style,
      center: opts.center,
      zoom: opts.zoom,
      interactive: opts.interactive ?? true,
      attributionControl: false,
      scrollZoom: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    // Scroll zoom is off by default so the page keeps scrolling over the map.
    // Holding Control temporarily enables it; the toggle unlocks it for good.
    let scrollUnlocked = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' && !scrollUnlocked) map.scrollZoom.enable();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' && !scrollUnlocked) map.scrollZoom.disable();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    return {
      map,

      destroy() {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        map.remove();
      },

      resize() {
        map.resize();
      },

      toggleScrollZoom() {
        scrollUnlocked = !scrollUnlocked;
        if (scrollUnlocked) map.scrollZoom.enable();
        else map.scrollZoom.disable();
        return scrollUnlocked;
      },
    };
  }
  ```

- [ ] **Step 5: create `src/scripts/map/layers/cameras.ts`**

  Everything camera-specific, moved verbatim. Three mechanical adjustments, all forced by removing the module-scope `map`:

  - `showCameraPopup` takes `map` as its first parameter instead of closing over the module variable, and its event type tightens from `maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }` to the equivalent `maplibregl.MapLayerMouseEvent`. Type-level only, zero runtime effect.
  - `bindMapEvents()` becomes `bindCameraEvents(map)` with named handlers, so `removeCameraLayers` can `map.off` exactly what it bound. The `WeakMap` holds one teardown closure per map — it is handler bookkeeping required for correct removal, **not** a layer registry. Do not grow it into one.
  - `loadVendorImages()` was awaited in `initMap` alongside the camera fetch; here `addCameraLayers` fires it with `void`. Popups read `vendorImages` on click, long after the promise settles, so the visible result is identical.

  The `escapeHtml` copy is gone — this module imports the hardened shared helper from `src/lib/escape-html.ts`, so the `src=`/`alt=` interpolations in `showCameraPopup` are now safe against a `"` in an OSM tag.

  Create the file with exactly this content:

  ```ts
  /**
   * Camera layer.
   *
   * Everything Deflock-camera-specific: vendor reference images, the
   * directional cone icon, direction parsing, the camera popup, and the
   * cluster / dot / cone layers with their event handlers.
   */

  import maplibregl from 'maplibre-gl';
  import { escapeHtml } from '../../../lib/escape-html.js';

  // --- Vendor image lookup ---

  const vendorImages = new Map<string, string>();

  async function loadVendorImages(): Promise<void> {
    try {
      const res = await fetch('https://cms.deflock.me/items/lprVendors');
      if (!res.ok) return;
      const { data } = await res.json();
      for (const vendor of data) {
        if (vendor.urls?.length && vendor.fullName) {
          vendorImages.set(vendor.fullName, vendor.urls[0].url);
        }
      }
    } catch {
      // Non-critical — popups just won't have vendor images
    }
  }

  function getVendorImageUrl(manufacturer: string | null): string | null {
    if (!manufacturer) return null;
    return vendorImages.get(manufacturer) ?? null;
  }

  // --- Wikimedia thumbnail URL ---

  export function wikimediaThumbnailUrl(filename: string): string {
    const clean = filename.replace(/^File:/, '').replace(/ /g, '_');
    return `https://commons.wikimedia.org/w/thumb.php?f=${encodeURIComponent(clean)}&w=300`;
  }

  // --- Direction parsing ---

  export function parseDirection(tags: Record<string, string> | undefined): number | null {
    if (!tags) return null;
    const raw = tags['direction'] || tags['camera:direction'];
    if (!raw) return null;
    const first = String(raw).split(';')[0].trim();

    // Range format "138-183" -> midpoint
    if (/^\d+-\d+$/.test(first)) {
      const [a, b] = first.split('-').map(Number);
      return (a + b) / 2;
    }

    // Cardinal directions
    const cardinals: Record<string, number> = {
      N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
      E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
      S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
      W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
    };
    const upper = first.toUpperCase();
    if (upper in cardinals) return cardinals[upper];

    // Numeric degrees
    const deg = Number(first);
    return isNaN(deg) ? null : deg;
  }

  // --- Directional cone image ---

  export function createConeImage(): { width: number; height: number; data: Uint8ClampedArray } {
    const coneSize = 80;
    const coneCanvas = document.createElement('canvas');
    coneCanvas.width = coneSize;
    coneCanvas.height = coneSize;
    const ctx = coneCanvas.getContext('2d')!;
    const cx = coneSize / 2;
    const cy = coneSize / 2;
    const radius = 36;
    const halfAngle = 25 * (Math.PI / 180);

    // Draw cone/wedge pointing up (0deg = north)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    const startAngle = -Math.PI / 2 - halfAngle;
    const endAngle = -Math.PI / 2 + halfAngle;
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 1;
    ctx.stroke();

    return {
      width: coneSize,
      height: coneSize,
      data: ctx.getImageData(0, 0, coneSize, coneSize).data,
    };
  }

  // --- Camera popup ---

  function showCameraPopup(map: maplibregl.Map, e: maplibregl.MapLayerMouseEvent): void {
    if (!e.features?.length) return;
    const feat = e.features[0];
    const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    const props = feat.properties;

    // Parse properties (MapLibre stringifies nested values)
    const id = props.id;
    const manufacturer = props.manufacturer && props.manufacturer !== 'null' ? props.manufacturer : null;
    const operator = props.operator && props.operator !== 'null' ? props.operator : null;
    const direction = props.direction != null && props.direction !== 'null' ? Number(props.direction) : null;
    const wikimedia = props.wikimedia_commons && props.wikimedia_commons !== 'null' ? props.wikimedia_commons : null;

    // Resolve image: wikimedia photo takes priority, then vendor reference image
    const imageUrl = wikimedia
      ? wikimediaThumbnailUrl(wikimedia)
      : getVendorImageUrl(manufacturer);

    let html = '<div class="camera-popup">';

    if (imageUrl) {
      const label = manufacturer ? escapeHtml(manufacturer) + ' LPR' : 'ALPR Camera';
      html += `<div class="camera-popup-img"><img src="${escapeHtml(imageUrl)}" alt="${label}" loading="lazy" /><span class="camera-popup-img-label">${label}</span></div>`;
    } else {
      html += '<div class="camera-popup-img camera-popup-img-empty"><span>ALPR Camera</span></div>';
    }

    if (manufacturer) {
      html += `<div class="camera-popup-mfr">Made by<br><strong>${escapeHtml(manufacturer)}</strong></div>`;
    }

    if (operator && operator !== manufacturer) {
      html += `<div class="camera-popup-op">Operated by ${escapeHtml(operator)}</div>`;
    }

    if (direction !== null) {
      html += `<div class="camera-popup-dir">Facing ${Math.round(direction)}&deg;</div>`;
    }

    html += `<a class="camera-popup-link" href="https://www.openstreetmap.org/node/${encodeURIComponent(String(id))}" target="_blank" rel="noopener">&#x2197; VIEW ON OSM</a>`;

    html += '</div>';

    // Privacy-friendly analytics event (no personal data sent)
    if (typeof umami !== 'undefined') umami.track('camera-popup-viewed');

    new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 12 })
      .setLngLat(coords)
      .setHTML(html)
      .addTo(map);
  }

  // --- Layers ---

  const CAMERA_LAYER_IDS = ['cluster-glow', 'clusters', 'cluster-count', 'camera-dots', 'camera-cones'];

  /** Per-map event teardown, so removeCameraLayers can unbind what it bound. */
  const cameraTeardowns = new WeakMap<maplibregl.Map, () => void>();

  export function addCameraLayers(map: maplibregl.Map, geojson: GeoJSON.FeatureCollection): void {
    // Popups read this lazily on click, so there is no need to block setup on it.
    void loadVendorImages();

    map.addSource('cameras', {
      type: 'geojson',
      data: geojson,
      cluster: true,
      clusterMaxZoom: 15,
      clusterRadius: 50,
    });

    // Cluster glow (much larger blurred circle behind)
    map.addLayer({
      id: 'cluster-glow',
      type: 'circle',
      source: 'cameras',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'interpolate', ['linear'], ['get', 'point_count'],
          2, 'rgba(255,255,255,0.6)',
          10, 'rgba(200,200,200,0.5)',
          25, 'rgba(239,68,68,0.5)',
          50, 'rgba(220,38,38,0.5)',
        ],
        'circle-radius': ['step', ['get', 'point_count'], 28, 10, 36, 50, 48],
        'circle-opacity': 0.4,
        'circle-blur': 1,
      },
    });

    // Cluster circles
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'cameras',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'interpolate', ['linear'], ['get', 'point_count'],
          2, '#dc2626',
          15, '#b91c1c',
          50, '#991b1b',
        ],
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
        'circle-opacity': 0.95,
        'circle-stroke-width': 2,
        'circle-stroke-color': [
          'interpolate', ['linear'], ['get', 'point_count'],
          2, 'rgba(255,255,255,0.7)',
          15, 'rgba(200,200,200,0.6)',
          50, 'rgba(239,68,68,0.8)',
        ],
        'circle-stroke-opacity': 0.9,
      },
    });

    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'cameras',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-size': 13,
        'text-font': ['Noto Sans Regular'],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    });

    map.addLayer({
      id: 'camera-dots',
      type: 'circle',
      source: 'cameras',
      filter: ['all', ['!', ['has', 'point_count']], ['!', ['get', 'hasDirection']]],
      paint: {
        'circle-color': '#ef4444',
        'circle-radius': 5,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#991b1b',
      },
    });

    // Directional cone icon
    map.addImage('cone', createConeImage());

    map.addLayer({
      id: 'camera-cones',
      type: 'symbol',
      source: 'cameras',
      filter: ['all', ['!', ['has', 'point_count']], ['get', 'hasDirection']],
      layout: {
        'icon-image': 'cone',
        'icon-size': 1.0,
        'icon-rotate': ['get', 'direction'],
        'icon-allow-overlap': true,
        'icon-rotation-alignment': 'map',
      },
    });

    bindCameraEvents(map);
  }

  export function removeCameraLayers(map: maplibregl.Map): void {
    cameraTeardowns.get(map)?.();
    cameraTeardowns.delete(map);

    for (const id of CAMERA_LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.hasImage('cone')) map.removeImage('cone');
    if (map.getSource('cameras')) map.removeSource('cameras');
  }

  // --- Map event handlers ---

  function bindCameraEvents(map: maplibregl.Map): void {
    // Cluster click -> zoom in
    const onClusterClick = (e: maplibregl.MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      if (!features.length) return;
      const clusterId = features[0].properties.cluster_id;
      const source = map.getSource('cameras') as maplibregl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({
          center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
          zoom,
        });
      });
    };

    // Camera dot and cone clicks -> popup
    const onCameraClick = (e: maplibregl.MapLayerMouseEvent) => showCameraPopup(map, e);

    // Pointer cursors on interactive features
    const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', 'clusters', onClusterClick);
    map.on('mouseenter', 'clusters', onEnter);
    map.on('mouseleave', 'clusters', onLeave);
    map.on('click', 'camera-dots', onCameraClick);
    map.on('click', 'camera-cones', onCameraClick);
    map.on('mouseenter', 'camera-dots', onEnter);
    map.on('mouseleave', 'camera-dots', onLeave);
    map.on('mouseenter', 'camera-cones', onEnter);
    map.on('mouseleave', 'camera-cones', onLeave);

    cameraTeardowns.set(map, () => {
      map.off('click', 'clusters', onClusterClick);
      map.off('mouseenter', 'clusters', onEnter);
      map.off('mouseleave', 'clusters', onLeave);
      map.off('click', 'camera-dots', onCameraClick);
      map.off('click', 'camera-cones', onCameraClick);
      map.off('mouseenter', 'camera-dots', onEnter);
      map.off('mouseleave', 'camera-dots', onLeave);
      map.off('mouseenter', 'camera-cones', onEnter);
      map.off('mouseleave', 'camera-cones', onLeave);
    });
  }
  ```

- [ ] **Step 6: move the test next to its subject and delete the old module**

  ```bash
  git mv src/scripts/camera-map.test.ts src/scripts/map/layers/cameras.test.ts
  git rm src/scripts/camera-map.ts
  ```

  One line changes in the moved test — the import target. Nothing else:

  ```diff
   import { describe, it, expect, vi, afterEach } from 'vitest';
  -import { parseDirection, wikimediaThumbnailUrl, createConeImage } from './camera-map.js';
  +import { parseDirection, wikimediaThumbnailUrl, createConeImage } from './cameras.js';
  ```

  Re-run it. Same 28 assertions, same result — that is the whole point of the safety net:

  ```bash
  node node_modules/vitest/vitest.mjs run src/scripts/map/layers/cameras.test.ts
  ```

  Expected: `Tests 28 passed (28)`.

- [ ] **Step 7: lift the MapLibre chrome CSS off the `#camera-map` id**

  These rules currently live in `MapSection.astro`'s scoped `<style>` and are keyed to one element id, so a second map container would render MapLibre's unstyled default controls. The exact selectors being changed:

  ```
  #camera-map :global(.maplibregl-ctrl-group)
  #camera-map :global(.maplibregl-ctrl-group button)
  #camera-map :global(.maplibregl-ctrl-group button + button)
  #camera-map :global(.maplibregl-ctrl-group button .maplibregl-ctrl-icon)
  #camera-map :global(.maplibregl-ctrl-group button:hover .maplibregl-ctrl-icon)
  #camera-map :global(.maplibregl-ctrl-group button:hover)
  #camera-map :global(.maplibregl-popup-content)
  #camera-map :global(.maplibregl-popup-tip)
  #camera-map :global(.maplibregl-popup-close-button)
  #camera-map :global(.maplibregl-popup-close-button:hover)
  ```

  Each `#camera-map :global(X)` becomes `.map-dark X` in `src/styles/global.css`. A scoped class would not fix this — Astro stamps scoped selectors with a per-component attribute, so a map container in a *different* component still would not match. The rules have to be global.

  The `:global(.camera-popup*)` block moves too, unprefixed. That markup is built by `cameras.ts`, so it belongs beside the module that emits it rather than inside one component's scoped styles. They were already `:global()`, so this is a relocation with zero specificity or cascade change.

  In `src/styles/global.css`, insert this immediately above the `/* Dark scrollbars — matches site background */` comment:

  ```css
  /* ── MapLibre dark chrome ──
     Applied by adding `map-dark` to a MapLibre container element. Global (not
     scoped to one component) so a second map container gets the same controls
     and popup skin instead of MapLibre's unstyled defaults. */
  .map-dark .maplibregl-ctrl-group {
    background: rgba(38, 38, 38, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(64, 64, 64, 0.6);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .map-dark .maplibregl-ctrl-group button {
    width: 36px;
    height: 36px;
  }

  .map-dark .maplibregl-ctrl-group button + button {
    border-top: 1px solid #404040;
  }

  .map-dark .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
    filter: invert(1) brightness(0.7);
  }

  .map-dark .maplibregl-ctrl-group button:hover .maplibregl-ctrl-icon {
    filter: invert(1) brightness(0.9);
  }

  .map-dark .maplibregl-ctrl-group button:hover {
    background: rgba(64, 64, 64, 0.5);
  }

  .map-dark .maplibregl-popup-content {
    background: #262626;
    border: 1px solid #404040;
    border-radius: 0.75rem;
    padding: 0;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    overflow: hidden;
    font-family: 'Inter', sans-serif;
  }

  .map-dark .maplibregl-popup-tip {
    border-top-color: #262626;
  }

  .map-dark .maplibregl-popup-close-button {
    color: #737373;
    font-size: 18px;
    padding: 4px 8px;
    right: 2px;
    top: 2px;
  }

  .map-dark .maplibregl-popup-close-button:hover {
    color: #d4d4d4;
    background: transparent;
  }

  /* ── Camera popup body (markup built by src/scripts/map/layers/cameras.ts) ── */
  .camera-popup {
    width: 220px;
  }

  .camera-popup-img {
    position: relative;
    background: #171717;
    height: 120px;
    overflow: hidden;
  }

  .camera-popup-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
  }

  .camera-popup-img-label {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.6);
    color: #d4d4d4;
    font-size: 11px;
    font-weight: 500;
    text-align: center;
  }

  .camera-popup-img-empty {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .camera-popup-img-empty span {
    color: #525252;
    font-size: 13px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .camera-popup-mfr {
    padding: 12px 14px 0;
    color: #a3a3a3;
    font-size: 13px;
    line-height: 1.4;
  }

  .camera-popup-mfr strong {
    color: #ffffff;
    font-size: 15px;
    font-weight: 700;
  }

  .camera-popup-op {
    padding: 6px 14px 0;
    color: #737373;
    font-size: 12px;
  }

  .camera-popup-dir {
    padding: 6px 14px 0;
    color: #737373;
    font-size: 12px;
  }

  .camera-popup-link {
    display: block;
    padding: 10px 14px;
    margin-top: 10px;
    border-top: 1px solid #404040;
    color: #ef4444;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .camera-popup-link:hover {
    color: #f87171;
  }
  ```

- [ ] **Step 8: compose `createMap` + `addCameraLayers` in `MapSection.astro`**

  Three edits to `src/components/MapSection.astro`.

  **8a. Opt the container into the shared chrome:**

  ```diff
  -        <div id="camera-map" style="width: 100%; height: 100%;" role="application" aria-label="ALPR Camera Map"></div>
  +        <div id="camera-map" class="map-dark" style="width: 100%; height: 100%;" role="application" aria-label="ALPR Camera Map"></div>
  ```

  **8b.** Delete everything in the scoped `<style>` block from `/* Dark glass zoom controls */` down to the closing brace of `:global(.camera-popup-link:hover)` — that is every rule moved in Step 7. The `.map-scroll-btn`, `.map-badge`, `.map-live-dot` and `@keyframes map-dot-blink` rules above it stay: they style this component's own overlay markup, not MapLibre's. Replace the deleted block with a pointer:

  ```css
    /* MapLibre control + popup chrome and the camera popup body now live in
       src/styles/global.css under `.map-dark` / `.camera-popup*`, so a second
       map container is not left with unstyled default controls. */
  ```

  **8c.** Replace the entire `<script>` block with this. The camera fetch and the `DeflockCamera` → GeoJSON mapping move here because `addCameraLayers` takes finished GeoJSON — that is exactly why `parseDirection` is a public export. `mapLoaded: boolean` becomes a memoised `Promise<MapHandle>`, which removes the old re-entrancy hole where `toggleScrollZoom()` could flip the flag before a map existed and leave the button out of sync with the map.

  ```html
  <script>
    import type { MapHandle } from '../scripts/map/core.js';

    interface DeflockCamera {
      id: number;
      lat: number;
      lon: number;
      tags?: Record<string, string>;
    }

    const MAP_CENTER: [number, number] = [-82.39, 34.85];
    const MAP_ZOOM = 11;

    let mapReady: Promise<MapHandle> | null = null;

    async function initCameraMap(): Promise<MapHandle> {
      await import('maplibre-gl/dist/maplibre-gl.css');
      const { createMap } = await import('../scripts/map/core.js');
      const { addCameraLayers, parseDirection } = await import('../scripts/map/layers/cameras.js');

      const handle = createMap({
        container: 'camera-map',
        style: '/map-style.json',
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
      });

      handle.map.on('load', async () => {
        try {
          const res = await fetch('/camera-data.json');
          if (!res.ok) throw new Error(`Failed to load camera data: ${res.status}`);
          const cameras: DeflockCamera[] = await res.json();

          const geojson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: cameras.map((cam) => {
              const direction = parseDirection(cam.tags);
              return {
                type: 'Feature' as const,
                geometry: {
                  type: 'Point' as const,
                  coordinates: [cam.lon, cam.lat],
                },
                properties: {
                  id: cam.id,
                  direction,
                  hasDirection: direction !== null,
                  manufacturer: cam.tags?.manufacturer || null,
                  operator: cam.tags?.operator || null,
                  wikimedia_commons: cam.tags?.wikimedia_commons || null,
                },
              };
            }),
          };

          addCameraLayers(handle.map, geojson);
        } catch (err) {
          console.error('Failed to load camera data:', err);
        }
      });

      return handle;
    }

    /** Idempotent: every caller shares one map instance. */
    function loadMap(): Promise<MapHandle> {
      if (!mapReady) mapReady = initCameraMap();
      return mapReady;
    }

    // Desktop: lazy-load when map section scrolls into view
    const mapContainer = document.getElementById('camera-map');
    if (mapContainer && window.matchMedia('(min-width: 768px)').matches) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          loadMap();
        }
      }, { rootMargin: '200px' });
      observer.observe(mapContainer);
    }

    // Handle resize mobile -> desktop
    window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
      if (e.matches && !mapReady) loadMap();
    });

    // Mobile toggle
    document.getElementById('map-toggle')?.addEventListener('click', async () => {
      if (typeof umami !== 'undefined') umami.track('map-opened-mobile');
      document.getElementById('map-button-container')?.classList.add('hidden');
      const frame = document.getElementById('map-frame');
      if (frame) {
        frame.classList.remove('hidden');
        frame.classList.add('block');
      }
      const handle = await loadMap();
      handle.resize();
    });

    // Scroll-to-zoom toggle
    document.getElementById('scroll-toggle')?.addEventListener('click', async () => {
      const btn = document.getElementById('scroll-toggle') as HTMLButtonElement;
      const handle = await loadMap();
      const enabled = handle.toggleScrollZoom();
      btn.setAttribute('aria-pressed', String(enabled));
      btn.querySelector('.scroll-btn-label')!.textContent = enabled ? 'Disable scroll zoom' : 'Enable scroll zoom';
    });

  </script>
  ```

  The old `loadAndResize()` only resized when the map already existed; the new mobile handler resizes on first load too. That is required — the container goes from `display: none` to visible in the same click, and MapLibre needs to re-measure it.

- [ ] **Step 9: run the full suite and the build**

  ```bash
  node node_modules/vitest/vitest.mjs run
  node node_modules/astro/astro.js build
  ```

  Expected: `Test Files 8 passed (8)` / `Tests 116 passed (116)`, then `[build] Complete!` with 17 pages and no warnings about `camera-map`. (The count is up from the pre-task baseline by the 28 moved `cameras.test.ts` assertions plus the 8 new `escape-html.test.ts` assertions.)

  Then confirm the CSS actually shipped and nothing was purged — `global.css` sits under `@import "tailwindcss"`, so verify rather than assume:

  ```bash
  grep -ro "\.map-dark \.maplibregl-ctrl-group" dist/_astro/*.css | head -1
  grep -ro "\.camera-popup-link" dist/_astro/*.css | head -1
  grep -o 'id="camera-map"[^>]*' dist/index.html
  grep -rc "camera-map\[data-astro" dist/_astro/*.css
  ```

  Expected: the first two print a match; the third prints `id="camera-map" class="map-dark" ...`; the fourth prints `0` for every file, proving no scoped `#camera-map` rule survives.

- [ ] **Step 10: manual smoke checklist**

  Unit tests cannot reach WebGL rendering, cluster expansion, the popup, or `getVendorImageUrl`. Do this by hand — the map is the site's headline feature and a silent break ships to production.

  ```bash
  node node_modules/astro/astro.js dev --host 127.0.0.1
  ```

  Then open `http://127.0.0.1:4321/` in a **real, focused browser window** at 1280px wide. Do not use a background or hidden preview pane: the desktop map is behind an `IntersectionObserver`, which a throttled hidden pane never fires. That failure looks exactly like a broken refactor and is not one.

  Open DevTools, keep the Console visible, and check each item:

  1. **Homepage map renders.** Scroll to "See the cameras watching your street." Expect the dark basemap to paint inside the 600px frame, with zoom `+`/`−` at top right on a translucent dark rounded panel (36×36px buttons, white-on-dark icons) — not MapLibre's white default. Console: no errors, and specifically no `Failed to load camera data`.
  2. **Clusters expand on click.** Expect red numbered circles over Greenville/Spartanburg. Click one. Expect the map to ease in and that cluster to split into smaller clusters or individual markers. Repeat until you reach individual cameras: red dots for cameras with no direction, red wedge cones for cameras with one, each cone rotated to its bearing. (This is the check the unit tests explicitly cannot make — cones drawn from real pixel data.)
  3. **Camera popup opens and shows a vendor image.** Click a single camera. Expect a dark rounded popup, ~220px wide, with a close `×` at top right. On a camera tagged `manufacturer=Flock Safety`, expect a photo at the top with a caption reading `Flock Safety LPR` — that photo comes from `getVendorImageUrl`, the function no unit test covers, so its presence is the only proof the vendor fetch still works. Below it: `Made by / Flock Safety`, an operator line if it differs, `Facing NNN°` if directional, and a red `↗ VIEW ON OSM` link. Click the link and confirm it opens the right OSM node in a new tab. Then find a camera with no manufacturer and confirm you get the short grey `ALPR CAMERA` placeholder instead.
  4. **Scroll-zoom toggle works.** With the button reading `ENABLE SCROLL ZOOM`, scroll the wheel over the map: expect the **page** to scroll and the map not to zoom. Click the button. Expect the label to become `DISABLE SCROLL ZOOM` and the button and icon to turn red (`aria-pressed="true"`). Scroll again: expect the **map** to zoom and the page to stay put. Click again and confirm it reverts. Separately, with the toggle off, hold `Ctrl` and scroll: expect the map to zoom while held, and to stop on release.
  5. **Mobile map toggle works.** Resize to 375px wide and reload. Expect a red `EXPLORE THE CAMERA MAP →` button instead of the map, and the scroll-zoom button hidden. Click it. Expect the button block to vanish and the map to appear **correctly sized to the full container width** — a stretched or letterboxed canvas means the `handle.resize()` in the mobile handler is not firing. Confirm clusters and popups work here too.
  6. **Controls are styled on any container, not just this one** (this replaces the glow-frame check from the brief, which has no code behind it — see the intro). In the Console:

     ```js
     const el = document.getElementById('camera-map');
     const c = el.querySelector('.maplibregl-ctrl-group');
     ({ cls: el.className,
        bg: getComputedStyle(c).backgroundColor,
        radius: getComputedStyle(c).borderRadius,
        btn: getComputedStyle(c.querySelector('button')).width,
        icon: getComputedStyle(c.querySelector('.maplibregl-ctrl-icon')).filter })
     ```

     Expect exactly: `cls` contains `map-dark`, `bg: "rgba(38, 38, 38, 0.85)"`, `radius: "8px"`, `btn: "36px"`, `icon: "invert(1) brightness(0.7)"`. Those are the same computed values the old `#camera-map` rules produced, now reachable from a class any future container can set.

- [ ] **Step 11: commit**

  Stage exactly these paths — the branch has unrelated untracked files that must not ride along:

  ```bash
  git add src/scripts/map/core.ts \
          src/scripts/map/layers/cameras.ts \
          src/scripts/map/layers/cameras.test.ts \
          src/lib/escape-html.ts \
          src/lib/escape-html.test.ts \
          src/scripts/camera-map.ts \
          src/scripts/action-modal/results-renderer.ts \
          src/components/MapSection.astro \
          src/styles/global.css
  git status
  ```

  Confirm `git status` shows those nine paths and nothing else, then:

  ```bash
  git commit -m @'
  refactor: split camera-map into map core and camera layer

  camera-map.ts held a module-scope `let map` plus every camera concern in
  one 403-line file, so a second map could not exist on a page.

  - src/scripts/map/core.ts owns instantiation, the nav control, resize and
    the scroll-zoom lock, returning a MapHandle instead of a module singleton
  - src/scripts/map/layers/cameras.ts owns vendor images, the cone icon,
    direction parsing, the popup and the cluster/dot/cone layers
  - src/lib/escape-html.ts de-duplicates a helper that was byte-identical in
    camera-map.ts and action-modal/results-renderer.ts, and hardens it to
    escape " and ' in addition to & < >
  - MapSection.astro composes createMap + addCameraLayers; its MapLibre
    control and popup CSS moves from `#camera-map :global(...)` to a shared
    `.map-dark` class in global.css so a second container is not left with
    unstyled default controls

  Security fix (in scope): the old escapeHtml escaped via textContent/innerHTML
  and left quote characters raw, but showCameraPopup interpolates its output
  into src="..."/alt="..." attributes fed by third-party OSM tags. A `"` in a
  manufacturer tag broke out of the attribute and, under this repo's script-src
  'unsafe-inline', executed an injected handler — stored XSS. The merged helper
  now escapes & < > " ' with a single-pass static-map replace (no DOM, runs
  under vitest's node env); escape-html.test.ts covers all five characters and a
  manufacturer-style breakout payload.

  Pure refactor otherwise, no user-visible change. 28 unit tests covering
  parseDirection, wikimediaThumbnailUrl and createConeImage were written against
  the pre-move code and pass unchanged after it.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  '@
  ```

---

---

---

### Task 19: events page and components

Builds the public `/events` page: a baked list + month grid rendered from `src/data/events.json` at build time, merged client-side with the `/api/events` overlay, and a MapLibre map that shows a county choropleth statewide and city-centroid pins when zoomed in.

One module that other steps in this task import does not exist yet, so this task creates it before anything imports it:

- `src/lib/events-view.ts` — the pure view-model layer (merge as an add-only overlay, recurrence expansion, formatting). It touches no DOM and no network, so it gets a real failing-test-first cycle under vitest (Steps 2 and 3). The `.astro` components stay thin because all of this logic lives here.

The map itself is **not** rebuilt here. The MapLibre bootstrap already lives in `src/scripts/map/core.ts` (`createMap(opts) -> MapHandle`), extracted by the earlier map-extraction task, and the events map **composes** it: `createMap({ container: 'events-map', ..., interactive: true })` for the instance, then `addEventLayers(handle.map, ...)` from `src/scripts/map/layers/events.ts` for the choropleth and pins — the same core-plus-layer split the camera map uses (`map/core.ts` + `map/layers/cameras.ts`). This task therefore adds one new layer module beside `cameras.ts`; it does not create or touch `map/core.ts`.

Three things this task does **not** do, on purpose:

- **No filter chips** (county / event type). Design §12 lists them; they need their own task because both the Astro render path and the client patch path have to filter, and they interact with the empty state. Not in scope here — which is also why `events-view.ts` exposes no county filter yet.
- **No Umami exclusion for `/events/*`** (design §14). That edits `Base.astro`, which is on every page. Separate task.
- **No CSP edits.** Everything this page fetches (`/api/events`, `/districts/*.json`, `tiles.openfreemap.org`) is already permitted by the current `public/_headers` policy, so the mandatory action-modal smoke test is not triggered by this task.

**Files:**

- Precondition (not modified): `src/scripts/map/core.ts` and `src/lib/escape-html.ts` — created by the map-extraction task; this task composes/imports them
- Create `src/lib/events-view.ts` — pure merge / expansion / formatting helpers, shared by the Astro build and the browser
- Create `src/lib/events-view.test.ts`
- Create `scripts/build-county-shapes.mjs` — dissolves the 46 per-county district files into one simplified county-outline FeatureCollection
- Create `scripts/build-county-shapes.test.mjs`
- Create `public/districts/sc-counties.json` — generated by the script above, committed
- Create `src/scripts/map/layers/events.ts` — events-only map layers, a layer module beside `map/layers/cameras.ts`, dynamically imported
- Create `src/scripts/events-page.ts` — tabs, overlay fetch, merge, DOM patching, lazy map compose
- Create `src/components/EventsList.astro`
- Create `src/components/EventsMonth.astro`
- Create `src/components/EventsMap.astro`
- Create `src/pages/events.astro`
- Modify `package.json` — run `build-county-shapes.mjs` in `prebuild`
- Modify `lighthouserc.json` — audit `/events`

---

- [ ] **Step 1: Verify preconditions**

  **Precondition: this task composes the shared MapLibre core from the map-extraction task. `src/scripts/map/core.ts` (which exports `createMap(opts) -> MapHandle`) and `src/lib/escape-html.ts` must already exist. Do not start until the existsSync check below reports both `OK`.**

  This task consumes artifacts produced by earlier tasks. Run this from the repo root (`the repo root`):

  ```bash
  node -e "for (const f of ['src/lib/public-event.ts','src/lib/recurrence.ts','src/lib/json-island.ts','src/lib/sanitize-text.ts','src/data/events.json','src/data/city-centroids.json','src/scripts/map/core.ts','src/lib/escape-html.ts']) console.log(require('fs').existsSync(f) ? 'OK   ' + f : 'MISS ' + f)"
  ```

  Expected: eight `OK` lines. If any line reads `MISS`, stop — the task that creates that artifact has not landed yet. Do not stub these files. In particular, `src/scripts/map/core.ts` and `src/lib/escape-html.ts` come from the map-extraction task; without them this task cannot compose the shared map core or import the hardened escaper. `src/data/events.json` is the `[]` seed the scheduled-fold task (Task 15) commits to the repo — it is not created here; the fold later rewrites it in place.

  Then confirm the two data files have the shapes this task assumes:

  ```bash
  node -e "const e=require('./src/data/events.json'); console.log('events isArray:', Array.isArray(e), 'n:', e.length, 'keys:', Object.keys(e[0]||{}).join(','))"
  node -e "const c=require('./src/data/city-centroids.json'); const k=Object.keys(c)[0]; console.log('centroid sample:', k, JSON.stringify(c[k]))"
  ```

  `src/data/events.json` must be a **top-level array** of `PublicEvent` objects (`id, type, title, description, date, time, city, county, address, hasSignalGroup, recurrence, organizer, createdAt`). `src/data/city-centroids.json` must be an object keyed by city slug; the value may be either `[lng, lat]` or `{ "lng": …, "lat": … }` — the loader in Step 9 accepts both, so either is fine. Anything else (a wrapper object around the events array, a centroid keyed by display name) means the upstream task diverged; reconcile before continuing.

  Finally, confirm the two modules this task creates do **not** already exist, so Steps 2 and 9 write them from scratch rather than half-editing someone else's version:

  ```bash
  node -e "for (const f of ['src/lib/events-view.ts','src/scripts/map/layers/events.ts']) console.log(require('fs').existsSync(f) ? 'EXISTS (unexpected) ' + f : 'absent (expected) ' + f)"
  ```

  Expected: two `absent (expected)` lines.

---

- [ ] **Step 2: Write the failing test for `src/lib/events-view.ts`**

  `events-view.ts` is the whole reason the components can stay thin: merging (add-only overlay), recurrence expansion, and date formatting all live here as pure functions, so they are testable without a DOM. Write the test first.

  Create `src/lib/events-view.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import {
    mergeEvents,
    parseOverlayEnvelope,
    expandAll,
    splitByToday,
    monthAbbr,
    dayOfMonth,
    formatTime12,
    sortKey,
  } from './events-view.js';
  import type { PublicEvent } from './public-event.js';

  function ev(over: Partial<PublicEvent> = {}): PublicEvent {
    return {
      id: 'aaaaaaaa',
      type: 'meetup',
      title: 'Meetup',
      description: null,
      date: '2026-09-01',
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: null,
      hasSignalGroup: true,
      recurrence: null,
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
      ...over,
    } as PublicEvent;
  }

  describe('mergeEvents', () => {
    it('returns the baked set unchanged when the overlay is null', () => {
      const baked = [ev({ id: 'aaaaaaaa' }), ev({ id: 'bbbbbbbb' })];
      expect(mergeEvents(baked, null).map((e) => e.id)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
    });

    it('baked wins for an id present in both', () => {
      const baked = [ev({ id: 'aaaaaaaa', title: 'baked title' })];
      const overlay = [ev({ id: 'aaaaaaaa', title: 'overlay title' })];
      const merged = mergeEvents(baked, overlay);
      expect(merged).toHaveLength(1);
      expect(merged[0].title).toBe('baked title');
    });

    it('keeps a baked event the overlay omits (overlay never tombstones)', () => {
      const baked = [ev({ id: 'aaaaaaaa' }), ev({ id: 'bbbbbbbb' })];
      const overlay = [ev({ id: 'aaaaaaaa' })];
      // bbbbbbbb is absent from the overlay, but absence is not a tombstone: the
      // overlay legitimately filters revoked and past events, so a baked id it
      // omits stays visible. Revocation is handled by the fold rewriting events.json.
      expect(mergeEvents(baked, overlay).map((e) => e.id)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
    });

    it('appends overlay-only events', () => {
      const baked = [ev({ id: 'aaaaaaaa', date: '2026-09-01' })];
      const overlay = [ev({ id: 'aaaaaaaa', date: '2026-09-01' }), ev({ id: 'cccccccc', date: '2026-08-20' })];
      expect(mergeEvents(baked, overlay).map((e) => e.id)).toEqual(['cccccccc', 'aaaaaaaa']);
    });

    it('shows all baked events when the overlay is empty', () => {
      const baked = [ev({ id: 'aaaaaaaa' }), ev({ id: 'bbbbbbbb' })];
      // An empty overlay means "nothing to add", not "delete everything".
      expect(mergeEvents(baked, []).map((e) => e.id)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
    });

    it('sorts by date, then time, then id', () => {
      const baked = [
        ev({ id: 'dddddddd', date: '2026-09-01', time: '19:00' }),
        ev({ id: 'cccccccc', date: '2026-09-01', time: '19:00' }),
        ev({ id: 'bbbbbbbb', date: '2026-09-01', time: '08:00' }),
        ev({ id: 'aaaaaaaa', date: '2026-08-31', time: '23:00' }),
      ];
      expect(mergeEvents(baked, null).map((e) => e.id)).toEqual([
        'aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd',
      ]);
    });
  });

  describe('parseOverlayEnvelope', () => {
    it('returns the events array from the { events } envelope', () => {
      const events = [ev({ id: 'aaaaaaaa' }), ev({ id: 'bbbbbbbb' })];
      expect(parseOverlayEnvelope({ events })).toEqual(events);
    });

    it('returns an empty array for an empty overlay, so the merge shows baked', () => {
      // { events: [] } is a valid envelope; mergeEvents(baked, []) then keeps baked.
      expect(parseOverlayEnvelope({ events: [] })).toEqual([]);
    });

    it('returns null for any body that is not the { events: [...] } envelope', () => {
      expect(parseOverlayEnvelope(null)).toBeNull();
      expect(parseOverlayEnvelope([ev()])).toBeNull();
      expect(parseOverlayEnvelope({ events: 'nope' })).toBeNull();
      expect(parseOverlayEnvelope({})).toBeNull();
    });
  });

  describe('expandAll', () => {
    it('emits one occurrence for a non-recurring event', () => {
      const out = expandAll([ev({ date: '2026-09-01', recurrence: null })], '2027-08-18');
      expect(out.map((o) => o.date)).toEqual(['2026-09-01']);
      expect(out[0].event.id).toBe('aaaaaaaa');
    });

    it('expands a weekly series and keeps occurrences sorted across events', () => {
      const out = expandAll(
        [
          ev({ id: 'bbbbbbbb', date: '2026-09-03', recurrence: null }),
          ev({ id: 'aaaaaaaa', date: '2026-09-01', recurrence: { freq: 'weekly', until: '2026-09-15' } }),
        ],
        '2027-08-18',
      );
      expect(out.map((o) => `${o.date}:${o.event.id}`)).toEqual([
        '2026-09-01:aaaaaaaa',
        '2026-09-03:bbbbbbbb',
        '2026-09-08:aaaaaaaa',
        '2026-09-15:aaaaaaaa',
      ]);
    });

    it('never emits an occurrence past the horizon', () => {
      const out = expandAll(
        [ev({ date: '2026-09-01', recurrence: { freq: 'weekly', until: '2027-02-01' } })],
        '2026-09-20',
      );
      expect(out.every((o) => o.date <= '2026-09-20')).toBe(true);
      expect(out.length).toBeGreaterThan(0);
    });
  });

  describe('splitByToday', () => {
    it('puts today in upcoming and yesterday in past', () => {
      const occ = expandAll(
        [
          ev({ id: 'aaaaaaaa', date: '2026-08-17' }),
          ev({ id: 'bbbbbbbb', date: '2026-08-18' }),
          ev({ id: 'cccccccc', date: '2026-08-19' }),
        ],
        '2027-08-18',
      );
      const { upcoming, past } = splitByToday(occ, '2026-08-18');
      expect(upcoming.map((o) => o.date)).toEqual(['2026-08-18', '2026-08-19']);
      expect(past.map((o) => o.date)).toEqual(['2026-08-17']);
    });

    it('returns past newest-first', () => {
      const occ = expandAll(
        [ev({ id: 'aaaaaaaa', date: '2026-08-10' }), ev({ id: 'bbbbbbbb', date: '2026-08-15' })],
        '2027-08-18',
      );
      expect(splitByToday(occ, '2026-08-18').past.map((o) => o.date)).toEqual(['2026-08-15', '2026-08-10']);
    });
  });

  describe('formatters', () => {
    it('formats the month abbreviation without touching the local time zone', () => {
      expect(monthAbbr('2026-01-01')).toBe('JAN');
      expect(monthAbbr('2026-12-31')).toBe('DEC');
    });

    it('strips the leading zero from the day', () => {
      expect(dayOfMonth('2026-09-05')).toBe('5');
      expect(dayOfMonth('2026-09-22')).toBe('22');
    });

    it('converts 24h to 12h', () => {
      expect(formatTime12('00:00')).toBe('12:00 AM');
      expect(formatTime12('00:30')).toBe('12:30 AM');
      expect(formatTime12('09:05')).toBe('9:05 AM');
      expect(formatTime12('12:00')).toBe('12:00 PM');
      expect(formatTime12('19:00')).toBe('7:00 PM');
      expect(formatTime12('23:59')).toBe('11:59 PM');
    });

    it('builds a lexically sortable key', () => {
      expect(sortKey('2026-09-01', '19:00', 'aaaaaaaa')).toBe('2026-09-01T19:00#aaaaaaaa');
      expect(sortKey('2026-09-01', '08:00', 'zzzzzzzz') < sortKey('2026-09-01', '19:00', 'aaaaaaaa')).toBe(true);
    });
  });
  ```

  Run it:

  ```bash
  npx vitest run src/lib/events-view.test.ts
  ```

  Expected failure — vitest cannot resolve the module under test:

  ```
  Error: Failed to load url ./events-view.js (resolved id: ./events-view.js) in src/lib/events-view.test.ts. Does the file exist?
  ```

---

- [ ] **Step 3: Implement `src/lib/events-view.ts`**

  Create `src/lib/events-view.ts` with exactly this content:

  ```ts
  /**
   * Pure view helpers for the events calendar.
   *
   * Shared by three callers: the build-time render in src/pages/events.astro,
   * the browser patch pass in src/scripts/events-page.ts, and the tests.
   *
   * Nothing here touches the DOM, the network, or the local time zone. Dates are
   * handled as 'YYYY-MM-DD' strings and compared lexically; the only Date use is
   * Date.UTC(), which is time-zone independent. `new Date('2026-09-01')` parses as
   * UTC midnight and then renders in local time, which shifts the day west of
   * Greenwich — that bug is why none of this uses it.
   */

  import type { PublicEvent } from './public-event.js';
  import { expandOccurrences } from './recurrence.js';

  export interface Occurrence {
    /** The stored event this occurrence belongs to. */
    event: PublicEvent;
    /** ISO 'YYYY-MM-DD' for this specific occurrence. */
    date: string;
  }

  const MONTHS_ABBR = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ] as const;

  const MONTHS_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ] as const;

  /** Lexically sortable key: date, then time, then id as the tiebreak. */
  export function sortKey(date: string, time: string, id: string): string {
    return `${date}T${time}#${id}`;
  }

  /**
   * Merge the git-baked event set with the /api/events overlay.
   *
   * Overlay ADDS, never removes. Start from the full baked set; the overlay can
   * only contribute ids the baked set does not already carry.
   *
   *   overlay === null  -> the fetch failed; render baked only (graceful degradation)
   *   overlay === []    -> nothing to add; render baked only
   *   id in both        -> the baked record wins (git is the authoritative content)
   *   baked only        -> kept; the overlay legitimately omits revoked and past
   *                        events, so its absence is NOT a tombstone. Revocation is
   *                        enforced by the fold rewriting events.json and by /go
   *                        refusing the link in the meantime, never by this merge.
   *   overlay only      -> appended (submitted since the last weekly fold)
   */
  export function mergeEvents(
    baked: readonly PublicEvent[],
    overlay: readonly PublicEvent[] | null,
  ): PublicEvent[] {
    const out: PublicEvent[] = [...baked];

    if (overlay) {
      const bakedIds = new Set(baked.map((e) => e.id));
      for (const e of overlay) if (!bakedIds.has(e.id)) out.push(e);
    }

    out.sort((a, b) =>
      sortKey(a.date, a.time, a.id) < sortKey(b.date, b.time, b.id) ? -1 : 1,
    );
    return out;
  }

  /**
   * Pull the event array out of the /api/events response envelope.
   *
   * The endpoint returns `{ events: PublicEvent[] }` (netlify/functions/events.ts),
   * never a bare array. Any body that is not that envelope — a bare array, null, a
   * malformed shape — returns null, which mergeEvents() treats as "overlay
   * unavailable, show baked", the same graceful path as a failed fetch. An empty
   * `{ events: [] }` returns `[]`, which merges to the baked set unchanged.
   */
  export function parseOverlayEnvelope(body: unknown): PublicEvent[] | null {
    if (
      body !== null &&
      typeof body === 'object' &&
      Array.isArray((body as { events?: unknown }).events)
    ) {
      return (body as { events: PublicEvent[] }).events;
    }
    return null;
  }

  /**
   * Expand every event's recurrence rule into dated occurrences, bounded by
   * `horizonEndIso`, and return them in calendar order.
   */
  export function expandAll(
    events: readonly PublicEvent[],
    horizonEndIso: string,
  ): Occurrence[] {
    const out: Occurrence[] = [];
    for (const event of events) {
      for (const date of expandOccurrences(event.date, event.recurrence, horizonEndIso)) {
        out.push({ event, date });
      }
    }
    out.sort((a, b) =>
      sortKey(a.date, a.event.time, a.event.id) < sortKey(b.date, b.event.time, b.event.id)
        ? -1
        : 1,
    );
    return out;
  }

  /**
   * Split expanded occurrences at `todayIso`. Today counts as upcoming.
   * `past` comes back newest-first, which is the order it is displayed in.
   */
  export function splitByToday(
    occurrences: readonly Occurrence[],
    todayIso: string,
  ): { upcoming: Occurrence[]; past: Occurrence[] } {
    const upcoming: Occurrence[] = [];
    const past: Occurrence[] = [];
    for (const o of occurrences) (o.date >= todayIso ? upcoming : past).push(o);
    past.reverse();
    return { upcoming, past };
  }

  /** 'AUG' for '2026-08-22'. */
  export function monthAbbr(iso: string): string {
    return MONTHS_ABBR[Number(iso.slice(5, 7)) - 1];
  }

  /** 'August' for '2026-08-22'. */
  export function monthLong(year: number, monthIndex0: number): string {
    return MONTHS_LONG[monthIndex0];
  }

  /** '22' for '2026-08-22', '5' for '2026-08-05'. */
  export function dayOfMonth(iso: string): string {
    return String(Number(iso.slice(8, 10)));
  }

  /** '7:00 PM' for '19:00'. */
  export function formatTime12(hhmm: string): string {
    const h = Number(hhmm.slice(0, 2));
    const m = hhmm.slice(3, 5);
    const suffix = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${suffix}`;
  }

  /** 0 = Sunday. Uses Date.UTC so the result never depends on the runtime zone. */
  export function weekdayIndex(iso: string): number {
    return new Date(
      Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))),
    ).getUTCDay();
  }

  /** Days in the given month. `monthIndex0` is 0-based. */
  export function daysInMonth(year: number, monthIndex0: number): number {
    return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  }

  /** 'YYYY-MM-DD' from numeric parts. */
  export function isoDate(year: number, monthIndex0: number, day: number): string {
    const mm = String(monthIndex0 + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  /** `iso` shifted forward by `months`, clamped to the last day of the target month. */
  export function addMonths(iso: string, months: number): string {
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7)) - 1;
    const d = Number(iso.slice(8, 10));
    const targetY = y + Math.floor((m + months) / 12);
    const targetM = ((m + months) % 12 + 12) % 12;
    return isoDate(targetY, targetM, Math.min(d, daysInMonth(targetY, targetM)));
  }

  /**
   * Group occurrences by calendar month, keyed 'YYYY-MM', keys in calendar order.
   * EventsMonth.astro renders a fixed three-month window and reads from this map.
   */
  export function groupByMonth(
    occurrences: readonly Occurrence[],
  ): Map<string, Occurrence[]> {
    const out = new Map<string, Occurrence[]>();
    for (const o of occurrences) {
      const key = o.date.slice(0, 7);
      const bucket = out.get(key);
      if (bucket) bucket.push(o);
      else out.set(key, [o]);
    }
    return new Map([...out.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  }
  ```

  Run again:

  ```bash
  npx vitest run src/lib/events-view.test.ts
  ```

  Expected: `Test Files  1 passed (1)` with all 18 tests passing.

  Commit:

  ```bash
  git add src/lib/events-view.ts src/lib/events-view.test.ts
  git commit -m "feat(events): shared view helpers for merge, expansion, and formatting"
  ```

---

- [ ] **Step 4: Write the failing test for `scripts/build-county-shapes.mjs`**

  Context for why this script exists: design §11 says "the 46 county polygons already ship in `public/districts/`." They do not. What ships is 46 files of *council district* polygons (Greenville alone is 12 features, 29 KB). Feeding those straight to a `fill` layer draws internal district seams at statewide zoom and costs ~1.2 MB. This script dissolves each county's districts into its outer boundary and simplifies it, producing one 79 KB file (~15 KB brotli).

  The dissolve is edge cancellation: districts partition their county, so every internal edge appears twice in opposite directions and cancels; what survives is the county outline. Coordinates are snapped to 4 decimals (~11 m) first, because the ArcGIS and TIGER sources do not agree on shared vertices to full float precision.

  Create `scripts/build-county-shapes.test.mjs`:

  ```js
  import { describe, it, expect } from 'vitest';
  import { dissolveRings, simplifyRing, ringArea } from './build-county-shapes.mjs';

  // Two unit squares sharing the edge x=1. Dissolved, they are one 2x1 rectangle.
  const left = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const right = [[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]];

  describe('dissolveRings', () => {
    it('returns a single ring for two squares sharing an edge', () => {
      const out = dissolveRings([left, right]);
      expect(out).toHaveLength(1);
      expect(Math.abs(ringArea(out[0]))).toBeCloseTo(2, 6);
    });

    it('closes the ring it returns', () => {
      const [ring] = dissolveRings([left, right]);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    });

    it('drops the shared edge from the output', () => {
      const [ring] = dissolveRings([left, right]);
      const interior = ring.filter((p) => p[0] === 1 && p[1] > 0 && p[1] < 1);
      expect(interior).toEqual([]);
    });

    it('returns two rings for two disjoint squares', () => {
      const far = [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]];
      expect(dissolveRings([left, far])).toHaveLength(2);
    });

    it('snaps near-identical vertices so they still cancel', () => {
      const rightNudged = [[1.00001, 0], [2, 0], [2, 1], [1.00001, 1], [1.00001, 0]];
      expect(dissolveRings([left, rightNudged])).toHaveLength(1);
    });

    it('returns an empty array for no input', () => {
      expect(dissolveRings([])).toEqual([]);
    });
  });

  describe('simplifyRing', () => {
    it('drops collinear midpoints', () => {
      const ring = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
      const out = simplifyRing(ring, 0.001);
      expect(out).toHaveLength(5);
      expect(out.some((p) => p[0] === 1 && p[1] === 0)).toBe(false);
    });

    it('keeps a vertex whose deviation exceeds the tolerance', () => {
      const ring = [[0, 0], [1, 0.5], [2, 0], [2, 2], [0, 2], [0, 0]];
      expect(simplifyRing(ring, 0.1)).toHaveLength(6);
    });

    it('leaves the ring closed', () => {
      const ring = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
      const out = simplifyRing(ring, 0.001);
      expect(out[0]).toEqual(out[out.length - 1]);
    });

    it('never collapses a ring below a triangle', () => {
      const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
      expect(simplifyRing(ring, 1000).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('ringArea', () => {
    it('is positive for a counter-clockwise ring', () => {
      expect(ringArea(left)).toBeCloseTo(1, 6);
    });

    it('is negative for a clockwise ring', () => {
      expect(ringArea([...left].reverse())).toBeCloseTo(-1, 6);
    });
  });
  ```

  Run it:

  ```bash
  npx vitest run scripts/build-county-shapes.test.mjs
  ```

  Expected failure:

  ```
  Error: Failed to load url ./build-county-shapes.mjs (resolved id: ./build-county-shapes.mjs) in scripts/build-county-shapes.test.mjs. Does the file exist?
  ```

---

- [ ] **Step 5: Implement `scripts/build-county-shapes.mjs`**

  Create `scripts/build-county-shapes.mjs` with exactly this content:

  ```js
  /**
   * Build public/districts/sc-counties.json — one simplified outline per SC county —
   * from the 46 per-county council-district files that sync-open-civics.mjs copies
   * into public/districts/.
   *
   * Run as part of prebuild, after sync-open-civics.mjs:
   *   node scripts/build-county-shapes.mjs
   *
   * Why: the events map draws a county choropleth below z8. Rendering the raw
   * district polygons would draw internal district seams and cost ~1.2 MB.
   * Dissolving and simplifying gives ~79 KB (~15 KB brotli) with no seams.
   *
   * Method: council districts partition their county, so every interior edge appears
   * twice in opposite directions. Cancel matched edge pairs, stitch what is left into
   * rings, drop slivers, then Douglas-Peucker at 0.004 degrees (~440 m, about 1 px at
   * z8 which is where the choropleth fades out anyway).
   *
   * Vertices are snapped to 4 decimals (~11 m) before cancellation because the ArcGIS
   * and TIGER-derived sources do not agree on shared vertices to full float precision.
   */

  import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
  import { dirname, join, resolve } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const SNAP_DECIMALS = 4;
  const SIMPLIFY_TOLERANCE = 0.004;
  const SLIVER_AREA = 1e-4; // square degrees; below this a dissolved ring is noise
  const OUTPUT_DECIMALS = 4;

  const snap = (p) => [
    Number(p[0].toFixed(SNAP_DECIMALS)),
    Number(p[1].toFixed(SNAP_DECIMALS)),
  ];
  const key = (p) => `${p[0]},${p[1]}`;

  /** Shoelace area. Positive for counter-clockwise rings. */
  export function ringArea(ring) {
    let a = 0;
    for (let i = 0; i + 1 < ring.length; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return a / 2;
  }

  /**
   * Dissolve a set of closed rings into their outer boundary rings.
   * Input rings are [[lng, lat], ...] with the first point repeated last.
   * Returns closed rings; returns [] if nothing stitches (caller falls back).
   */
  export function dissolveRings(rings) {
    const edges = new Map();

    for (const raw of rings) {
      const ring = raw.map(snap);
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = key(ring[i]);
        const b = key(ring[i + 1]);
        if (a === b) continue;
        const rev = `${b}|${a}`;
        if (edges.has(rev)) { edges.delete(rev); continue; }
        const fwd = `${a}|${b}`;
        if (edges.has(fwd)) { edges.delete(fwd); continue; }
        edges.set(fwd, [ring[i], ring[i + 1]]);
      }
    }

    // Adjacency: start-vertex key -> list of outgoing segments.
    const adj = new Map();
    for (const [k, seg] of edges) {
      const from = k.slice(0, k.indexOf('|'));
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from).push(seg);
    }

    const out = [];
    for (const [start, list] of adj) {
      while (list.length) {
        const first = list.shift();
        const ring = [first[0], first[1]];
        let cur = key(first[1]);
        let guard = 0;
        while (cur !== start && guard++ < 500000) {
          const next = adj.get(cur);
          if (!next || !next.length) break;
          const seg = next.shift();
          ring.push(seg[1]);
          cur = key(seg[1]);
        }
        if (cur === start && ring.length >= 4) out.push(ring);
      }
    }
    return out;
  }

  function perpendicularDistance(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
    );
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  /** Iterative Douglas-Peucker over a closed ring. Returns a closed ring. */
  export function simplifyRing(ring, tolerance) {
    if (ring.length < 5) return ring;
    const open = ring.slice(0, -1);
    const keep = new Uint8Array(open.length);
    keep[0] = 1;
    keep[open.length - 1] = 1;

    const stack = [[0, open.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let idx = -1;
      let max = 0;
      for (let i = s + 1; i < e; i++) {
        const d = perpendicularDistance(open[i], open[s], open[e]);
        if (d > max) { max = d; idx = i; }
      }
      if (max > tolerance) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }

    const res = [];
    for (let i = 0; i < open.length; i++) if (keep[i]) res.push(open[i]);
    if (res.length < 3) return ring;
    res.push(res[0]);
    return res;
  }

  function collectRings(featureCollection) {
    const rings = [];
    for (const feature of featureCollection.features ?? []) {
      const g = feature.geometry;
      if (!g) continue;
      if (g.type === 'Polygon') rings.push(...g.coordinates);
      else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) rings.push(...poly);
    }
    return rings;
  }

  function main() {
    const here = dirname(fileURLToPath(import.meta.url));
    const districtsDir = join(here, '..', 'public', 'districts');
    const outPath = join(districtsDir, 'sc-counties.json');

    const files = readdirSync(districtsDir)
      .filter((f) => f.startsWith('county-') && f.endsWith('.json'))
      .sort();

    const round = (v) => Number(v.toFixed(OUTPUT_DECIMALS));
    const features = [];
    const fallbacks = [];

    for (const file of files) {
      const county = file.replace(/^county-/, '').replace(/\.json$/, '');
      const fc = JSON.parse(readFileSync(join(districtsDir, file), 'utf-8'));
      const rings = collectRings(fc);

      let outline = dissolveRings(rings).filter((r) => Math.abs(ringArea(r)) > SLIVER_AREA);
      if (!outline.length) {
        // Stitching failed (overlapping or malformed district geometry). Fall back to
        // the raw district rings: the fill still covers the county, it just carries
        // internal seams. Reported below so it is visible, not silent.
        outline = rings;
        fallbacks.push(county);
      }

      const simplified = outline
        .map((r) => simplifyRing(r, SIMPLIFY_TOLERANCE).map((p) => [round(p[0]), round(p[1])]))
        .filter((r) => r.length >= 4);

      features.push({
        type: 'Feature',
        properties: { county },
        geometry: { type: 'MultiPolygon', coordinates: simplified.map((r) => [r]) },
      });
    }

    const json = JSON.stringify({ type: 'FeatureCollection', features });
    writeFileSync(outPath, json + '\n');
    console.log(
      `Wrote ${features.length} county outlines to public/districts/sc-counties.json ` +
        `(${json.length} bytes)`,
    );
    if (fallbacks.length) {
      console.log(`  dissolve fell back to raw district rings for: ${fallbacks.join(', ')}`);
    }
    if (features.length !== 46) {
      throw new Error(`Expected 46 SC counties, found ${features.length}`);
    }
  }

  const invokedDirectly =
    process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
  if (invokedDirectly) main();
  ```

  Run the test again:

  ```bash
  npx vitest run scripts/build-county-shapes.test.mjs
  ```

  Expected: `Test Files  1 passed (1)`, 12 tests passing.

---

- [ ] **Step 6: Generate `public/districts/sc-counties.json` and wire it into prebuild**

  Run the script:

  ```bash
  node scripts/build-county-shapes.mjs
  ```

  Expected output, exactly two lines:

  ```
  Wrote 46 county outlines to public/districts/sc-counties.json (79445 bytes)
    dissolve fell back to raw district rings for: jasper
  ```

  Jasper's district file contains a district named `nan` that overlaps its neighbours, so its edges do not cancel. The fallback renders correctly (the fill still covers the county); only its internal seams survive. Do not chase it.

  Sanity-check the result:

  ```bash
  node -e "const fc=require('./public/districts/sc-counties.json'); console.log(fc.features.length, 'features'); console.log(fc.features.slice(0,3).map(f=>f.properties.county+':'+f.geometry.coordinates.length+' rings').join(' '))"
  ```

  Expected:

  ```
  46 features
  abbeville:1 rings aiken:1 rings allendale:2 rings
  ```

  Now edit `package.json` so the file regenerates whenever the upstream boundaries change. Replace this line:

  ```json
      "prebuild": "node scripts/sync-open-civics.mjs",
  ```

  with:

  ```json
      "prebuild": "node scripts/sync-open-civics.mjs && node scripts/build-county-shapes.mjs",
  ```

  Commit:

  ```bash
  git add scripts/build-county-shapes.mjs scripts/build-county-shapes.test.mjs public/districts/sc-counties.json package.json
  git commit -m "feat(events): dissolve SC county outlines for the events map choropleth"
  ```

---

- [ ] **Step 7: Create `src/components/EventsList.astro`**

  All event-card CSS lives in a single global block in `events.astro` (Step 10), **not** here. Astro scoped styles stamp a `data-astro-*` attribute onto elements in the template; cards that `events-page.ts` creates at runtime have no such attribute and would render unstyled. The class names below are the contract between this component and the runtime renderer in Step 11 — if you change one, change the other.

  The component stays thin because every date and time decision was made in `events-view.ts`: it maps over already-expanded, already-split, already-sorted occurrences.

  Create `src/components/EventsList.astro`:

  ```astro
  ---
  import type { Occurrence } from '../lib/events-view.js';
  import { monthAbbr, dayOfMonth, formatTime12, sortKey } from '../lib/events-view.js';

  interface Props {
    upcoming: Occurrence[];
    past: Occurrence[];
    cityNames: Record<string, string>;
    countyNames: Record<string, string>;
  }

  const { upcoming, past, cityNames, countyNames } = Astro.props;

  const place = (o: Occurrence) =>
    `${cityNames[o.event.city] ?? o.event.city} · ${countyNames[o.event.county] ?? o.event.county} County`;
  ---

  <div class="events-list-wrap">
    <p class="events-count label-mono text-[#737373]">
      <span id="events-count">{upcoming.length}</span> upcoming
    </p>

    <ul id="events-list" class="events-list" aria-live="polite">
      {upcoming.map((o) => (
        <li
          class="event-card"
          data-event-id={o.event.id}
          data-date={o.date}
          data-sort={sortKey(o.date, o.event.time, o.event.id)}
        >
          <div class="event-date" aria-hidden="true">
            <span class="event-date-mon">{monthAbbr(o.date)}</span>
            <span class="event-date-day">{dayOfMonth(o.date)}</span>
          </div>
          <div class="event-body">
            <h3 class="event-title">{o.event.title}</h3>
            <p class="event-meta">
              <span class="sr-only">{o.date} </span>{formatTime12(o.event.time)} · {place(o)}
            </p>
            {o.event.address && <p class="event-address">{o.event.address}</p>}
            {o.event.description && <p class="event-desc">{o.event.description}</p>}
            <p class="event-actions">
              <span class={`event-badge ${o.event.type === 'meetup' ? 'event-badge-meetup' : 'event-badge-public'}`}>
                {o.event.type === 'meetup' ? 'Location in group' : 'Public event'}
              </span>
              {o.event.hasSignalGroup && (
                <a class="event-signal" href={`/go/${o.event.id}`} rel="noreferrer">Join Signal group</a>
              )}
            </p>
          </div>
        </li>
      ))}
    </ul>

    <div id="events-empty" class="events-empty" hidden={upcoming.length > 0}>
      <p class="events-empty-lead">Nothing on the calendar right now.</p>
      <p class="events-empty-proof">
        {past.length > 0
          ? `${past.length} ${past.length === 1 ? 'event has' : 'events have'} run in the last 30 days.`
          : 'Be the first to put something on it.'}
      </p>
      <p class="events-empty-actions">
        <a class="event-signal" href="mailto:hello@deflocksc.org">Email us</a>
        <button id="intake-open" type="button" class="event-signal event-signal-btn">Join the Signal group</button>
      </p>
    </div>

    {past.length > 0 && (
      <details class="events-past">
        <summary class="label-mono">Past events ({past.length})</summary>
        <ul class="events-past-list">
          {past.map((o) => (
            <li class="event-past-row">
              <span class="event-past-date">{monthAbbr(o.date)} {dayOfMonth(o.date)}</span>
              <span class="event-title event-past-title">{o.event.title}</span>
              <span class="event-past-place">{place(o)}</span>
            </li>
          ))}
        </ul>
      </details>
    )}
  </div>
  ```

  Note the past rows carry **no** `/go/` link and no `data-event-id`: the redirect refuses past events server-side anyway (design §9), and leaving the id off keeps the client patch pass from touching them.

---

- [ ] **Step 8: Create `src/components/EventsMonth.astro`**

  Three stacked month grids starting with the current month. Three fixed months rather than a navigable one so the whole view is server-rendered and works with JavaScript off — there is no client-side month navigation to duplicate.

  Create `src/components/EventsMonth.astro`:

  ```astro
  ---
  import type { Occurrence } from '../lib/events-view.js';
  import {
    monthLong,
    daysInMonth,
    weekdayIndex,
    isoDate,
    formatTime12,
    sortKey,
  } from '../lib/events-view.js';

  interface Props {
    occurrences: Occurrence[];
    today: string;
    cityNames: Record<string, string>;
  }

  const { occurrences, today, cityNames } = Astro.props;

  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    if (!byDay.has(o.date)) byDay.set(o.date, []);
    byDay.get(o.date)!.push(o);
  }

  const startYear = Number(today.slice(0, 4));
  const startMonth = Number(today.slice(5, 7)) - 1;

  const months = [0, 1, 2].map((offset) => {
    const year = startYear + Math.floor((startMonth + offset) / 12);
    const month = (startMonth + offset) % 12;
    const first = isoDate(year, month, 1);
    const lead = weekdayIndex(first);
    const total = daysInMonth(year, month);
    return {
      label: `${monthLong(year, month)} ${year}`,
      lead: Array.from({ length: lead }, (_, i) => i),
      days: Array.from({ length: total }, (_, i) => isoDate(year, month, i + 1)),
    };
  });

  const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  ---

  <div class="events-months">
    {months.map((m) => (
      <section class="month-block" aria-label={m.label}>
        <h3 class="month-title">{m.label}</h3>
        <div class="month-dow" aria-hidden="true">
          {DOW.map((d) => <span>{d}</span>)}
        </div>
        <div class="month-grid">
          {m.lead.map(() => <div class="month-cell month-cell-empty" aria-hidden="true"></div>)}
          {m.days.map((iso) => (
            <div class={`month-cell${iso === today ? ' month-cell-today' : ''}`} data-day={iso}>
              <span class="month-daynum">{Number(iso.slice(8, 10))}</span>
              <div class="month-chips" data-chips={iso}>
                {(byDay.get(iso) ?? []).map((o) => (
                  <a
                    class="month-chip"
                    href={`#event-${o.event.id}`}
                    data-event-id={o.event.id}
                    data-sort={sortKey(o.date, o.event.time, o.event.id)}
                    title={`${formatTime12(o.event.time)} · ${cityNames[o.event.city] ?? o.event.city}`}
                  >
                    <span class="event-title month-chip-title">{o.event.title}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
  ```

---

- [ ] **Step 9: Create `src/scripts/map/layers/events.ts` and `src/components/EventsMap.astro`**

  **This map must never fetch `/camera-data.json`.** That file is 804 KB, same-origin and billed, and is the difference between a 470 KB and a 1,274 KB events page (design §11). Nothing in this layer module or in `map/core.ts` references it, and the events page never imports `map/layers/cameras.ts` (the camera GeoJSON is fetched by `MapSection.astro`, never by a shared module). Keeping cameras and events as separate layer modules over one shared `map/core.ts` is exactly what guarantees the camera fetch can never reach this page.

  `events.ts` is a layer module in the same shape as `map/layers/cameras.ts`: it takes a map that `map/core.ts` already built and whose style has loaded, and adds its sources, layers, and handlers to it. It exports `addEventLayers(map, { counties, events, centroids, cityNames })`, `removeEventLayers(map)`, and `setEventData(map, occurrences)` (the overlay merge pushes a fresh occurrence set through the last one). Per-map state lives in a `WeakMap` keyed by the map — the same handler-bookkeeping pattern `cameras.ts` uses for teardown, not a layer registry. The composer (`events-page.ts`, Step 11) fetches the county outlines and imports the city centroids and passes them in, exactly as `MapSection.astro` fetches the camera GeoJSON and passes it to `addCameraLayers`.

  Create `src/scripts/map/layers/events.ts`:

  ```ts
  /**
   * Events layer.
   *
   * Everything the /events map needs on top of the shared map core: the SC county
   * choropleth with count badges below z8, the crossfade to city-centroid pins
   * above z8, the county-select highlight, and the city/county click handlers.
   *
   * A layer module in the same shape as map/layers/cameras.ts: it takes a map that
   * map/core.ts already built (createMap -> MapHandle) and whose style has loaded,
   * and adds sources, layers and handlers to it. It does NOT build a map, and it
   * does NOT own view state (fit/center lives in the composer).
   *
   * Deliberately does NOT import map/layers/cameras.ts and does NOT fetch
   * /camera-data.json. That 804 KB file is the difference between a 470 KB and a
   * 1,274 KB events page (design §11); a separate layer module is what keeps it
   * unreachable from this page.
   */

  import maplibregl from 'maplibre-gl';
  import { escapeHtml } from '../../../lib/escape-html.js';
  import type { Occurrence } from '../../../lib/events-view.js';

  /** [lng, lat] per city slug. */
  export type Centroids = Record<string, [number, number]>;

  export interface EventLayerData {
    /** County outlines, from /districts/sc-counties.json. */
    counties: GeoJSON.FeatureCollection;
    /** The occurrences to plot. */
    events: readonly Occurrence[];
    /**
     * City centroids keyed by slug. Each value is either [lng, lat] or
     * { lng, lat }; both are accepted, so raw src/data/city-centroids.json works.
     */
    centroids: Record<string, unknown>;
    /** Display names per city slug, for the pin labels. */
    cityNames: Record<string, string>;
  }

  interface EventLayerState {
    counties: GeoJSON.FeatureCollection;
    centroids: Centroids;
    cityNames: Record<string, string>;
    teardown: () => void;
  }

  const EVENT_LAYER_IDS = [
    'county-fill',
    'county-outline',
    'county-highlight',
    'county-badge',
    'city-dots',
    'city-labels',
  ];

  /** Per-map state, so setEventData can recompute and removeEventLayers can unbind. */
  const eventStates = new WeakMap<maplibregl.Map, EventLayerState>();

  /** Accepts either [lng, lat] or { lng, lat } per city slug. */
  function normalizeCentroids(raw: Record<string, unknown>): Centroids {
    const out: Centroids = {};
    for (const [slug, value] of Object.entries(raw)) {
      if (Array.isArray(value) && value.length >= 2) {
        out[slug] = [Number(value[0]), Number(value[1])];
      } else if (value && typeof value === 'object') {
        const v = value as Record<string, unknown>;
        if (typeof v.lng === 'number' && typeof v.lat === 'number') out[slug] = [v.lng, v.lat];
      }
    }
    return out;
  }

  function countBy(occurrences: readonly Occurrence[], field: 'county' | 'city'): Map<string, number> {
    const counts = new Map<string, number>();
    for (const o of occurrences) {
      const k = o.event[field];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }

  function cityFeatureCollection(
    state: EventLayerState,
    occurrences: readonly Occurrence[],
  ): GeoJSON.FeatureCollection {
    const counts = countBy(occurrences, 'city');
    const features: GeoJSON.Feature[] = [];
    for (const [slug, count] of counts) {
      const coords = state.centroids[slug];
      if (!coords) {
        console.warn(`events-map: no centroid for city "${slug}"`);
        continue;
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: { city: slug, label: state.cityNames[slug] ?? slug, count },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  function applyCountyCounts(
    map: maplibregl.Map,
    state: EventLayerState,
    occurrences: readonly Occurrence[],
  ): void {
    const source = map.getSource('sc-counties') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const counts = countBy(occurrences, 'county');
    for (const f of state.counties.features) {
      const slug = String(f.properties?.county ?? '');
      (f.properties as Record<string, unknown>).count = counts.get(slug) ?? 0;
    }
    source.setData(state.counties);
  }

  /**
   * Push a new occurrence set at an events map. Recomputes county counts and city
   * pins from the map's stored state. No-op if the map has no event layers yet.
   */
  export function setEventData(map: maplibregl.Map, occurrences: readonly Occurrence[]): void {
    const state = eventStates.get(map);
    if (!state) return;
    applyCountyCounts(map, state, occurrences);
    (map.getSource('event-cities') as maplibregl.GeoJSONSource | undefined)
      ?.setData(cityFeatureCollection(state, occurrences));
  }

  /**
   * Add the events choropleth, city pins, highlight and interactions to a map that
   * map/core.ts already created and whose style has finished loading.
   */
  export function addEventLayers(map: maplibregl.Map, data: EventLayerData): void {
    const counties = data.counties;
    for (const f of counties.features) (f.properties as Record<string, unknown>).count = 0;

    const state: EventLayerState = {
      counties,
      centroids: normalizeCentroids(data.centroids),
      cityNames: data.cityNames,
      teardown: () => {},
    };

    map.addSource('sc-counties', { type: 'geojson', data: counties });
    map.addSource('event-cities', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addSource('county-selected', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // --- Below z8: county choropleth + count badges ---

    map.addLayer({
      id: 'county-fill',
      type: 'fill',
      source: 'sc-counties',
      filter: ['>', ['get', 'count'], 0],
      paint: {
        'fill-color': [
          'interpolate', ['linear'], ['get', 'count'],
          1, '#7f1d1d',
          3, '#b91c1c',
          8, '#ef4444',
        ],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.55, 8, 0],
      },
    });

    map.addLayer({
      id: 'county-outline',
      type: 'line',
      source: 'sc-counties',
      filter: ['>', ['get', 'count'], 0],
      paint: {
        'line-color': '#fca5a5',
        'line-width': 1,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 8, 0],
      },
    });

    // County-select highlight. Its own source so a setData on sc-counties (a count
    // refresh) never disturbs the selection, and vice versa.
    map.addLayer({
      id: 'county-highlight',
      type: 'line',
      source: 'county-selected',
      paint: {
        'line-color': '#fbbf24',
        'line-width': 2,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.9, 8, 0],
      },
    });

    map.addLayer({
      id: 'county-badge',
      type: 'symbol',
      source: 'sc-counties',
      filter: ['>', ['get', 'count'], 0],
      layout: {
        'text-field': ['to-string', ['get', 'count']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#450a0a',
        'text-halo-width': 1.4,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 8, 0],
      },
    });

    // --- Above z8: city-centroid pins ---

    map.addLayer({
      id: 'city-dots',
      type: 'circle',
      source: 'event-cities',
      paint: {
        'circle-color': '#ef4444',
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 7, 5, 13],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.75)',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.95],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.9],
      },
    });

    map.addLayer({
      id: 'city-labels',
      type: 'symbol',
      source: 'event-cities',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-anchor': 'top',
        'text-offset': [0, 1.1],
      },
      paint: {
        'text-color': '#e8e8e8',
        'text-halo-color': '#0d0d0d',
        'text-halo-width': 1.4,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1],
      },
    });

    state.teardown = bindEventInteractions(map);
    eventStates.set(map, state);

    // Seed the sources now that the state (and its centroids) is registered.
    setEventData(map, data.events);
  }

  export function removeEventLayers(map: maplibregl.Map): void {
    eventStates.get(map)?.teardown();
    eventStates.delete(map);
    for (const id of EVENT_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of ['sc-counties', 'event-cities', 'county-selected']) {
      if (map.getSource(id)) map.removeSource(id);
    }
  }

  function bindEventInteractions(map: maplibregl.Map): () => void {
    // City pin -> popup. The pin is a city centroid, not a venue; the copy says so —
    // overstating a privacy control on an anti-surveillance site costs more than not
    // having one.
    const onCityClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const label = String(f.properties?.label ?? '');
      const count = Number(f.properties?.count ?? 0);
      const html =
        `<div class="events-popup">` +
        `<strong>${escapeHtml(label)}</strong>` +
        `<span>${count} ${count === 1 ? 'event' : 'events'}</span>` +
        `<em>Exact location shared in the group.</em>` +
        `</div>`;
      new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: 14 })
        .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(html)
        .addTo(map);
    };

    // County fill -> highlight the clicked county and ease in past the crossfade.
    const onCountyClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const selected = map.getSource('county-selected') as maplibregl.GeoJSONSource | undefined;
      selected?.setData({
        type: 'FeatureCollection',
        features: f ? [{ type: 'Feature', geometry: f.geometry, properties: {} }] : [],
      });
      map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom() + 2, 8.5) });
    };

    const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { map.getCanvas().style.cursor = ''; };

    map.on('click', 'city-dots', onCityClick);
    map.on('click', 'county-fill', onCountyClick);
    map.on('mouseenter', 'city-dots', onEnter);
    map.on('mouseleave', 'city-dots', onLeave);
    map.on('mouseenter', 'county-fill', onEnter);
    map.on('mouseleave', 'county-fill', onLeave);

    return () => {
      map.off('click', 'city-dots', onCityClick);
      map.off('click', 'county-fill', onCountyClick);
      map.off('mouseenter', 'city-dots', onEnter);
      map.off('mouseleave', 'city-dots', onLeave);
      map.off('mouseenter', 'county-fill', onEnter);
      map.off('mouseleave', 'county-fill', onLeave);
    };
  }
  ```

  Create `src/components/EventsMap.astro`.

  ```astro
  ---
  ---

  <div id="events-map-frame" class="events-map-frame">
    <div class="map-badge" aria-hidden="true">
      <span class="map-live-dot"></span>
      SC Events
    </div>
    <div
      id="events-map"
      role="application"
      aria-label="Map of DeflockSC events by county and city"
    ></div>
    <noscript>
      <p class="events-map-noscript">
        The map needs JavaScript. The list and month views below work without it.
      </p>
    </noscript>
    <p class="events-map-attrib">
      Tiles by <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
      · <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>
      · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap</a>
      · Pins mark a city centre, never a venue.
    </p>
  </div>

  <style>
    .events-map-frame {
      position: relative;
      background: #0d0d0d;
      border: 1px solid rgba(255, 255, 255, 0.07);
    }

    #events-map {
      width: 100%;
      height: 58vh;
      min-height: 340px;
      clip-path: inset(0);
    }

    @media (min-width: 1024px) {
      #events-map {
        height: min(68vh, 620px);
      }
    }

    .events-map-noscript,
    .events-map-attrib {
      padding: 0.5rem 0.75rem;
      margin: 0;
      color: #737373;
      font-size: 11px;
      line-height: 1.5;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }

    .events-map-attrib a {
      color: #a3a3a3;
    }

    .map-badge {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 10;
      font-family: 'DM Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #e8e8e8;
      background: rgba(13, 13, 13, 0.85);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      padding: 5px 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }

    .map-live-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #dc2626;
      flex-shrink: 0;
      animation: map-dot-blink 2s ease-in-out infinite;
    }

    @keyframes map-dot-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.25; }
    }

    @media (prefers-reduced-motion: reduce) {
      .map-live-dot { animation: none; }
    }

    /* MapLibre control + popup chrome, scoped to this container. The shared
       `.map-dark` class in src/styles/global.css carries the same skin for the
       camera map; these scoped copies keep #events-map self-contained without
       depending on that class. */
    #events-map :global(.maplibregl-ctrl-group) {
      background: rgba(38, 38, 38, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(64, 64, 64, 0.6);
      border-radius: 0.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    #events-map :global(.maplibregl-ctrl-group button) {
      width: 36px;
      height: 36px;
    }

    #events-map :global(.maplibregl-ctrl-group button + button) {
      border-top: 1px solid #404040;
    }

    #events-map :global(.maplibregl-ctrl-group button .maplibregl-ctrl-icon) {
      filter: invert(1) brightness(0.7);
    }

    #events-map :global(.maplibregl-ctrl-group button:hover .maplibregl-ctrl-icon) {
      filter: invert(1) brightness(0.9);
    }

    #events-map :global(.maplibregl-popup-content) {
      background: #262626;
      border: 1px solid #404040;
      border-radius: 0.75rem;
      padding: 12px 14px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    #events-map :global(.maplibregl-popup-tip) {
      border-top-color: #262626;
    }

    #events-map :global(.maplibregl-popup-close-button) {
      color: #737373;
      font-size: 18px;
      padding: 2px 6px;
    }

    :global(.events-popup) {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 13px;
      line-height: 1.45;
    }

    :global(.events-popup strong) { color: #ffffff; font-size: 15px; }
    :global(.events-popup span)   { color: #a3a3a3; }
    :global(.events-popup em)     { color: #fbbf24; font-style: normal; font-size: 12px; }
  </style>
  ```

---

- [ ] **Step 10: Create `src/pages/events.astro`**

  This is where the baked data is read, re-validated, expanded, and where every global style for the page lives.

  Create `src/pages/events.astro`:

  ```astro
  ---
  import Base from '../layouts/Base.astro';
  import EventsList from '../components/EventsList.astro';
  import EventsMonth from '../components/EventsMonth.astro';
  import EventsMap from '../components/EventsMap.astro';
  import registry from '../data/registry.json';
  import bakedEventsRaw from '../data/events.json';
  import { toPublicEvent, type PublicEvent, type StoredEvent } from '../lib/public-event.js';
  import { publicEventSchema } from '../lib/event-schema.js';
  import { expandAll, splitByToday, addMonths } from '../lib/events-view.js';
  import { toJsonIsland } from '../lib/json-island.js';

  // The committed events.json is validated at build time with the shared strict
  // schema — publicEventSchema, imported from event-schema.js — and then projected
  // through toPublicEvent() before it is rendered or serialized into the data
  // island. That schema is the single source of truth for the stored/public shape,
  // so this page keeps no local copy that can drift from the real one. The file
  // lives in a repo a later bad commit can edit, so the build must never trust it
  // (design §5/§6): a record carrying a server-only field (signalUrl, codeDigest,
  // revoked) is rejected by the schema's `.strict()` and fails the build, and even
  // a record that slipped through could not reach the client, because every field
  // is picked by the allowlist projection, never spread. The per-field caps live
  // inside the shared schema (imported from sanitize-text.ts there), never retyped.
  const bakedEvents: PublicEvent[] = (bakedEventsRaw as unknown[]).map((raw, index) => {
    const parsed = publicEventSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const at = issue.path.length > 0 ? issue.path.join('.') : '_record';
      const detail = issue.code === 'unrecognized_keys' ? 'unexpected_field' : issue.message;
      throw new Error(
        `src/data/events.json: record ${index} at "${at}" failed strict validation (${detail})`,
      );
    }
    // Allowlist projection, even after a clean parse: defence in depth (design §5).
    return toPublicEvent(parsed.data as unknown as StoredEvent);
  });

  // Display names, derived from registry.json at build time and shipped in the data
  // island. registry.json itself is ~50 KB and must never reach the client bundle.
  const cityNames: Record<string, string> = {};
  const countyNames: Record<string, string> = {};
  for (const j of registry.jurisdictions as Array<Record<string, string>>) {
    if (j.type === 'place') {
      cityNames[j.id.split(':')[1]] = j.name.replace(/ (City|Town) Council$/, '');
    } else if (j.type === 'county') {
      countyNames[j.county.toLowerCase()] = j.county;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const horizonEnd = addMonths(today, 12);

  // One 30-day retention horizon, matching RETENTION_DAYS in netlify/functions/events.ts
  // and the build-time expiry guard (design §10). A single window everywhere — the past
  // list, the shipped island, and the overlay all cut at the same 30 days — so a baked id
  // the overlay can return is exactly a baked id the island still carries.
  const RETENTION_DAYS = 30;
  const retentionCutoff = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - RETENTION_DAYS);
    return d.toISOString().slice(0, 10);
  })();

  const allOccurrences = expandAll(bakedEvents, horizonEnd);
  const { upcoming, past } = splitByToday(allOccurrences, today);
  const recentPast = past.filter((o) => o.date >= retentionCutoff);

  // Bounded island: ship only events still inside the retention horizon, not the whole
  // baked array (design §12). An event's last relevant day is the end of its series, or
  // its single date. Anything older is neither rendered as a card nor returned by
  // /api/events, so shipping it would only bloat the page.
  const lastRelevantDate = (e: PublicEvent): string => e.recurrence?.until ?? e.date;
  const islandEvents = bakedEvents.filter((e) => lastRelevantDate(e) >= retentionCutoff);

  const island = {
    events: islandEvents,
    cityNames,
    countyNames,
    today,
    horizonEnd,
  };
  ---

  <Base
    title="ALPR Organizing Events in South Carolina | DeflockSC"
    description="Find DeflockSC meetups, council meetings, and public actions near you in South Carolina. Organizers reach you through a per-event Signal group."
  >
    <section class="events-hero">
      <div class="events-hero-inner">
        <p class="label-mono-heading mb-3">Events</p>
        <h1 class="events-h1">Find people near you.</h1>
        <p class="events-lede">
          Meetups, council meetings, and public actions across South Carolina. Meetup
          venues are never published here — the address is shared inside the event's
          Signal group.
        </p>
      </div>
    </section>

    <section class="events-body">
      <div
        class="events-tabs"
        role="tablist"
        aria-label="Calendar views"
        id="events-tabs"
      >
        <button id="tab-list" role="tab" aria-selected="true" aria-controls="panel-list" class="events-tab is-selected" data-tab="list">List</button>
        <button id="tab-month" role="tab" aria-selected="false" aria-controls="panel-month" class="events-tab" data-tab="month" tabindex="-1">Month</button>
        <button id="tab-map" role="tab" aria-selected="false" aria-controls="panel-map" class="events-tab events-tab-map" data-tab="map" tabindex="-1">Map</button>
      </div>

      <div class="events-grid">
        <div id="panel-map" role="tabpanel" aria-labelledby="tab-map" tabindex="0" data-panel="map">
          <EventsMap />
        </div>

        <div id="panel-list" role="tabpanel" aria-labelledby="tab-list" tabindex="0" data-panel="list" class="is-active">
          <EventsList upcoming={upcoming} past={recentPast} cityNames={cityNames} countyNames={countyNames} />
        </div>

        <div id="panel-month" role="tabpanel" aria-labelledby="tab-month" tabindex="0" data-panel="month">
          <EventsMonth occurrences={upcoming} today={today} cityNames={cityNames} />
        </div>
      </div>
    </section>

    <div id="intake-dialog" class="intake-dialog" hidden>
      <div class="intake-panel" role="dialog" aria-modal="true" aria-labelledby="intake-heading">
        <h2 id="intake-heading">Before you join</h2>
        <p>
          This group is unvetted, which is the point (it has to be open for strangers to
          find us) and also the risk: everyone who can read this page can join it,
          including bad actors or people whose interest in South Carolina organizing is
          professional (journalists, police, etc.). Please do not share anything in this
          chat that you wouldn't want published or used against you in court.
        </p>
        <p>
          Two minutes of setup first. Open Signal, set a username, and switch Privacy ›
          Phone Number to Nobody. Use a name you don't mind strangers keeping.
        </p>
        <p class="intake-actions">
          <!-- No href: /go/intake is set on window.location at click time by
               events-page.ts, so the path never appears in the static HTML and a
               scraper that never clicks never sees it. -->
          <button id="intake-confirm" type="button" class="event-signal event-signal-btn">I've done that, open Signal</button>
          <button id="intake-cancel" type="button" class="event-signal event-signal-btn">Cancel</button>
        </p>
      </div>
    </div>

    <script type="application/json" id="events-data" set:html={toJsonIsland(island)}></script>
    <script>
      import '../scripts/events-page.js';
    </script>
  </Base>

  <style is:global>
    /* Every rule for event cards, month chips, and tabs is global on purpose.
       Astro scoped styles stamp a data-astro-* attribute onto template elements;
       cards that events-page.ts creates at runtime have no such attribute and would
       render unstyled. Class names here are the contract with that renderer. */

    .events-hero { background: #111111; padding: 7rem 0 3rem; }
    .events-hero-inner { max-width: 56rem; margin: 0 auto; padding: 0 1.5rem; }
    .events-h1 {
      color: #e8e8e8;
      font-weight: 700;
      font-size: clamp(1.9rem, 5vw, 3rem);
      letter-spacing: -0.02em;
      margin-bottom: 1rem;
      line-height: 1.1;
    }
    .events-lede { color: #a0a0a0; font-size: 1.05rem; max-width: 40rem; }

    .events-body { background: #171717; padding: 0 1.5rem 4rem; }

    /* --- Tabs --- */
    .events-tabs {
      display: flex;
      gap: 0.25rem;
      max-width: 84rem;
      margin: 0 auto;
      padding: 1rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      position: sticky;
      top: 4rem;
      background: #171717;
      z-index: 20;
    }
    .events-tab {
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #737373;
      background: transparent;
      border: 1px solid transparent;
      padding: 0.75rem 1.1rem;
      min-height: 44px;
      cursor: pointer;
    }
    .events-tab.is-selected { color: #e8e8e8; border-color: #dc2626; }
    .events-tab:focus-visible { outline: 2px solid #fbbf24; outline-offset: 2px; }

    /* --- Panels: tabbed on mobile, two columns on desktop --- */
    .events-grid { max-width: 84rem; margin: 0 auto; padding-top: 1.5rem; }
    [data-panel] { display: none; }
    [data-panel].is-active { display: block; }

    @media (min-width: 1024px) {
      .events-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 2rem;
        align-items: start;
      }
      /* Map is always visible on desktop and never a tab. */
      [data-panel='map'] {
        display: block;
        position: sticky;
        top: 8rem;
        align-self: start;
      }
      .events-tab-map { display: none; }
    }

    /* --- Event cards --- */
    .events-count { margin-bottom: 0.75rem; }
    .events-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }

    .event-card {
      display: grid;
      grid-template-columns: 3.5rem minmax(0, 1fr);
      gap: 1rem;
      background: #1a1a1a;
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-left: 2px solid #dc2626;
      padding: 1rem;
    }
    .event-date { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
    .event-date-mon {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      color: #dc2626;
    }
    .event-date-day { color: #e8e8e8; font-size: 1.6rem; font-weight: 800; line-height: 1.1; }
    .event-body { min-width: 0; }

    /* Defence in depth against hostile titles (design §6). The sanitizer rejects
       bidi overrides, zero-width runs, and stacked combining marks at submit time and
       again at build; these four rules mean a miss cannot wreck the layout.
       max-height:4.6em is the fallback for browsers without the `lh` unit. */
    .event-title {
      overflow-wrap: anywhere;
      unicode-bidi: isolate;
      max-height: 4.6em;
      max-height: 3lh;
      overflow: hidden;
    }

    .event-title {
      color: #e8e8e8;
      font-size: 1.05rem;
      font-weight: 700;
      line-height: 1.35;
      margin: 0 0 0.35rem;
    }
    .event-meta { color: #a3a3a3; font-size: 0.875rem; margin: 0 0 0.35rem; }
    .event-address { color: #737373; font-size: 0.8125rem; margin: 0 0 0.35rem; }
    .event-desc { color: #a3a3a3; font-size: 0.875rem; margin: 0 0 0.5rem; overflow-wrap: anywhere; }
    .event-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin: 0.5rem 0 0; }

    .event-badge {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 0.3rem 0.55rem;
      border: 1px solid currentColor;
    }
    .event-badge-meetup { color: #fbbf24; }
    .event-badge-public { color: #4ade80; }

    .event-signal {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 0.9rem;
      color: #ffffff;
      background: #dc2626;
      font-size: 0.8125rem;
      font-weight: 700;
      text-decoration: none;
      border: none;
      cursor: pointer;
    }
    .event-signal:hover { background: #b91c1c; }
    .event-signal-btn { font-family: inherit; }

    /* --- Empty state and past events --- */
    .events-empty {
      background: #1a1a1a;
      border: 1px solid rgba(255, 255, 255, 0.07);
      padding: 2rem 1.25rem;
      text-align: center;
    }
    .events-empty[hidden] { display: none; }
    .events-empty-lead { color: #e8e8e8; font-weight: 700; margin: 0 0 0.5rem; }
    .events-empty-proof { color: #a3a3a3; font-size: 0.9rem; margin: 0 0 1.25rem; }
    .events-empty-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; margin: 0; }

    .events-past { margin-top: 2rem; border-top: 1px solid rgba(255, 255, 255, 0.07); padding-top: 1rem; }
    .events-past summary { color: #737373; cursor: pointer; }
    .events-past-list { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .event-past-row { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: 0.75rem; color: #737373; font-size: 0.85rem; }
    .event-past-date { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.1em; }
    .event-past-title { color: #a3a3a3; font-size: 0.9rem; font-weight: 600; margin: 0; }
    .event-past-place { grid-column: 2; }

    /* --- Month grids --- */
    .events-months { display: flex; flex-direction: column; gap: 2rem; }
    .month-title { color: #e8e8e8; font-size: 1rem; font-weight: 700; margin: 0 0 0.5rem; }
    .month-dow, .month-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
    .month-dow span {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      color: #525252;
      text-align: center;
      padding-bottom: 4px;
    }
    .month-cell {
      min-height: 4.25rem;
      background: #1a1a1a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 3px;
      min-width: 0;
    }
    .month-cell-empty { background: transparent; border-color: transparent; }
    .month-cell-today { border-color: #dc2626; }
    .month-daynum { font-family: 'DM Mono', monospace; font-size: 10px; color: #737373; }
    .month-chips { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
    .month-chip {
      display: block;
      background: rgba(220, 38, 38, 0.18);
      border-left: 2px solid #dc2626;
      padding: 1px 3px;
      text-decoration: none;
      min-width: 0;
    }
    .month-chip-title { font-size: 10px; font-weight: 600; color: #e8e8e8; margin: 0; line-height: 1.25; max-height: 2lh; }

    /* --- Intake dialog --- */
    .intake-dialog {
      position: fixed;
      inset: 0;
      z-index: 60;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .intake-dialog[hidden] { display: none; }
    .intake-panel {
      background: #1a1a1a;
      border: 1px solid rgba(255, 255, 255, 0.12);
      max-width: 32rem;
      padding: 1.75rem;
      color: #a3a3a3;
      font-size: 0.9rem;
      line-height: 1.65;
    }
    .intake-panel h2 { color: #e8e8e8; font-size: 1.25rem; font-weight: 700; margin: 0 0 0.75rem; }
    .intake-panel p { margin: 0 0 1rem; }
    .intake-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0; }
  </style>
  ```

---

- [ ] **Step 11: Create `src/scripts/events-page.ts`**

  This is the composer. It owns the lazy map lifecycle: it dynamically imports `map/core.js` and `map/layers/events.js`, fetches the county outlines, imports the city centroids, calls `createMap({ container: 'events-map', ..., interactive: true })`, waits for the style, fits South Carolina, then hands the map to `addEventLayers`. It never rebuilds the map bootstrap — that lives in `map/core.ts`. All merge and date logic comes from `events-view.ts`.

  Create `src/scripts/events-page.ts`:

  ```ts
  /**
   * Events page runtime: view tabs, the baked/overlay merge, and the lazy map load.
   *
   * The list and month views are server-rendered from src/data/events.json, so the
   * page is complete with JavaScript off. This module only patches that markup:
   * it inserts anything submitted since the last weekly fold. The overlay only ADDS —
   * it never tombstones a baked card (a revoked event is removed by the fold rewriting
   * events.json, and stopped at /go in the meantime). Card markup is therefore written
   * twice — once in EventsList.astro, once in buildCard() below. Keep the class names
   * in sync.
   *
   * The map is COMPOSED, not rebuilt: this module calls createMap() from
   * src/scripts/map/core.ts (the shared MapLibre bootstrap) and then addEventLayers()
   * from src/scripts/map/layers/events.ts, the same core-plus-layer split the camera
   * map uses. It never imports the camera layer, so /camera-data.json can never load.
   *
   * All merge and date logic comes from src/lib/events-view.ts, so the browser and
   * the build agree by construction.
   *
   * Nothing here uses innerHTML: every string from an event goes through
   * textContent, so a hostile title cannot become markup even if the sanitizer
   * upstream ever misses one.
   */

  import type { PublicEvent } from '../lib/public-event.js';
  import type { Occurrence } from '../lib/events-view.js';
  import type { MapHandle } from './map/core.js';
  import {
    mergeEvents,
    parseOverlayEnvelope,
    expandAll,
    splitByToday,
    monthAbbr,
    dayOfMonth,
    formatTime12,
    sortKey,
  } from '../lib/events-view.js';

  interface Island {
    events: PublicEvent[];
    cityNames: Record<string, string>;
    countyNames: Record<string, string>;
    today: string;
    horizonEnd: string;
  }

  const islandEl = document.getElementById('events-data');
  if (!islandEl) throw new Error('events-page: #events-data island missing');
  const island: Island = JSON.parse(islandEl.textContent || '{}');

  const bakedIds = new Set(island.events.map((e) => e.id));
  let occurrences: Occurrence[] = splitByToday(
    expandAll(island.events, island.horizonEnd),
    island.today,
  ).upcoming;

  // --- Tabs ---------------------------------------------------------------

  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#events-tabs [role="tab"]'),
  );

  function selectTab(name: string) {
    for (const tab of tabs) {
      const on = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(on));
      tab.classList.toggle('is-selected', on);
      tab.tabIndex = on ? 0 : -1;
    }
    for (const panel of document.querySelectorAll<HTMLElement>('[data-panel]')) {
      panel.classList.toggle('is-active', panel.dataset.panel === name);
    }
    if (name === 'map') void loadMap();
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab!));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const visible = tabs.filter((t) => t.offsetParent !== null);
      const i = visible.indexOf(tab);
      const next = visible[(i + (e.key === 'ArrowRight' ? 1 : visible.length - 1)) % visible.length];
      next.focus();
      selectTab(next.dataset.tab!);
    });
  }

  // --- Lazy map (composes map/core.ts + map/layers/events.ts) --------------

  /** SC bounding box, same values as SC_BBOX in src/lib/district-matcher.ts. */
  const SC_BOUNDS: [[number, number], [number, number]] = [
    [-83.5, 32.0],
    [-78.5, 35.3],
  ];

  let mapHandle: MapHandle | null = null;
  let eventsLayer: typeof import('./map/layers/events.js') | null = null;
  let mapLoading = false;

  async function loadMap() {
    if (mapHandle) { mapHandle.resize(); return; }
    if (mapLoading) return;
    mapLoading = true;

    await import('maplibre-gl/dist/maplibre-gl.css');
    const [{ createMap }, layer, centroidsMod, countiesRes] = await Promise.all([
      import('./map/core.js'),
      import('./map/layers/events.js'),
      import('../data/city-centroids.json'),
      fetch('/districts/sc-counties.json'),
    ]);
    if (!countiesRes.ok) throw new Error(`sc-counties.json: ${countiesRes.status}`);
    const counties = (await countiesRes.json()) as GeoJSON.FeatureCollection;
    eventsLayer = layer;

    const handle = createMap({
      container: 'events-map',
      style: '/map-style.json',
      center: [-81.0, 33.7],
      zoom: 6,
      interactive: true,
    });
    mapHandle = handle;

    await new Promise<void>((resolve) => {
      if (handle.map.isStyleLoaded()) resolve();
      else handle.map.once('load', () => resolve());
    });

    handle.map.fitBounds(SC_BOUNDS, { padding: 20, duration: 0 });

    layer.addEventLayers(handle.map, {
      counties,
      events: occurrences,
      centroids: (centroidsMod as { default: Record<string, unknown> }).default,
      cityNames: island.cityNames,
    });
  }

  // Desktop shows the map permanently, so load it when it scrolls into view.
  // Mobile loads it only from the Map tab, which keeps MapLibre (261 KB) out of
  // the default mobile page load.
  const desktop = window.matchMedia('(min-width: 1024px)');
  const mapEl = document.getElementById('events-map');
  if (mapEl && desktop.matches) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) { io.disconnect(); void loadMap(); }
      },
      { rootMargin: '200px' },
    );
    io.observe(mapEl);
  }
  desktop.addEventListener('change', (e) => { if (e.matches) void loadMap(); });

  // --- Card and chip construction (mirrors EventsList / EventsMonth) -------

  function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function placeLabel(e: PublicEvent): string {
    const city = island.cityNames[e.city] ?? e.city;
    const county = island.countyNames[e.county] ?? e.county;
    return `${city} · ${county} County`;
  }

  function buildCard(o: Occurrence): HTMLLIElement {
    const e = o.event;
    const li = document.createElement('li');
    li.className = 'event-card';
    li.dataset.eventId = e.id;
    li.dataset.date = o.date;
    li.dataset.sort = sortKey(o.date, e.time, e.id);

    const date = el('div', 'event-date');
    date.setAttribute('aria-hidden', 'true');
    date.append(
      el('span', 'event-date-mon', monthAbbr(o.date)),
      el('span', 'event-date-day', dayOfMonth(o.date)),
    );

    const body = el('div', 'event-body');
    body.append(el('h3', 'event-title', e.title));
    body.append(el('p', 'event-meta', `${formatTime12(e.time)} · ${placeLabel(e)}`));
    if (e.address) body.append(el('p', 'event-address', e.address));
    if (e.description) body.append(el('p', 'event-desc', e.description));

    const actions = el('p', 'event-actions');
    const meetup = e.type === 'meetup';
    actions.append(
      el(
        'span',
        `event-badge ${meetup ? 'event-badge-meetup' : 'event-badge-public'}`,
        meetup ? 'Location in group' : 'Public event',
      ),
    );
    if (e.hasSignalGroup) {
      const a = el('a', 'event-signal', 'Join Signal group') as HTMLAnchorElement;
      a.href = `/go/${encodeURIComponent(e.id)}`;
      a.rel = 'noreferrer';
      actions.append(a);
    }
    body.append(actions);

    li.append(date, body);
    return li;
  }

  function buildChip(o: Occurrence): HTMLAnchorElement {
    const a = document.createElement('a');
    a.className = 'month-chip';
    a.href = `#event-${encodeURIComponent(o.event.id)}`;
    a.dataset.eventId = o.event.id;
    a.dataset.sort = sortKey(o.date, o.event.time, o.event.id);
    a.title = `${formatTime12(o.event.time)} · ${island.cityNames[o.event.city] ?? o.event.city}`;
    a.append(el('span', 'event-title month-chip-title', o.event.title));
    return a;
  }

  function insertSorted(container: Element, node: HTMLElement, key: string) {
    for (const child of Array.from(container.children) as HTMLElement[]) {
      if ((child.dataset.sort ?? '') > key) { container.insertBefore(node, child); return; }
    }
    container.append(node);
  }

  // --- Merge and patch ----------------------------------------------------

  function applyMerge(merged: PublicEvent[]) {
    const live = new Set(merged.map((e) => e.id));

    // 1. Defensive prune: drop any rendered card whose id is not in the merged set.
    //    Under add-only merge the baked set is always retained (the overlay never
    //    tombstones), so in practice this removes nothing — a revoked-but-not-yet-
    //    folded event stays listed here and is stopped at /go instead. It remains as a
    //    guard against a card with no backing record.
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('[data-event-id]'))) {
      if (!live.has(node.dataset.eventId!)) node.remove();
    }

    // 2. Insert events submitted since the last fold.
    const fresh = merged.filter((e) => !bakedIds.has(e.id));
    const freshOccurrences = splitByToday(
      expandAll(fresh, island.horizonEnd),
      island.today,
    ).upcoming;

    const list = document.getElementById('events-list');
    for (const o of freshOccurrences) {
      if (list) insertSorted(list, buildCard(o), sortKey(o.date, o.event.time, o.event.id));
      const chips = document.querySelector(`[data-chips="${CSS.escape(o.date)}"]`);
      if (chips) insertSorted(chips, buildChip(o), sortKey(o.date, o.event.time, o.event.id));
    }

    // 3. Recompute the occurrence set for the map and the header count.
    occurrences = splitByToday(expandAll(merged, island.horizonEnd), island.today).upcoming;

    const count = document.getElementById('events-count');
    if (count) count.textContent = String(list ? list.children.length : occurrences.length);

    const empty = document.getElementById('events-empty');
    if (empty && list) empty.hidden = list.children.length > 0;

    if (mapHandle && eventsLayer) eventsLayer.setEventData(mapHandle.map, occurrences);
  }

  async function loadOverlay() {
    try {
      const res = await fetch('/api/events', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`/api/events: ${res.status}`);
      // The endpoint returns { events: PublicEvent[] } (netlify/functions/events.ts).
      // parseOverlayEnvelope returns that array, or null for any non-envelope body;
      // mergeEvents(baked, null) then renders the baked set unchanged.
      const overlay = parseOverlayEnvelope(await res.json());
      applyMerge(mergeEvents(island.events, overlay));
    } catch (err) {
      // Fail soft: the baked page stays exactly as rendered.
      console.warn('events: overlay unavailable, showing baked events only', err);
    }
  }

  void loadOverlay();

  // --- Intake dialog ------------------------------------------------------

  const dialog = document.getElementById('intake-dialog');
  document.getElementById('intake-open')?.addEventListener('click', () => {
    if (!dialog) return;
    dialog.hidden = false;
    document.getElementById('intake-confirm')?.focus();
  });
  // The confirm control carries no href in the markup. Navigation to /go/intake is
  // injected here, at click time, so the path is absent from view-source and a
  // scraper that never clicks the button never harvests the intake redirect.
  document.getElementById('intake-confirm')?.addEventListener('click', () => {
    window.location.href = '/go/intake';
  });
  document.getElementById('intake-cancel')?.addEventListener('click', () => {
    if (dialog) dialog.hidden = true;
    document.getElementById('intake-open')?.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog && !dialog.hidden) {
      dialog.hidden = true;
      document.getElementById('intake-open')?.focus();
    }
  });
  ```

---

- [ ] **Step 12: Add `/events` to the Lighthouse CI audit**

  `lighthouserc.json` audits only `/` and `/blog/`, so a new page ships unaudited (design §12). Change:

  ```json
        "url": ["/", "/blog/"]
  ```

  to:

  ```json
        "url": ["/", "/blog/", "/events"]
  ```

---

- [ ] **Step 13: Manual verification — desktop, 1280x800**

  Astro components, the global CSS, and the MapLibre layers cannot be unit-tested here, so this step and the next are the verification.

  Start the dev server (npx/npm do not resolve reliably under the preview tooling on Windows, so invoke Astro's entry point directly):

  ```bash
  node node_modules/astro/astro.js dev --host 127.0.0.1 --port 4321
  ```

  Open `http://127.0.0.1:4321/events` in Chrome. Open DevTools, switch on the device toolbar, and set the viewport to **1280 x 800** (Responsive). Reload with the Network tab open and the filter cleared.

  Expected, all ten:

  1. Two columns. The map fills the left column; the event list fills the right column.
  2. Scrolling the page moves the list while the map stays pinned below the tab strip (`position: sticky`).
  3. The tab strip shows exactly **two** buttons — `List` and `Month`. No `Map` button.
  4. Clicking `Month` swaps the right column to three stacked month grids (current month plus the next two), each with an `S M T W T F S` header row. Clicking `List` swaps back.
  5. The map renders the dark basemap with all of South Carolina in frame, and any county holding an event is filled dark red with a white number badge over it.
  6. In the Network tab, filter on `camera` — **zero requests**. `camera-data.json` must never appear on this page.
  7. In the Network tab, `sc-counties.json` appears with status 200 and a size around 79 KB (~15 KB transferred with compression).
  8. Click the map's `+` control four times, from the initial zoom of about 6.3 up past 8. The county fills, county outlines, and number badges fade to nothing and red city dots with white city-name labels fade in.
  9. Click a city dot. A dark popup opens showing the city name, an event count, and the amber line `Exact location shared in the group.`
  10. View source (Ctrl+U) and search the raw HTML for `/go/intake` — **zero matches**; the intake path is never in the static markup. Then open an event's intake dialog and click **I've done that, open Signal**: the browser navigates to `/go/intake` (set on `window.location` at click time). A scraper that never clicks the confirm button never sees the path.

  Then confirm the two maps coexist, which is the whole point of splitting the map into a shared core (`map/core.ts`) in the earlier map-extraction task: open `http://127.0.0.1:4321/` in a second tab, scroll to the camera map, and go back to the `/events` tab. Both maps must still render and pan independently, and neither console shows an error.

  The browser console must be free of errors. `events-map: no centroid for city "…"` warnings mean `src/data/city-centroids.json` is missing a slug that an event uses — fix the centroid data, not this page.

---

- [ ] **Step 14: Manual verification — mobile, 375x812**

  With the same dev server running, set the DevTools viewport to **375 x 812**. Reload with the Network tab open and the filter set to `JS`.

  Expected, all seven:

  1. One column. The tab strip shows **three** buttons — `List`, `Month`, `Map` — with `List` selected (red underline, brighter text) and the event list below it.
  2. No map is visible, and the Network tab shows **no** `maplibre` chunk and **no** requests to `tiles.openfreemap.org`.
  3. Tap `Month`. The list is replaced by the three month grids. Still no `maplibre` chunk.
  4. Tap `Map`. A `maplibre-gl` JS chunk, `maplibre-gl.css`, `/districts/sc-counties.json`, and requests to `tiles.openfreemap.org` all appear now and not before. The map renders with all of South Carolina in frame.
  5. Filter the Network tab on `camera` — still **zero requests**.
  6. Every tab button and every "Join Signal group" button measures at least 44 px tall in the DevTools element overlay.
  7. The page body does not scroll horizontally. Run this in the console; it must print `[]`:

     ```js
     [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(e => e.className)
     ```

  Then verify the hostile-title defences with a title that is 80 characters of unbroken text. Paste this into the console and confirm the card does not widen the grid and the title clamps at three lines:

  ```js
  const t = document.querySelector('.event-title');
  if (t) { t.textContent = 'A'.repeat(80); console.log(getComputedStyle(t).overflowWrap, getComputedStyle(t).unicodeBidi, getComputedStyle(t).overflow); }
  ```

  Expected console output: `anywhere isolate hidden`, and the card visibly stays inside the 375 px viewport with the long run wrapped, not clipped off the right edge. Reload to discard the mutation.

  Finally, confirm the no-JavaScript path. In DevTools open Command Palette (Ctrl+Shift+P), run `Disable JavaScript`, and reload `http://127.0.0.1:4321/events`. Expected: the event list and all three month grids are still fully rendered; the map area shows the noscript line `The map needs JavaScript. The list and month views below work without it.` Re-enable JavaScript.

---

- [ ] **Step 15: Full test suite and commit**

  Run everything:

  ```bash
  npm test
  ```

  Expected: all test files pass, including the pre-existing `src/lib/geo-utils.test.ts`, `src/lib/blog-utils.test.ts`, and `src/lib/district-matcher.test.ts` plus the two added by this task (`src/lib/events-view.test.ts`, `scripts/build-county-shapes.test.mjs`). No failures, no unhandled errors.

  Then confirm the production build succeeds end to end (this also exercises the `prebuild` chain, so `sc-counties.json` is regenerated):

  ```bash
  npm run build
  ```

  Expected: the prebuild prints `Wrote 46 county outlines to public/districts/sc-counties.json (79445 bytes)`, the Astro build completes with no errors, and `dist/events/index.html` exists.

  Commit:

  ```bash
  git add src/pages/events.astro src/components/EventsList.astro src/components/EventsMonth.astro src/components/EventsMap.astro src/scripts/events-page.ts src/scripts/map/layers/events.ts lighthouserc.json
  git commit -m "feat(events): public calendar page with list, month, and map views"
  ```

---

---

---

### Task 20: County and type filters

Closes design §12's filter chips: county, and event type (meetups / public events). The events-page task shipped `/events` deliberately without them and noted that `src/lib/events-view.ts` "exposes no county filter yet" because the filter interacts with recurrence expansion and with the empty state, and both needed helpers that did not exist yet.

**Why the chips are client-rendered, and why that is the honest choice here.** This site prerenders to static HTML (`astro.config.mjs` sets no `output`, `netlify.toml` publishes `dist`). There is no server to read a query string. An earlier draft of this task reached for one prerendered page per filter combination so the chips could be real `<a href>` links that keep working with JavaScript off — a rest-parameter route, a `getStaticPaths()` matrix, `noindex`, sitemap exclusion, a route-collision guard. That is far more machinery than the feature earns. The simpler and equally honest choice: the chips are built by JavaScript and **do not exist in the no-JavaScript DOM at all** — rather than existing and silently doing nothing, which was the real hazard on a static site. Filtering being JS-only matches the rest of deflocksc.org, which already ships client scripts in eleven components (the action modal, the map, the bill tracker, the FAQ, the nav, the toolkit pages); this is the established baseline, not a regression.

**The invariant: degrade to complete content, never to a dead end.** With JavaScript off, `/events` still lists every upcoming event with its date, city, and Signal join link, and still shows the map. You lose the ability to *narrow* the list; you lose no information and reach no broken control. The filter is a pure enhancement over a page that is already whole.

**Filter state lives in the URL hash** (`#county=greenville`, `#county=greenville&type=meetups`), so a filtered view is still shareable among the ~all visitors who have JavaScript. The client reads the hash on load and applies it, writes it on every filter change, and listens for `hashchange` so the browser back and forward buttons move between filter states. Design §12's `?county=` sketch predates the static-output constraint; the hash form replaces it, and it needs no server and no per-filter route.

Three rules that are easy to get wrong, so they are stated once here:

- **The chip row is derived from the events that exist, not from the 46-county registry.** `countyOptions()` counts upcoming occurrences per county, and only counties with at least one get a chip. With a handful of events that is a row of two or three chips, not a wall of 46.
- **The chip *list* comes from the unfiltered set; only the chip *counts* are faceted.** If selecting Greenville erased every other county's chip, the user would be stranded with no way back out except the browser's back button. A faceted count can drop to 0 and the chip dims, but it stays clickable so the user is never stranded.
- **The map is county-unfiltered on purpose.** Selecting a county filters the list, but the choropleth keeps drawing every county so the next one is still one click away. The selected county gets an amber outline instead. `events-page.ts` owns the filter state and calls back into `src/scripts/map/layers/events.ts`, so the highlight and the chip cannot disagree — clicking a county on the map sets the filter and the chip reflects it.

Out of scope, on purpose: no city-level filter (city chips would be a wall, and the county chips already narrow enough), and no date-range filter (the Month tab is the date view).

**Files:**

- Modify `src/lib/events-view.ts` — add the pure filter, facet, hash, and empty-state helpers
- Modify `src/lib/events-view.test.ts` — cover them
- Modify `src/components/EventsList.astro` — stable ids for the empty state and the past list, shared empty-state copy
- Modify `src/pages/events.astro` — stays a single static route; add the empty filter container, the island fields the client needs, and the chip styles
- Modify `src/scripts/map/layers/events.ts` — a county-select callback, a `setSelectedCounty` export, and a county click that reports a selection (the `county-selected` source and `county-highlight` layer already exist from the events-page task)
- Modify `src/scripts/events-page.ts` — filter state, chip building, hash read/write, `hashchange`, map sync

No new component, no new route, no `astro.config.mjs` change.

---

- [ ] **Step 1: Verify preconditions**

  This task extends the modules the events-page task created. It does not redefine either. Run from the repo root (`the repo root`):

  ```bash
  node -e "['src/lib/events-view.ts','src/lib/events-view.test.ts','src/pages/events.astro','src/components/EventsList.astro','src/components/EventsMonth.astro','src/scripts/events-page.ts','src/scripts/map/layers/events.ts'].forEach(f=>console.log(require('fs').existsSync(f)?'OK   '+f:'MISS '+f))"
  ```

  Expected: seven `OK` lines. Any `MISS` means the events-page task has not landed; stop rather than stubbing.

  Confirm the exports this task builds on are the ones the events-page task actually shipped:

  ```bash
  node -e "const s=require('fs').readFileSync('src/lib/events-view.ts','utf8'); ['sortKey','mergeEvents','expandAll','splitByToday','monthAbbr','dayOfMonth','formatTime12','addMonths','groupByMonth'].forEach(n=>console.log(s.includes('export function '+n+'(')?'OK   '+n:'MISS '+n))"
  ```

  Expected: nine `OK` lines.

  Confirm the `type` union, because the filter's URL slugs are derived from it:

  ```bash
  grep -n "meetup" src/lib/public-event.ts
  ```

  Expected: a line declaring the union as `'meetup' | 'public'`. **If the second member is not `'public'`,** change `TYPE_SLUGS` and the `EventTypeFilter` union in Step 3 and the type chip list in Step 7 to match the real member name, and nothing else — every other line in this task reads those two definitions rather than hardcoding the value.

  A note on the static-output assumption: unlike the earlier draft, this task's routing does not depend on it. The page is one static route with or without a server, and hash-based filtering works either way. No `output`-key gate is needed.

---

- [ ] **Step 2: Write the failing tests for the filter helpers**

  These go in the existing `src/lib/events-view.test.ts` so they can reuse its `ev()` factory, which is already the canonical `PublicEvent` fixture for this module.

  First replace the import block at the top of `src/lib/events-view.test.ts`. Change:

  ```ts
  import {
    mergeEvents,
    expandAll,
    splitByToday,
    monthAbbr,
    dayOfMonth,
    formatTime12,
    sortKey,
  } from './events-view.js';
  ```

  to:

  ```ts
  import {
    mergeEvents,
    expandAll,
    splitByToday,
    monthAbbr,
    dayOfMonth,
    formatTime12,
    sortKey,
    ALL_EVENTS,
    matchesFilter,
    filterEvents,
    filterOccurrences,
    countyOptions,
    facetCounts,
    filterHash,
    parseFilterHash,
    emptyStateProof,
  } from './events-view.js';
  ```

  Then append this to the end of the file:

  ```ts
  // Four events across three counties and both types. Every filter test reads from
  // this one set so a filter's result is always checkable by eye against it.
  const MIXED = [
    ev({ id: 'gv1meet', county: 'greenville', city: 'greenville', type: 'meetup', date: '2026-09-01' }),
    ev({ id: 'gv2publ', county: 'greenville', city: 'greer', type: 'public', date: '2026-09-04' }),
    ev({ id: 'ch1meet', county: 'charleston', city: 'charleston', type: 'meetup', date: '2026-09-02' }),
    ev({ id: 'ri1publ', county: 'richland', city: 'columbia', type: 'public', date: '2026-09-03' }),
  ];

  describe('matchesFilter', () => {
    it('accepts everything under the all/all filter', () => {
      expect(MIXED.every((e) => matchesFilter(e, ALL_EVENTS))).toBe(true);
    });

    it('rejects an event in another county', () => {
      expect(matchesFilter(MIXED[0], { county: 'charleston', type: 'all' })).toBe(false);
    });

    it('rejects an event of another type', () => {
      expect(matchesFilter(MIXED[0], { county: 'all', type: 'public' })).toBe(false);
    });
  });

  describe('filterEvents', () => {
    it('returns every event under the all/all filter', () => {
      expect(filterEvents(MIXED, ALL_EVENTS).map((e) => e.id)).toEqual([
        'gv1meet', 'gv2publ', 'ch1meet', 'ri1publ',
      ]);
    });

    it('returns a fresh array rather than the input', () => {
      expect(filterEvents(MIXED, ALL_EVENTS)).not.toBe(MIXED);
    });

    it('filters by county slug', () => {
      expect(filterEvents(MIXED, { county: 'greenville', type: 'all' }).map((e) => e.id)).toEqual([
        'gv1meet', 'gv2publ',
      ]);
    });

    it('filters by event type', () => {
      expect(filterEvents(MIXED, { county: 'all', type: 'meetup' }).map((e) => e.id)).toEqual([
        'gv1meet', 'ch1meet',
      ]);
    });

    it('composes county and type', () => {
      expect(filterEvents(MIXED, { county: 'greenville', type: 'public' }).map((e) => e.id)).toEqual([
        'gv2publ',
      ]);
    });

    it('returns empty for an unknown county without throwing', () => {
      expect(() => filterEvents(MIXED, { county: 'not-a-county', type: 'all' })).not.toThrow();
      expect(filterEvents(MIXED, { county: 'not-a-county', type: 'all' })).toEqual([]);
    });

    it('returns empty for an unknown county composed with a type', () => {
      expect(filterEvents(MIXED, { county: 'not-a-county', type: 'meetup' })).toEqual([]);
    });

    it('returns empty for a county with no event of the requested type', () => {
      expect(filterEvents(MIXED, { county: 'richland', type: 'meetup' })).toEqual([]);
    });
  });

  describe('filtering and recurrence expansion', () => {
    const RECURRING = [
      ev({
        id: 'gvweekly',
        county: 'greenville',
        date: '2026-09-01',
        recurrence: { freq: 'weekly', until: '2026-09-22' },
      }),
      ev({ id: 'ch1once', county: 'charleston', date: '2026-09-03', recurrence: null }),
    ];

    it('really does recur (fixture guard)', () => {
      const all = expandAll(RECURRING, '2027-09-01');
      expect(all.filter((o) => o.event.id === 'gvweekly').length).toBeGreaterThan(1);
    });

    it('leaks no occurrence of a recurring event that the filter excludes', () => {
      const out = expandAll(filterEvents(RECURRING, { county: 'charleston', type: 'all' }), '2027-09-01');
      expect(out.map((o) => o.event.id)).toEqual(['ch1once']);
    });

    it('leaks no occurrence when the filter is applied after expansion either', () => {
      const all = expandAll(RECURRING, '2027-09-01');
      expect(filterOccurrences(all, { county: 'charleston', type: 'all' }).map((o) => o.event.id)).toEqual([
        'ch1once',
      ]);
    });

    it('agrees whether the filter runs before or after expansion', () => {
      const filter = { county: 'greenville', type: 'all' as const };
      const before = expandAll(filterEvents(RECURRING, filter), '2027-09-01');
      const after = filterOccurrences(expandAll(RECURRING, '2027-09-01'), filter);
      expect(after.map((o) => `${o.date}:${o.event.id}`)).toEqual(
        before.map((o) => `${o.date}:${o.event.id}`),
      );
    });
  });

  describe('countyOptions', () => {
    it('lists only counties that actually have occurrences', () => {
      const occ = expandAll(MIXED, '2027-09-01');
      expect(countyOptions(occ).map((c) => c.county).sort()).toEqual([
        'charleston', 'greenville', 'richland',
      ]);
    });

    it('counts occurrences, not events, and sorts busiest first', () => {
      const occ = expandAll(MIXED, '2027-09-01');
      expect(countyOptions(occ)).toEqual([
        { county: 'greenville', count: 2 },
        { county: 'charleston', count: 1 },
        { county: 'richland', count: 1 },
      ]);
    });

    it('returns an empty list for no occurrences', () => {
      expect(countyOptions([])).toEqual([]);
    });
  });

  describe('facetCounts', () => {
    const OCC = expandAll(MIXED, '2027-09-01');

    it('reports full totals under the all/all filter', () => {
      const f = facetCounts(OCC, ALL_EVENTS);
      expect(f.countyAll).toBe(4);
      expect(f.countyCounts).toEqual({ greenville: 2, charleston: 1, richland: 1 });
      expect(f.typeCounts).toEqual({ all: 4, meetup: 2, public: 2 });
    });

    it('facets the county counts by the active type', () => {
      const f = facetCounts(OCC, { county: 'all', type: 'meetup' });
      expect(f.countyCounts).toEqual({ greenville: 1, charleston: 1 });
      expect(f.countyAll).toBe(2);
    });

    it('facets the type counts by the active county', () => {
      const f = facetCounts(OCC, { county: 'greenville', type: 'all' });
      expect(f.typeCounts).toEqual({ all: 2, meetup: 1, public: 1 });
    });

    it('leaves the county counts untouched by the active county', () => {
      const f = facetCounts(OCC, { county: 'greenville', type: 'all' });
      expect(f.countyCounts).toEqual({ greenville: 2, charleston: 1, richland: 1 });
    });

    it('reports zeros for an unknown active county', () => {
      const f = facetCounts(OCC, { county: 'not-a-county', type: 'all' });
      expect(f.typeCounts).toEqual({ all: 0, meetup: 0, public: 0 });
    });
  });

  describe('filterHash and parseFilterHash', () => {
    it('maps the all/all filter to an empty hash', () => {
      expect(filterHash(ALL_EVENTS)).toBe('');
    });

    it('maps a county filter to a county hash', () => {
      expect(filterHash({ county: 'greenville', type: 'all' })).toBe('#county=greenville');
    });

    it('maps a type filter to a type hash', () => {
      expect(filterHash({ county: 'all', type: 'meetup' })).toBe('#type=meetups');
      expect(filterHash({ county: 'all', type: 'public' })).toBe('#type=public');
    });

    it('puts the county first in a composed hash', () => {
      expect(filterHash({ county: 'greenville', type: 'meetup' })).toBe(
        '#county=greenville&type=meetups',
      );
    });

    it('round-trips every shape', () => {
      for (const filter of [
        ALL_EVENTS,
        { county: 'greenville', type: 'all' as const },
        { county: 'all', type: 'meetup' as const },
        { county: 'all', type: 'public' as const },
        { county: 'greenville', type: 'meetup' as const },
      ]) {
        expect(parseFilterHash(filterHash(filter))).toEqual(filter);
      }
    });

    it('parses a hash string with the leading # already stripped', () => {
      expect(parseFilterHash('county=greenville&type=meetups')).toEqual({
        county: 'greenville',
        type: 'meetup',
      });
    });

    it('keeps an unknown county so the filter resolves to empty rather than to everything', () => {
      const filter = parseFilterHash('#county=not-a-county');
      expect(filter).toEqual({ county: 'not-a-county', type: 'all' });
      expect(filterEvents(MIXED, filter)).toEqual([]);
    });

    it('falls back to all events for an empty hash and for junk', () => {
      expect(parseFilterHash('')).toEqual(ALL_EVENTS);
      expect(parseFilterHash('#')).toEqual(ALL_EVENTS);
      expect(parseFilterHash('#nonsense')).toEqual(ALL_EVENTS);
    });
  });

  describe('emptyStateProof', () => {
    it('invites the first event when nothing has run', () => {
      expect(emptyStateProof(0)).toBe('Be the first to put something on it.');
    });

    it('uses the singular for one past event', () => {
      expect(emptyStateProof(1)).toBe('1 event has run in the last 90 days.');
    });

    it('uses the plural for several', () => {
      expect(emptyStateProof(3)).toBe('3 events have run in the last 90 days.');
    });
  });
  ```

  Run it:

  ```bash
  npx vitest run src/lib/events-view.test.ts
  ```

  Expected failure — the new names do not exist yet:

  ```
  SyntaxError: The requested module './events-view.js' does not provide an export named 'ALL_EVENTS'
  ```

---

- [ ] **Step 3: Implement the filter helpers in `src/lib/events-view.ts`**

  Append this to the end of `src/lib/events-view.ts`, below `groupByMonth`. Nothing above it changes.

  ```ts
  /* ------------------------------------------------------------------------ *
   * Filtering (design §12)
   *
   * Three callers share every function below, which is the entire point of
   * putting them here: the prerender in src/pages/events.astro (which renders the
   * full, unfiltered list), the browser in src/scripts/events-page.ts (which
   * narrows it), and the tests. A filter that is computed one way at build and
   * another way at runtime is a filter that eventually shows a visitor a list the
   * URL disagrees with.
   * ------------------------------------------------------------------------ */

  /** URL slug for each event type, used in the hash. No SC county is named
   *  "meetups" or "public", so the two dimensions never collide in one hash. */
  export const TYPE_SLUGS = { meetup: 'meetups', public: 'public' } as const;

  export type EventTypeFilter = 'all' | 'meetup' | 'public';

  export interface EventFilter {
    /** A county slug, or the literal 'all'. Unknown slugs are legal and match nothing. */
    county: string;
    type: EventTypeFilter;
  }

  /** The unfiltered state, i.e. what /events renders with no hash. */
  export const ALL_EVENTS: EventFilter = { county: 'all', type: 'all' };

  export function matchesFilter(event: PublicEvent, filter: EventFilter): boolean {
    if (filter.county !== 'all' && event.county !== filter.county) return false;
    if (filter.type !== 'all' && event.type !== filter.type) return false;
    return true;
  }

  /**
   * Filter stored events. Applied *before* recurrence expansion by the client, so
   * an excluded recurring event cannot leak a single occurrence. An unknown county
   * slug simply matches nothing — it is not an error, because a visitor can paste
   * any #county= hash and an empty calendar with a recruit prompt tells them more
   * than a broken control would.
   */
  export function filterEvents(
    events: readonly PublicEvent[],
    filter: EventFilter,
  ): PublicEvent[] {
    return events.filter((e) => matchesFilter(e, filter));
  }

  /** The same predicate over already-expanded occurrences. */
  export function filterOccurrences(
    occurrences: readonly Occurrence[],
    filter: EventFilter,
  ): Occurrence[] {
    return occurrences.filter((o) => matchesFilter(o.event, filter));
  }

  /**
   * The counties worth offering as chips, busiest first, ties broken by slug.
   * Derived from the occurrences that exist — never from the 46-county registry —
   * so the chip row stays a row.
   */
  export function countyOptions(
    occurrences: readonly Occurrence[],
  ): Array<{ county: string; count: number }> {
    const counts = new Map<string, number>();
    for (const o of occurrences) {
      counts.set(o.event.county, (counts.get(o.event.county) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([county, count]) => ({ county, count }))
      .sort((a, b) => b.count - a.count || (a.county < b.county ? -1 : 1));
  }

  export interface FilterFacets {
    /** Occurrences per county under the active *type* filter (county ignored). */
    countyCounts: Record<string, number>;
    /** Total occurrences under the active *type* filter, for the "All counties" chip. */
    countyAll: number;
    /** Occurrences per type under the active *county* filter (type ignored). */
    typeCounts: { all: number; meetup: number; public: number };
  }

  /**
   * Counts for the chip badges. Each dimension is faceted by the *other* one, which
   * is why a chip can read 0: "Greenville 0" under an active Meetups filter means
   * Greenville has events but no meetups, and that is worth showing rather than
   * hiding, because hiding it would strand anyone who filtered into a dead end.
   */
  export function facetCounts(
    occurrences: readonly Occurrence[],
    active: EventFilter,
  ): FilterFacets {
    const countyCounts: Record<string, number> = {};
    let countyAll = 0;
    for (const o of filterOccurrences(occurrences, { county: 'all', type: active.type })) {
      countyCounts[o.event.county] = (countyCounts[o.event.county] ?? 0) + 1;
      countyAll += 1;
    }

    const inCounty = filterOccurrences(occurrences, { county: active.county, type: 'all' });
    return {
      countyCounts,
      countyAll,
      typeCounts: {
        all: inCounty.length,
        meetup: inCounty.filter((o) => o.event.type === 'meetup').length,
        public: inCounty.filter((o) => o.event.type === 'public').length,
      },
    };
  }

  /**
   * The URL hash for a filter: '' for the unfiltered state, '#county=greenville',
   * '#type=meetups', '#county=greenville&type=meetups'. Shareable among the ~all
   * visitors who have JavaScript; the no-JS page ignores it and shows everything.
   */
  export function filterHash(filter: EventFilter): string {
    const parts: string[] = [];
    if (filter.county !== 'all') parts.push(`county=${filter.county}`);
    if (filter.type !== 'all') parts.push(`type=${TYPE_SLUGS[filter.type]}`);
    return parts.length ? `#${parts.join('&')}` : '';
  }

  /**
   * Inverse of filterHash, tolerant of a leading '#' and of an empty string.
   * Anything that is not a recognised type slug under type= is ignored; an unknown
   * county under county= is kept, so a shared #county=<slug> for a county with no
   * current events resolves to the empty state rather than silently widening to
   * every event in the state.
   */
  export function parseFilterHash(hash: string): EventFilter {
    const raw = hash.replace(/^#/, '');
    let county = 'all';
    let type: EventTypeFilter = 'all';
    for (const part of raw.split('&')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const key = part.slice(0, eq);
      const value = decodeURIComponent(part.slice(eq + 1));
      if (key === 'county' && value) county = value;
      else if (key === 'type') {
        if (value === TYPE_SLUGS.meetup) type = 'meetup';
        else if (value === TYPE_SLUGS.public) type = 'public';
      }
    }
    return { county, type };
  }

  /**
   * The social-proof line under the empty state (design §12). Shared by the
   * prerender and the browser so a county filtered down to nothing shows the same
   * sentence as a calendar that was empty to begin with.
   */
  export function emptyStateProof(pastCount: number): string {
    if (pastCount <= 0) return 'Be the first to put something on it.';
    return `${pastCount} ${pastCount === 1 ? 'event has' : 'events have'} run in the last 90 days.`;
  }
  ```

  Run again:

  ```bash
  npx vitest run src/lib/events-view.test.ts
  ```

  Expected: `Test Files  1 passed (1)` and `Tests  49 passed (49)` — the events-page task's 15 plus the 34 added here.

  Commit:

  ```bash
  git add src/lib/events-view.ts src/lib/events-view.test.ts
  git commit -m "feat(events): pure county and type filter helpers"
  ```

---

- [ ] **Step 4: Give `src/components/EventsList.astro` the hooks the filter needs**

  Three changes, all so the client can rewrite the counts and the empty state when the filter moves without duplicating the copy that produced them.

  **(a)** Import the shared empty-state line. Change:

  ```astro
  import { monthAbbr, dayOfMonth, formatTime12, sortKey } from '../lib/events-view.js';
  ```

  to:

  ```astro
  import { monthAbbr, dayOfMonth, formatTime12, sortKey, emptyStateProof } from '../lib/events-view.js';
  ```

  **(b)** Replace the empty-state block so its proof line comes from that function and carries an id. Change:

  ```astro
    <div id="events-empty" class="events-empty" hidden={upcoming.length > 0}>
      <p class="events-empty-lead">Nothing on the calendar right now.</p>
      <p class="events-empty-proof">
        {past.length > 0
          ? `${past.length} ${past.length === 1 ? 'event has' : 'events have'} run in the last 90 days.`
          : 'Be the first to put something on it.'}
      </p>
  ```

  to:

  ```astro
    <!-- One empty state for both cases. A county filtered down to nothing and a
         calendar that was empty to begin with get the same lead, the same proof
         line, and the same two ways in — the only thing that differs is the
         number, and that comes from emptyStateProof() on both render paths. -->
    <div id="events-empty" class="events-empty" hidden={upcoming.length > 0}>
      <p class="events-empty-lead">Nothing on the calendar right now.</p>
      <p class="events-empty-proof" id="events-empty-proof">{emptyStateProof(past.length)}</p>
  ```

  **(c)** Make the past block always present so the client can repopulate it, instead of existing only when the prerendered page happened to have past events. Change:

  ```astro
    {past.length > 0 && (
      <details class="events-past">
        <summary class="label-mono">Past events ({past.length})</summary>
        <ul class="events-past-list">
          {past.map((o) => (
            <li class="event-past-row">
              <span class="event-past-date">{monthAbbr(o.date)} {dayOfMonth(o.date)}</span>
              <span class="event-title event-past-title">{o.event.title}</span>
              <span class="event-past-place">{place(o)}</span>
            </li>
          ))}
        </ul>
      </details>
    )}
  ```

  to:

  ```astro
    <details class="events-past" id="events-past" hidden={past.length === 0}>
      <summary class="label-mono">
        Past events (<span id="events-past-count">{past.length}</span>)
      </summary>
      <ul class="events-past-list" id="events-past-list">
        {past.map((o) => (
          <li class="event-past-row">
            <span class="event-past-date">{monthAbbr(o.date)} {dayOfMonth(o.date)}</span>
            <span class="event-title event-past-title">{o.event.title}</span>
            <span class="event-past-place">{place(o)}</span>
          </li>
        ))}
      </ul>
    </details>
  ```

  Past rows still carry no `data-event-id`, exactly as the events-page task left them: `/go/:id` refuses past events server-side, and keeping the id off keeps the overlay patch pass from touching them. The client rebuilds these rows wholesale on a filter change rather than patching them.

---

- [ ] **Step 5: Add the filter container, island fields, and chip styles to `src/pages/events.astro`**

  The page stays a single static route. It prerenders the **full, unfiltered** calendar — that is the no-JavaScript invariant — and ships an empty filter container the client fills. Three edits.

  **(a)** Replace the entire frontmatter — everything between the opening `---` and its matching `---` at the top of the file — with this. It computes `today`/`horizonEnd`/`pastCutoff` at build (a build straddling midnight still uses one day throughout the page), renders the unfiltered occurrence sets, and hands the client the county slugs and display names it needs to build chips. The `getStaticPaths` matrix, the per-filter props, and the `noindex` fragment from the earlier draft are all gone.

  ```astro
  ---
  import Base from '../layouts/Base.astro';
  import EventsList from '../components/EventsList.astro';
  import EventsMonth from '../components/EventsMonth.astro';
  import EventsMap from '../components/EventsMap.astro';
  import registry from '../data/registry.json';
  import bakedEventsRaw from '../data/events.json';
  import { toPublicEvent, type PublicEvent, type StoredEvent } from '../lib/public-event.js';
  import { publicEventSchema } from '../lib/event-schema.js';
  import {
    expandAll,
    splitByToday,
    addMonths,
    countyOptions,
  } from '../lib/events-view.js';
  import { toJsonIsland } from '../lib/json-island.js';

  // Baked events.json is validated with the shared strict publicEventSchema and
  // projected through toPublicEvent — IDENTICAL to the events-page task that created
  // this file. This task must NOT weaken that back to a cast plus a partial field
  // check: publicEventSchema's `.strict()` is what rejects a hand-edited record
  // carrying a server-only field (signalUrl, codeDigest, revoked) and fails the build,
  // and toPublicEvent is the allowlist projection that stops any such field reaching
  // the data island (design §5/§6). The per-field caps live inside the shared schema,
  // never retyped here.
  const bakedEvents: PublicEvent[] = (bakedEventsRaw as unknown[]).map((raw, index) => {
    const parsed = publicEventSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const at = issue.path.length > 0 ? issue.path.join('.') : '_record';
      const detail = issue.code === 'unrecognized_keys' ? 'unexpected_field' : issue.message;
      throw new Error(
        `src/data/events.json: record ${index} at "${at}" failed strict validation (${detail})`,
      );
    }
    return toPublicEvent(parsed.data as unknown as StoredEvent);
  });

  const today = new Date().toISOString().slice(0, 10);
  const horizonEnd = addMonths(today, 12);
  const cutoffDate = new Date(`${today}T00:00:00Z`);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 90);
  const pastCutoff = cutoffDate.toISOString().slice(0, 10);

  // Display names, derived from registry.json at build time and shipped in the data
  // island. registry.json itself is ~50 KB and must never reach the client bundle.
  const cityNames: Record<string, string> = {};
  const countyNames: Record<string, string> = {};
  for (const j of registry.jurisdictions as Array<Record<string, string>>) {
    if (j.type === 'place') {
      cityNames[j.id.split(':')[1]] = j.name.replace(/ (City|Town) Council$/, '');
    } else if (j.type === 'county') {
      countyNames[j.county.toLowerCase()] = j.county;
    }
  }

  // The page prerenders the FULL, unfiltered calendar — that is the no-JavaScript
  // invariant. The client narrows it in place; nothing here is filtered.
  const allOccurrences = expandAll(bakedEvents, horizonEnd);
  const { upcoming, past: recentPast } = splitByToday(allOccurrences, today);
  const past = recentPast.filter((o) => o.date >= pastCutoff);

  // County slugs with at least one upcoming occurrence, busiest first. The client
  // builds one chip per slug — never one per registry county — so the row stays a
  // row.
  const counties = countyOptions(upcoming).map((c) => c.county);

  const island = {
    events: bakedEvents,
    cityNames,
    countyNames,
    today,
    horizonEnd,
    pastCutoff,
    // The county slugs that get a chip on first paint. The overlay merge may add a
    // transient chip for a county it introduces, but the initial row comes from here.
    counties,
  };
  ---
  ```

  This keeps the body's `<EventsList upcoming={upcoming} past={recentPast} .../>` and `<EventsMonth occurrences={upcoming} .../>` calls valid: `upcoming` and `recentPast` are still in scope, and `past` (the 90-day-trimmed set) feeds only the island. If the events-page task's markup embeds the island through a `set:html` call other than `toJsonIsland(island)`, keep that call as it is — the two new keys (`pastCutoff`, `counties`) serialize automatically because they are added to the same `island` object. The rest of the markup — the hero, the List/Month/Map tabs, the intake dialog, and the `<script>import '../scripts/events-page.js';</script>` — is unchanged. Only the two edits below touch the body.

  **(b)** Add the empty filter container. It sits above the grid, is empty and `hidden` in the prerendered HTML, and is filled by `events-page.ts` on load — so a no-JavaScript visitor sees no chip row and no dead control, only the complete list below it. Find the grid wrapper (the `<div class="events-grid">` that holds the List/Month panels) and insert immediately before it:

  ```astro
        {/* Built by events-page.ts on load. Empty and hidden without JavaScript,
            so there is no dead control — the full list below is the complete view. */}
        <nav id="events-filters" class="events-filters" aria-label="Filter events" hidden></nav>

        <div class="events-grid">
  ```

  (If the grid wrapper carries different attributes in the events-page task's markup, leave them; insert the `<nav>` on the line above whatever that opening tag is.)

  **(c)** Add the chip styles. Insert this immediately before the closing `</style>` of the page's `<style is:global>` block, after the intake-dialog rules. The chips are `<button>` elements the client creates, so the rules are global (a scoped rule keys on a `data-astro-*` attribute the runtime-created nodes do not carry):

  ```css
    /* --- Filter chips ---
       Built by events-page.ts, so styled globally: runtime-created nodes carry no
       data-astro-* attribute for a scoped rule to match. The container ships hidden
       and the script unhides it, which is why there is no flash of an empty bar. */
    .events-filters {
      max-width: 84rem;
      margin: 0 auto;
      padding: 1rem 0 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .events-filters[hidden] { display: none; }
    .filter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
    .filter-legend { color: #525252; margin-right: 0.35rem; }

    .filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: 44px;
      padding: 0 0.75rem;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: transparent;
      color: #a3a3a3;
      font-family: inherit;
      font-size: 0.8125rem;
      text-decoration: none;
      cursor: pointer;
    }
    .filter-chip:hover { border-color: rgba(255, 255, 255, 0.28); color: #e8e8e8; }
    .filter-chip.is-active { border-color: #dc2626; background: rgba(220, 38, 38, 0.14); color: #ffffff; }
    .filter-chip:focus-visible { outline: 2px solid #fbbf24; outline-offset: 2px; }
    /* A chip that matches nothing right now still has to be reachable, or filtering
       into a dead end leaves no way back out. Dimmed, not removed. */
    .filter-chip[data-count='0'] { opacity: 0.45; }

    .filter-chip-count { font-family: 'DM Mono', monospace; font-size: 10px; color: #737373; }
    .filter-chip.is-active .filter-chip-count { color: #fca5a5; }

    .filter-clear {
      color: #737373;
      font-size: 0.75rem;
      text-decoration: underline;
      margin-left: 0.35rem;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      border: 0;
      background: transparent;
      font-family: inherit;
      cursor: pointer;
    }
    .filter-clear[hidden] { display: none; }
    .events-past[hidden] { display: none; }
  ```

  Confirm the page still builds:

  ```bash
  npm run build
  ```

  Expected: the Astro build completes with no errors and `dist/events/index.html` exists. With `src/data/events.json` still empty the filter container is present but stays hidden until the client runs; that is correct. Step 8 supplies a fixture so the interesting cases can be seen.

  Commit. The no-JavaScript half of the feature — a complete, filterless list — is intact and shippable at this point:

  ```bash
  git add src/components/EventsList.astro src/pages/events.astro
  git commit -m "feat(events): filter container, hooks, and chip styles"
  ```

---

- [ ] **Step 6: Make the map a filter control in `src/scripts/map/layers/events.ts`**

  Five edits to `src/scripts/map/layers/events.ts`. The events-page task already ships the county choropleth, the `county-selected` source, and the amber `county-highlight` line layer that reads from it; this task re-adds none of them. What it adds is composer control of that highlight (`setSelectedCounty`) and a county click that **reports a selection** to whoever owns the filter state instead of easing the map in. The map keeps rendering every county — selecting one must not hide the others, or the next county becomes unreachable — and never zooms on a county click, because easing past z8 fades the choropleth out and the choropleth is doubling as the selection UI.

  **(a)** Extend `EventLayerData` with the select callback. Change:

  ```ts
  export interface EventLayerData {
    /** County outlines, from /districts/sc-counties.json. */
    counties: GeoJSON.FeatureCollection;
    /** The occurrences to plot. */
    events: readonly Occurrence[];
    /**
     * City centroids keyed by slug. Each value is either [lng, lat] or
     * { lng, lat }; both are accepted, so raw src/data/city-centroids.json works.
     */
    centroids: Record<string, unknown>;
    /** Display names per city slug, for the pin labels. */
    cityNames: Record<string, string>;
  }
  ```

  to:

  ```ts
  export interface EventLayerData {
    /** County outlines, from /districts/sc-counties.json. */
    counties: GeoJSON.FeatureCollection;
    /** The occurrences to plot. */
    events: readonly Occurrence[];
    /**
     * City centroids keyed by slug. Each value is either [lng, lat] or
     * { lng, lat }; both are accepted, so raw src/data/city-centroids.json works.
     */
    centroids: Record<string, unknown>;
    /** Display names per city slug, for the pin labels. */
    cityNames: Record<string, string>;
    /**
     * Called when a county fill is clicked, with the county slug — or null when the
     * already-selected county is clicked again (a toggle-off). The layer holds no
     * filter state; the composer decides and calls setSelectedCounty back, which is
     * why the amber outline and the filter chip can never drift apart.
     */
    onCountySelect?: (county: string | null) => void;
  }
  ```

  **(b)** Carry the selection and the callback in the per-map state. Change:

  ```ts
  interface EventLayerState {
    counties: GeoJSON.FeatureCollection;
    centroids: Centroids;
    cityNames: Record<string, string>;
    teardown: () => void;
  }
  ```

  to:

  ```ts
  interface EventLayerState {
    counties: GeoJSON.FeatureCollection;
    centroids: Centroids;
    cityNames: Record<string, string>;
    selectedCounty: string | null;
    onCountySelect: ((county: string | null) => void) | null;
    teardown: () => void;
  }
  ```

  **(c)** Add the composer-driven highlight setter. Insert this immediately after `setEventData`:

  ```ts
  /**
   * Highlight one county, or none, by pushing its outline into the `county-selected`
   * source the events-page task already created. The composer owns the filter state
   * and calls this; the map never decides on its own what is selected, so the amber
   * outline always matches the active chip. No-op if the map has no event layers yet.
   */
  export function setSelectedCounty(map: maplibregl.Map, county: string | null): void {
    const state = eventStates.get(map);
    if (!state) return;
    state.selectedCounty = county;
    const source = map.getSource('county-selected') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const feature = county
      ? state.counties.features.find((f) => String(f.properties?.county ?? '') === county)
      : undefined;
    source.setData({
      type: 'FeatureCollection',
      features: feature ? [{ type: 'Feature', geometry: feature.geometry, properties: {} }] : [],
    });
  }
  ```

  **(d)** Seed the two new state fields in `addEventLayers`. Change:

  ```ts
    const state: EventLayerState = {
      counties,
      centroids: normalizeCentroids(data.centroids),
      cityNames: data.cityNames,
      teardown: () => {},
    };
  ```

  to:

  ```ts
    const state: EventLayerState = {
      counties,
      centroids: normalizeCentroids(data.centroids),
      cityNames: data.cityNames,
      selectedCounty: null,
      onCountySelect: data.onCountySelect ?? null,
      teardown: () => {},
    };
  ```

  **(e)** Replace the county click handler in `bindEventInteractions` so it reports a selection instead of setting the highlight and easing in. Change:

  ```ts
    // County fill -> highlight the clicked county and ease in past the crossfade.
    const onCountyClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const selected = map.getSource('county-selected') as maplibregl.GeoJSONSource | undefined;
      selected?.setData({
        type: 'FeatureCollection',
        features: f ? [{ type: 'Feature', geometry: f.geometry, properties: {} }] : [],
      });
      map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom() + 2, 8.5) });
    };
  ```

  to:

  ```ts
    // County fill -> report a selection to the composer. The choropleth is a filter
    // control, not a zoom shortcut: clicking a county hands its slug to the composer,
    // which owns the filter state and calls setSelectedCounty back; clicking the
    // already-selected county clears it. We do NOT ease in past z8 here — that would
    // fade the choropleth out, and the choropleth is doubling as the selection UI.
    const onCountyClick = (e: maplibregl.MapLayerMouseEvent) => {
      const slug = String(e.features?.[0]?.properties?.county ?? '');
      if (!slug) return;
      const state = eventStates.get(map);
      if (!state) return;
      state.onCountySelect?.(slug === state.selectedCounty ? null : slug);
    };
  ```

  Nothing else in `events.ts` changes: `county-selected`, `county-highlight`, `EVENT_LAYER_IDS`, and `removeEventLayers` already account for the selection source and layer.

---

- [ ] **Step 7: Wire the filter into `src/scripts/events-page.ts`**

  The module keeps the events-page task's structure: the prerendered DOM is correct on arrival and the overlay merge still patches it incrementally. What is new is a filter change — a user action that re-renders the list, the month chips, and the past rows from `allEvents`, then writes the URL hash. There is nothing in the DOM to "unhide," because the page renders one full list and the client narrows it.

  **(a)** Extend the imports. Change:

  ```ts
  import type { PublicEvent } from '../lib/public-event.js';
  import type { Occurrence } from '../lib/events-view.js';
  import type { MapHandle } from './map/core.js';
  import {
    mergeEvents,
    expandAll,
    splitByToday,
    monthAbbr,
    dayOfMonth,
    formatTime12,
    sortKey,
  } from '../lib/events-view.js';
  ```

  to:

  ```ts
  import type { PublicEvent } from '../lib/public-event.js';
  import type { Occurrence, EventFilter, EventTypeFilter } from '../lib/events-view.js';
  import type { MapHandle } from './map/core.js';
  import {
    mergeEvents,
    expandAll,
    splitByToday,
    monthAbbr,
    dayOfMonth,
    formatTime12,
    sortKey,
    matchesFilter,
    filterEvents,
    facetCounts,
    filterHash,
    parseFilterHash,
    emptyStateProof,
  } from '../lib/events-view.js';
  ```

  **(b)** Extend the island shape and the module state. Change:

  ```ts
  interface Island {
    events: PublicEvent[];
    cityNames: Record<string, string>;
    countyNames: Record<string, string>;
    today: string;
    horizonEnd: string;
  }
  ```

  to:

  ```ts
  interface Island {
    events: PublicEvent[];
    cityNames: Record<string, string>;
    countyNames: Record<string, string>;
    today: string;
    horizonEnd: string;
    pastCutoff: string;
    counties: string[];
  }
  ```

  Then change:

  ```ts
  const bakedIds = new Set(island.events.map((e) => e.id));
  let occurrences: Occurrence[] = splitByToday(
    expandAll(island.events, island.horizonEnd),
    island.today,
  ).upcoming;
  ```

  to:

  ```ts
  const bakedIds = new Set(island.events.map((e) => e.id));

  /** Every event the page knows about. Baked at build, replaced by the overlay merge. */
  let allEvents: PublicEvent[] = island.events;

  /** The active filter, seeded from the URL hash so a shared #county=… link narrows
   *  on load. The prerendered page is the full list; the client filters over it. */
  let filter: EventFilter = parseFilterHash(location.hash);

  function upcomingFor(events: readonly PublicEvent[]): Occurrence[] {
    return splitByToday(expandAll(events, island.horizonEnd), island.today).upcoming;
  }

  /** What the map draws: type-filtered but never county-filtered, so every other
   *  county stays on the choropleth and stays one click away. */
  function mapOccurrences(): Occurrence[] {
    return upcomingFor(filterEvents(allEvents, { county: 'all', type: filter.type }));
  }
  ```

  **(c)** Draw the filtered occurrences on first paint, register the county-select callback, and set the initial highlight. In `loadMap`, change the `addEventLayers` call. Change:

  ```ts
    layer.addEventLayers(handle.map, {
      counties,
      events: occurrences,
      centroids: (centroidsMod as { default: Record<string, unknown> }).default,
      cityNames: island.cityNames,
    });
  }
  ```

  to:

  ```ts
    layer.addEventLayers(handle.map, {
      counties,
      events: mapOccurrences(),
      centroids: (centroidsMod as { default: Record<string, unknown> }).default,
      cityNames: island.cityNames,
      onCountySelect: (county) => {
        // The map does not hold filter state; it reports a click and this module
        // decides. That is what makes the chip and the amber outline the same thing.
        pushHash({ ...filter, county: county ?? 'all' });
      },
    });
    layer.setSelectedCounty(handle.map, filter.county === 'all' ? null : filter.county);
  }
  ```

  **(d)** Add a past-row builder next to `buildChip`, mirroring `EventsList.astro`. Insert immediately after the `buildChip` function:

  ```ts
  function buildPastRow(o: Occurrence): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'event-past-row';
    li.append(
      el('span', 'event-past-date', `${monthAbbr(o.date)} ${dayOfMonth(o.date)}`),
      el('span', 'event-title event-past-title', o.event.title),
      el('span', 'event-past-place', placeLabel(o.event)),
    );
    return li;
  }
  ```

  **(e)** Rework `applyMerge` so the merge respects the active filter and hands the chrome update to one shared place. Change:

  ```ts
    // 2. Insert events submitted since the last fold.
    const fresh = merged.filter((e) => !bakedIds.has(e.id));
  ```

  to:

  ```ts
    // 2. Insert events submitted since the last fold — but only the ones the active
    //    filter admits, or a filtered list grows rows it is not supposed to show.
    const fresh = merged.filter((e) => !bakedIds.has(e.id) && matchesFilter(e, filter));
  ```

  and change the tail of the function — everything from the `// 3.` comment to the closing brace:

  ```ts
    // 3. Recompute the occurrence set for the map and the header count.
    occurrences = splitByToday(expandAll(merged, island.horizonEnd), island.today).upcoming;

    const count = document.getElementById('events-count');
    if (count) count.textContent = String(list ? list.children.length : occurrences.length);

    const empty = document.getElementById('events-empty');
    if (empty && list) empty.hidden = list.children.length > 0;

    if (mapHandle && eventsLayer) eventsLayer.setEventData(mapHandle.map, occurrences);
  }
  ```

  to:

  ```ts
    // 3. The merged set is what every later filter change renders from.
    allEvents = merged;
    syncChrome();
  }
  ```

  **(f)** Add the filter engine. Insert this immediately after `applyMerge` and before `loadOverlay`. It defines the chip builder, the shared chrome sync, the re-render, and the hash writer, then wires the listeners and does the first paint at the bottom (module top level, so it runs once when the script loads):

  ```ts
  // --- Filter ---------------------------------------------------------------
  //
  // The chips do not exist without this file: the <nav id="events-filters"> the
  // page ships is empty and hidden, so a no-JavaScript visitor sees the complete
  // list and no dead control. Here we build the chips, filter the list in place,
  // and keep the choice in the URL hash so a filtered view is shareable and the
  // back button works. `el`, `buildCard`, `buildChip`, and `placeLabel` already
  // exist in this module (the events-page task); they are used, not redefined.

  function chipButton(
    key: string,
    value: string,
    label: string,
    count: number,
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter-chip';
    b.dataset.filterKey = key;
    b.dataset.filterValue = value;
    b.dataset.count = String(count);
    b.append(document.createTextNode(label), el('span', 'filter-chip-count', String(count)));
    return b;
  }

  /** Build the two chip rows and the clear button, once, from the counties that
   *  have events. Counts and active states are set here and then maintained by
   *  syncChrome(); this only decides which chips exist. */
  function buildFilters(): void {
    const nav = document.getElementById('events-filters');
    if (!nav) return;
    const facets = facetCounts(upcomingFor(allEvents), filter);

    const countyRow = document.createElement('div');
    countyRow.className = 'filter-row';
    const countyLegend = document.createElement('span');
    countyLegend.className = 'filter-legend label-mono';
    countyLegend.textContent = 'County';
    countyRow.append(countyLegend, chipButton('county', 'all', 'All counties', facets.countyAll));
    for (const slug of island.counties) {
      countyRow.append(
        chipButton('county', slug, island.countyNames[slug] ?? slug, facets.countyCounts[slug] ?? 0),
      );
    }

    const typeRow = document.createElement('div');
    typeRow.className = 'filter-row';
    const typeLegend = document.createElement('span');
    typeLegend.className = 'filter-legend label-mono';
    typeLegend.textContent = 'Type';
    typeRow.append(
      typeLegend,
      chipButton('type', 'all', 'All types', facets.typeCounts.all),
      chipButton('type', 'meetup', 'Meetups', facets.typeCounts.meetup),
      chipButton('type', 'public', 'Public events', facets.typeCounts.public),
    );

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.id = 'filter-clear';
    clear.className = 'filter-clear';
    clear.dataset.filterKey = 'clear';
    clear.textContent = 'Clear';
    clear.hidden = filter.county === 'all' && filter.type === 'all';
    typeRow.append(clear);

    nav.replaceChildren(countyRow, typeRow);
    nav.hidden = false;
  }

  /** Chip counts, active states, the clear button, the header count, the past
   *  block, the empty state, and the map. Shared by the filter path and the overlay
   *  merge so the two can never disagree. */
  function syncChrome(): void {
    const facets = facetCounts(upcomingFor(allEvents), filter);

    const countyRow = document
      .querySelector<HTMLElement>('[data-filter-key="county"]')
      ?.parentElement;

    // A county the overlay introduced has no first-paint chip. Give it a transient
    // one so a map selection into that county is always visible in the chip row.
    if (countyRow && filter.county !== 'all') {
      const known = countyRow.querySelector(`[data-filter-value="${CSS.escape(filter.county)}"]`);
      if (!known) {
        const chip = chipButton(
          'county',
          filter.county,
          island.countyNames[filter.county] ?? filter.county,
          0,
        );
        chip.dataset.transient = '1';
        countyRow.append(chip);
      }
    }
    for (const stale of document.querySelectorAll<HTMLElement>('[data-transient="1"]')) {
      if (stale.dataset.filterValue !== filter.county) stale.remove();
    }

    for (const chip of document.querySelectorAll<HTMLElement>('.filter-chip')) {
      const key = chip.dataset.filterKey;
      const value = chip.dataset.filterValue ?? 'all';

      const active = key === 'county' ? filter.county === value : filter.type === value;
      chip.classList.toggle('is-active', active);
      if (active) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');

      const count =
        key === 'county'
          ? value === 'all'
            ? facets.countyAll
            : facets.countyCounts[value] ?? 0
          : facets.typeCounts[value as 'all' | 'meetup' | 'public'] ?? 0;
      chip.dataset.count = String(count);
      const badge = chip.querySelector('.filter-chip-count');
      if (badge) badge.textContent = String(count);
    }

    const clear = document.getElementById('filter-clear');
    if (clear) clear.hidden = filter.county === 'all' && filter.type === 'all';

    const list = document.getElementById('events-list');
    const shown = list ? list.children.length : 0;
    const count = document.getElementById('events-count');
    if (count) count.textContent = String(shown);

    const pastList = document.getElementById('events-past-list');
    const pastShown = pastList ? pastList.children.length : 0;
    const pastBlock = document.getElementById('events-past');
    if (pastBlock) pastBlock.hidden = pastShown === 0;
    const pastCount = document.getElementById('events-past-count');
    if (pastCount) pastCount.textContent = String(pastShown);

    // One empty state for both cases: a county filtered down to nothing gets the
    // same lead, the same proof line, and the same two ways in as a calendar that
    // was empty to begin with.
    const empty = document.getElementById('events-empty');
    if (empty) empty.hidden = shown > 0;
    const proof = document.getElementById('events-empty-proof');
    if (proof) proof.textContent = emptyStateProof(pastShown);

    if (mapHandle && eventsLayer) {
      eventsLayer.setEventData(mapHandle.map, mapOccurrences());
      eventsLayer.setSelectedCounty(mapHandle.map, filter.county === 'all' ? null : filter.county);
    }
  }

  /** Re-render the list, the month chips, and the past rows for a filter, then sync
   *  the chrome. Pure DOM work — no history side effects, so hashchange can call it. */
  function applyFilter(next: EventFilter): void {
    filter = next;

    const split = splitByToday(
      expandAll(filterEvents(allEvents, filter), island.horizonEnd),
      island.today,
    );
    const upcoming = split.upcoming;
    const past = split.past.filter((o) => o.date >= island.pastCutoff);

    const list = document.getElementById('events-list');
    if (list) list.replaceChildren(...upcoming.map(buildCard));

    for (const chips of document.querySelectorAll<HTMLElement>('[data-chips]')) {
      chips.replaceChildren();
    }
    for (const o of upcoming) {
      const chips = document.querySelector(`[data-chips="${CSS.escape(o.date)}"]`);
      if (chips) chips.append(buildChip(o));
    }

    const pastList = document.getElementById('events-past-list');
    if (pastList) pastList.replaceChildren(...past.map(buildPastRow));

    syncChrome();
  }

  /** Write the filter to the URL hash and re-render. pushState is deliberately not
   *  a hashchange, so this never double-fires with the hashchange listener below. */
  function pushHash(next: EventFilter): void {
    const url = `${location.pathname}${location.search}${filterHash(next)}`;
    history.pushState({ filter: next }, '', url);
    applyFilter(next);
  }

  document.getElementById('events-filters')?.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-filter-key]');
    if (!chip) return;
    const key = chip.dataset.filterKey;
    const value = chip.dataset.filterValue ?? 'all';
    if (key === 'clear') pushHash({ county: 'all', type: 'all' });
    else if (key === 'county') pushHash({ ...filter, county: value });
    else pushHash({ ...filter, type: value as EventTypeFilter });
  });

  // Back, forward, and any manual edit of the hash are hash changes; the pushState
  // in pushHash deliberately is not, so this fires once per user navigation and
  // never doubles a re-render.
  window.addEventListener('hashchange', () => applyFilter(parseFilterHash(location.hash)));

  // First paint: build the chips, then apply whatever the hash already asked for.
  // On a bare /events this re-renders the identical full list; on a shared
  // #county=… link it narrows immediately.
  buildFilters();
  applyFilter(filter);
  ```

  Type-check and lint:

  ```bash
  npm run build
  ```

  Expected: the Astro build completes with no TypeScript errors. (Runtime behaviour is verified by hand in Steps 9 and 10.)

---

- [ ] **Step 8: Load a local fixture so the filters have something to filter**

  `src/data/events.json` is very likely still empty, and an empty calendar exercises exactly one of the cases below. This writes a temporary five-event fixture across three counties, both types, one weekly series (two occurrences), and one past event — dated relative to today so it stays valid whenever you run it.

  **This is local only. Never commit it.**

  ```bash
  node -e '
  const fs=require("fs");
  const d=(n)=>{const t=new Date();t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
  const mk=(o)=>Object.assign({id:"",type:"meetup",title:"",description:null,date:"",time:"19:00",city:"greenville",county:"greenville",address:null,hasSignalGroup:true,recurrence:null,organizer:"fixture",createdAt:new Date().toISOString()},o);
  fs.copyFileSync("src/data/events.json","src/data/events.json.bak");
  fs.writeFileSync("src/data/events.json", JSON.stringify([
    mk({id:"fixt0001",title:"Greenville sign night",date:d(5)}),
    mk({id:"fixt0002",title:"Greenville County Council meeting",type:"public",address:"301 University Ridge, Greenville",hasSignalGroup:false,date:d(9)}),
    mk({id:"fixt0003",title:"Charleston weekly meetup",county:"charleston",city:"charleston",date:d(3),recurrence:{freq:"weekly",until:d(10)}}),
    mk({id:"fixt0004",title:"Columbia canvass",type:"public",county:"richland",city:"columbia",address:"1101 Lincoln St, Columbia",hasSignalGroup:false,date:d(11)}),
    mk({id:"fixt0005",title:"Columbia past meetup",county:"richland",city:"columbia",date:d(-6)}),
  ], null, 2) + "\n");
  console.log("fixture written; original saved to src/data/events.json.bak");
  '
  ```

  Expected output: `fixture written; original saved to src/data/events.json.bak`

  This fixture yields, inside the horizon:

  - **Greenville** — 2 upcoming (sign night = meetup, council = public)
  - **Charleston** — 2 upcoming (the weekly series, occurrences at `d(3)` and `d(10)`, both meetup)
  - **Richland** — 1 upcoming (canvass = public), and 1 past (`d(-6)` meetup) for the social-proof line

  So 5 upcoming occurrences; meetups = 3, public events = 2. County chips, busiest first with slug ties broken alphabetically: **Charleston 2 · Greenville 2 · Richland 1**.

  Build and confirm the three counties reach the page:

  ```bash
  npm run build && node -e '
  const fs=require("fs");
  const html=fs.readFileSync("dist/events/index.html","utf8");
  for (const s of ["charleston","greenville","richland"]) console.log((html.includes(s)?"OK   ":"MISS ")+s);
  '
  ```

  Expected: three `OK` lines — the county slugs are present in the embedded island the client reads.

  **Restore the real file before committing anything:**

  ```bash
  node -e 'require("fs").renameSync("src/data/events.json.bak","src/data/events.json"); console.log("restored")'
  ```

  Run the fixture command again at the start of Steps 9 and 10, and the restore again at the end of each.

---

- [ ] **Step 9: Manual verification — the no-JavaScript path (the invariant)**

  This is the load-bearing check. The feature is only honest if the page is complete with JavaScript off.

  With the fixture from Step 8 in place, start the dev server (npx/npm do not resolve reliably under the preview tooling on Windows, so invoke Astro's entry point directly):

  ```bash
  node node_modules/astro/astro.js dev --host 127.0.0.1 --port 4321
  ```

  In Chrome, open DevTools, Command Palette (Ctrl+Shift+P), run **Disable JavaScript**. Then open `http://127.0.0.1:4321/events/`.

  Expected, all five:

  1. **No chip row is visible at all.** The `#events-filters` container is present in the DOM but `hidden`; with JavaScript off nothing fills or unhides it. There is no dead control to click.
  2. The List panel shows **every upcoming event** — all 5 occurrences: Greenville sign night, Greenville County Council meeting, both Charleston weekly meetup dates, and the Columbia canvass. Each card shows its date, its city, and — for the three meetups — a "Join Signal group" action pointing at `/go/:id`. You lose narrowing; you lose no information.
  3. The "Past events" disclosure reads **(1)** and contains the Columbia past meetup.
  4. Open `http://127.0.0.1:4321/events/#county=greenville` directly. The page is byte-identical to check 2 — the hash is inert without JavaScript, and that is fine, because the unfiltered list is already the complete view. No error, no blank state.
  5. Stop the server, restore the real (empty) events file, restart, and open `/events/`. The List panel now shows the empty state: **"Nothing on the calendar right now."**, then **"Be the first to put something on it."**, then the `Email us` and `Join the Signal group` buttons — with no chip row above it. Re-enable JavaScript when done.

  ```bash
  node -e 'require("fs").renameSync("src/data/events.json.bak","src/data/events.json"); console.log("restored")'
  ```

---

- [ ] **Step 10: Manual verification — the JavaScript upgrade, the hash, and the map**

  Reload the fixture (Step 8 command), restart the dev server, re-enable JavaScript, and open `http://127.0.0.1:4321/events/` at a **1280 x 800** viewport with the DevTools Console visible.

  Expected, all eleven:

  1. On load a chip row appears: a `County` row reading `All counties 5` · `Charleston 2` · `Greenville 2` · `Richland 1`, and a `Type` row reading `All types 5` · `Meetups 3` · `Public events 2`. (Charleston is 2 because the weekly series contributes two occurrences inside the horizon; the counts are occurrences, not events.) `All counties` and `All types` are outlined red. No `Clear` button.
  2. Exactly three county chips. Not 46.
  3. Click `Greenville`. The list re-renders to the two Greenville events **without a page navigation** (no reload spinner; the Network tab logs no document request), the URL becomes `http://127.0.0.1:4321/events/#county=greenville`, `Greenville` is the red chip, the `Type` counts drop to `All types 2` · `Meetups 1` · `Public events 1`, and a `Clear` button has appeared.
  4. The county counts are unchanged (`Charleston 2`, `Greenville 2`, `Richland 1`) and every county chip is still clickable. Narrowing did not remove the way back out.
  5. Click `Meetups` from there. The URL becomes `#county=greenville&type=meetups`, one card remains (sign night), and both `Greenville` and `Meetups` are red. `Richland` now reads `0` and is dimmed but still clickable.
  6. Press the browser **back** button. The URL returns to `#county=greenville`, the list returns to two cards, and `Meetups` is no longer red. Forward returns to the composed filter. (This is the `hashchange` path.)
  7. Click `Clear`. The URL returns to `http://127.0.0.1:4321/events/` (no hash) and all five occurrences are back.
  8. Reload while at `#county=greenville`. The list narrows to Greenville with no flash back through the full list beyond the brief first paint — the hash is applied as the script runs.
  9. On the `Map` tab: three counties are filled red with white count badges. Click the **Charleston** fill. The list narrows to the two Charleston occurrences, the `Charleston` chip goes red, the county gets an amber outline, and the URL becomes `#county=charleston`. The Greenville and Richland fills are **still drawn and still red** — selecting one county must not erase the others. Click the Charleston fill again: the selection clears, the outline disappears, `All counties` goes red, and the URL drops the hash.
  10. Click `Meetups` in the chip row, then click the **Greenville** fill on the map. The URL becomes `#county=greenville&type=meetups` — the map click composed with the existing type filter rather than replacing it. (Richland's fill is gone from the map because Richland has no meetup.)
  11. The Console is free of errors throughout.

  Then repeat the essentials at **375 x 812**: the chip rows wrap onto multiple lines without the page scrolling horizontally, each chip measures at least 44 px tall in the element overlay, and filtering still works on the `List` and `Month` tabs before the `Map` tab has ever been tapped (no `maplibre` chunk in the Network tab).

  Confirm no horizontal overflow. In the Console, this must print `[]`:

  ```js
  [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(e => e.className)
  ```

  Restore the real events file:

  ```bash
  node -e 'require("fs").renameSync("src/data/events.json.bak","src/data/events.json"); console.log("restored")'
  ```

---

- [ ] **Step 11: Full suite, build, and commit**

  Confirm the fixture is gone before anything else:

  ```bash
  git status --short src/data/
  ```

  Expected: no output. If `src/data/events.json` shows as modified or `src/data/events.json.bak` exists, the fixture leaked — restore and delete the backup before continuing.

  Run everything:

  ```bash
  npm test
  ```

  Expected: all test files pass, including `src/lib/geo-utils.test.ts`, `src/lib/blog-utils.test.ts`, `src/lib/district-matcher.test.ts`, `scripts/build-county-shapes.test.mjs`, and `src/lib/events-view.test.ts` at 49 tests. No failures, no unhandled errors.

  ```bash
  npm run build
  ```

  Expected: the prebuild chain runs, the Astro build completes with no errors, and `dist/events/index.html` exists.

  Commit:

  ```bash
  git add src/scripts/events-page.ts src/scripts/map/layers/events.ts
  git commit -m "feat(events): client-side county and type filtering wired to the map"
  ```

---

---

---

### Task 21: submit form page

The organizer-facing submission form. It renders six fields for a meetup and reveals two more for a public event, offers a recurrence control, carries the CSS-hidden honeypot, shows the §13 Signal setup checklist at the Signal-link field, and on success shows the `/events#<id>` permalink for the organizer to copy.

This task builds the **client** only. It POSTs JSON to `POST /api/submit-event`; that function is a separate task. Until it exists, the form's failure path is what you verify (Step 11).

**Files:**

- Create: `src/lib/city-label.ts`
- Create: `src/lib/city-label.test.ts`
- Create: `src/components/SubmitEventForm.astro`
- Create: `src/pages/events/submit.astro`
- Modify: `astro.config.mjs`

Depends on `src/lib/jurisdictions.ts` (`allCitySlugs`) from Task 5. Run all commands from the repo root, `the repo root`.

---

- [ ] **Step 1: Write the failing test for `cityLabel`**

  `allCitySlugs()` returns slugs (`greenville`, `mount-pleasant`). The `<select>` needs human labels. That is pure string formatting, so it goes in its own module with its own test rather than hiding inside `.astro` frontmatter where nothing can reach it.

  Create `src/lib/city-label.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest';
  import { cityLabel } from './city-label.js';

  describe('cityLabel', () => {
    it('capitalizes a single-word slug', () => {
      expect(cityLabel('greenville')).toBe('Greenville');
    });

    it('capitalizes every word of a hyphenated slug', () => {
      expect(cityLabel('mount-pleasant')).toBe('Mount Pleasant');
    });

    it('strips a registry place: prefix', () => {
      expect(cityLabel('place:north-charleston')).toBe('North Charleston');
    });

    it('returns an empty string for an empty slug', () => {
      expect(cityLabel('')).toBe('');
    });

    it('ignores repeated and trailing hyphens', () => {
      expect(cityLabel('fort--mill-')).toBe('Fort Mill');
    });

    it('leaves already-capitalized input alone', () => {
      expect(cityLabel('Aiken')).toBe('Aiken');
    });

    it('is idempotent', () => {
      expect(cityLabel(cityLabel('mount-pleasant'))).toBe('Mount Pleasant');
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails for the right reason**

  ```
  node node_modules/vitest/vitest.mjs run src/lib/city-label.test.ts
  ```

  Expected output (exact wording, exit code 1):

  ```
   FAIL  src/lib/city-label.test.ts [ src/lib/city-label.test.ts ]
  Error: Cannot find module './city-label.js' imported from 'src/lib/city-label.test.ts'

   Test Files  1 failed (1)
        Tests  no tests
  ```

  If you instead see `No test files found, exiting with code 1`, the test file is not where you think it is. Fix the path before continuing.

- [ ] **Step 3: Implement `cityLabel`**

  Create `src/lib/city-label.ts` — complete file:

  ```ts
  /**
   * Display label for a city slug returned by `allCitySlugs()`.
   *
   * Pure string formatting: no registry lookup, no I/O. The slug remains the
   * only value ever submitted or stored; this is presentation for the <select>
   * on the submit form and for event cards.
   *
   * Accepts an optional `place:` prefix so a raw `registry.json` id also works.
   */
  export function cityLabel(slug: string): string {
    const bare = slug.startsWith('place:') ? slug.slice('place:'.length) : slug;

    return bare
      .split(/[-\s]/)
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  ```

  The split pattern is a flat character class with no nested quantifier, per §6's regex shape rule.

- [ ] **Step 4: Run the test again, then the whole suite**

  ```
  node node_modules/vitest/vitest.mjs run src/lib/city-label.test.ts
  ```

  Expected: `Test Files  1 passed (1)` and `Tests  7 passed (7)`.

  Then the full suite, which must stay green:

  ```
  npm test
  ```

  Expected: `Test Files` all passed, exit code 0.

- [ ] **Step 5: Commit the helper**

  ```
  git add src/lib/city-label.ts src/lib/city-label.test.ts
  git commit -m "feat(events): add cityLabel slug-to-label helper"
  ```

- [ ] **Step 6: Create the form component**

  Create `src/components/SubmitEventForm.astro` — complete file:

  ```astro
  ---
  import { allCitySlugs } from '../lib/jurisdictions.js';
  import { cityLabel } from '../lib/city-label.js';

  // Same allowlist the server validates against, so the select can never offer a
  // value `validateSubmission()` would reject. County is NOT asked for: it is
  // derived server-side via `countyForCity()`, and a submitted county is a
  // validation error (design §6).
  const cityOptions = allCitySlugs()
    .map((slug) => ({ slug, label: cityLabel(slug) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const labelClass =
    "block font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.16em] text-[#a3a3a3] mb-1.5";
  const inputClass =
    'w-full bg-[#111111] border border-[rgba(255,255,255,0.12)] text-[#e8e8e8] px-3 py-2.5 text-sm focus:outline-none focus-visible:outline-none focus:border-[#d4d4d4] focus:ring-2 focus:ring-[#d4d4d4]';
  const hintClass = 'text-[13px] text-[#737373] mt-1.5 leading-[1.5]';
  const errorClass = 'text-[13px] text-[#f87171] mt-1.5 leading-[1.5]';
  ---

  <div class="max-w-[640px]">
    <p id="submit-status" class="sr-only" role="status" aria-live="polite"></p>

    <p
      id="error-summary"
      tabindex="-1"
      hidden
      class="border-l-2 border-[#dc2626] bg-[rgba(220,38,38,0.08)] text-[#fca5a5] text-sm px-4 py-3 mb-6"
    >
    </p>

    <form id="submit-event-form" novalidate>
      <!-- Event type -->
      <fieldset class="border-0 p-0 m-0 mb-8">
        <legend class={labelClass}>Event type</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex gap-3 items-start border border-[rgba(255,255,255,0.12)] p-4 cursor-pointer hover:border-[rgba(255,255,255,0.28)] transition-colors">
            <input type="radio" name="type" value="meetup" checked class="mt-1 accent-[#dc2626]" />
            <span>
              <span class="block text-[#e8e8e8] text-sm font-bold mb-1">Organizing meetup</span>
              <span class="block text-[13px] text-[#737373] leading-[1.5]">
                Title, date, time, city. No address is published. You share the venue inside the Signal group.
              </span>
            </span>
          </label>
          <label class="flex gap-3 items-start border border-[rgba(255,255,255,0.12)] p-4 cursor-pointer hover:border-[rgba(255,255,255,0.28)] transition-colors">
            <input type="radio" name="type" value="public" class="mt-1 accent-[#dc2626]" />
            <span>
              <span class="block text-[#e8e8e8] text-sm font-bold mb-1">Public event</span>
              <span class="block text-[13px] text-[#737373] leading-[1.5]">
                Council meetings and public-facing actions. Address is required and published.
              </span>
            </span>
          </label>
        </div>
        <p class={errorClass} data-error-for="type" id="error-type" hidden></p>
      </fieldset>

      <!--
        Honeypot. Hidden with CSS, never type="hidden" (bots skip hidden inputs).
        autocomplete="one-time-code" keeps browser autofill from populating it and
        locking out a real organizer. tabindex="-1" and aria-hidden="true" keep it
        out of the tab order and the accessibility tree. Design §6.
        The submit function drops any submission where `website` is non-empty, and
        strips the (empty) key before validation.
      -->
      <div class="hp-field" aria-hidden="true">
        <label for="field-website">Website</label>
        <input
          id="field-website"
          name="website"
          type="text"
          autocomplete="one-time-code"
          tabindex="-1"
          aria-hidden="true"
        />
      </div>

      <!-- Title -->
      <div class="mb-6">
        <label for="field-title" class={labelClass}>Title</label>
        <input
          id="field-title"
          name="title"
          type="text"
          required
          maxlength="80"
          autocomplete="off"
          spellcheck="false"
          class={inputClass}
          aria-describedby="hint-title error-title"
        />
        <p id="hint-title" class={hintClass}>
          Up to 80 characters. Plain text, Latin script, no emoji.
        </p>
        <p class={errorClass} data-error-for="title" id="error-title" hidden></p>
      </div>

      <!-- Date + time -->
      <div class="grid gap-6 sm:grid-cols-2 mb-6">
        <div>
          <label for="field-date" class={labelClass}>Date</label>
          <input
            id="field-date"
            name="date"
            type="date"
            required
            class={inputClass}
            aria-describedby="hint-date error-date"
          />
          <p id="hint-date" class={hintClass}>Within the next 12 months.</p>
          <p class={errorClass} data-error-for="date" id="error-date" hidden></p>
        </div>
        <div>
          <label for="field-time" class={labelClass}>Start time</label>
          <input
            id="field-time"
            name="time"
            type="time"
            step="60"
            required
            class={inputClass}
            aria-describedby="hint-time error-time"
          />
          <p id="hint-time" class={hintClass}>24-hour clock. Eastern time.</p>
          <p class={errorClass} data-error-for="time" id="error-time" hidden></p>
        </div>
      </div>

      <!-- Recurrence. The schema (Task 11) accepts recurrence = { freq, until }
           with freq in ('weekly','monthly_nth'); the UI maps monthly ->
           monthly_nth. The `until` field is revealed only when the event repeats
           and its key is omitted from the payload otherwise. -->
      <div class="mb-6">
        <label for="field-repeats" class={labelClass}>Repeats</label>
        <select
          id="field-repeats"
          name="repeats"
          class={inputClass}
          aria-describedby="hint-repeats"
        >
          <option value="none" selected>Does not repeat</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly (same weekday each month)</option>
        </select>
        <p id="hint-repeats" class={hintClass}>
          Leave this on "Does not repeat" for a one-off. Recurring events run up to 6 months out.
        </p>
      </div>

      <div id="recurrence-until-field" class="mb-6" hidden>
        <label for="field-until" class={labelClass}>Repeat until</label>
        <input
          id="field-until"
          name="recurrence.until"
          type="date"
          class={inputClass}
          aria-describedby="hint-until error-until"
        />
        <p id="hint-until" class={hintClass}>
          The last date the event repeats, within 6 months of the start date.
        </p>
        <p class={errorClass} data-error-for="recurrence.until" id="error-until" hidden></p>
      </div>

      <!-- City -->
      <div class="mb-6">
        <label for="field-city" class={labelClass}>City</label>
        <select
          id="field-city"
          name="city"
          required
          class={inputClass}
          aria-describedby="hint-city error-city"
        >
          <option value="" disabled selected>Select a city</option>
          {cityOptions.map((option) => <option value={option.slug}>{option.label}</option>)}
        </select>
        <p id="hint-city" class={hintClass}>
          The county is filled in for you. Not on the list? Email us and we will add it.
        </p>
        <p class={errorClass} data-error-for="city" id="error-city" hidden></p>
      </div>

      <!-- Public-event-only fields -->
      <div id="public-only-fields" hidden>
        <div class="mb-6">
          <label for="field-address" class={labelClass}>Address</label>
          <input
            id="field-address"
            name="address"
            type="text"
            maxlength="120"
            autocomplete="off"
            class={inputClass}
            aria-describedby="hint-address error-address"
          />
          <p id="hint-address" class={hintClass}>
            Published on the calendar and in the map popup. Public venues only.
          </p>
          <p class={errorClass} data-error-for="address" id="error-address" hidden></p>
        </div>

        <div class="mb-6">
          <label for="field-description" class={labelClass}>Description (optional)</label>
          <textarea
            id="field-description"
            name="description"
            rows="4"
            maxlength="300"
            class={inputClass}
            aria-describedby="hint-description error-description"></textarea>
          <p id="hint-description" class={hintClass}>
            Up to 300 characters. It goes live immediately with nobody reading it first.
          </p>
          <p class={errorClass} data-error-for="description" id="error-description" hidden></p>
        </div>
      </div>

      <!-- Signal group link + the §13 setup checklist -->
      <div class="mb-6">
        <label for="field-signal-url" class={labelClass}>Signal group link</label>
        <input
          id="field-signal-url"
          name="signalUrl"
          type="text"
          required
          inputmode="url"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="https://signal.group/#..."
          class={inputClass}
          aria-describedby="hint-signal-url error-signal-url"
        />
        <p id="hint-signal-url" class={hintClass}>
          <span id="signal-url-requirement">Required. Every meetup needs a group.</span>
          The link is never published on the site; visitors reach it through a redirect.
        </p>
        <p class={errorClass} data-error-for="signalUrl" id="error-signal-url" hidden></p>

        <details id="signal-setup" class="mt-3 border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.05)]">
          <summary class="cursor-pointer px-4 py-3 text-[#fbbf24] text-sm font-bold list-none">
            Before you paste that link
          </summary>
          <div id="signal-setup-panel" class="px-4 pb-4 pt-0">
            <p class="text-[#a3a3a3] text-sm mb-3">Four things, once per group.</p>
            <ol class="list-decimal pl-5 space-y-3 text-[#a3a3a3] text-sm leading-[1.6] marker:text-[#fbbf24]">
              <li>
                <strong class="text-[#e8e8e8]">Give it a boring name and leave the description blank.</strong>
                Anyone holding the link can read your group's name, description, and member count without joining.
                "Thursday group" tells them nothing. "Greenville DeflockSC organizers" tells them your chapter exists
                and how many of you there are. The address never goes in the description.
              </li>
              <li>
                <strong class="text-[#e8e8e8]">Set disappearing messages before you invite anyone.</strong>
                Group Settings &#8250; Disappearing Messages. 1 week is a fine default. Do it first, or the early
                messages stay forever.
              </li>
              <li>
                <strong class="text-[#e8e8e8]">Hide your own number.</strong>
                Settings &#8250; Privacy &#8250; Phone Number &#8250; Nobody. Set a username instead. You're about to
                be in a room with strangers.
              </li>
              <li>
                <strong class="text-[#e8e8e8]">Burn the group when the event's over.</strong>
                Have everyone leave, then delete it. Move the people you trust into a separate group. Don't reuse an
                event group for anything else, and only keep one alive if the event actually recurs.
              </li>
            </ol>
          </div>
        </details>
      </div>

      <!-- Organizer code -->
      <div class="mb-8">
        <label for="field-organizer-code" class={labelClass}>Organizer code</label>
        <input
          id="field-organizer-code"
          name="organizerCode"
          type="text"
          required
          maxlength="128"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          placeholder="drum yoga vivid clay"
          class={inputClass}
          aria-describedby="hint-organizer-code error-organizer-code"
        />
        <p id="hint-organizer-code" class={hintClass}>
          The four words you were given. Capitals, spaces, and hyphens do not matter.
        </p>
        <p class={errorClass} data-error-for="organizerCode" id="error-organizer-code" hidden></p>
      </div>

      <button
        type="submit"
        id="submit-button"
        class="bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-[0.08em] px-8 py-3.5 transition-colors"
      >
        Publish event
      </button>

      <noscript>
        <p class="text-[#fca5a5] text-sm mt-4">
          This form needs JavaScript to submit. Email us instead and we will post it for you.
        </p>
      </noscript>
    </form>

    <!-- Success -->
    <div id="success-panel" tabindex="-1" hidden class="border-l-2 border-[#16a34a] bg-[rgba(22,163,74,0.06)] px-5 py-5">
      <p class="font-['DM_Mono',monospace] text-[10px] uppercase tracking-[0.16em] text-[#4ade80] mb-2">Published</p>
      <h2 class="text-[#e8e8e8] text-xl font-bold mb-2">Your event is live.</h2>
      <p class="text-[#a3a3a3] text-sm mb-4">
        This is its permanent link. Save it now: the id is not something we can look up for you later.
      </p>
      <div class="flex gap-2 mb-3">
        <input
          id="permalink-input"
          type="text"
          readonly
          value=""
          aria-label="Event permalink"
          class="flex-1 bg-[#111111] border border-[rgba(255,255,255,0.12)] text-[#e8e8e8] px-3 py-2.5 text-sm font-['DM_Mono',monospace] focus:outline-none focus-visible:outline-none focus:border-[#d4d4d4] focus:ring-2 focus:ring-[#d4d4d4]"
        />
        <button
          type="button"
          id="copy-permalink"
          class="bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] text-[#e8e8e8] font-bold text-xs uppercase tracking-[0.08em] px-5 py-2.5 transition-colors min-w-[7rem]"
        >
          Copy
        </button>
      </div>
      <p class="text-sm">
        <a id="success-link" href="/events" class="text-[#fbbf24] hover:text-[#fcd34d] underline">/events</a>
        <span class="text-[#737373]"> &middot; </span>
        <a href="/events/submit" class="text-[#fbbf24] hover:text-[#fcd34d] underline">Submit another</a>
      </p>
    </div>
  </div>

  <style>
    /* Astro scopes these, so they apply only inside this component. */

    /* Explicit, so a utility class can never win over a `hidden` toggle. */
    [hidden] {
      display: none !important;
    }

    /* Honeypot: hidden with CSS, off-screen and non-interactive, but a real
       text input in the DOM so a naive bot fills it. */
    .hp-field {
      position: absolute;
      left: -9999px;
      top: 0;
      width: 1px;
      height: 1px;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
    }

    #signal-setup summary::-webkit-details-marker {
      display: none;
    }

    #signal-setup summary::after {
      content: ' +';
    }

    #signal-setup[open] summary::after {
      content: ' \2212';
    }
  </style>

  <script>
    const form = document.getElementById('submit-event-form') as HTMLFormElement;
    const publicOnly = document.getElementById('public-only-fields') as HTMLElement;
    const addressInput = document.getElementById('field-address') as HTMLInputElement;
    const descriptionInput = document.getElementById('field-description') as HTMLTextAreaElement;
    const signalInput = document.getElementById('field-signal-url') as HTMLInputElement;
    const signalRequirement = document.getElementById('signal-url-requirement') as HTMLElement;
    const dateInput = document.getElementById('field-date') as HTMLInputElement;
    const repeatsSelect = document.getElementById('field-repeats') as HTMLSelectElement;
    const untilField = document.getElementById('recurrence-until-field') as HTMLElement;
    const untilInput = document.getElementById('field-until') as HTMLInputElement;
    const honeypot = document.getElementById('field-website') as HTMLInputElement;
    const statusEl = document.getElementById('submit-status') as HTMLElement;
    const errorSummary = document.getElementById('error-summary') as HTMLElement;
    const submitButton = document.getElementById('submit-button') as HTMLButtonElement;
    const successPanel = document.getElementById('success-panel') as HTMLElement;
    const successLink = document.getElementById('success-link') as HTMLAnchorElement;
    const permalinkInput = document.getElementById('permalink-input') as HTMLInputElement;
    const copyButton = document.getElementById('copy-permalink') as HTMLButtonElement;

    // Allowlist of field names the server may point an error at. Any other value
    // in the response is ignored, so a response body can never drive a selector.
    const FIELD_NAMES = [
      'type',
      'title',
      'description',
      'date',
      'time',
      'city',
      'address',
      'signalUrl',
      'recurrence.until',
      'organizerCode',
    ];

    const FIELD_ERROR_MESSAGES: Record<string, string> = {
      required: 'This is required.',
      too_long: 'Too long. Shorten it and try again.',
      too_short: 'Too short.',
      invalid_format: 'That format is not accepted.',
      not_allowed: 'This field is not accepted for this event type.',
      past_date: 'Pick a date in the future.',
      too_far_out: 'Pick a date within the next 12 months.',
      unknown_city: 'Pick a city from the list.',
      derived_field: 'The server fills this in. Do not submit it.',
      invalid_url: 'Must be a https://signal.group/#... invite link.',
      disallowed_characters: 'Remove unusual characters and try again.',
      until_not_after_date: 'The repeat-until date must be after the start date.',
      until_too_far_out: 'Recurring events can run at most 6 months out.',
    };

    const TOP_LEVEL_MESSAGES: Record<string, string> = {
      invalid: 'Some fields need fixing. See the notes below.',
      invalid_code: 'That organizer code is not valid.',
      revoked_code: 'That organizer code is not valid.',
      rate_limited: 'Too many submissions from your network today. Try again tomorrow.',
      duplicate: 'An event with these details has already been submitted.',
      body_too_large: 'That submission is too large. Shorten the description and try again.',
      context_refused: 'Submissions are turned off on this deploy.',
      server_error: 'Something broke on our end. Try again in a minute.',
    };

    function isoDate(value: Date): string {
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${value.getFullYear()}-${month}-${day}`;
    }

    // Set at load, never baked, so a stale build cannot ship a stale bound.
    const today = new Date();
    dateInput.min = isoDate(today);
    dateInput.max = isoDate(new Date(today.getFullYear(), today.getMonth() + 12, today.getDate()));

    function currentType(): string {
      const checked = form.querySelector('input[name="type"]:checked') as HTMLInputElement | null;
      return checked ? checked.value : 'meetup';
    }

    function applyType(): void {
      const isPublic = currentType() === 'public';
      publicOnly.hidden = !isPublic;
      addressInput.required = isPublic;
      // Disabled keeps hidden fields out of native validation and out of focus order.
      addressInput.disabled = !isPublic;
      descriptionInput.disabled = !isPublic;
      signalInput.required = !isPublic;
      signalRequirement.textContent = isPublic
        ? 'Optional for public events.'
        : 'Required. Every meetup needs a group.';
    }

    // Keep the `until` bounds pinned to the start date: strictly after it, and no
    // more than 6 months out. Client-side hint only; the server is authoritative.
    function syncUntilBounds(): void {
      const start = dateInput.value;
      if (!start) {
        untilInput.removeAttribute('min');
        untilInput.removeAttribute('max');
        return;
      }
      const parts = start.split('-').map(Number);
      const y = parts[0];
      const m = parts[1];
      const d = parts[2];
      untilInput.min = isoDate(new Date(y, m - 1, d + 1));
      untilInput.max = isoDate(new Date(y, m - 1 + 6, d));
    }

    function applyRepeats(): void {
      const recurring = repeatsSelect.value !== 'none';
      untilField.hidden = !recurring;
      untilInput.required = recurring;
      // Disabled keeps the hidden `until` out of native validation and focus order.
      untilInput.disabled = !recurring;
      if (recurring) syncUntilBounds();
    }

    form.querySelectorAll('input[name="type"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        clearErrors();
        applyType();
      });
    });
    applyType();

    repeatsSelect.addEventListener('change', () => {
      clearErrors();
      applyRepeats();
    });
    dateInput.addEventListener('change', syncUntilBounds);
    applyRepeats();

    function fieldValue(id: string): string {
      const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
      return el ? el.value.trim() : '';
    }

    // Build the recurrence object the schema accepts, or null when the event does
    // not repeat. The UI's "monthly" maps to the schema's `monthly_nth`.
    function buildRecurrence(): { freq: 'weekly' | 'monthly_nth'; until: string } | null {
      const repeats = repeatsSelect.value;
      if (repeats === 'none') return null;
      const until = untilInput.value.trim();
      if (!until) return null;
      return { freq: repeats === 'monthly' ? 'monthly_nth' : 'weekly', until };
    }

    function clearErrors(): void {
      form.querySelectorAll('[data-error-for]').forEach((el) => {
        const node = el as HTMLElement;
        node.textContent = '';
        node.hidden = true;
      });
      form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
      errorSummary.textContent = '';
      errorSummary.hidden = true;
    }

    function showFormError(message: string): void {
      // textContent only. Nothing from a response body is ever parsed as HTML.
      errorSummary.textContent = message;
      errorSummary.hidden = false;
      statusEl.textContent = message;
      errorSummary.focus();
    }

    function setBusy(busy: boolean): void {
      submitButton.disabled = busy;
      submitButton.textContent = busy ? 'Publishing...' : 'Publish event';
      if (busy) statusEl.textContent = 'Publishing your event.';
    }

    function showFailure(status: number, body: any): void {
      const code = body && typeof body.code === 'string' ? body.code : 'server_error';
      const errors = body && Array.isArray(body.errors) ? body.errors : [];
      let placed = 0;

      for (const item of errors) {
        if (!item || typeof item.field !== 'string') continue;
        if (FIELD_NAMES.indexOf(item.field) === -1) continue;
        const target = form.querySelector(`[data-error-for="${item.field}"]`) as HTMLElement | null;
        if (!target) continue;
        target.textContent = FIELD_ERROR_MESSAGES[item.code] || 'That value is not accepted.';
        target.hidden = false;
        const input = form.querySelector(`[name="${item.field}"]`);
        if (input) input.setAttribute('aria-invalid', 'true');
        placed += 1;
      }

      const heading = TOP_LEVEL_MESSAGES[code] || TOP_LEVEL_MESSAGES.server_error;
      showFormError(placed > 0 ? heading : `${heading} (HTTP ${status})`);
    }

    function showSuccess(id: string): void {
      form.hidden = true;
      errorSummary.hidden = true;
      permalinkInput.value = `${window.location.origin}/events#${id}`;
      successLink.href = `/events#${id}`;
      successLink.textContent = `/events#${id}`;
      successPanel.hidden = false;
      statusEl.textContent = 'Event published. Copy your permalink.';
      successPanel.focus();
    }

    copyButton.addEventListener('click', async () => {
      permalinkInput.select();
      try {
        await navigator.clipboard.writeText(permalinkInput.value);
        copyButton.textContent = 'Copied';
      } catch {
        copyButton.textContent = 'Press Ctrl+C';
      }
      window.setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 3000);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const type = currentType();
      const isPublic = type === 'public';

      // Build the payload by OMITTING inapplicable keys rather than sending null.
      // The server schema is .strict(): an `address` or `description` key on a
      // meetup is itself the error, and an optional field counts as "not
      // provided" only when its key is absent, never when it is null (design §6).
      const payload: Record<string, unknown> = {
        type,
        title: fieldValue('field-title'),
        date: fieldValue('field-date'),
        time: fieldValue('field-time'),
        city: fieldValue('field-city'),
        organizerCode: fieldValue('field-organizer-code'),
        // Honeypot. The function reads and drops this before validation, so it is
        // always sent (empty for a human) and never omitted.
        website: honeypot.value,
      };

      if (isPublic) {
        // Address is required for a public event; description is optional and its
        // key is added only when the organizer actually filled it.
        payload.address = fieldValue('field-address');
        const description = fieldValue('field-description');
        if (description) payload.description = description;
      }

      // Signal link: required for a meetup, optional for a public event. The key
      // is omitted entirely when empty.
      const signalUrl = fieldValue('field-signal-url');
      if (signalUrl) payload.signalUrl = signalUrl;

      // Recurrence: the key is present only when the event repeats.
      const recurrence = buildRecurrence();
      if (recurrence) payload.recurrence = recurrence;

      setBusy(true);

      let response: Response;
      let body: any = null;
      try {
        response = await fetch('/api/submit-event', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        body = await response.json().catch(() => null);
      } catch {
        setBusy(false);
        showFormError('Could not reach the server. Check your connection and try again.');
        return;
      }

      setBusy(false);

      if (response.ok && body && body.ok === true && typeof body.id === 'string') {
        showSuccess(body.id);
        return;
      }

      showFailure(response.status, body);
    });
  </script>
  ```

  Note for the implementer: the §13 checklist copy is **frozen and reproduced verbatim** from the design. `&#8250;` is U+203A, the character the design uses for Signal's menu paths. Do not run that block through a copy rewrite. The surrounding page and field copy (hints, buttons, success panel, the recurrence labels) is placeholder-grade and still owes the copydesk gate the design defers to implementation.

- [ ] **Step 7: Create the page**

  Create `src/pages/events/submit.astro` — complete file:

  ```astro
  ---
  import Base from '../../layouts/Base.astro';
  import SubmitEventForm from '../../components/SubmitEventForm.astro';
  ---

  <Base
    title="Submit an Event — DeflockSC"
    description="Vetted organizers post a meetup or public event to the South Carolina calendar."
  >
    <meta slot="head" name="robots" content="noindex, nofollow" />

    <section class="bg-[#111111] pt-28 pb-10 relative overflow-hidden">
      <div
        class="absolute left-4 -top-2 font-bold leading-none text-[rgba(255,255,255,0.025)] pointer-events-none select-none"
        style="font-size: clamp(5rem, 10vw, 9rem)"
        aria-hidden="true"
      >
        SUBMIT
      </div>
      <div class="max-w-4xl mx-auto px-6 relative z-10">
        <p class="label-mono-heading mb-3">Organizers only</p>
        <h1 class="text-[#e8e8e8] font-bold text-3xl md:text-5xl tracking-[-0.02em] mb-4">
          Post an event.
        </h1>
        <p class="text-[#a0a0a0] text-lg max-w-2xl">
          You need an organizer code. Submissions publish immediately with nobody reviewing them
          first, so read what you wrote before you hit publish.
        </p>
      </div>
    </section>

    <section class="bg-[#111111] pb-24">
      <div class="max-w-4xl mx-auto px-6">
        <SubmitEventForm />
      </div>
    </section>
  </Base>
  ```

- [ ] **Step 8: Keep the page out of the sitemap**

  The page carries `robots: noindex`; the sitemap must agree or the two signals contradict each other.

  In `astro.config.mjs`, replace:

  ```js
    integrations: [sitemap()],
  ```

  with:

  ```js
    integrations: [
      sitemap({
        // The submit form is organizer-code gated and sends robots noindex.
        // Keep it out of the sitemap so the two signals agree.
        filter: (page) => !page.includes('/events/submit'),
      }),
    ],
  ```

  Leave `public/robots.txt` alone: a `Disallow` there would stop crawlers from ever reading the `noindex`.

  Out of scope here, tracked by design §14: excluding `/events/*` from the Umami beacon in `Base.astro`. That edit touches every page and belongs with the adjacent-fixes task.

- [ ] **Step 9: Manual verification — field reveal**

  `.astro` components are not unit-testable here, so this and Steps 10–12 are the verification.

  Start the dev server (`npx` does not resolve reliably on this machine, so call the module directly):

  ```
  node node_modules/astro/astro.js dev --host 127.0.0.1
  ```

  Open `http://127.0.0.1:4321/events/submit`. In the browser console:

  ```js
  [...document.querySelectorAll('#submit-event-form [name]')]
    .filter(el => el.checkVisibility({opacityProperty: true, visibilityProperty: true}) && el.type !== 'radio')
    .map(el => el.name)
  ```

  Expected, with "Organizing meetup" selected (the default) and "Does not repeat" — the `until` field is hidden, so it does not appear:

  ```
  ['title', 'date', 'time', 'repeats', 'city', 'signalUrl', 'organizerCode']
  ```

  Click the "Public event" radio, re-run the same snippet. Expected:

  ```
  ['title', 'date', 'time', 'repeats', 'city', 'address', 'description', 'signalUrl', 'organizerCode']
  ```

  Then confirm the required flags flipped:

  ```js
  [document.getElementById('field-address').required, document.getElementById('field-signal-url').required]
  ```

  Expected with "Public event" selected: `[true, false]`. Switch back to "Organizing meetup" and re-run: `[false, true]`.

  Now the recurrence reveal. The `until` field is hidden until "Repeats" leaves "none":

  ```js
  const rp = document.getElementById('field-repeats');
  const before = document.getElementById('recurrence-until-field').hidden;
  rp.value = 'weekly';
  rp.dispatchEvent(new Event('change'));
  [before, document.getElementById('recurrence-until-field').hidden, document.getElementById('field-until').required]
  ```

  Expected: `[true, false, true]`. Set it back to `none` and re-dispatch; the field hides and `field-until` is no longer required.

- [ ] **Step 10: Manual verification — honeypot and the Signal checklist**

  Still on `/events/submit`, in the console:

  ```js
  const hp = document.getElementById('field-website');
  [hp.type, hp.getAttribute('autocomplete'), hp.getAttribute('tabindex'), hp.getAttribute('aria-hidden'),
   hp.parentElement.getAttribute('aria-hidden'), getComputedStyle(hp.parentElement).position,
   hp.checkVisibility({opacityProperty: true, visibilityProperty: true}),
   document.querySelectorAll('#submit-event-form input[type=hidden]').length]
  ```

  Expected exactly:

  ```
  ['text', 'one-time-code', '-1', 'true', 'true', 'absolute', false, 0]
  ```

  Then click "Before you paste that link" to expand the checklist and verify item 2 is verbatim:

  ```js
  document.querySelectorAll('#signal-setup-panel li')[1].textContent.replace(/\s+/g, ' ').trim()
  ```

  Expected exactly:

  ```
  Set disappearing messages before you invite anyone. Group Settings › Disappearing Messages. 1 week is a fine default. Do it first, or the early messages stay forever.
  ```

  Also confirm the checklist has four items:

  ```js
  document.querySelectorAll('#signal-setup-panel li').length
  ```

  Expected: `4`.

  Keyboard check, by hand: focus the City select and press Tab. Focus must land on the "Before you paste that link" summary, then the Signal link input. It must never land in the honeypot.

- [ ] **Step 11: Manual verification — success panel and error panel**

  The submit function does not exist yet, so stub `fetch` in the console before submitting.

  **Success path (and payload omission).** Paste this capturing stub, then fill in a title, a future date, a time, a city, `https://signal.group/#CjQKIExAMPLEexampleEXAMPLE`, and any organizer code, leave "Repeats" on "Does not repeat", and click "Publish event":

  ```js
  window.__sent = null;
  window.fetch = async (_url, opts) => {
    window.__sent = JSON.parse(opts.body);
    return new Response(
      JSON.stringify({ ok: true, id: 'k7m29qxb' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
  ```

  Expected: the form disappears; a green-bordered panel reads "Your event is live."; the readonly input holds `http://127.0.0.1:4321/events#k7m29qxb`; the link below reads `/events#k7m29qxb`. Click "Copy" — the button text changes to `Copied` and reverts to `Copy` after ~3 seconds. Confirm the clipboard:

  ```js
  await navigator.clipboard.readText()
  ```

  Expected: `'http://127.0.0.1:4321/events#k7m29qxb'`.

  Then confirm the meetup payload OMITTED the inapplicable keys rather than sending null (design §6, contract #5):

  ```js
  [('address' in window.__sent), ('description' in window.__sent), ('recurrence' in window.__sent),
   window.__sent.signalUrl, window.__sent.website]
  ```

  Expected: `[false, false, false, 'https://signal.group/#CjQKIExAMPLEexampleEXAMPLE', '']`.

  **Field-error path.** Reload the page, then paste and submit again:

  ```js
  window.fetch = async () => new Response(
    JSON.stringify({ ok: false, code: 'invalid', errors: [{ field: 'title', code: 'too_long' }] }),
    { status: 400, headers: { 'content-type': 'application/json' } }
  );
  ```

  Expected: red text under Title reading `Too long. Shorten it and try again.`, the summary at the top reading `Some fields need fixing. See the notes below.`, and:

  ```js
  document.getElementById('field-title').getAttribute('aria-invalid')
  ```

  Expected: `'true'`.

  **Invalid-code path.** Reload, paste and submit:

  ```js
  window.fetch = async () => new Response(
    JSON.stringify({ ok: false, code: 'invalid_code' }),
    { status: 403, headers: { 'content-type': 'application/json' } }
  );
  ```

  Expected summary text: `That organizer code is not valid. (HTTP 403)`.

  **Real network path.** Reload once more (restoring the real `fetch`) and submit without stubbing. The dev server has no `/api/submit-event`, so expected summary text is:

  ```
  Something broke on our end. Try again in a minute. (HTTP 404)
  ```

  Stop the dev server with Ctrl+C.

- [ ] **Step 12: Build verification**

  ```
  npm run build
  ```

  Expected: build completes with exit code 0 and the output lists `▶ /events/submit/`.

  Confirm the page is out of the sitemap:

  ```
  grep -o "events/submit" dist/sitemap-0.xml | wc -l
  ```

  Expected output: `0`.

  Confirm the noindex tag shipped:

  ```
  grep -c 'name="robots" content="noindex, nofollow"' dist/events/submit/index.html
  ```

  Expected output: `1`.

  And re-run the unit suite, which must still be green:

  ```
  npm test
  ```

- [ ] **Step 13: Commit**

  ```
  git add src/components/SubmitEventForm.astro src/pages/events/submit.astro astro.config.mjs
  git commit -m "feat(events): add organizer submit form page

  Six fields for a meetup, address and description revealed for public events.
  Recurrence control (none/weekly/monthly plus an until date) builds the
  { freq, until } object the schema accepts, or omits it entirely.
  Inapplicable fields are omitted from the payload, never sent as null.
  CSS-hidden honeypot with autocomplete=one-time-code, tabindex=-1, aria-hidden.
  Signal setup checklist from design section 13 at the Signal-link field.
  Success state shows the /events#<id> permalink with a copy button.
  Page is noindex and filtered out of the sitemap."
  ```

---

---

---

### Task 22: Analytics exclusion

Design §14 requires excluding `/events/*` from the Umami beacon: "a record of interest in a specific event is exactly what a subpoena would want." Proxying the beacon through `deflocksc.org` (the `/u/*` rewrites in `netlify.toml`) hides it from ad blockers, not from Umami — so not loading the script on `/events` at all is the only real control.

**Mechanism chosen: gate the `<script>` tag on `Astro.url.pathname` in `Base.astro`.** Umami's data attributes are the wrong tool here. `data-domains` filters by hostname, not path; `data-auto-track="false"` and `data-do-not-track` still download and execute the script, which means the visitor's browser still makes a request that Netlify proxies and Umami Cloud terminates. Only omitting the tag prevents a request from existing. It is also the only variant a build-output guard can assert on.

**Files:**
- `src/layouts/Base.astro` — modify
- `tests/config-guards.test.ts` — create

**Depends on:** the task that creates `src/pages/events/index.astro`. The guard test asserts against `dist/events/index.html`, so it will fail with an explicit "does not exist" message if run before that page exists. Sequence this task after it.

**Not touched:** `netlify.toml` and `public/_headers`. The `/u/script.js` and `/u/api/send` rewrites stay exactly as they are (every other page still needs them), and CSP is unchanged. Since neither file changes, this task does not trigger the mandatory action-modal smoke test.

---

- [ ] **Step 1: Gate the Umami script tag on the events path in `Base.astro`**

  The current frontmatter ends at lines 15–18 of `src/layouts/Base.astro`:

  ```astro
  const { title = "DeflockSC — License Plate Surveillance in South Carolina", description = "Over 240 ALPR cameras track drivers across South Carolina with no public vote and no oversight. See the map, find your reps, and fight back.", ogImage = "/og-image.png", ogType = "website", publishedDate } = Astro.props;
  const siteOrigin = Astro.site ?? new URL("https://deflocksc.org");
  const canonicalURL = new URL(Astro.url.pathname, siteOrigin);
  const ogImageURL = new URL(ogImage, siteOrigin).href;
  ```

  Add one derived constant directly below `ogImageURL`, leaving the four existing lines untouched:

  ```astro
  const ogImageURL = new URL(ogImage, siteOrigin).href;

  // Analytics exclusion (design §14): the events calendar carries no beacon.
  // Proxying through our own domain hides the beacon from ad blockers, not from
  // Umami — a record of who looked at a specific event is exactly what a
  // subpoena would want, so the script is never emitted on these pages.
  // Astro builds in directory format, so pathname is "/events/" for the index
  // and "/events/<anything>/" for any future child route.
  const analyticsExcluded =
    Astro.url.pathname === '/events' || Astro.url.pathname.startsWith('/events/');
  ```

  Then wrap the beacon. Current markup, lines 60–61 verbatim:

  ```astro
      {/* Umami Cloud Analytics – proxied through our domain to avoid ad-blocker blocklists */}
      <script defer src="/u/script.js" data-website-id="c0ff812f-a062-43e1-8ac1-e5eafd527ffc" />
  ```

  Replace those two lines with:

  ```astro
      {/* Umami Cloud Analytics – proxied through our domain to avoid ad-blocker blocklists.
          Suppressed on /events/* per design §14. */}
      {!analyticsExcluded && (
        <script defer src="/u/script.js" data-website-id="c0ff812f-a062-43e1-8ac1-e5eafd527ffc" />
      )}
  ```

  Do not touch anything else in the file. In particular, leave the inline reveal-observer `<script>` in the body alone.

  No runtime fallout on `/events`: every `umami.track()` call site in the repo is already guarded by `typeof umami !== 'undefined'` (`src/scripts/action-modal/modal-controller.ts:51`, `src/scripts/action-modal/results-renderer.ts:14,20`, `src/scripts/camera-map.ts:173`, `src/components/MapSection.astro:390`), and `src/umami.d.ts` already documents the global as conditionally loaded.

  If Step 3's homepage assertion fails — meaning Astro stopped emitting the tag verbatim once it sat inside an expression — add `is:inline` to the tag (`<script is:inline defer src="/u/script.js" ...>`) and re-run. Do not reach for `is:inline` preemptively; the tag renders verbatim today without it.

- [ ] **Step 2: Write the build-output guard**

  Create `tests/config-guards.test.ts`. This asserts against real `dist/` output, not source text — a source grep would pass even if Astro hoisted the script back into every page.

  ```ts
  import { describe, it, expect, beforeAll } from 'vitest';
  import { execFileSync } from 'node:child_process';
  import { existsSync, readFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import path from 'node:path';

  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const distDir = path.join(repoRoot, 'dist');

  // Substrings that identify the Umami beacon in built HTML. The tag renders as:
  //   <script defer src="/u/script.js" data-website-id="c0ff812f-..."></script>
  const UMAMI_SRC = '/u/script.js';
  const UMAMI_ATTR = 'data-website-id';

  function readBuilt(relPath: string): string {
    const full = path.join(distDir, relPath);
    if (!existsSync(full)) {
      throw new Error(
        `Expected build output at dist/${relPath}, but it does not exist. ` +
          `If /events has not been implemented yet, this guard cannot run.`
      );
    }
    return readFileSync(full, 'utf8');
  }

  beforeAll(() => {
    // Invoke Astro directly rather than `npm run build`: that would fire the
    // prebuild open-civics sync, which hits the network. Calling the module
    // through process.execPath avoids npx/npm PATH resolution on Windows.
    execFileSync(
      process.execPath,
      [path.join('node_modules', 'astro', 'astro.js'), 'build'],
      { cwd: repoRoot, stdio: 'ignore' }
    );
  }, 300_000);

  describe('Umami beacon exclusion (design §14)', () => {
    it('omits the Umami script from the built /events page', () => {
      const html = readBuilt('events/index.html');
      expect(html).not.toContain(UMAMI_SRC);
      expect(html).not.toContain(UMAMI_ATTR);
    });

    it('keeps the Umami script on the built homepage', () => {
      const html = readBuilt('index.html');
      expect(html).toContain(UMAMI_SRC);
      expect(html).toContain(UMAMI_ATTR);
    });

    it('keeps the Umami script on an interior page outside /events', () => {
      const html = readBuilt('toolkit/index.html');
      expect(html).toContain(UMAMI_SRC);
      expect(html).toContain(UMAMI_ATTR);
    });
  });
  ```

  No config change is needed: `vitest.config.ts` sets only `environment: 'node'`, so the default `include` pattern (`**/*.{test,spec}.?(c|m)[jt]s?(x)`, minus `node_modules`) already picks up `tests/`.

  Accepted cost: this file makes `npm test` run a full production build. Measured at roughly 35s wall on this machine (Astro itself reports ~10s; the rest is startup). That is the price of asserting against real output instead of source.

- [ ] **Step 3: Verify**

  Run the guard alone first:

  ```
  npx vitest run tests/config-guards.test.ts
  ```

  All three tests must pass. Then run the whole suite to confirm nothing else regressed:

  ```
  npm test
  ```

  `src/lib/geo-utils.test.ts`, `src/lib/blog-utils.test.ts`, and `src/lib/district-matcher.test.ts` must still pass.

  Manual verification against the built output (Git Bash, from the repo root, after the build the test already ran — or run `node node_modules/astro/astro.js build` first):

  ```
  grep -c 'u/script.js' dist/index.html dist/events/index.html
  ```

  Exact expected output:

  ```
  dist/index.html:1
  dist/events/index.html:0
  ```

  (`grep` exits 1 because one file had no match; that is expected and not a failure.)

- [ ] **Step 4: Commit**

  ```
  git add src/layouts/Base.astro tests/config-guards.test.ts
  git commit -m "feat(events): exclude /events/* from the Umami beacon

  Gate the Umami script tag on Astro.url.pathname in Base.astro so no
  analytics beacon is emitted on /events or any child route. Umami's data
  attributes are not sufficient: data-domains filters by hostname, and
  data-auto-track=false still loads and executes the script. Omitting the
  tag is the only variant that prevents the request from existing.

  Proxying the beacon through our own domain hides it from ad blockers,
  not from Umami, so exclusion is the only real control (design section 14).

  Add tests/config-guards.test.ts, which builds the site and asserts against
  dist/ output that /events carries no beacon while the homepage and
  /toolkit still do."
  ```

---

---

---

### Task 23: CSP, caching and config

**Files:**
- Modify: `tests/config-guards.test.ts` — append the config-content guards below the Umami guard the analytics-exclusion task created; do NOT recreate the file
- Modify: `public/_headers`
- Modify: `netlify.toml`
- Modify: `astro.config.mjs` — merge the dev proxies in beside the `sitemap({ filter })` the submit-form task added; do not drop that filter
- Verify only, no edit expected: `lighthouserc.json` — the events-page task already added `/events`
- Verify only, no edit expected: `.gitignore`

**Sequencing:** this task appends to `tests/config-guards.test.ts` (created by the analytics-exclusion task), merges into `astro.config.mjs` (already carrying the submit-form task's sitemap filter), and reads the `/events` entry the events-page task added to `lighthouserc.json`. Run it only after all three have landed on the branch, and after the `/events` page exists (LHCI hard-fails if `dist/events/` is missing). Confirm before starting:

```bash
cd /c/Users/tim/workspace/deflocksc-website && ls src/pages/events.astro tests/config-guards.test.ts
```

Expected: both paths listed. If `src/pages/events.astro` is missing, run the page task first. If `tests/config-guards.test.ts` is missing, the analytics-exclusion task has not landed; run it first, because this task appends to the file it creates.

---

- [ ] **Step 1: Append the failing config-guard checks**

  These are configuration files, not modules, so the test asserts on their contents. It is the regression guard that stops a future edit from silently dropping a CSP directive or attaching `Cache-Control` to `/api/*`.

  Do **not** recreate `tests/config-guards.test.ts`: the analytics-exclusion task already created it with the Umami-beacon guard (which builds the site and reads `dist/`). Append the block below **after** that file's existing `describe('Umami beacon exclusion (design §14)', ...)` block. The file already imports `readFileSync` and vitest's `describe`/`it`/`expect`, so add no new imports — just the parser, the const reads, and the three describes:

  ```ts
  // --- Config-content guards (CSP, caching, lighthouse, gitignore) ---
  // These read the config files directly rather than dist/, so unlike the Umami
  // guard above they do not depend on the build. They share the file only so all
  // config regressions live in one place.

  // tests/ sits one directory below the repo root
  const rootUrl = new URL('../', import.meta.url);
  const read = (relativePath: string): string =>
    readFileSync(new URL(relativePath, rootUrl), 'utf8');

  /**
   * Parse a Netlify `_headers` file into { pathPattern: [headerLine, ...] }.
   * Unindented non-comment lines are path patterns; indented lines are header values.
   */
  function parseHeadersFile(text: string): Record<string, string[]> {
    const blocks: Record<string, string[]> = {};
    let current: string | null = null;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      if (!/^\s/.test(line)) {
        current = trimmed;
        blocks[current] = [];
      } else if (current !== null) {
        blocks[current].push(trimmed);
      }
    }
    return blocks;
  }

  const headerBlocks = parseHeadersFile(read('public/_headers'));
  const cspLine =
    (headerBlocks['/*'] ?? []).find((l) => /^content-security-policy:/i.test(l)) ?? '';

  const netlifyToml = read('netlify.toml');
  const tomlHeaderPaths = [...netlifyToml.matchAll(/^\s*for\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);

  describe('public/_headers', () => {
    it('declares exactly one header block, for /*', () => {
      expect(Object.keys(headerBlocks)).toEqual(['/*']);
    });

    it('adds base-uri, form-action and object-src to the CSP', () => {
      for (const directive of ["base-uri 'none'", "form-action 'self'", "object-src 'none'"]) {
        expect(cspLine).toContain(directive);
        // exactly once: a duplicated directive is a merge artifact, and the
        // browser honours the most restrictive occurrence, hiding the mistake
        expect(cspLine.split(directive).length - 1).toBe(1);
      }
    });

    it('sets no Cache-Control on the /* rule', () => {
      const cacheLines = (headerBlocks['/*'] ?? []).filter((l) => /^cache-control:/i.test(l));
      expect(cacheLines).toEqual([]);
    });

    it('sets no header rule on /api/*', () => {
      expect(Object.keys(headerBlocks).filter((p) => p.startsWith('/api'))).toEqual([]);
    });
  });

  describe('netlify.toml', () => {
    it('marks /_astro/* immutable for a year', () => {
      expect(tomlHeaderPaths).toEqual(['/*', '/_astro/*']);
      expect(netlifyToml).toContain('Cache-Control = "public, max-age=31536000, immutable"');
    });

    it('declares no header rule on /api/*', () => {
      expect(tomlHeaderPaths.filter((p) => p.startsWith('/api'))).toEqual([]);
    });

    it('does not redefine the CSP (public/_headers is the only definition)', () => {
      // netlify.toml wins on a same-path same-header conflict, so a stale copy here
      // would silently override the real policy
      expect(netlifyToml).not.toMatch(/^\s*Content-Security-Policy\s*=/im);
    });
  });

  describe('repo config', () => {
    it('audits /events in lighthouserc.json', () => {
      const lhci = JSON.parse(read('lighthouserc.json'));
      // The events-page task added this entry; this guard only stops a later edit
      // from dropping it. This task does not modify lighthouserc.json.
      expect(lhci.ci.collect.url).toContain('/events');
    });

    it('gitignores .env', () => {
      const lines = read('.gitignore').split(/\r?\n/).map((l) => l.trim());
      expect(lines).toContain('.env');
    });
  });
  ```

- [ ] **Step 2: Run the test and watch it fail**

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && npx vitest run tests/config-guards.test.ts
  ```

  The file now holds the analytics-exclusion task's three Umami guards (which build the site and pass) plus the nine config-content guards appended above, so the run is twelve tests. Expected: **2 failed, 10 passed** — the summary line reads `Tests  2 failed | 10 passed (12)`. The two failures, in order:

  1. `public/_headers > adds base-uri, form-action and object-src to the CSP`
     ```
     AssertionError: expected 'default-src 'self'; script-src 'self' 'un…' to contain 'base-uri 'none''
     ```
     (the left-hand value is the full current CSP string, truncated by vitest's diff printer)
  2. `netlify.toml > marks /_astro/* immutable for a year`
     ```
     AssertionError: expected [ '/*' ] to deeply equal [ '/*', '/_astro/*' ]
     ```

  The lighthouse audit is **not** among the failures: the events-page task already added `/events` to `lighthouserc.json`, so `repo config > audits /events in lighthouserc.json` passes from the start — this task cannot expect that failure. If any *other* test fails, stop — the repo is not in the state this task assumes. (If the Umami guards fail, the analytics-exclusion task has not fully landed; sort that before continuing, since this task shares its file.)

- [ ] **Step 3: Add the three CSP directives to `public/_headers`**

  The CSP is defined in exactly one place in the repo: `public/_headers` line 6. That line currently reads, verbatim (single logical line, no wrapping in the file):

  ```
    Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://scstatehouse.gov https://*.scstatehouse.gov https://scdailygazette.com https://cms.deflock.me https://upload.wikimedia.org; connect-src 'self' https://cms.deflock.me https://tiles.openfreemap.org https://*.openfreemap.org https://cloud.umami.is https://api-gateway.umami.dev; frame-src 'self'; worker-src blob:; frame-ancestors 'none'
  ```

  Append `; base-uri 'none'; form-action 'self'; object-src 'none'` to the end of that line. Do not reorder or otherwise touch the existing directives — `connect-src 'self'` already covers the same-origin POST to `/api/submit-event`, so nothing needs widening for this feature.

  Replace the whole file with exactly this content (2 comment lines added at the top, line 6 extended):

  ```
  # This file is the ONLY definition of Content-Security-Policy in the repo.
  # Cache-Control lives in netlify.toml. Never add Cache-Control to the /* rule.
  /*
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()
    Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://scstatehouse.gov https://*.scstatehouse.gov https://scdailygazette.com https://cms.deflock.me https://upload.wikimedia.org; connect-src 'self' https://cms.deflock.me https://tiles.openfreemap.org https://*.openfreemap.org https://cloud.umami.is https://api-gateway.umami.dev; frame-src 'self'; worker-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
  ```

  None of the three new directives falls back to `default-src`, which is why their absence was a real gap: without `base-uri`, an injected `<base href="//evil.tld">` reroutes every relative script URL and defeats `script-src 'self'` outright.

  Note what this task does **not** do: `script-src 'unsafe-inline'` stays. Removing it requires moving the `define:vars` inline scripts out of `ActionModal.astro`, which is scoped as its own PR (design §14).

- [ ] **Step 4: Add immutable caching for `/_astro/*` in `netlify.toml`**

  Replace the whole file with exactly this content (comment above the existing headers block, plus a new `[[headers]]` block at the end):

  ```toml
  [build]
    command = "npm run build"
    publish = "dist"
    ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- . ':!.claude'"

  [build.environment]
    NODE_VERSION = "22"

  # Proxy Umami Cloud through our domain to avoid ad-blocker blocklists
  [[redirects]]
    from = "/u/script.js"
    to = "https://cloud.umami.is/script.js"
    status = 200

  [[redirects]]
    from = "/u/api/send"
    to = "https://cloud.umami.is/api/send"
    status = 200

  # Proxy Census Bureau geocoder to avoid CORS (API has no CORS headers)
  [[redirects]]
    from = "/api/geocode"
    to = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
    status = 200
    query = {address = ":address", benchmark = ":benchmark", vintage = ":vintage", format = ":format"}

  # Security headers.
  # CSP is defined ONLY in public/_headers. Do not add it here: when both files set
  # the same header for the same path, netlify.toml wins, so a stale copy in this
  # file would silently override the real policy.
  [[headers]]
    for = "/*"
    [headers.values]
      X-Frame-Options = "DENY"
      X-Content-Type-Options = "nosniff"
      Referrer-Policy = "strict-origin-when-cross-origin"
      Permissions-Policy = "geolocation=(self), camera=(), microphone=(), payment=()"

  # Astro emits content-hashed filenames under /_astro/, so the URL changes whenever
  # the bytes change and the response can never go stale. Netlify's default is
  # `public, max-age=0, must-revalidate`, which costs 13-18 billed conditional
  # requests per repeat visit for zero body bytes.
  #
  # Deliberately NOT applied to /api/*: those are function responses and each function
  # sets its own Cache-Control (or none). Never widen this to /* .
  [[headers]]
    for = "/_astro/*"
    [headers.values]
      Cache-Control = "public, max-age=31536000, immutable"
  ```

  Confirm no `Cache-Control` reaches `/api/*` from either file:

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && grep -n -i 'cache-control' public/_headers netlify.toml
  ```

  Expected output — exactly two lines, the comment plus the one `/_astro/*` value, and nothing under a `/api` path:

  ```
  public/_headers:2:# Cache-Control lives in netlify.toml. Never add Cache-Control to the /* rule.
  netlify.toml:46:    Cache-Control = "public, max-age=31536000, immutable"
  ```

  (Line numbers may differ by a line or two; the important part is that `Cache-Control` appears as a value under `/_astro/*` only.)

- [ ] **Step 5: Confirm `/events` is already audited in `lighthouserc.json`**

  The events-page task already added `/events` to the Lighthouse CI URL list, so this task makes **no edit** here — it only confirms the entry is present and that the built page the audit will load exists. Rewriting the file to add a trailing slash would re-diverge from the entry that task committed; leave it as the events-page task shipped it.

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && node -e "const l=require('./lighthouserc.json'); console.log(l.ci.collect.url)"
  ```

  Expected: an array that includes `/events`, e.g. `[ '/', '/blog/', '/events' ]`. If `/events` is absent, the events-page task has not landed; stop and run it first rather than adding the entry here — it owns that file.

  Then confirm the file the audit resolves against exists after a build (Step 10 covers the build itself):

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && ls dist/events/index.html
  ```

  Expected: `dist/events/index.html`.

  Consequence to know before merging: `.github/workflows/lighthouse.yml` runs `treosh/lighthouse-ci-action@v12` against this config, and CI hard-fails below accessibility 0.85 / best-practices 0.90 / SEO 0.90. `/events` is inside that gate.

- [ ] **Step 6: Verify `.env` is already gitignored**

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && grep -nx '\.env' .gitignore
  ```

  Expected output:

  ```
  8:.env
  ```

  If that prints a match, make **no edit** — `.env` is already covered (and `.env.*` on line 9, with `!.env.example` on line 10). If it prints nothing and exits 1, append a line `.env` immediately after line 7 (`__pycache__/`) and re-run until it matches. This matters because `scripts/organizer-codes.mjs` reads `ORGANIZER_CODE_PEPPER` from a local `.env`; a committed pepper would make every issued organizer code forgeable from the public repo.

- [ ] **Step 7: Run the guard test again and watch it pass**

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && npx vitest run tests/config-guards.test.ts
  ```

  Expected: `Tests  12 passed (12)` and `Test Files  1 passed (1)` — the three Umami guards plus the nine config-content guards.

  Then confirm nothing else regressed:

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && npm test
  ```

  Expected: all test files pass, exit code 0.

- [ ] **Step 8: Add the dev proxies for the new function paths to `astro.config.mjs`**

  Netlify Functions do not run under `astro dev`, so `/api/events`, `/api/submit-event`, and `/go/:eventId` would 404 against the Astro dev server. Mirror the existing `/api/geocode` proxy pattern, pointing at a locally-running Netlify functions server instead of an upstream API.

  The submit-form task (Task 21) already changed `integrations` from `[sitemap()]` to `[sitemap({ filter })]` so `/events/submit` stays out of the sitemap. This task adds only two things: the `FUNCTIONS_SERVER` const and the three `vite.server.proxy` entries for `/api/events`, `/api/submit-event`, and `/go/:eventId`. It must not disturb that filter.

  **Do not blind-replace the file.** The block below is what `astro.config.mjs` should read exactly once this task is done, and it **retains Task 21's `sitemap({ filter })` call**. Before you save, confirm the `filter:` line is present in the block below and in your file — if your working copy's `sitemap(...)` call differs from the one shown (a later task widened the filter, say), reconcile so the file keeps *both* the existing filter and the new proxies, rather than overwriting either. The safest edit is targeted: add the `FUNCTIONS_SERVER` const above `export default defineConfig`, and add the three new proxy entries immediately after the existing `/api/geocode` entry inside `vite.server.proxy`, leaving the `integrations` array and the tailwind plugin untouched.

  ```js
  // @ts-check
  import { defineConfig } from 'astro/config';
  import sitemap from '@astrojs/sitemap';

  import tailwindcss from '@tailwindcss/vite';

  // Netlify Functions do not run under `astro dev`. To exercise them locally, run
  //   npx netlify functions:serve
  // in a second terminal (serves netlify/functions/ on port 9999); the proxies below
  // forward the production URLs to it so client code can use the real paths.
  //
  // Caveat: `functions:serve` routes by file name, not by each function's
  // `config.path`, so `context.params` is NOT populated behind this proxy.
  // `/go/:eventId` parameter handling is verified against a Netlify deploy preview,
  // never against `astro dev`.
  const FUNCTIONS_SERVER = 'http://127.0.0.1:9999';

  // https://astro.build/config
  export default defineConfig({
    site: 'https://deflocksc.org',
    integrations: [
      sitemap({
        // The submit form is organizer-code gated and sends robots noindex.
        // Keep it out of the sitemap so the two signals agree.
        filter: (page) => !page.includes('/events/submit'),
      }),
    ],
    vite: {
      plugins: [tailwindcss()],
      server: {
        proxy: {
          '/api/geocode': {
            target: 'https://geocoding.geo.census.gov',
            changeOrigin: true,
            rewrite: (path) => path.replace('/api/geocode', '/geocoder/geographies/onelineaddress'),
          },
          '/api/events': {
            target: FUNCTIONS_SERVER,
            changeOrigin: true,
            rewrite: (path) => path.replace('/api/events', '/.netlify/functions/events'),
          },
          '/api/submit-event': {
            target: FUNCTIONS_SERVER,
            changeOrigin: true,
            rewrite: (path) => path.replace('/api/submit-event', '/.netlify/functions/submit-event'),
          },
          // Regex key (leading ^) so this matches only /go/<id> and never a future
          // page route that happens to start with "go".
          '^/go/[A-Za-z0-9_-]+$': {
            target: FUNCTIONS_SERVER,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/go\//, '/.netlify/functions/go/'),
          },
        },
      },
    }
  });
  ```

  **Guard — confirm Task 21's filter survived the edit.** After saving, run:

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && grep -n "events/submit" astro.config.mjs
  ```

  Expected: one line, the `filter: (page) => !page.includes('/events/submit')` inside the `sitemap({ ... })` call. If it prints nothing, you overwrote Task 21's filter — restore it before committing, because without it the noindex submit page goes back into the sitemap.

- [ ] **Step 9: Manually verify the dev proxies**

  Terminal 1 — Astro dev server (per the repo's Windows workaround, `npx`/`npm` do not resolve under the preview tooling, so invoke the module directly):

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && node node_modules/astro/astro.js dev --host 127.0.0.1
  ```

  Expected: `Local  http://127.0.0.1:4321/`.

  Terminal 2 — Netlify functions server:

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && npx netlify functions:serve
  ```

  Expected: `Functions server is listening on 9999`.

  Terminal 3 — the checks:

  ```bash
  curl -sS -D - -o /dev/null http://127.0.0.1:4321/api/events | grep -i '^content-type:'
  ```

  Expected: `content-type: application/json` (possibly with `; charset=utf-8`). The failure mode this rules out is `content-type: text/html` — that is Astro's own 404 page, meaning the proxy key did not match.

  ```bash
  curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/go/abcd2345
  ```

  Expected: `404` from the function's own refusal path (no such event in the local store), **not** an Astro HTML 404. Distinguish them:

  ```bash
  curl -sS http://127.0.0.1:4321/go/abcd2345 | head -5
  ```

  Expected: the function's static refusal body. If you see `<!DOCTYPE html>` followed by Astro's error-page markup, the proxy key is wrong.

  If terminal 2 is not running, the proxy returns `500` and terminal 1 logs `[vite] http proxy error: ... ECONNREFUSED 127.0.0.1:9999` — that is the expected signal that the entry is wired but the backend is down, not a config bug.

  Shut down both servers when done.

- [ ] **Step 10: Build, then verify the headers with curl — before and after**

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && npm run build
  ```

  Expected: `Complete!` with a non-zero page count and exit code 0.

  **Before (current production, run these before the branch deploys):**

  ```bash
  curl -sS -D - -o /dev/null https://deflocksc.org/ | grep -i '^content-security-policy:'
  ```

  Expected — one line ending in `frame-ancestors 'none'`, with no `base-uri`, no `form-action`, no `object-src`:

  ```
  content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://scstatehouse.gov https://*.scstatehouse.gov https://scdailygazette.com https://cms.deflock.me https://upload.wikimedia.org; connect-src 'self' https://cms.deflock.me https://tiles.openfreemap.org https://*.openfreemap.org https://cloud.umami.is https://api-gateway.umami.dev; frame-src 'self'; worker-src blob:; frame-ancestors 'none'
  ```

  ```bash
  ASSET=$(curl -sS https://deflocksc.org/ | grep -oE '/_astro/[A-Za-z0-9._-]+\.css' | head -1)
  echo "asset: $ASSET"
  curl -sS -D - -o /dev/null "https://deflocksc.org$ASSET" | grep -i '^cache-control:'
  ```

  Expected: a `/_astro/...css` path echoed, then Netlify's default:

  ```
  cache-control: public,max-age=0,must-revalidate
  ```

  **After (against the Netlify deploy preview for this branch's PR).** Get the preview URL from the Netlify bot comment on the PR, or:

  ```bash
  gh pr view --json url,number
  ```

  Then, substituting the preview host:

  ```bash
  PREVIEW=https://deploy-preview-<N>--<site-name>.netlify.app

  curl -sS -D - -o /dev/null "$PREVIEW/" | grep -i '^content-security-policy:'
  ```

  Expected — the identical line as before, now ending with the three added directives:

  ```
  content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://scstatehouse.gov https://*.scstatehouse.gov https://scdailygazette.com https://cms.deflock.me https://upload.wikimedia.org; connect-src 'self' https://cms.deflock.me https://tiles.openfreemap.org https://*.openfreemap.org https://cloud.umami.is https://api-gateway.umami.dev; frame-src 'self'; worker-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
  ```

  ```bash
  ASSET=$(curl -sS "$PREVIEW/" | grep -oE '/_astro/[A-Za-z0-9._-]+\.css' | head -1)
  curl -sS -D - -o /dev/null "$PREVIEW$ASSET" | grep -i -E '^(cache-control|content-security-policy):'
  ```

  Expected — the immutable cache header, **and** the `/*` security headers still applying to the same response (both rules match, they do not replace each other):

  ```
  cache-control: public, max-age=31536000, immutable
  content-security-policy: default-src 'self'; ... object-src 'none'
  ```

  ```bash
  curl -sS -D - -o /dev/null "$PREVIEW/api/events" | grep -i '^cache-control:'
  ```

  Expected: the value the events function sets on its own response. The assertion here is negative and absolute — the output must **not** contain `31536000` or `immutable`. A year-long immutable cache on the overlay endpoint would freeze the calendar for every visitor who ever loaded it, and no revocation or fold could reach them. If `31536000` appears, a `Cache-Control` rule has leaked onto a path that matches `/api/*`; re-check Step 4.

  ```bash
  curl -sS -D - -o /dev/null "$PREVIEW/events/" | grep -i -E '^(cache-control|content-security-policy):'
  ```

  Expected: `cache-control: public,max-age=0,must-revalidate` (the Netlify default for HTML — the events page must revalidate so a folded takedown is visible immediately) and the new CSP line.

- [ ] **Step 11: Run the mandatory action-modal smoke test**

  This task edits `public/_headers` and `netlify.toml`, which is exactly the trigger condition in `.github/pull_request_template.md`. A `connect-src` tightening in the security-hardening PR already broke the Census geocoder once, and that failure was invisible until someone typed a real address into the modal. The CSP change here adds `form-action 'self'`, which governs form submission targets — the modal's behaviour must be confirmed, not assumed.

  Run against the deploy preview from Step 10 (the CSP is not applied by `astro dev`, so a local check proves nothing here). Open `$PREVIEW/` with devtools console visible and work the checklist:

  - [ ] Open modal → enter a SC address → results load without console errors (watch specifically for `Refused to connect` / `Refused to ... because it violates the following Content Security Policy directive` messages)
  - [ ] Modal starts at top after results appear (not scrolled to reps)
  - [ ] Test on mobile viewport (375px) — same checks
  - [ ] Geolocation path works (if location permissions available)
  - [ ] Manual dropdown path works
  - [ ] "Start Over" resets to input view

  Any CSP violation printed to the console is a hard stop: fix the directive rather than shipping and reverting.

- [ ] **Step 12: Commit**

  ```bash
  cd /c/Users/tim/workspace/deflocksc-website && git add public/_headers netlify.toml astro.config.mjs tests/config-guards.test.ts && git commit -m "chore: tighten CSP, cache hashed assets, wire events dev proxies

  Add base-uri 'none', form-action 'self' and object-src 'none' to the CSP in
  public/_headers. None of the three fall back to default-src; without base-uri an
  injected <base> reroutes every relative script URL and defeats script-src 'self'.

  Cache /_astro/* as public, max-age=31536000, immutable. Filenames are
  content-hashed, and Netlify's must-revalidate default costs 13-18 billed
  conditional requests per repeat visit for zero body bytes. Not applied to /api/*,
  whose responses set their own Cache-Control.

  Proxy /api/events, /api/submit-event and /go/<id> to a local netlify
  functions:serve under astro dev, in the shape of the existing /api/geocode proxy,
  without disturbing the sitemap filter the submit-form task added.

  Append the header, cache, lighthouse and gitignore guards to
  tests/config-guards.test.ts (created by the analytics-exclusion task) so a future
  edit cannot silently drop a directive or cache an API response. The events-page
  task already audits /events in lighthouserc.json; this task only guards it."
  ```

---
