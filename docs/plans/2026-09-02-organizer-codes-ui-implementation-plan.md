# Organizer Codes Local Admin UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revised 2026-09-02** after Sol security review round 1. Changes: exact Host allowlist with 421 rejection (DNS-rebinding defense) enforced before anything is served; both loopback origins accepted; browser auto-open removed (env-inheriting child process); revoke made idempotent with a UI "Retry takedown" recovery path and a real named confirmation dialog; canary first-write note carried through revoke; automated loopback HTTP security tests over an injectable request handler; plaintext-lifecycle clearing on `pagehide`/bfcache `pageshow`; honest remote-access deferral replacing the Tailscale recipe; digits-only port validation; delivered 413 on oversized bodies.
>
> **Revised again after round 2** (everything else approved): the canary outcome now surfaces through an injected `onCanary(note, warning)` callback that both ops fire immediately after the canary check — BEFORE any fallible store work — so a mid-operation failure cannot swallow the first-use note or the mismatch warning (the CLI prints it in today's channels; the server records it and echoes it in success AND error responses; three ops failure-surfacing tests + one HTTP test added); `CODES_UI_PORT` 80/443 are rejected at startup (browsers omit the scheme-default port from Host/Origin, which the exact allowlist requires); the foreign-Host HTTP test uses the server's real ephemeral port with a wrong hostname, isolating hostname rejection.

**Goal:** A local, browser-based admin UI for organizer codes — `npm run codes:ui` — that reuses the CLI's exact minting logic through one shared, audited ops module to issue codes (copy-to-clipboard, shown once), list existing codes (never the codes themselves), and revoke them (with the tombstone cascade, behind a real named confirmation). It writes to the same production Netlify Blobs the CLI does, using the maintainer's local `.env`. It is never deployed; remote access is deferred outright (see Task 6's README note) — the loopback Host/Origin guard blocks non-loopback access by design.

**Architecture:** The credential core (canary check, wordlist checksum, collision check, idempotent revoke + tombstone cascade) is extracted from `scripts/organizer-codes.ts` into a new dependency-injected module `src/lib/organizer-ops.ts` that returns structured data — no stdout, no clipboard, no `process.exit`. The CLI becomes a thin presentation shell over it. The HTTP side is split the same way: `src/lib/codes-ui-server.ts` exports a dependency-injected `createRequestHandler` (exercised by automated loopback HTTP tests with fake ops), and `scripts/codes-ui.ts` is the thin bootstrap entry (bundled and run exactly like the CLI, bound to `127.0.0.1` only) serving a single self-contained page (`scripts/codes-ui.html`) and three JSON endpoints. Every request passes an exact Host allowlist (`127.0.0.1:<port>` / `localhost:<port>`, else 421 — the DNS-rebinding defense) before anything is served; `/api/*` additionally requires a per-run random token plus Origin/Sec-Fetch-Site checks accepting both loopback origins (pure decisions, unit-tested in `src/lib/codes-ui-guard.ts`). The pepper-canary outcome flows through an injected `onCanary` callback fired before any fallible store work, so both front-ends surface it even when an operation fails mid-flight. `CONTEXT=production` and `NETLIFY_BLOBS_CONTEXT` are set by each shell's bootstrap before any store factory runs, unchanged from the CLI.

**Tech Stack:** TypeScript, Node 22 (`node:http`, `node:crypto`, `process.loadEnvFile`), esbuild bundling (same pattern as `npm run codes`), Vitest, `@netlify/blobs` via the existing `src/lib/blob-stores.ts` guards. No new dependencies.

**Design doc:** `docs/plans/2026-09-02-organizer-codes-ui-design.md`. Every task traces to a section there; where this plan and the design disagree, the design wins and the plan is wrong — except for the deviations recorded below, which are deliberate and explained.

---

## Recorded baselines (measured in this worktree, 2026-09-02)

All three were run in `C:\Users\tim\workspace\dc-codes-ui` before writing this plan. Every task's gates compare against these.

- **`npm test`** → **32 test files passed, 807 tests passed, 0 failures** (~9s). Note: `tests/config-guards.test.ts` runs its own `astro build` in a `beforeAll`; never run `npm test` concurrently with another build in this worktree or the two builds race on `dist/` and that file's 15 tests fail spuriously.
- **`node node_modules/typescript/bin/tsc --noEmit`** → exit 2 with **exactly 14 pre-existing errors**, and no others:
  1. `astro.config.mjs(29,15)` TS2322 (vite Plugin type mismatch)
  2. `src/lib/geo-utils.test.ts(30,33)` TS2345
  3. `src/lib/geo-utils.test.ts(34,35)` TS2345
  4. `src/lib/geo-utils.test.ts(38,33)` TS2345
  5. `src/lib/geo-utils.test.ts(42,33)` TS2345
  6. `src/lib/geo-utils.test.ts(46,33)` TS2345
  7. `src/lib/geo-utils.test.ts(50,35)` TS2345
  8. `src/lib/geo-utils.test.ts(54,35)` TS2345
  9. `src/lib/geo-utils.test.ts(78,30)` TS2345
  10. `src/lib/geo-utils.test.ts(94,30)` TS2345
  11. `src/lib/geo-utils.test.ts(105,30)` TS2345
  12. `src/lib/geo-utils.test.ts(125,30)` TS2345
  13. `src/pages/blog/[...slug]/og.png.ts(17,23)` TS2345
  14. `src/scripts/events-page.ts(79,36)` TS7016 (accessible-autocomplete has no types)
- **`npm run build`** → exit 0 (21 pages built). On a fresh checkout tsc reports ~26 errors until `npm run build` generates the `.astro` types — always run the build before trusting a tsc count.

**Gate definitions used by every task below:**

- *tsc gate:* `node node_modules/typescript/bin/tsc --noEmit` reports exactly the 14 errors above — same files, same lines (line numbers in files this plan does not touch must not move), zero new errors.
- *build gate:* `npm run build` exits 0.
- *test gate:* `npm test` reports 0 failures, with the expected total stated per task.

---

## Ground rules

1. **This tool writes PRODUCTION Netlify Blobs.** No task in this plan may issue, revoke, or set anything against the real stores. All ops logic is verified with in-memory fake stores; the server and page are verified with invalid inputs (rejected before any store is touched) and with the guard/binding checks. Real issue/revoke is a post-merge manual step for the maintainer, documented in Task 7.
2. **CLI invariants must survive the refactor byte-for-byte** (design "Load-bearing facts"): never write a plaintext code to a file; never log a plaintext code; never accept a code as a command-line argument; never print a code during `list`; never print the intake URL during `list`; never commit anything from the tool. The new UI adds one: the plaintext code exists only in memory, the localhost HTTP response, and the browser DOM.
3. **`CONTEXT=production` ordering:** each front-end sets `NETLIFY_BLOBS_CONTEXT` and then `CONTEXT=production` in its bootstrap, before any store factory is called. Store factories are only ever invoked inside command/request handlers, which run after the bootstrap completes.
4. Two Unicode code points, U+2028 and U+2029, must never appear as literal characters anywhere (repo-wide rule from the events plan). None of the code below contains them; keep it that way when transcribing.
5. Commit at the end of every task, from the worktree root, with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
6. TDD tasks (1, 3, and the handler half of 4): write the test file first, run it, watch it fail for the right reason (module not found / assertion), then write the module, then watch it pass. Manual-verify portions (Task 2, the entry+stub half of 4, Tasks 5 and 6): gates are tsc/build/test plus the concrete checks listed in the task — no jsdom (the HTTP tests use a real loopback `node:http` server, not a DOM).

## Deliberate deviations from the design (recorded, not silent)

The design doc was revised in sync with this plan after Sol's round-1 review (Host allowlist, both-loopback origins, no auto-open, idempotent revoke, canary-note parity, automated HTTP tests, remote-access deferral) — those items are now design-conformant, not deviations. What remains recorded:

- **D1 — `wordlist` moves out of the shared `OpsDeps` into `IssueDeps`.** The design's `OpsDeps` sketch lists `wordlist: string[]`, but only `issueCode` uses it, and requiring it for `list`/`revoke` would make the CLI's `list` start failing on machines without the wordlist — a behavior change. `IssueDeps extends OpsDeps` adds the field for the one op that needs it. The design's own §2 agrees: "Each endpoint reads+validates the wordlist (issue)".
- **D2 — canary outcomes travel via the injected `onCanary` callback, not return values** (revised in round 2): both ops fire `deps.onCanary(note, warning)` immediately after the canary check and before any fallible store work, so both shells reproduce today's canary output exactly — and the signal survives a mid-operation failure (the CLI's callback prints note→stdout / warning→stderr; the server's records the values and echoes them in success and error responses). The results carry no canary fields. Now reflected in the design's §1 sketch.
- **D3 — failure ordering inside `issue` shifts one notch:** the wordlist is read (and checksum-verified) *before* the canary check, because the design specifies the wordlist is "already read + checksum-verified by the caller-side reader" that hands it to `issueCode`. On a machine where *both* are broken, the wordlist error now wins. Each individual failure message is unchanged. (Canary note/warning ordering is governed by D2: `onCanary` fires after a successful canary decision and *before* generation/collision/write, so the outcome survives a subsequent failure.)
- **D4 — the fold is a note, not a button.** Design §3 allows "a note/optional trigger"; the UI shows the CLI's fold-reminder text after a successful revoke and leaves triggering to `gh workflow run fold-events.yml` (or the CLI's prompt). No `fold` field in `POST /api/revoke`.
- **D5 — the security boundary lives in two testable lib modules.** `src/lib/codes-ui-guard.ts` holds the pure Host/token/origin decisions (its own TDD task); `src/lib/codes-ui-server.ts` holds the dependency-injected request handler, exercised by real loopback HTTP tests with injected fake ops (TDD half of Task 4). `scripts/codes-ui.ts` is only the bootstrap entry. This satisfies the design's Testing section without jsdom. (This makes 7 tasks where the design sketch implies 6.)
- **D6 — `GET /api/list` includes each row's `digest`.** The on-screen table never shows it, but the per-row Revoke and Retry-takedown buttons need it to make the target unambiguous (so the server's `many` outcome is unreachable from the UI). Precedent: `list --json` already emits digests, and a digest is a one-way value, not a code.
- **D7 — no approved-mockup file exists in this worktree.** The page is built from design §3 plus the committed theme tokens in `docs/plans/assets/deflock-ui-kit.html`, using system font stacks instead of Google Fonts so the page needs zero external requests and runs under a strict CSP.

## Task overview

| # | Task | Mode | New/changed files |
|---|---|---|---|
| 1 | Shared ops module (idempotent revoke, canary data) | TDD | `src/lib/organizer-ops.ts`, `src/lib/organizer-ops.test.ts` |
| 2 | CLI refactor to shared ops | manual-verify | `scripts/organizer-codes.ts` |
| 3 | Host/CSRF guard module | TDD | `src/lib/codes-ui-guard.ts`, `src/lib/codes-ui-guard.test.ts` |
| 4 | Server: handler core + HTTP security tests + thin entry | TDD (handler) + manual (entry) | `src/lib/codes-ui-server.ts`, `src/lib/codes-ui-server.test.ts`, `scripts/codes-ui.ts`, `scripts/codes-ui.html` (stub) |
| 5 | The page | manual-verify | `scripts/codes-ui.html` (full) |
| 6 | `codes:ui` script + remote-access deferral README note | manual-verify | `package.json`, `README.md` |
| 7 | Full verification | gates + manual | (none) |

Expected test totals: after Task 1 → 33 files / 828 tests; after Task 3 → 34 files / 844 tests; after Task 4 → **35 files / 861 tests**; unchanged thereafter.

---

## Task 1 — Shared ops module `src/lib/organizer-ops.ts` (TDD)

Design §1. Extract the core of issue/list/revoke into dependency-injected functions returning structured data. Reuses the existing pure helpers from `organizer-cli.ts` / `organizer-code.ts` — nothing is reimplemented. Also hosts `readVerifiedWordlist`, the shared wordlist read + checksum enforcement both front-ends call (design §1: "moved into the module or a shared helper both front-ends call"). Three Sol-review requirements land here: `revokeCode` is **idempotent** (an already-revoked target skips the record re-write but still completes the tombstone sweep — the recovery path for an interrupted cascade); and the canary outcomes (first-write note, non-strict mismatch warning) surface through an injected **`onCanary(note, warning)` callback on `OpsDeps`, invoked immediately after the canary check and BEFORE any generate/lookup/write/sweep** — so a store failure mid-operation can never swallow the signal (round 2: on first use the canary has already been *written* by then; losing the note would hide that). The callback is the single carrier — the results do NOT duplicate the canary fields.

**Files:**

- Create `src/lib/organizer-ops.test.ts` (first)
- Create `src/lib/organizer-ops.ts`

**Steps:**

- [ ] 1. Write the failing test file `src/lib/organizer-ops.test.ts` exactly as follows (21 tests):

```ts
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { type Store } from '@netlify/blobs';
import {
  CANARY_KEY,
  CANARY_MISMATCH_MESSAGE,
  canaryDigest,
} from './organizer-cli.js';
import { digestCode } from './organizer-code.js';
import {
  OpsError,
  issueCode,
  listCodes,
  readVerifiedWordlist,
  revokeCode,
  type OpsDeps,
} from './organizer-ops.js';

const PEPPER = 'test-pepper';
const NOW = '2026-09-02T12:00:00.000Z';

// A tiny wordlist plus an rng that walks 0,1,2,3 makes the generated code —
// and therefore its digest — fully deterministic.
const WORDS = ['alpha', 'bravo', 'chirp', 'delta', 'ember', 'frost'];
const FIXED_CODE = 'alpha-bravo-chirp-delta';
const FIXED_DIGEST = digestCode(FIXED_CODE, PEPPER);

function sequenceRng(values: number[]): (maxExclusive: number) => number {
  let i = 0;
  return () => {
    const value = values[i % values.length];
    i += 1;
    return value;
  };
}

/** In-memory fake of the (already Proxy-wrapped) Store surface the ops use. */
class FakeStore {
  readonly data = new Map<string, unknown>();
  /** Write-call counter, for asserting the idempotent-revoke skip. */
  writes = 0;

  constructor(initial: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initial)) this.data.set(key, value);
  }

  async list(): Promise<{ blobs: { key: string; etag: string }[] }> {
    return { blobs: [...this.data.keys()].map((key) => ({ key, etag: 'etag' })) };
  }

  async get(key: string): Promise<unknown> {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.writes += 1;
    this.data.set(key, value);
  }

  async setJSON(key: string, value: unknown): Promise<void> {
    this.writes += 1;
    this.data.set(key, value);
  }

  asStore(): Store {
    return this as unknown as Store;
  }
}

/**
 * FakeStore whose writes throw, for the canary-survives-failure tests:
 * the onCanary callback must have fired before the write that explodes.
 */
class ExplodingWriteStore extends FakeStore {
  async setJSON(_key: string, _value: unknown): Promise<void> {
    throw new Error('store write failed');
  }
}

interface Fakes {
  codes: FakeStore;
  events: FakeStore;
  meta: FakeStore;
  /** Every onCanary invocation, in order: [note, warning]. */
  canaryCalls: [string | null, string | null][];
  deps: OpsDeps;
}

function makeFakes(
  overrides: { codes?: FakeStore; events?: FakeStore; meta?: FakeStore; rng?: number[] } = {},
): Fakes {
  const codes = overrides.codes ?? new FakeStore();
  const events = overrides.events ?? new FakeStore();
  // Default: the canary already matches this pepper, so ops proceed silently.
  const meta = overrides.meta ?? new FakeStore({ [CANARY_KEY]: canaryDigest(PEPPER) });
  const canaryCalls: [string | null, string | null][] = [];
  return {
    codes,
    events,
    meta,
    canaryCalls,
    deps: {
      codes: codes.asStore(),
      events: events.asStore(),
      meta: meta.asStore(),
      pepper: PEPPER,
      now: () => NOW,
      rng: sequenceRng(overrides.rng ?? [0, 1, 2, 3]),
      onCanary: (note, warning) => {
        canaryCalls.push([note, warning]);
      },
    },
  };
}

/** Everything the fakes have persisted, flattened, for never-persisted scans. */
function persistedText(...stores: FakeStore[]): string {
  return stores.map((store) => JSON.stringify([...store.data.entries()])).join('\n');
}

describe('readVerifiedWordlist', () => {
  it('reads and verifies the committed wordlist (1296 words)', () => {
    const result = readVerifiedWordlist(process.cwd());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1296);
      expect(result.value[0]).toBe('aardvark');
    }
  });

  it('fails with a missing-file message for a root without the wordlist', () => {
    const result = readVerifiedWordlist(join(process.cwd(), 'no-such-dir'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('missing');
      expect(result.message).toContain('npm run build-wordlist');
    }
  });
});

describe('issueCode', () => {
  it('writes exactly one record, keyed by the HMAC digest, shaped by buildCodeRecord', async () => {
    const { codes, deps } = makeFakes();
    const result = await issueCode({ ...deps, wordlist: WORDS }, { pseudonym: 'handle-jay' });
    expect(result.pseudonym).toBe('handle-jay');
    expect(codes.data.size).toBe(1);
    expect(codes.data.get(FIXED_DIGEST)).toEqual({
      pseudonym: 'handle-jay',
      issuedAt: NOW,
      revoked: false,
    });
  });

  it('returns the plaintext code in memory only — not the digest, never persisted', async () => {
    const { codes, events, meta, deps } = makeFakes();
    const result = await issueCode({ ...deps, wordlist: WORDS }, { pseudonym: 'handle-jay' });
    expect(result.code).toBe(FIXED_CODE);
    expect(result.code).not.toBe(FIXED_DIGEST);
    const persisted = persistedText(codes, events, meta);
    expect(persisted).not.toContain(result.code);
    expect(persisted).toContain(FIXED_DIGEST);
  });

  it('refuses when the generated code collides with an existing record', async () => {
    const { deps } = makeFakes({
      codes: new FakeStore({
        [FIXED_DIGEST]: { pseudonym: 'earlier', issuedAt: NOW, revoked: false },
      }),
    });
    await expect(
      issueCode({ ...deps, wordlist: WORDS }, { pseudonym: 'handle-jay' }),
    ).rejects.toMatchObject({ name: 'OpsError', code: 'collision' });
  });

  it('writes the pepper canary on first use and fires onCanary with the note', async () => {
    const { meta, canaryCalls, deps } = makeFakes({ meta: new FakeStore() });
    await issueCode({ ...deps, wordlist: WORDS }, { pseudonym: 'handle-jay' });
    expect(meta.data.get(CANARY_KEY)).toBe(canaryDigest(PEPPER));
    expect(canaryCalls).toHaveLength(1);
    expect(canaryCalls[0][0]).toContain('wrote the pepper canary');
    expect(canaryCalls[0][1]).toBeNull();
  });

  it('fires onCanary with nothing to report when the stored canary matches', async () => {
    const { canaryCalls, deps } = makeFakes();
    await issueCode({ ...deps, wordlist: WORDS }, { pseudonym: 'handle-jay' });
    expect(canaryCalls).toEqual([[null, null]]);
  });

  it('surfaces the first-use note via onCanary even when the issue then fails on a collision', async () => {
    // The canary is WRITTEN before the collision is discovered; the note must
    // not be swallowed by the failure.
    const { meta, canaryCalls, deps } = makeFakes({
      meta: new FakeStore(),
      codes: new FakeStore({
        [FIXED_DIGEST]: { pseudonym: 'earlier', issuedAt: NOW, revoked: false },
      }),
    });
    await expect(
      issueCode({ ...deps, wordlist: WORDS }, { pseudonym: 'handle-jay' }),
    ).rejects.toMatchObject({ name: 'OpsError', code: 'collision' });
    expect(meta.data.get(CANARY_KEY)).toBe(canaryDigest(PEPPER));
    expect(canaryCalls).toHaveLength(1);
    expect(canaryCalls[0][0]).toContain('wrote the pepper canary');
  });

  it('refuses to issue on canary mismatch (strict) and writes nothing', async () => {
    const { codes, deps } = makeFakes({
      meta: new FakeStore({ [CANARY_KEY]: 'not-the-right-digest' }),
    });
    await expect(
      issueCode({ ...deps, wordlist: WORDS }, { pseudonym: 'handle-jay' }),
    ).rejects.toMatchObject({
      name: 'OpsError',
      code: 'canary_mismatch',
      message: CANARY_MISMATCH_MESSAGE,
    });
    expect(codes.data.size).toBe(0);
  });
});

describe('listCodes', () => {
  it('returns rows with digest, pseudonym, issuedAt, revoked — and no code field', async () => {
    const { deps } = makeFakes({
      codes: new FakeStore({
        ['a'.repeat(64)]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: false },
        ['b'.repeat(64)]: { pseudonym: 'pier', issuedAt: NOW, revoked: true },
      }),
    });
    const rows = await listCodes(deps);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      digest: 'a'.repeat(64),
      pseudonym: 'handle-jay',
      issuedAt: NOW,
      revoked: false,
    });
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(
      ['digest', 'issuedAt', 'pseudonym', 'revoked'],
    );
  });

  it('tolerates a malformed record without crashing', async () => {
    const { deps } = makeFakes({
      codes: new FakeStore({ ['c'.repeat(64)]: 'not-an-object' }),
    });
    const rows = await listCodes(deps);
    expect(rows).toEqual([
      { digest: 'c'.repeat(64), pseudonym: '(unknown)', issuedAt: '', revoked: false },
    ]);
  });
});

describe('revokeCode', () => {
  const digestA = 'a'.repeat(64);
  const digestB = 'b'.repeat(64);

  function seededCodes(): FakeStore {
    return new FakeStore({
      [digestA]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: false },
      [digestB]: { pseudonym: 'pier', issuedAt: NOW, revoked: false },
    });
  }

  it('revokes the selected code, rewriting exactly the three owned fields', async () => {
    const { codes, deps } = makeFakes({ codes: seededCodes() });
    const result = await revokeCode(deps, { pseudonym: 'handle-jay', digest: null });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.digest).toBe(digestA);
      expect(result.pseudonym).toBe('handle-jay');
    }
    expect(codes.data.get(digestA)).toEqual({
      pseudonym: 'handle-jay',
      issuedAt: NOW,
      revoked: true,
    });
    expect(codes.data.get(digestB)).toEqual({
      pseudonym: 'pier',
      issuedAt: NOW,
      revoked: false,
    });
  });

  it('tombstones only matching, not-yet-tombstoned events and counts them', async () => {
    const events = new FakeStore({
      ev1: { codeDigest: digestA, title: 'one', revoked: false },
      ev2: { codeDigest: digestA, title: 'two' },
      ev3: { codeDigest: digestA, title: 'already', revoked: true },
      ev4: { codeDigest: digestB, title: 'other-code' },
    });
    const { deps } = makeFakes({ codes: seededCodes(), events });
    const result = await revokeCode(deps, { pseudonym: 'handle-jay', digest: null });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.tombstoned).toBe(2);
    expect(events.data.get('ev1')).toEqual({ codeDigest: digestA, title: 'one', revoked: true });
    expect(events.data.get('ev2')).toEqual({ codeDigest: digestA, title: 'two', revoked: true });
    expect(events.data.get('ev3')).toEqual({ codeDigest: digestA, title: 'already', revoked: true });
    expect(events.data.get('ev4')).toEqual({ codeDigest: digestB, title: 'other-code' });
  });

  it('returns none for an unknown pseudonym', async () => {
    const { deps } = makeFakes({ codes: seededCodes() });
    const result = await revokeCode(deps, { pseudonym: 'ghost', digest: null });
    expect(result).toEqual({ kind: 'none' });
  });

  it('returns many with the candidate rows when a pseudonym holds two codes', async () => {
    const { deps } = makeFakes({
      codes: new FakeStore({
        [digestA]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: false },
        [digestB]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: false },
      }),
    });
    const result = await revokeCode(deps, { pseudonym: 'handle-jay', digest: null });
    expect(result.kind).toBe('many');
    if (result.kind === 'many') {
      expect(result.rows.map((row) => row.digest).sort()).toEqual([digestA, digestB]);
    }
  });

  it('disambiguates by digest and leaves the sibling untouched', async () => {
    const { codes, deps } = makeFakes({
      codes: new FakeStore({
        [digestA]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: false },
        [digestB]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: false },
      }),
    });
    const result = await revokeCode(deps, { pseudonym: 'handle-jay', digest: digestB });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.digest).toBe(digestB);
    expect((codes.data.get(digestA) as { revoked: boolean }).revoked).toBe(false);
    expect((codes.data.get(digestB) as { revoked: boolean }).revoked).toBe(true);
  });

  it('warns via onCanary but proceeds on canary mismatch (non-strict)', async () => {
    const { codes, canaryCalls, deps } = makeFakes({
      codes: seededCodes(),
      meta: new FakeStore({ [CANARY_KEY]: 'not-the-right-digest' }),
    });
    const result = await revokeCode(deps, { pseudonym: 'handle-jay', digest: null });
    expect(result.kind).toBe('ok');
    expect(canaryCalls).toEqual([[null, CANARY_MISMATCH_MESSAGE]]);
    expect((codes.data.get(digestA) as { revoked: boolean }).revoked).toBe(true);
  });

  it('writes the canary on a first-use revoke and fires onCanary with the note', async () => {
    const { meta, canaryCalls, deps } = makeFakes({ codes: seededCodes(), meta: new FakeStore() });
    const result = await revokeCode(deps, { pseudonym: 'handle-jay', digest: null });
    expect(meta.data.get(CANARY_KEY)).toBe(canaryDigest(PEPPER));
    expect(result.kind).toBe('ok');
    expect(canaryCalls).toHaveLength(1);
    expect(canaryCalls[0][0]).toContain('wrote the pepper canary');
    expect(canaryCalls[0][1]).toBeNull();
  });

  it('surfaces the mismatch warning via onCanary even when the revoke then fails on a store write', async () => {
    const { canaryCalls, deps } = makeFakes({
      codes: new ExplodingWriteStore({
        [digestA]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: false },
      }),
      meta: new FakeStore({ [CANARY_KEY]: 'not-the-right-digest' }),
    });
    await expect(
      revokeCode(deps, { pseudonym: 'handle-jay', digest: null }),
    ).rejects.toThrow('store write failed');
    // The warning fired BEFORE the doomed write — it is not lost.
    expect(canaryCalls).toEqual([[null, CANARY_MISMATCH_MESSAGE]]);
  });

  it('surfaces the first-use note via onCanary even when the revoke then fails on a store write', async () => {
    const { meta, canaryCalls, deps } = makeFakes({
      codes: new ExplodingWriteStore({
        [digestA]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: false },
      }),
      meta: new FakeStore(),
    });
    await expect(
      revokeCode(deps, { pseudonym: 'handle-jay', digest: null }),
    ).rejects.toThrow('store write failed');
    // The canary was already written and the note already surfaced.
    expect(meta.data.get(CANARY_KEY)).toBe(canaryDigest(PEPPER));
    expect(canaryCalls).toHaveLength(1);
    expect(canaryCalls[0][0]).toContain('wrote the pepper canary');
  });

  it('is idempotent: re-revoking an already-revoked code completes remaining tombstones without re-writing the record', async () => {
    // The recovery scenario: a previous revoke flipped the record but died
    // mid-cascade, leaving ev2 stranded. The retry must finish the sweep,
    // skip the codes-store write, and touch no other digest.
    const codes = new FakeStore({
      [digestA]: { pseudonym: 'handle-jay', issuedAt: NOW, revoked: true },
      [digestB]: { pseudonym: 'pier', issuedAt: NOW, revoked: false },
    });
    const events = new FakeStore({
      ev1: { codeDigest: digestA, title: 'swept-first-time', revoked: true },
      ev2: { codeDigest: digestA, title: 'stranded' },
      ev3: { codeDigest: digestB, title: 'other-code' },
    });
    const { deps } = makeFakes({ codes, events });
    const result = await revokeCode(deps, { pseudonym: 'handle-jay', digest: digestA });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') expect(result.tombstoned).toBe(1);
    expect(codes.writes).toBe(0);
    expect(codes.data.get(digestA)).toEqual({
      pseudonym: 'handle-jay',
      issuedAt: NOW,
      revoked: true,
    });
    expect(events.data.get('ev2')).toEqual({
      codeDigest: digestA,
      title: 'stranded',
      revoked: true,
    });
    expect(events.data.get('ev3')).toEqual({ codeDigest: digestB, title: 'other-code' });
    expect((codes.data.get(digestB) as { revoked: boolean }).revoked).toBe(false);
  });
});

// Referenced so the import is used even if a future edit drops the rejects checks.
void OpsError;
```

- [ ] 2. Run the tests and watch them fail for the right reason: `npx vitest run src/lib/organizer-ops.test.ts` → the run must fail with a module-resolution error for `./organizer-ops.js` (not a syntax error in the test file).
- [ ] 3. Write `src/lib/organizer-ops.ts` exactly as follows:

```ts
/**
 * The shared impure core of the organizer-code operations: issue, list,
 * revoke. Both front-ends — the CLI (`scripts/organizer-codes.ts`) and the
 * local admin UI server (`scripts/codes-ui.ts`) — call these functions, so
 * there is a single audited implementation of the credential logic: the
 * pepper canary, the wordlist checksum, the collision check, and the
 * revoke + tombstone cascade.
 *
 * Everything here takes injected dependencies (stores, pepper, wordlist,
 * clock, rng) and returns structured data. No stdout, no clipboard, no
 * process.exit — presentation belongs to the front-ends. The injection is
 * also what makes this file unit-testable with in-memory fake stores.
 *
 * Invariants inherited from the CLI (must never break):
 *   - the plaintext code exists only in the returned IssueResult, in memory;
 *     only its HMAC digest is ever persisted
 *   - listCodes returns rows, never code material (none is stored to return)
 *   - CONTEXT=production and NETLIFY_BLOBS_CONTEXT are the front-end
 *     bootstrap's job, set BEFORE any store factory is called — never here
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Store } from '@netlify/blobs';

import * as cli from './organizer-cli.js';
import { digestCode, generateCode, normalizeCode } from './organizer-code.js';

export type OpsErrorCode = 'canary_mismatch' | 'collision' | 'generate_bug';

/** A refusal from the ops core. Front-ends map it to exit codes / HTTP statuses. */
export class OpsError extends Error {
  readonly code: OpsErrorCode;

  constructor(code: OpsErrorCode, message: string) {
    super(message);
    this.name = 'OpsError';
    this.code = code;
  }
}

export interface OpsDeps {
  codes: Store;
  events: Store;
  meta: Store;
  pepper: string;
  /** () => new Date().toISOString() in production; fixed in tests. */
  now: () => string;
  /** crypto.randomInt in production (rejection-sampled); deterministic in tests. */
  rng: (maxExclusive: number) => number;
  /**
   * The canary signal channel. Invoked exactly once per issue/revoke,
   * IMMEDIATELY after the canary check and BEFORE any generate/lookup/write/
   * sweep — so a mid-operation store failure can never swallow a first-write
   * note (the canary is already written by then) or a mismatch warning.
   * `note` is the first-write note; `warning` the non-strict mismatch
   * warning; both null when the stored canary simply matched. This callback
   * is the ONLY carrier — results do not duplicate the canary outcome.
   */
  onCanary: (note: string | null, warning: string | null) => void;
}

/** Only issueCode needs the wordlist; list/revoke must not require one (D1). */
export interface IssueDeps extends OpsDeps {
  wordlist: readonly string[];
}

export interface IssueResult {
  pseudonym: string;
  /** Plaintext, IN MEMORY ONLY. Shown once by the caller, then dropped. Never persisted, never logged. */
  code: string;
}

export type RevokeResult =
  | { kind: 'ok'; digest: string; pseudonym: string; tombstoned: number }
  | { kind: 'none' }
  | { kind: 'many'; rows: cli.ListRow[] };

interface CanaryOutcome {
  note: string | null;
  warning: string | null;
}

/**
 * The canary check runs INSIDE issueCode/revokeCode rather than as a helper a
 * front-end could forget to call: every front-end enforces it identically by
 * construction (design §1).
 */
async function enforceCanary(deps: OpsDeps, strict: boolean): Promise<CanaryOutcome> {
  const stored = (await deps.meta.get(cli.CANARY_KEY, { type: 'text' })) as string | null;
  const decision = cli.decideCanary(stored, cli.canaryDigest(deps.pepper), strict);
  if (decision.action === 'write') {
    await deps.meta.set(cli.CANARY_KEY, decision.value);
    return { note: decision.note, warning: null };
  }
  if (decision.action === 'refuse') throw new OpsError('canary_mismatch', decision.message);
  if (decision.action === 'warn') return { note: null, warning: decision.message };
  return { note: null, warning: null };
}

/**
 * Issue one code: canary (strict) -> onCanary -> generate -> digest ->
 * collision check -> store the record under the digest. The plaintext code is
 * returned in memory only; the caller shows it once and drops it. onCanary
 * fires before the fallible work so a first-write note survives a later
 * collision or store failure.
 */
export async function issueCode(
  deps: IssueDeps,
  input: { pseudonym: string },
): Promise<IssueResult> {
  const canary = await enforceCanary(deps, true);
  deps.onCanary(canary.note, canary.warning);

  const code = generateCode(deps.wordlist, deps.rng);
  const normalized = normalizeCode(code);
  if (!normalized.ok) {
    throw new OpsError(
      'generate_bug',
      `generated code failed normalizeCode (${normalized.code}) — this is a bug`,
    );
  }
  const digest = digestCode(normalized.value, deps.pepper);

  if ((await deps.codes.get(digest, { type: 'json' })) !== null) {
    throw new OpsError('collision', 'the generated code collides with an existing code. Run issue again.');
  }
  await deps.codes.setJSON(digest, cli.buildCodeRecord(input.pseudonym, deps.now()));

  return { pseudonym: input.pseudonym, code };
}

/** Every code record as a ListRow. Rows carry digests — never codes. */
export async function listCodes(deps: OpsDeps): Promise<cli.ListRow[]> {
  const { blobs } = await deps.codes.list();
  const rows: cli.ListRow[] = [];
  for (const blob of blobs) {
    const record = await deps.codes.get(blob.key, { type: 'json' });
    if (record === null || record === undefined) continue;
    rows.push(cli.toListRow(blob.key, record));
  }
  return rows;
}

/**
 * Revoke one code: canary (non-strict — a takedown must work even with a wrong
 * local pepper) -> onCanary -> select target -> rewrite the record ->
 * tombstone every event this code created.
 *
 * IDEMPOTENT: an already-revoked target skips the record re-write but still
 * runs the tombstone sweep over every remaining codeDigest-matching,
 * non-tombstoned event. The record flips to revoked BEFORE the sweep, so a
 * failure mid-cascade would otherwise strand events with no way to finish the
 * takedown — re-running the revoke is the recovery path (the UI exposes it as
 * "Retry takedown" on revoked rows).
 */
export async function revokeCode(
  deps: OpsDeps,
  input: { pseudonym: string; digest: string | null },
): Promise<RevokeResult> {
  const canary = await enforceCanary(deps, false);
  // BEFORE the lookup and the writes: a store failure below must not swallow
  // the canary signal (on first use the canary is already written by now).
  deps.onCanary(canary.note, canary.warning);

  const selection = cli.selectRevocationTarget(
    await listCodes(deps),
    input.pseudonym,
    input.digest,
  );
  if (selection.kind === 'none') return { kind: 'none' };
  if (selection.kind === 'many') return { kind: 'many', rows: selection.rows };

  const target = selection.row;
  if (!target.revoked) {
    await deps.codes.setJSON(target.digest, cli.revokeRecord(target));
  }

  // Cascade: tombstone every event this code created. Runs even when the
  // record was already revoked — that is the idempotent recovery sweep.
  const { blobs } = await deps.events.list();
  let tombstoned = 0;
  for (const blob of blobs) {
    const event = await deps.events.get(blob.key, { type: 'json' });
    if (!cli.shouldTombstone(event, target.digest)) continue;
    await deps.events.setJSON(blob.key, cli.tombstoneEvent(event as Record<string, unknown>));
    tombstoned += 1;
  }

  return { kind: 'ok', digest: target.digest, pseudonym: target.pseudonym, tombstoned };
}

export type WordlistReadResult =
  | { ok: true; value: string[] }
  | { ok: false; message: string };

/**
 * Read + checksum-verify + structurally validate the committed wordlist.
 * Shared by both front-ends so the checksum enforcement cannot diverge
 * (design §1). Paths resolve from the given project root: both front-ends run
 * as esbuild bundles out of node_modules/.cache, so import.meta.url is
 * useless — they pass process.cwd(), which npm sets to the repo root.
 * Message texts are byte-identical to the pre-refactor CLI's.
 */
export function readVerifiedWordlist(projectRoot: string): WordlistReadResult {
  const txtPath = join(projectRoot, cli.WORDLIST_TXT_REL);
  const shaPath = join(projectRoot, cli.WORDLIST_SHA_REL);
  if (!existsSync(txtPath)) {
    return { ok: false, message: `missing ${txtPath}. Run: npm run build-wordlist` };
  }
  const bytes = readFileSync(txtPath);
  const actual = createHash('sha256').update(bytes).digest('hex');
  const checked = cli.checkWordlistChecksum(actual, readFileSync(shaPath, 'utf-8'));
  if (!checked.ok) {
    return {
      ok: false,
      message:
        checked.code === 'mismatch'
          ? `wordlist checksum mismatch. The word source for every code you issue is not what was audited. Restore it with: git checkout -- ${cli.WORDLIST_TXT_REL}`
          : `${cli.WORDLIST_SHA_REL} is not a valid sha256sum record for the wordlist. Regenerate both with: npm run build-wordlist`,
    };
  }
  const list = cli.parseWordlist(bytes.toString('utf-8'));
  if (!list.ok) return { ok: false, message: `wordlist failed structural validation (${list.code})` };
  return { ok: true, value: list.value };
}
```

- [ ] 4. Run `npx vitest run src/lib/organizer-ops.test.ts` → **21 tests pass, 0 failures**.
- [ ] 5. Run the full gates: `npm test` → **33 files / 828 tests, 0 failures**. `node node_modules/typescript/bin/tsc --noEmit` → exactly the 14 baseline errors. `npm run build` → exit 0.
- [ ] 6. Commit:

```
git add src/lib/organizer-ops.ts src/lib/organizer-ops.test.ts
git commit -m "feat(codes): extract shared organizer-ops issue/list/revoke core" -m "Dependency-injected, structured-result versions of the CLI's issue/list/
revoke paths, plus the shared checksum-enforcing wordlist reader, so the
CLI and the upcoming local admin UI run one audited implementation.
Revoke is idempotent (re-run completes an interrupted tombstone cascade)
and the canary outcome fires through an injected onCanary callback
before any fallible store work, so it survives a mid-operation failure.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 — Refactor `scripts/organizer-codes.ts` onto the shared ops (manual-verify)

Design §1 last paragraph: the CLI keeps ONLY presentation (banners, `--clip`, the fold prompt) and delegates the core to `organizer-ops.ts`. Behavior is identical; the existing pure test suite (`organizer-cli.test.ts`) is untouched and stays green. `runSetIntake`, `maybeTriggerFold`, `copyToClipboard`, argument handling, and the `.env` / `NETLIFY_BLOBS_CONTEXT` / `CONTEXT=production` bootstrap are unchanged. Deleted from the shell (moved to ops): `readWordlist`, `enforceCanary`, `listCodeRows`, and the inline generate/digest/collision/cascade bodies.

**Files:**

- Rewrite `scripts/organizer-codes.ts`

**Steps:**

- [ ] 1. Replace the entire contents of `scripts/organizer-codes.ts` with:

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
 * This is the THIN SHELL. It reads the environment, wires stdin/stdout, and
 * sets exit codes. Argument parsing, the record shapes, and all output text
 * live in src/lib/organizer-cli.ts (pure, unit tested); the issue/list/revoke
 * core — canary, wordlist checksum, collision check, tombstone cascade —
 * lives in src/lib/organizer-ops.ts (dependency-injected, unit tested), and
 * is shared with the local admin UI server (scripts/codes-ui.ts).
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
import { randomInt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stderr, stdin, stdout } from 'node:process';

import * as cli from '../src/lib/organizer-cli.js';
import {
  issueCode,
  listCodes,
  readVerifiedWordlist,
  revokeCode,
  type OpsDeps,
} from '../src/lib/organizer-ops.js';
import { validateSignalUrl } from '../src/lib/signal-url.js';
import {
  ContextRefusedError,
  codesStore,
  eventsStore,
  linksStore,
  metaStore,
} from '../src/lib/blob-stores.js';

const PROJECT_ROOT = process.cwd();
const FOLD_WORKFLOW_PATH = join(PROJECT_ROOT, '.github', 'workflows', cli.FOLD_WORKFLOW);
const ENV_FILE = join(PROJECT_ROOT, '.env');

function fail(message: string): never {
  stderr.write(`organizer-codes: ${message}\n`);
  process.exit(1);
}

/**
 * The store factories run here, inside a subcommand — strictly after main()
 * has set NETLIFY_BLOBS_CONTEXT and CONTEXT=production.
 *
 * onCanary prints in the same channels and order as the old inline
 * enforceCanary — first-write note on stdout, mismatch warning on stderr —
 * and the ops fire it BEFORE any store lookup/write, so the signal reaches
 * the terminal even when the operation then fails mid-flight.
 */
function buildOpsDeps(pepper: string): OpsDeps {
  return {
    codes: codesStore(),
    events: eventsStore(),
    meta: metaStore(),
    pepper,
    now: () => new Date().toISOString(),
    rng: (maxExclusive) => randomInt(maxExclusive),
    onCanary: (note, warning) => {
      if (note !== null) stdout.write(note);
      if (warning !== null) stderr.write(`organizer-codes: warning: ${warning}\n`);
    },
  };
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

async function runIssue(
  command: { pseudonym: string; clip: boolean },
  pepper: string,
): Promise<void> {
  const wordlist = readVerifiedWordlist(PROJECT_ROOT);
  if (!wordlist.ok) fail(wordlist.message);

  // The canary note/warning is printed by buildOpsDeps' onCanary, inside
  // issueCode, before any store work.
  const result = await issueCode(
    { ...buildOpsDeps(pepper), wordlist: wordlist.value },
    { pseudonym: command.pseudonym },
  );

  stdout.write(cli.formatIssueBanner(result.pseudonym, result.code));

  if (command.clip) {
    stdout.write(
      copyToClipboard(result.code)
        ? '  Copied to the clipboard.\n\n'
        : '  Could not reach a clipboard tool; copy it by hand.\n\n',
    );
  }
}

async function runRevoke(
  command: { pseudonym: string; digest: string | null; fold: cli.FoldMode },
  pepper: string,
): Promise<void> {
  // The canary note/warning is printed by buildOpsDeps' onCanary, inside
  // revokeCode — before the lookup and the writes, exactly like the old
  // inline enforceCanary, so it survives a mid-revoke failure.
  const result = await revokeCode(buildOpsDeps(pepper), {
    pseudonym: command.pseudonym,
    digest: command.digest,
  });

  if (result.kind === 'none') fail(cli.formatNoCodeFound(command.pseudonym));
  if (result.kind === 'many') {
    stderr.write(`organizer-codes: ${cli.formatAmbiguousRevoke(command.pseudonym, result.rows)}`);
    process.exit(1);
  }

  stdout.write(cli.formatRevokeSummary(command.pseudonym, result.digest, result.tombstoned));
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

async function runList(command: { json: boolean }, pepper: string): Promise<void> {
  const rows = await listCodes(buildOpsDeps(pepper));
  if (command.json) {
    stdout.write(cli.toListJson(rows));
    return;
  }
  // Whether /go/intake is configured — never the URL itself.
  const intake = await linksStore().get('intake', { type: 'text' });
  stdout.write(`${cli.formatListTable(rows)}\n`);
  stdout.write(cli.formatIntakeStatus(typeof intake === 'string' && intake.length > 0));
}

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
  // Both variables are read lazily by the store factories, and buildOpsDeps
  // only runs inside the subcommands below, so setting them here is correct.
  process.env.CONTEXT = 'production';

  if (command.name === 'issue') await runIssue(command, env.value.pepper);
  else if (command.name === 'revoke') await runRevoke(command, env.value.pepper);
  else if (command.name === 'set-intake') await runSetIntake(command);
  else await runList(command, env.value.pepper);
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

Notes for the implementer:

- `OpsError`s (canary refuse, collision, generate bug) intentionally propagate to the top-level catch, which prints `organizer-codes: <message>` and exits 1 — byte-identical to the old inline `fail(...)` calls.
- The `- never accept a code as a command-line argument` invariant is untouched: `parseCliArgs` still runs before anything else.
- Do NOT re-add `createHash`, `readFileSync`, or the `Store` type import — they moved to `organizer-ops.ts` with `readWordlist`/`listCodeRows`/`enforceCanary`.

- [ ] 2. Gates: `node node_modules/typescript/bin/tsc --noEmit` → exactly the 14 baseline errors. `npm run build` → exit 0. `npm test` → **33 files / 828 tests, 0 failures** (unchanged from Task 1 — this task adds no tests and must break none).
- [ ] 3. Manual check, no credentials needed (fails before any store access): run `npm run codes -- badarg drum yoga vivid clay` → stderr contains `refusing to run: an argument looks like an organizer code`, exit code 1. Then `npm run codes -- help` → prints the usage block, exit 0.
- [ ] 4. Manual check of the hard-fail-on-missing-secret path (Git Bash syntax): `ORGANIZER_CODE_PEPPER=' ' npm run codes -- list` → stderr contains `ORGANIZER_CODE_PEPPER is not set`, exit 1. (A single space defeats `.env` loading because `loadEnvFile` never overrides an already-set variable, and `parseEnv` trims.)
- [ ] 5. Commit:

```
git add scripts/organizer-codes.ts
git commit -m "refactor(codes): CLI delegates issue/list/revoke to organizer-ops" -m "Presentation only remains in the shell: banners, --clip, the fold
prompt, exit codes. Canary, wordlist checksum, collision check, and the
tombstone cascade now run in the shared, unit-tested ops module.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 — Host/CSRF guard `src/lib/codes-ui-guard.ts` (TDD)

Design §2 and the Testing section: two pure decision functions the server applies to every request (D5). `decideHost` is the **DNS-rebinding defense** (Sol critical finding): an exact, case-normalized Host allowlist — `127.0.0.1:<port>` and `localhost:<port>` only — checked before anything is served, page included; anything else (or a missing Host) is rejected and answered 421 by the server. Without it, a rebinding attacker who resolves an attacker-controlled hostname to 127.0.0.1 could load `/`, read the embedded token, and make requests the origin checks consider same-origin. `decideApiAuth` is the per-run-token + fetch-metadata CSRF check, accepting **both** loopback origins (safe once Host + token are enforced).

**Files:**

- Create `src/lib/codes-ui-guard.test.ts` (first)
- Create `src/lib/codes-ui-guard.ts`

**Steps:**

- [ ] 1. Write the failing test file `src/lib/codes-ui-guard.test.ts` exactly as follows (16 tests):

```ts
import { describe, it, expect } from 'vitest';
import { decideApiAuth, decideHost, loopbackHosts, loopbackOrigins } from './codes-ui-guard.js';

const TOKEN = 'a'.repeat(64);
const HOSTS = loopbackHosts(4919);
const ORIGINS = loopbackOrigins(4919);
const EXPECTED = { token: TOKEN, origins: ORIGINS };

describe('decideHost', () => {
  it('accepts 127.0.0.1 with the right port', () => {
    expect(decideHost(HOSTS, '127.0.0.1:4919')).toEqual({ ok: true, value: true });
  });

  it('accepts localhost with the right port, case-normalized', () => {
    expect(decideHost(HOSTS, 'localhost:4919')).toEqual({ ok: true, value: true });
    expect(decideHost(HOSTS, 'LocalHost:4919')).toEqual({ ok: true, value: true });
  });

  it('rejects a missing Host', () => {
    expect(decideHost(HOSTS, undefined)).toEqual({ ok: false, code: 'bad_host' });
    expect(decideHost(HOSTS, '')).toEqual({ ok: false, code: 'bad_host' });
  });

  it('rejects a foreign host even when it resolves to loopback (DNS rebinding)', () => {
    expect(decideHost(HOSTS, 'evil.example:4919')).toEqual({ ok: false, code: 'bad_host' });
    expect(decideHost(HOSTS, 'evil.example')).toEqual({ ok: false, code: 'bad_host' });
  });

  it('rejects a loopback host with the wrong port', () => {
    expect(decideHost(HOSTS, '127.0.0.1:9999')).toEqual({ ok: false, code: 'bad_host' });
    expect(decideHost(HOSTS, 'localhost')).toEqual({ ok: false, code: 'bad_host' });
  });
});

describe('decideApiAuth', () => {
  it('rejects a missing token', () => {
    expect(decideApiAuth(EXPECTED, { token: undefined, origin: undefined, secFetchSite: undefined }))
      .toEqual({ ok: false, code: 'missing_token' });
  });

  it('rejects an empty token', () => {
    expect(decideApiAuth(EXPECTED, { token: '', origin: undefined, secFetchSite: undefined }))
      .toEqual({ ok: false, code: 'missing_token' });
  });

  it('rejects a wrong token', () => {
    expect(decideApiAuth(EXPECTED, { token: 'b'.repeat(64), origin: undefined, secFetchSite: undefined }))
      .toEqual({ ok: false, code: 'bad_token' });
  });

  it('accepts a valid token with no Origin and no Sec-Fetch-Site (curl)', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: undefined, secFetchSite: undefined }))
      .toEqual({ ok: true, value: true });
  });

  it('accepts a valid token with the 127.0.0.1 origin', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: 'http://127.0.0.1:4919', secFetchSite: 'same-origin' }))
      .toEqual({ ok: true, value: true });
  });

  it('accepts a valid token with the localhost origin (both loopback origins are allowed)', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: 'http://localhost:4919', secFetchSite: 'same-origin' }))
      .toEqual({ ok: true, value: true });
  });

  it('rejects a cross-site Origin even with a valid token', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: 'https://evil.example', secFetchSite: undefined }))
      .toEqual({ ok: false, code: 'cross_site' });
  });

  it('rejects Sec-Fetch-Site cross-site even with a valid token', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: undefined, secFetchSite: 'cross-site' }))
      .toEqual({ ok: false, code: 'cross_site' });
  });

  it('rejects Sec-Fetch-Site same-site (a subdomain is still not this page)', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: undefined, secFetchSite: 'same-site' }))
      .toEqual({ ok: false, code: 'cross_site' });
  });

  it('accepts Sec-Fetch-Site none with a valid token (address-bar / curl-like)', () => {
    expect(decideApiAuth(EXPECTED, { token: TOKEN, origin: undefined, secFetchSite: 'none' }))
      .toEqual({ ok: true, value: true });
  });

  it('reports cross_site before any token verdict, so a foreign page learns nothing about the token', () => {
    expect(decideApiAuth(EXPECTED, { token: undefined, origin: 'https://evil.example', secFetchSite: 'cross-site' }))
      .toEqual({ ok: false, code: 'cross_site' });
  });
});
```

- [ ] 2. Run `npx vitest run src/lib/codes-ui-guard.test.ts` → fails with a module-resolution error for `./codes-ui-guard.js`.
- [ ] 3. Write `src/lib/codes-ui-guard.ts` exactly as follows:

```ts
/**
 * Pure request-authorization decisions for the codes-ui local server
 * (src/lib/codes-ui-server.ts).
 *
 * Two layers, both pure so the HTTP shell hands header values in and this is
 * unit tested without any server (design: Testing):
 *
 * 1. decideHost — an exact, case-normalized Host allowlist checked on EVERY
 *    request before anything is served, the page included. This is the
 *    DNS-rebinding defense: a rebinding attacker resolves their own hostname
 *    to 127.0.0.1; the browser then talks to this server with Host
 *    evil.example, an origin the Origin/Sec-Fetch-Site checks would treat as
 *    same-origin for requests made by the attacker's page. Refusing every
 *    Host outside the allowlist (421) means the token page is never served
 *    into a rebound origin in the first place.
 *
 * 2. decideApiAuth — the local-CSRF check on /api/*: a random per-run token
 *    embedded in the served page and required back as the X-Codes-Token
 *    header, plus rejection of cross-site Origin/Sec-Fetch-Site evidence.
 *    A cross-site page cannot read the served page (same-origin policy), so
 *    it can never present the token, and even a lucky guess is rejected by
 *    the fetch-metadata check first. BOTH loopback origins (127.0.0.1 and
 *    localhost) are accepted — safe once Host + token are enforced, and it
 *    removes the hand-typed-localhost footgun.
 */
import { ok, err, type Ok, type Err } from './text-result.js';

export type HostCode = 'bad_host';
export type GuardCode = 'missing_token' | 'bad_token' | 'cross_site';

/** The only Host values this server answers: both loopback names, exact port. */
export function loopbackHosts(port: number): readonly string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`];
}

/** The only Origins /api/* accepts when an Origin header is present. */
export function loopbackOrigins(port: number): readonly string[] {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

/** Exact allowlist match, case-normalized. Missing/empty Host is rejected. */
export function decideHost(
  allowedHosts: readonly string[],
  host: string | undefined,
): Ok<true> | Err<HostCode> {
  if (host === undefined || host.length === 0) return err('bad_host');
  return allowedHosts.includes(host.trim().toLowerCase()) ? ok(true) : err('bad_host');
}

export interface ApiRequestEvidence {
  /** X-Codes-Token header, if any. */
  token: string | undefined;
  /** Origin header, if any. Same-origin fetch POSTs carry the page's own origin. */
  origin: string | undefined;
  /** Sec-Fetch-Site header, if any. Browsers send it; curl does not. */
  secFetchSite: string | undefined;
}

/**
 * Cross-site evidence is checked BEFORE the token, so the rejection a foreign
 * page can observe never depends on whether its guessed token was right.
 * `none` (address bar, non-browser clients) passes the fetch-metadata check
 * and still needs the token; `same-site` does not pass — nothing else runs on
 * this host, so only `same-origin` or absent metadata is legitimate.
 */
export function decideApiAuth(
  expected: { token: string; origins: readonly string[] },
  request: ApiRequestEvidence,
): Ok<true> | Err<GuardCode> {
  const site = (request.secFetchSite ?? '').toLowerCase();
  if (site !== '' && site !== 'same-origin' && site !== 'none') return err('cross_site');
  if (request.origin !== undefined && !expected.origins.includes(request.origin)) {
    return err('cross_site');
  }
  if (request.token === undefined || request.token.length === 0) return err('missing_token');
  if (request.token !== expected.token) return err('bad_token');
  return ok(true);
}
```

(The token comparison is a plain `!==`: the token is a 256-bit per-run random value and the adversary in this threat model — a cross-site page — cannot time responses it is forbidden from making in the first place. Do not add a timing-safe compare; it would imply a threat that does not exist here.)

- [ ] 4. Run `npx vitest run src/lib/codes-ui-guard.test.ts` → **16 tests pass**.
- [ ] 5. Full gates: `npm test` → **34 files / 844 tests, 0 failures**; tsc → 14 baseline errors; `npm run build` → exit 0.
- [ ] 6. Commit:

```
git add src/lib/codes-ui-guard.ts src/lib/codes-ui-guard.test.ts
git commit -m "feat(codes-ui): Host allowlist + per-run-token CSRF guard (pure)" -m "decideHost is the DNS-rebinding defense (exact loopback Host allowlist,
421 on anything else, checked before serving a byte); decideApiAuth is
the per-run token + fetch-metadata check, accepting both loopback
origins now that Host and token are enforced.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 — Server: handler core + HTTP security tests + thin entry (TDD handler / manual entry)

Design §2. The request handler is a dependency-injected factory in `src/lib/codes-ui-server.ts`, driven TDD-style by **automated loopback HTTP tests** with injected fake ops — the security boundary is not left to manual curl. `scripts/codes-ui.ts` is the thin bootstrap entry (bundled + run like the CLI): `.env` → `parseEnv` (hard error on a missing secret) → `NETLIFY_BLOBS_CONTEXT` → `CONTEXT=production` → real ops wiring → `listen(port, '127.0.0.1')`. On every request the handler checks the Host allowlist first (421 — DNS-rebinding defense), then serves the page or applies the token + fetch-metadata guard to `/api/*`. The handler records each request's `onCanary` values and echoes them in **both success and error responses** (Sol round 2 — a store failure after the canary check must not swallow the note/warning). **No browser auto-open** (Sol finding: a spawned `cmd`/`open`/`xdg-open` child inherits the environment, which holds the pepper and Netlify credentials) — the entry prints the URL. The entry validates `CODES_UI_PORT` digits-only AND rejects 80/443 (browsers omit the scheme-default port from Host/Origin serialization, which would 421/403 everything against the exact allowlist). Ships with a stub page so the serving path is verifiable; Task 5 replaces the stub with the real UI.

**Files:**

- Create `src/lib/codes-ui-server.test.ts` (first)
- Create `src/lib/codes-ui-server.ts`
- Create `scripts/codes-ui.ts`
- Create `scripts/codes-ui.html` (stub — replaced in Task 5)

**Steps:**

- [ ] 1. Write the failing HTTP test file `src/lib/codes-ui-server.test.ts` exactly as follows (17 tests; it runs a real `node:http` server on an ephemeral loopback port — no jsdom, no mocks of the HTTP layer):

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from 'node:http';
import { MAX_BODY_BYTES, createRequestHandler } from './codes-ui-server.js';
import { OpsError } from './organizer-ops.js';

const TOKEN = 't'.repeat(64);
const PAGE =
  '<!doctype html><html><head><title>t</title></head>' +
  '<body><script nonce="__CSP_NONCE__">const TOKEN = "__CODES_UI_TOKEN__";</script></body></html>';

interface Call {
  op: 'issue' | 'list' | 'revoke';
  args: unknown[];
}

const calls: Call[] = [];
let server: Server;
let port: number;

beforeAll(async () => {
  // Listen on an ephemeral port first, then attach the handler built for
  // that port (the handler derives its Host/Origin allowlists from it).
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  port = address.port;

  server.on(
    'request',
    createRequestHandler({
      token: TOKEN,
      port,
      pageHtml: () => PAGE,
      log: () => undefined,
      ops: {
        issue: async (pseudonym, onCanary) => {
          calls.push({ op: 'issue', args: [pseudonym] });
          if (pseudonym === 'boom') {
            // Simulates a first-use canary write followed by a failing op:
            // the recorded canary must still reach the ERROR response.
            onCanary('first-use-note-stub', null);
            throw new OpsError(
              'collision',
              'the generated code collides with an existing code. Run issue again.',
            );
          }
          onCanary(null, null);
          return { pseudonym, code: 'stub-code-words-four' };
        },
        list: async () => {
          calls.push({ op: 'list', args: [] });
          return [
            {
              digest: 'a'.repeat(64),
              pseudonym: 'handle-jay',
              issuedAt: '2026-09-02T00:00:00.000Z',
              revoked: false,
            },
          ];
        },
        revoke: async (pseudonym, digest, onCanary) => {
          calls.push({ op: 'revoke', args: [pseudonym, digest] });
          onCanary('canary-note-stub', null);
          return { kind: 'ok', digest: digest ?? 'b'.repeat(64), pseudonym, tombstoned: 2 };
        },
      },
    }),
  );
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  calls.length = 0;
});

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * Raw http.request wrapper with full Host-header control (fetch/undici
 * forbids overriding Host). `host: null` omits the header entirely.
 */
function send(options: {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  host?: string | null;
}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.host !== null) headers.host = options.host ?? `127.0.0.1:${port}`;
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'GET',
        path: options.path,
        headers,
        setHost: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

describe('codes-ui request handler', () => {
  it('rejects an unexpected Host with 421 and never serves the token (DNS rebinding)', async () => {
    // The server's REAL port with a wrong hostname, so this isolates
    // hostname rejection (the wrong-port case is its own test below).
    const reply = await send({ path: '/', host: `evil.example:${port}` });
    expect(reply.status).toBe(421);
    expect(reply.body).not.toContain(TOKEN);
  });

  it('rejects a missing Host with 421', async () => {
    const reply = await send({ path: '/', host: null });
    expect(reply.status).toBe(421);
  });

  it('rejects a wrong-port loopback Host with 421 even with a valid token', async () => {
    const reply = await send({
      path: '/api/list',
      host: '127.0.0.1:1',
      headers: { 'x-codes-token': TOKEN },
    });
    expect(reply.status).toBe(421);
    expect(calls).toEqual([]);
  });

  it('serves the page for Host 127.0.0.1 with token and nonce substituted, CSP and no-store', async () => {
    const reply = await send({ path: '/' });
    expect(reply.status).toBe(200);
    expect(reply.body).toContain(TOKEN);
    expect(reply.body).not.toContain('__CODES_UI_TOKEN__');
    expect(reply.body).not.toContain('__CSP_NONCE__');
    expect(reply.headers['cache-control']).toBe('no-store');
    const csp = reply.headers['content-security-policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'nonce-[^']+'/);
  });

  it('serves the page for Host localhost (both loopback hosts allowed)', async () => {
    const reply = await send({ path: '/', host: `localhost:${port}` });
    expect(reply.status).toBe(200);
    expect(reply.body).toContain(TOKEN);
  });

  it('requires the token on all three /api routes', async () => {
    const list = await send({ path: '/api/list' });
    const issue = await send({
      method: 'POST',
      path: '/api/issue',
      body: '{"pseudonym":"handle-jay"}',
    });
    const revoke = await send({
      method: 'POST',
      path: '/api/revoke',
      body: '{"pseudonym":"handle-jay"}',
    });
    for (const reply of [list, issue, revoke]) {
      expect(reply.status).toBe(403);
      expect(JSON.parse(reply.body)).toEqual({ error: 'missing_token' });
    }
    expect(calls).toEqual([]);
  });

  it('rejects a wrong token with 403 bad_token', async () => {
    const reply = await send({ path: '/api/list', headers: { 'x-codes-token': 'nope' } });
    expect(reply.status).toBe(403);
    expect(JSON.parse(reply.body)).toEqual({ error: 'bad_token' });
    expect(calls).toEqual([]);
  });

  it('rejects a cross-site Origin with a valid token and never calls the ops', async () => {
    const reply = await send({
      method: 'POST',
      path: '/api/issue',
      headers: {
        'x-codes-token': TOKEN,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: '{"pseudonym":"handle-jay"}',
    });
    expect(reply.status).toBe(403);
    expect(JSON.parse(reply.body)).toEqual({ error: 'cross_site' });
    expect(calls).toEqual([]);
  });

  it('rejects Sec-Fetch-Site cross-site with a valid token', async () => {
    const reply = await send({
      path: '/api/list',
      headers: { 'x-codes-token': TOKEN, 'sec-fetch-site': 'cross-site' },
    });
    expect(reply.status).toBe(403);
    expect(JSON.parse(reply.body)).toEqual({ error: 'cross_site' });
  });

  it('accepts both loopback Origins', async () => {
    const viaIp = await send({
      path: '/api/list',
      headers: { 'x-codes-token': TOKEN, origin: `http://127.0.0.1:${port}` },
    });
    expect(viaIp.status).toBe(200);
    const viaLocalhost = await send({
      method: 'POST',
      path: '/api/issue',
      host: `localhost:${port}`,
      headers: {
        'x-codes-token': TOKEN,
        origin: `http://localhost:${port}`,
        'content-type': 'application/json',
      },
      body: '{"pseudonym":"handle-jay"}',
    });
    expect(viaLocalhost.status).toBe(200);
    expect(JSON.parse(viaLocalhost.body).code).toBe('stub-code-words-four');
    expect(calls.map((call) => call.op)).toEqual(['list', 'issue']);
  });

  it('answers OPTIONS with 404 and no CORS headers (no preflight approval, ever)', async () => {
    const reply = await send({
      method: 'OPTIONS',
      path: '/api/issue',
      headers: { 'x-codes-token': TOKEN },
    });
    expect(reply.status).toBe(404);
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    expect(reply.headers['access-control-allow-methods']).toBeUndefined();
    expect(reply.headers['access-control-allow-headers']).toBeUndefined();
  });

  it('refuses a code-shaped pseudonym with 400 and never calls the ops', async () => {
    const reply = await send({
      method: 'POST',
      path: '/api/issue',
      headers: { 'x-codes-token': TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ pseudonym: 'drum yoga vivid clay' }),
    });
    expect(reply.status).toBe(400);
    expect(JSON.parse(reply.body).error).toBe('looks_like_code');
    expect(calls).toEqual([]);
  });

  it('refuses an invalid pseudonym with 400 and never calls the ops', async () => {
    const reply = await send({
      method: 'POST',
      path: '/api/revoke',
      headers: { 'x-codes-token': TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ pseudonym: 'Bad Name' }),
    });
    expect(reply.status).toBe(400);
    expect(JSON.parse(reply.body).error).toBe('invalid_pseudonym');
    expect(calls).toEqual([]);
  });

  it('answers an oversized body with a delivered 413', async () => {
    const reply = await send({
      method: 'POST',
      path: '/api/issue',
      headers: { 'x-codes-token': TOKEN, 'content-type': 'application/json' },
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    });
    expect(reply.status).toBe(413);
    expect(JSON.parse(reply.body)).toEqual({ error: 'body_too_large' });
    expect(calls).toEqual([]);
  });

  it('answers a non-JSON body with 400 bad_json', async () => {
    const reply = await send({
      method: 'POST',
      path: '/api/revoke',
      headers: { 'x-codes-token': TOKEN, 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(reply.status).toBe(400);
    expect(JSON.parse(reply.body)).toEqual({ error: 'bad_json' });
  });

  it('returns the revoke contract fields and no-store on API responses', async () => {
    const reply = await send({
      method: 'POST',
      path: '/api/revoke',
      headers: { 'x-codes-token': TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ pseudonym: 'handle-jay', digest: 'b'.repeat(64) }),
    });
    expect(reply.status).toBe(200);
    expect(reply.headers['cache-control']).toBe('no-store');
    const payload = JSON.parse(reply.body);
    expect(payload.kind).toBe('ok');
    expect(payload.digest).toBe('b'.repeat(64));
    expect(payload.tombstoned).toBe(2);
    expect(payload.foldReminder).toContain('fold');
    // The recorded onCanary values are echoed on success...
    expect(payload.canaryNote).toBe('canary-note-stub');
    expect(payload.canaryWarning).toBeNull();
    expect(calls).toEqual([{ op: 'revoke', args: ['handle-jay', 'b'.repeat(64)] }]);
  });

  it('echoes the recorded canary values in the ERROR response when the op fails after the canary check', async () => {
    // ...and on failure: the 'boom' fake fires onCanary with a first-use
    // note, then throws. The 409 must still carry the note.
    const reply = await send({
      method: 'POST',
      path: '/api/issue',
      headers: { 'x-codes-token': TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ pseudonym: 'boom' }),
    });
    expect(reply.status).toBe(409);
    const payload = JSON.parse(reply.body);
    expect(payload.error).toBe('collision');
    expect(payload.canaryNote).toBe('first-use-note-stub');
    expect(payload.canaryWarning).toBeNull();
    expect(calls).toEqual([{ op: 'issue', args: ['boom'] }]);
  });
});
```

- [ ] 2. Run `npx vitest run src/lib/codes-ui-server.test.ts` → fails with a module-resolution error for `./codes-ui-server.js`.
- [ ] 3. Write `src/lib/codes-ui-server.ts` exactly as follows:

```ts
/**
 * The codes-ui request handler, as a dependency-injected factory so the
 * entire security boundary — Host allowlist, per-run token, fetch-metadata
 * checks, input refusals, headers — is exercised by automated loopback HTTP
 * tests with fake ops (codes-ui-server.test.ts). The thin entry
 * (scripts/codes-ui.ts) builds the real deps and listens.
 *
 * Order of decisions on every request:
 *   1. Host allowlist (decideHost) -> 421. Before ANYTHING is served, the
 *      page included: the DNS-rebinding defense (see codes-ui-guard.ts).
 *   2. GET /   -> the page, per-run token + per-request CSP nonce substituted.
 *   3. /api/*  -> decideApiAuth (token + Origin/Sec-Fetch-Site), then input
 *      validation (CLI-identical refusals), then the injected op.
 *
 * Invariants:
 *   - never write a plaintext code to a file; never log one (the log sink
 *     receives error messages only, and no message in this codebase carries
 *     code material)
 *   - no CORS headers, ever — a browser preflight never gets approval
 *   - Cache-Control: no-store on every response
 */
import { randomBytes } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';

import * as cli from './organizer-cli.js';
import {
  decideApiAuth,
  decideHost,
  loopbackHosts,
  loopbackOrigins,
} from './codes-ui-guard.js';
import { OpsError, type IssueResult, type RevokeResult } from './organizer-ops.js';
import { ContextRefusedError } from './blob-stores.js';

export const MAX_BODY_BYTES = 16 * 1024;
const DIGEST_RE = /^[0-9a-f]{64}$/;

/** A refusal an injected op may throw to control the HTTP mapping (e.g. a wordlist failure). */
export class UiRefusal extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'UiRefusal';
    this.status = status;
    this.code = code;
  }
}

export type OnCanary = (note: string | null, warning: string | null) => void;

/**
 * The injected ops. issue/revoke receive the handler's per-request onCanary
 * recorder and must pass it through to the ops module, which fires it before
 * any fallible store work — so the handler can echo the canary outcome in
 * BOTH success and error responses.
 */
export interface UiOps {
  issue: (pseudonym: string, onCanary: OnCanary) => Promise<IssueResult>;
  list: () => Promise<cli.ListRow[]>;
  revoke: (pseudonym: string, digest: string | null, onCanary: OnCanary) => Promise<RevokeResult>;
}

export interface UiServerConfig {
  /** The per-run token; the entry mints it with randomBytes(32).toString('hex'). */
  token: string;
  /** The real listening port; the Host/Origin allowlists derive from it. */
  port: number;
  /** Returns the raw page template (placeholders unsubstituted). Called per request. */
  pageHtml: () => string;
  ops: UiOps;
  /** Error sink: stderr in the entry, a collector (or no-op) in tests. */
  log: (line: string) => void;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Reject but keep consuming 'data' events (drain, never destroy):
        // destroying the socket here would kill the 413 before it reaches
        // the client.
        tooLarge = true;
        chunks.length = 0;
        reject(new Error('request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    req.on('error', reject);
  });
}

async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  // readBody stays OUTSIDE the try: its body-too-large rejection must reach
  // the route catch and become a 413, not collapse into bad_json.
  const raw = await readBody(req);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function servePage(config: UiServerConfig, res: ServerResponse): void {
  const nonce = randomBytes(16).toString('base64');
  const html = config
    .pageHtml()
    .replaceAll('__CODES_UI_TOKEN__', config.token)
    .replaceAll('__CSP_NONCE__', nonce);
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy':
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; ` +
      `connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; ` +
      `frame-ancestors 'none'`,
  });
  res.end(html);
}

/** Shared pseudonym gate: the CLI's exact refusals, as HTTP 400s. Returns null after responding. */
function checkPseudonym(res: ServerResponse, raw: unknown): string | null {
  const pseudonym = typeof raw === 'string' ? raw.trim() : '';
  if (cli.looksLikeCode(pseudonym)) {
    sendJson(res, 400, { error: 'looks_like_code', message: cli.CLI_ARG_MESSAGES.looks_like_code });
    return null;
  }
  if (!cli.isValidPseudonym(pseudonym)) {
    sendJson(res, 400, {
      error: 'invalid_pseudonym',
      message: cli.CLI_ARG_MESSAGES.invalid_pseudonym,
    });
    return null;
  }
  return pseudonym;
}

async function handleApi(
  config: UiServerConfig,
  origins: readonly string[],
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  canary: { note: string | null; warning: string | null },
  onCanary: OnCanary,
): Promise<void> {
  const auth = decideApiAuth(
    { token: config.token, origins },
    {
      token: headerValue(req, 'x-codes-token'),
      origin: headerValue(req, 'origin'),
      secFetchSite: headerValue(req, 'sec-fetch-site'),
    },
  );
  if (!auth.ok) {
    sendJson(res, 403, { error: auth.code });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/list') {
    // ListRow is already an explicit projection (digest, pseudonym, issuedAt,
    // revoked) — no codes exist to leak, and the intake URL is not read here.
    sendJson(res, 200, { rows: await config.ops.list() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/issue') {
    const body = await parseJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { error: 'bad_json' });
      return;
    }
    const pseudonym = checkPseudonym(res, body.pseudonym);
    if (pseudonym === null) return;
    const result = await config.ops.issue(pseudonym, onCanary);
    // The one place the plaintext code crosses HTTP: a loopback response to
    // the page that asked. Not logged, not stored.
    sendJson(res, 200, {
      pseudonym: result.pseudonym,
      code: result.code,
      canaryNote: canary.note,
      canaryWarning: canary.warning,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/revoke') {
    const body = await parseJsonBody(req);
    if (body === null) {
      sendJson(res, 400, { error: 'bad_json' });
      return;
    }
    const pseudonym = checkPseudonym(res, body.pseudonym);
    if (pseudonym === null) return;
    const digest = typeof body.digest === 'string' ? body.digest : null;
    if (digest !== null && !DIGEST_RE.test(digest)) {
      sendJson(res, 400, { error: 'invalid_digest', message: cli.CLI_ARG_MESSAGES.invalid_digest });
      return;
    }
    const result = await config.ops.revoke(pseudonym, digest, onCanary);
    if (result.kind === 'none') {
      sendJson(res, 404, {
        kind: 'none',
        canaryNote: canary.note,
        canaryWarning: canary.warning,
      });
      return;
    }
    if (result.kind === 'many') {
      sendJson(res, 409, {
        kind: 'many',
        rows: result.rows,
        canaryNote: canary.note,
        canaryWarning: canary.warning,
      });
      return;
    }
    sendJson(res, 200, {
      kind: 'ok',
      digest: result.digest,
      pseudonym: result.pseudonym,
      tombstoned: result.tombstoned,
      canaryNote: canary.note,
      canaryWarning: canary.warning,
      // The fold is surfaced, never run silently (design §3): the page shows
      // this reminder; triggering stays with the CLI / `gh workflow run`.
      foldReminder: cli.formatFoldReminder(),
    });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

async function handle(
  config: UiServerConfig,
  hosts: readonly string[],
  origins: readonly string[],
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Per-request canary record. The ops fire onCanary BEFORE any fallible
  // store work, so these values are set even when the op then throws — and
  // the catch below echoes them, so a mid-operation failure cannot swallow
  // the canary signal (Sol round 2).
  const canary: { note: string | null; warning: string | null } = { note: null, warning: null };
  const onCanary: OnCanary = (note, warning) => {
    canary.note = note;
    canary.warning = warning;
  };
  try {
    // Host allowlist FIRST: nothing — not even the page — is served to an
    // unexpected or missing Host. 421 Misdirected Request.
    const host = decideHost(hosts, headerValue(req, 'host'));
    if (!host.ok) {
      sendJson(res, 421, { error: 'bad_host' });
      return;
    }

    const pathname = new URL(req.url ?? '/', `http://${hosts[0]}`).pathname;
    if (req.method === 'GET' && pathname === '/') {
      servePage(config, res);
      return;
    }
    if (pathname.startsWith('/api/')) {
      await handleApi(config, origins, req, res, pathname, canary, onCanary);
      return;
    }
    sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    if (error instanceof UiRefusal) {
      sendJson(res, error.status, {
        error: error.code,
        message: error.message,
        canaryNote: canary.note,
        canaryWarning: canary.warning,
      });
      return;
    }
    if (error instanceof OpsError) {
      sendJson(res, error.code === 'generate_bug' ? 500 : 409, {
        error: error.code,
        message: error.message,
        canaryNote: canary.note,
        canaryWarning: canary.warning,
      });
      return;
    }
    if (error instanceof ContextRefusedError) {
      sendJson(res, 500, {
        error: 'context_refused',
        message:
          `${error.message} codes-ui sets CONTEXT=production before any store factory — ` +
          'if you are seeing this, that ordering broke.',
        canaryNote: canary.note,
        canaryWarning: canary.warning,
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'request body too large') {
      sendJson(res, 413, { error: 'body_too_large' }, { connection: 'close' });
      return;
    }
    // Never echo unexpected internals to the page; log the message (messages
    // in this codebase never contain code material) and return a generic 500.
    config.log(`codes-ui: request failed: ${message}\n`);
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'internal',
        canaryNote: canary.note,
        canaryWarning: canary.warning,
      });
    }
  }
}

export function createRequestHandler(
  config: UiServerConfig,
): (req: IncomingMessage, res: ServerResponse) => void {
  const hosts = loopbackHosts(config.port);
  const origins = loopbackOrigins(config.port);
  return (req, res) => {
    void handle(config, hosts, origins, req, res);
  };
}
```

- [ ] 4. Run `npx vitest run src/lib/codes-ui-server.test.ts` → **17 tests pass, 0 failures**.
- [ ] 5. Write the thin entry `scripts/codes-ui.ts` exactly as follows:

```ts
#!/usr/bin/env node
/**
 * Organizer codes — local admin UI: the thin bootstrap entry.
 *
 *   npm run codes:ui
 *
 * All request handling lives in src/lib/codes-ui-server.ts (exercised by
 * automated loopback HTTP tests with fake ops); the shared credential core
 * lives in src/lib/organizer-ops.ts. This entry only: loads .env, validates
 * it (a missing secret is a hard error — no dry run, no local fallback), sets
 * NETLIFY_BLOBS_CONTEXT and CONTEXT=production, wires the real ops, binds
 * 127.0.0.1, and prints the URL.
 *
 * It deliberately does NOT open the browser: a spawned cmd/open/xdg-open
 * child would inherit this process's environment, which holds
 * ORGANIZER_CODE_PEPPER and the Netlify credentials. Click the printed URL.
 *
 * Bundled and run by esbuild exactly like `npm run codes`; bare `node` on
 * this file does not resolve './x.js' imports. Repo paths resolve from
 * process.cwd(), which npm sets to the repo root.
 *
 * Like the CLI, this writes to the PRODUCTION Netlify Blobs stores.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { stderr, stdout } from 'node:process';

import * as cli from '../src/lib/organizer-cli.js';
import {
  UiRefusal,
  createRequestHandler,
  type OnCanary,
} from '../src/lib/codes-ui-server.js';
import {
  issueCode,
  listCodes,
  readVerifiedWordlist,
  revokeCode,
  type OpsDeps,
} from '../src/lib/organizer-ops.js';
import { codesStore, eventsStore, metaStore } from '../src/lib/blob-stores.js';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = join(PROJECT_ROOT, '.env');
const PAGE_FILE = join(PROJECT_ROOT, 'scripts', 'codes-ui.html');

function fail(message: string): never {
  stderr.write(`codes-ui: ${message}\n`);
  process.exit(1);
}

/**
 * Store factories run per request — strictly after main()'s bootstrap below.
 * The handler's per-request onCanary recorder is passed straight through so
 * the canary outcome reaches the HTTP response even when the op then fails.
 */
function buildOpsDeps(pepper: string, onCanary: OnCanary): OpsDeps {
  return {
    codes: codesStore(),
    events: eventsStore(),
    meta: metaStore(),
    pepper,
    now: () => new Date().toISOString(),
    rng: (maxExclusive) => randomInt(maxExclusive),
    onCanary,
  };
}

function main(): void {
  // Same .env handling as the CLI: loadEnvFile never overrides an already-set
  // variable, which keeps `FOO= npm run codes:ui` meaningful.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

  const env = cli.parseEnv(process.env);
  if (!env.ok) fail(cli.ENV_MESSAGES[env.code]);
  const pepper = env.value.pepper;

  process.env.NETLIFY_BLOBS_CONTEXT = cli.buildBlobsContext(env.value);

  // The same deliberate, single, visible opt-in as the CLI: blob-stores.ts
  // refuses every write unless CONTEXT === 'production'. Set BEFORE any store
  // factory can run — buildOpsDeps executes only inside request handlers,
  // which run only after listen() below.
  process.env.CONTEXT = 'production';

  // Digits-only, then range: Number.parseInt('4919junk', 10) returns 4919
  // and would silently accept a mangled value.
  const rawPort = process.env.CODES_UI_PORT ?? '4919';
  if (!/^[0-9]{1,5}$/.test(rawPort)) fail('CODES_UI_PORT must be digits only (1-65535)');
  const port = Number(rawPort);
  if (port < 1 || port > 65535) fail('CODES_UI_PORT must be a port number (1-65535)');
  // Scheme-default ports break the exact Host/Origin allowlist: browsers
  // serialize http://127.0.0.1:80 as Host "127.0.0.1" (no :80), which the
  // allowlist's ":<port>" form would 421. A local dev tool has no business
  // on 80/443 anyway — refuse loudly instead of failing mysteriously.
  if (port === 80 || port === 443) {
    fail('CODES_UI_PORT must not be 80 or 443: browsers omit the default port from Host/Origin, which the loopback allowlist requires. Pick a non-default port (default 4919).');
  }

  if (!existsSync(PAGE_FILE)) {
    fail(`missing ${PAGE_FILE} — the UI page ships next to this script`);
  }

  const handler = createRequestHandler({
    token: randomBytes(32).toString('hex'),
    port,
    // Re-read per request: the file is tiny, and edits show up on refresh.
    pageHtml: () => readFileSync(PAGE_FILE, 'utf-8'),
    log: (line) => stderr.write(line),
    ops: {
      issue: async (pseudonym, onCanary) => {
        const wordlist = readVerifiedWordlist(PROJECT_ROOT);
        if (!wordlist.ok) throw new UiRefusal(500, 'wordlist', wordlist.message);
        return issueCode(
          { ...buildOpsDeps(pepper, onCanary), wordlist: wordlist.value },
          { pseudonym },
        );
      },
      // list never runs the canary; a no-op recorder satisfies OpsDeps.
      list: async () => listCodes(buildOpsDeps(pepper, () => undefined)),
      revoke: async (pseudonym, digest, onCanary) =>
        revokeCode(buildOpsDeps(pepper, onCanary), { pseudonym, digest }),
    },
  });

  const server = createServer(handler);
  server.on('error', (error: NodeJS.ErrnoException) => {
    fail(
      error.code === 'EADDRINUSE'
        ? `port ${port} is already in use. Stop the other codes-ui, or set CODES_UI_PORT.`
        : error.message,
    );
  });
  // 127.0.0.1 ONLY. Never '0.0.0.0', never '::', never a hostname.
  server.listen(port, '127.0.0.1', () => {
    stdout.write(`organizer codes admin UI: http://127.0.0.1:${port}\n`);
    stdout.write('Bound to 127.0.0.1 only. Writes go to the PRODUCTION Blobs stores.\n');
    stdout.write('Open the URL above yourself (nothing is auto-launched). Ctrl+C stops the server.\n');
  });
}

main();
```

- [ ] 6. Write the stub `scripts/codes-ui.html` (Task 5 replaces this file entirely):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Organizer codes — local admin</title>
</head>
<body>
<p>codes-ui stub page — replaced by the real UI in the next task.</p>
<p id="token-check"></p>
<script nonce="__CSP_NONCE__">
  const TOKEN = '__CODES_UI_TOKEN__';
  document.getElementById('token-check').textContent =
    'token wired: ' + (TOKEN.length === 64 ? 'yes' : 'NO — substitution broken');
</script>
</body>
</html>
```

Notes for the implementer:

- The maintainer can browse via `http://127.0.0.1:4919` (canonical, printed) or `http://localhost:4919` — both loopback Hosts and Origins are allowed now that the Host allowlist and token are enforced. Anything else — including a DNS-rebound hostname pointing at 127.0.0.1 — gets 421 before a single byte of the page.
- The `many` revoke outcome is unreachable from the shipped page (it always sends a digest) but the endpoint still handles it — the API contract stands on its own.
- Do NOT add any `spawn`/`exec` call to this entry — no child process may inherit the env (it holds the pepper and Netlify credentials). Task 7 greps for this.

- [ ] 7. Gates: tsc → 14 baseline errors; `npm run build` → exit 0; `npm test` → **35 files / 861 tests, 0 failures**.
- [ ] 8. Manual verification — startup only; the security boundary is covered by the automated tests above. **No production writes.** If this worktree has no `.env`, create a throwaway one with dummy values (`ORGANIZER_CODE_PEPPER=dummy`, `NETLIFY_AUTH_TOKEN=dummy`, `NETLIFY_SITE_ID=dummy`): the server boots fine because store factories are lazy. Bundle and run (the `codes:ui` npm script arrives in Task 6):

```
npx esbuild scripts/codes-ui.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/codes-ui.mjs
node node_modules/.cache/codes-ui.mjs
```

  Expect exactly the three startup lines and **no browser window opening**. Then, from a second terminal (Git Bash):

```
# loopback binding only — expect 127.0.0.1:4919 LISTENING and NO 0.0.0.0/[::] rows
netstat -ano | grep 4919

# page serves with placeholders substituted (expect 200, then 0)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4919/
curl -s http://127.0.0.1:4919/ | grep -c __CODES_UI_TOKEN__

# Host allowlist spot-check (expect 421) and one guard spot-check (expect 403)
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: evil.example" http://127.0.0.1:4919/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4919/api/list
```

  Also verify the hard-error path: stop the server and run `ORGANIZER_CODE_PEPPER=' ' node node_modules/.cache/codes-ui.mjs` → `codes-ui: ORGANIZER_CODE_PEPPER is not set...`, exit 1. And the port validation: `CODES_UI_PORT=4919junk node node_modules/.cache/codes-ui.mjs` → `codes-ui: CODES_UI_PORT must be digits only (1-65535)`, exit 1; `CODES_UI_PORT=80 node node_modules/.cache/codes-ui.mjs` → `codes-ui: CODES_UI_PORT must not be 80 or 443...`, exit 1. **Do NOT POST a valid pseudonym to /api/issue or /api/revoke** — with real credentials that would write production. Delete the throwaway `.env` if you created one.
- [ ] 9. Commit:

```
git add src/lib/codes-ui-server.ts src/lib/codes-ui-server.test.ts scripts/codes-ui.ts scripts/codes-ui.html
git commit -m "feat(codes-ui): loopback admin server - injectable handler + HTTP tests" -m "createRequestHandler enforces the Host allowlist (421, DNS-rebinding
defense) before serving anything, then the per-run token + fetch-metadata
guard on /api/*, with CLI-equal pseudonym refusals; it records onCanary
per request and echoes the canary outcome in success AND error responses.
Automated loopback HTTP tests with fake ops cover the whole boundary.
The thin entry binds 127.0.0.1, sets CONTEXT=production before any store
factory, validates the port (digits-only, never 80/443), and prints the
URL - no browser auto-open (env-inheriting child). Ships a stub page;
the real UI lands next.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 — The page `scripts/codes-ui.html` (manual-verify)

Design §3 and D7. One self-contained HTML file, deflock dark theme (tokens from `docs/plans/assets/deflock-ui-kit.html`, system font stacks — zero external requests, satisfying the server's CSP). Three areas: Issue (code shown once + Copy + warning), Existing codes (table, never the codes), Revoke (per-row **`window.confirm` dialog that names the pseudonym and states its events will be tombstoned** — a second deliberate action, not a re-click a double-click could defeat) → tombstone count + fold reminder. Revoked rows keep a **Retry takedown** action (re-runs the revoke by digest, completing tombstones an interrupted cascade left behind — backed by `revokeCode`'s idempotency). Every `/api` call sends the token header. API error messages append any canary note/warning the server echoed (Sol round 2), so a failed issue/revoke still surfaces the pepper-canary signal. All dynamic rendering uses `createElement`/`textContent` — a stored pseudonym is store data, not trusted markup.

**Page invariants — plaintext lifecycle:** the code lives only in the `#issued-code` text node. It is cleared on Dismiss, on re-issue, and on navigation: a `pagehide` handler calls the dismiss path, and a bfcache `pageshow` restore (`event.persisted`) clears defensively — `Cache-Control: no-store` does NOT prevent bfcache in current Chrome. Documented, deliberately unavoidable residues (do not pretend otherwise in any copy): the fetch response object, DevTools memory, the DOM while the box is shown, and the clipboard after Copy — OS clipboard history/sync may retain it. No `innerHTML` with dynamic data anywhere; no `console.log` of response bodies; no storage APIs (`localStorage`/`sessionStorage`/cookies).

**Files:**

- Replace `scripts/codes-ui.html` (the Task 4 stub) entirely

**Steps:**

- [ ] 1. Replace `scripts/codes-ui.html` with:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Organizer codes — local admin</title>
<style>
  :root {
    --b3:#0d0d0d; --b2:#1a1a1a; --b1:#171717; --bc:#e8e8e8; --muted:#9ca3af;
    --primary:#dc2626; --primary-h:#b91c1c; --pc:#ffffff;
    --amber:#fbbf24; --success:#16a34a; --error:#dc2626;
    --bord:rgba(255,255,255,0.10); --bord-strong:rgba(255,255,255,0.22);
    --neutral:#262626;
    --ff-ui:ui-sans-serif, system-ui, "Segoe UI", sans-serif;
    --ff-mono:ui-monospace, "Cascadia Mono", "SFMono-Regular", Menlo, monospace;
    --r-field:0.3rem; --r-box:0.45rem;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--b3); color:var(--bc); font-family:var(--ff-ui);
    font-size:15px; line-height:1.5; -webkit-font-smoothing:antialiased;
  }
  :focus-visible { outline:2px solid var(--amber); outline-offset:2px; }
  .page { max-width:880px; margin:0 auto; padding:clamp(1rem,4vw,2.25rem);
    display:flex; flex-direction:column; gap:1.15rem; }
  .label-mono { font-family:var(--ff-mono); text-transform:uppercase;
    letter-spacing:0.14em; font-size:0.68rem; font-weight:500; color:var(--muted); }
  .masthead { background:var(--b2); border:1px solid var(--bord);
    border-radius:var(--r-box); padding:0.85rem 1.1rem;
    display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
  .masthead h1 { margin:0; font-size:1.05rem; font-weight:600; letter-spacing:0.01em; }
  .badge-prod { font-family:var(--ff-mono); font-size:0.68rem; letter-spacing:0.1em;
    color:var(--amber); border:1px solid var(--amber); border-radius:var(--r-field);
    padding:0.2rem 0.55rem; }
  .card { background:var(--b1); border:1px solid var(--bord); border-radius:var(--r-box);
    padding:1.1rem 1.2rem; display:flex; flex-direction:column; gap:0.8rem; }
  .row { display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; }
  input[type=text] {
    background:var(--b2); color:var(--bc); border:1px solid var(--bord-strong);
    border-radius:var(--r-field); padding:0.5rem 0.7rem; font-family:var(--ff-mono);
    font-size:0.95rem; min-width:16rem; flex:1;
  }
  input[type=text]::placeholder { color:var(--muted); }
  button {
    font-family:var(--ff-ui); font-size:0.9rem; font-weight:600;
    border-radius:var(--r-field); border:1px solid transparent;
    padding:0.5rem 1rem; cursor:pointer;
  }
  .btn-primary { background:var(--primary); color:var(--pc); }
  .btn-primary:hover { background:var(--primary-h); }
  .btn-neutral { background:var(--neutral); color:var(--bc); border-color:var(--bord-strong); }
  .btn-neutral:hover { border-color:var(--bc); }
  .btn-danger { background:transparent; color:var(--error); border-color:var(--error); }
  .btn-danger:hover { background:var(--primary); color:var(--pc); }
  .hint { margin:0; color:var(--muted); font-size:0.82rem; }
  .code-box { display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;
    background:var(--b2); border:1px solid var(--amber); border-radius:var(--r-box);
    padding:0.9rem 1rem; }
  .code-text { font-family:var(--ff-mono); font-size:1.25rem; letter-spacing:0.03em;
    color:var(--amber); word-break:break-all; flex:1; }
  .warn { margin:0; color:var(--amber); font-size:0.82rem; }
  table { width:100%; border-collapse:collapse; font-size:0.9rem; }
  th { text-align:left; padding:0.45rem 0.6rem; border-bottom:1px solid var(--bord-strong); }
  th .label-mono { font-size:0.62rem; }
  td { padding:0.45rem 0.6rem; border-bottom:1px solid var(--bord); }
  td.mono { font-family:var(--ff-mono); }
  .state-active { color:var(--success); font-family:var(--ff-mono); font-size:0.78rem;
    text-transform:uppercase; letter-spacing:0.08em; }
  .state-revoked { color:var(--muted); font-family:var(--ff-mono); font-size:0.78rem;
    text-transform:uppercase; letter-spacing:0.08em; }
  .status { margin:0; min-height:1.4em; font-size:0.86rem; }
  .status.err { color:var(--error); }
  .status.ok { color:var(--success); }
  .status.note { color:var(--amber); }
  .revoke-note { white-space:pre-wrap; font-size:0.82rem; color:var(--muted);
    font-family:var(--ff-mono); margin:0; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<div class="page">
  <header class="masthead">
    <div>
      <p class="label-mono">DeflockSC · organizer codes</p>
      <h1>Local admin</h1>
    </div>
    <span class="badge-prod">LOCAL TOOL · WRITES PRODUCTION</span>
  </header>

  <section class="card" aria-labelledby="issue-h">
    <h2 id="issue-h" class="label-mono">Issue a code</h2>
    <form id="issue-form" class="row">
      <input type="text" id="pseudonym" name="pseudonym" autocomplete="off"
        spellcheck="false" placeholder="pseudonym, e.g. handle-jay" aria-label="Pseudonym">
      <button type="submit" class="btn-primary" id="issue-btn">Issue code</button>
    </form>
    <p class="hint">2&ndash;40 chars, lowercase a-z and 0-9, at most three hyphen-separated
      segments. Never a real name. Codes are never typed here &mdash; only pseudonyms.</p>
    <div id="issue-result" hidden>
      <div class="code-box">
        <span class="code-text" id="issued-code"></span>
        <button type="button" class="btn-neutral" id="copy-btn">Copy</button>
        <button type="button" class="btn-neutral" id="dismiss-btn">Dismiss</button>
      </div>
      <p class="warn">This is the only time it is shown. It is not stored, not logged, and
        cannot be recovered &mdash; only revoked and reissued. Hand it over out of band.</p>
    </div>
    <p id="issue-status" class="status" role="status"></p>
  </section>

  <section class="card" aria-labelledby="list-h">
    <h2 id="list-h" class="label-mono">Existing codes</h2>
    <table>
      <thead>
        <tr>
          <th><span class="label-mono">Pseudonym</span></th>
          <th><span class="label-mono">Issued</span></th>
          <th><span class="label-mono">State</span></th>
          <th></th>
        </tr>
      </thead>
      <tbody id="codes-tbody"></tbody>
    </table>
    <p id="list-status" class="status" role="status"></p>
    <p id="revoke-note" class="revoke-note" hidden></p>
  </section>
</div>

<script nonce="__CSP_NONCE__">
(() => {
  'use strict';
  const TOKEN = '__CODES_UI_TOKEN__';

  const el = (id) => document.getElementById(id);
  const issueForm = el('issue-form');
  const pseudonymInput = el('pseudonym');
  const issueResult = el('issue-result');
  const issuedCode = el('issued-code');
  const issueStatus = el('issue-status');
  const listStatus = el('list-status');
  const revokeNote = el('revoke-note');
  const tbody = el('codes-tbody');

  function setStatus(node, kind, text) {
    node.className = 'status' + (kind ? ' ' + kind : '');
    node.textContent = text;
  }

  async function api(path, body) {
    const options = { method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Codes-Token': TOKEN } };
    if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(path, options);
    let payload = null;
    try { payload = await res.json(); } catch { /* non-JSON error body */ }
    if (!res.ok) {
      const detail = payload && (payload.message || payload.error || payload.kind);
      let text = detail ? String(detail) : 'request failed (' + res.status + ')';
      // The server echoes the recorded canary outcome on error responses too
      // (it fires before the fallible store work) - a failed operation must
      // still surface the pepper-canary signal.
      if (payload && payload.canaryWarning) text += ' | WARNING: ' + payload.canaryWarning;
      if (payload && payload.canaryNote) text += ' | ' + payload.canaryNote;
      throw new Error(text);
    }
    return payload;
  }

  function dismissCode() {
    // The only copy of the plaintext code is this text node. Clear it.
    issuedCode.textContent = '';
    issueResult.hidden = true;
  }

  el('dismiss-btn').addEventListener('click', dismissCode);

  // Clear the code on navigation, not only on Dismiss/re-issue...
  window.addEventListener('pagehide', dismissCode);
  // ...and on a bfcache restore: Cache-Control no-store does NOT prevent
  // bfcache in current Chrome, so back/forward could resurrect the DOM.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) dismissCode();
  });

  el('copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(issuedCode.textContent);
      setStatus(issueStatus, 'ok', 'Copied. Paste it somewhere safe, then dismiss.');
    } catch {
      setStatus(issueStatus, 'err', 'Clipboard blocked - select the code and copy by hand.');
    }
  });

  issueForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    dismissCode();
    setStatus(issueStatus, '', 'Issuing...');
    try {
      const result = await api('/api/issue', { pseudonym: pseudonymInput.value.trim() });
      issuedCode.textContent = result.code;
      issueResult.hidden = false;
      pseudonymInput.value = '';
      setStatus(issueStatus, result.canaryNote ? 'note' : 'ok',
        result.canaryNote || 'Issued to ' + result.pseudonym + '.');
      await refreshList();
    } catch (error) {
      setStatus(issueStatus, 'err', error.message);
    }
  });

  function actionButton(row) {
    const retry = row.revoked;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = retry ? 'btn-neutral' : 'btn-danger';
    button.textContent = retry ? 'Retry takedown' : 'Revoke';
    button.addEventListener('click', async () => {
      // A real confirmation that NAMES the target and states the
      // consequence - a second deliberate action in a separate control,
      // not a re-click of the same button (a double-click would defeat
      // an arm-then-confirm button).
      const message = retry
        ? 'Re-run the takedown sweep for "' + row.pseudonym + '"?\n\n'
          + 'Any of its events not yet tombstoned will be tombstoned now.'
        : 'Revoke the code for "' + row.pseudonym + '"?\n\n'
          + 'Every event it published will be tombstoned. This cannot be undone.';
      if (!window.confirm(message)) return;
      button.disabled = true;
      button.textContent = retry ? 'Sweeping...' : 'Revoking...';
      revokeNote.hidden = true;
      try {
        // The row's digest makes the target unambiguous - the server's
        // "many" outcome is unreachable from here. For revoked rows this
        // re-runs the idempotent sweep (recovery for an interrupted cascade).
        const result = await api('/api/revoke', { pseudonym: row.pseudonym, digest: row.digest });
        const notes = [];
        if (result.foldReminder) notes.push(result.foldReminder);
        if (result.canaryNote) notes.push(result.canaryNote);
        if (result.canaryWarning) notes.push('WARNING: ' + result.canaryWarning);
        setStatus(listStatus, 'ok',
          (retry ? 'Takedown re-run for ' : 'Revoked ') + result.pseudonym
          + '. Tombstoned ' + result.tombstoned + ' event(s).');
        revokeNote.textContent = notes.join('\n');
        revokeNote.hidden = revokeNote.textContent === '';
        await refreshList();
      } catch (error) {
        setStatus(listStatus, 'err', error.message);
        button.disabled = false;
        button.textContent = retry ? 'Retry takedown' : 'Revoke';
      }
    });
    return button;
  }

  function renderRows(rows) {
    tbody.replaceChildren();
    const sorted = [...rows].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
    for (const row of sorted) {
      const tr = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.className = 'mono';
      nameCell.textContent = row.pseudonym;   // textContent: store data, not markup
      tr.append(nameCell);

      const dateCell = document.createElement('td');
      dateCell.className = 'mono';
      dateCell.textContent = String(row.issuedAt).slice(0, 10);
      tr.append(dateCell);

      const stateCell = document.createElement('td');
      const state = document.createElement('span');
      state.className = row.revoked ? 'state-revoked' : 'state-active';
      state.textContent = row.revoked ? 'revoked' : 'active';
      stateCell.append(state);
      tr.append(stateCell);

      const actionCell = document.createElement('td');
      // Active rows get Revoke; revoked rows get Retry takedown (recovery).
      actionCell.append(actionButton(row));
      tr.append(actionCell);

      tbody.append(tr);
    }
    if (sorted.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No codes issued.';
      tr.append(td);
      tbody.append(tr);
    }
  }

  async function refreshList() {
    try {
      const payload = await api('/api/list');
      renderRows(payload.rows);
      setStatus(listStatus, '', '');
    } catch (error) {
      setStatus(listStatus, 'err', 'Could not load the code list: ' + error.message);
    }
  }

  void refreshList();
})();
</script>
</body>
</html>
```

- [ ] 2. Gates: tsc → 14 baseline errors; `npm run build` → exit 0; `npm test` → 35 files / 861 tests. (The HTML file is outside all three pipelines; the gates confirm nothing else drifted.)
- [ ] 3. Manual verification — rebundle + run as in Task 4 step 8, open `http://127.0.0.1:4919/`, and check:
  - Dark deflock-styled page renders: masthead with the `LOCAL TOOL · WRITES PRODUCTION` badge, Issue card, Existing codes card. No requests to any non-loopback host in the browser Network tab; no CSP violations in the console.
  - With a dummy `.env`, the table shows `Could not load the code list: ...` — correct: dummy credentials cannot read the store, and the failure is contained to the status line.
  - Type `drum yoga vivid clay` and submit → the server's `looks_like_code` refusal text appears in the issue status line (this exercises fetch + token + error path end-to-end with zero store access). Then `Handle!` → the invalid-pseudonym message.
  - `http://localhost:4919/` also loads and behaves identically (both loopback hosts/origins allowed).
  - The revoke/confirm and bfcache-clearing flows cannot be exercised without production data — do not attempt them; Task 1's tests own the cascade logic, and the maintainer walkthrough in Task 7 covers the live checks (confirm dialog names the pseudonym; back/forward shows no code).
- [ ] 4. Commit:

```
git add scripts/codes-ui.html
git commit -m "feat(codes-ui): admin page - issue once-shown code, list, named-confirm revoke" -m "Deflock dark theme, textContent-only rendering, token header on every
call. The code lives in one DOM node and is cleared on dismiss, re-issue,
pagehide, and bfcache restore. Revoke uses a window.confirm naming the
pseudonym; revoked rows expose Retry takedown (idempotent sweep). Fold
surfaced as a reminder note after revoke.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6 — `codes:ui` script + remote-access deferral README note (manual-verify)

Design §4 and §5. The npm script mirrors `codes` exactly (esbuild bundle out of `node_modules/.cache`, then run). The README gains a maintainer section documenting the tool and an **honest remote-access deferral** — Sol's review established that the previously drafted `tailscale serve` recipe does not work against the loopback Host/Origin guard (a MagicDNS-origin POST can never carry a loopback Origin → 403; the MagicDNS Host → 421) and that "Tailscale supplies identity" is overstated when the app never checks Serve's identity headers. The README must not ship POST-breaking or security-overstating instructions.

**Files:**

- Modify `package.json`
- Modify `README.md`

**Steps:**

- [ ] 1. In `package.json`, add one line to `"scripts"`, directly below the existing `"codes"` entry:

```json
    "codes:ui": "esbuild scripts/codes-ui.ts --bundle --platform=node --format=esm --packages=external --outfile=node_modules/.cache/codes-ui.mjs && node node_modules/.cache/codes-ui.mjs",
```

  (Byte-for-byte the `codes` pattern with the filenames swapped. esbuild is already available transitively; do not add it as a dependency.)

- [ ] 2. In `README.md`, insert the following section between `## Quick Start` and `## Adapting for Your State`:

````markdown
## Organizer Codes Admin (maintainers only)

Organizer codes gate event submissions on `/events/submit`. Two local tools manage
them, both requiring `ORGANIZER_CODE_PEPPER`, `NETLIFY_AUTH_TOKEN`, and
`NETLIFY_SITE_ID` in a local `.env` (see `.env.example`). Both write to the
**production** Netlify Blobs stores -- there is no dry run and no local fallback.

- **CLI:** `npm run codes -- list | issue <pseudonym> | revoke <pseudonym> | set-intake <url>`
- **Browser UI:** `npm run codes:ui` -- serves an admin page at
  `http://127.0.0.1:4919` (issue with copy-to-clipboard, list, revoke behind a
  named confirmation; revoked rows offer a retry that completes an interrupted
  takedown). The server binds `127.0.0.1` only, answers only the two loopback
  hostnames (anything else gets a 421), never opens a browser by itself (click
  the printed URL), and is never deployed. A code is shown exactly once, at
  issue time; it is never stored, logged, or shown again. Setting the intake
  link stays CLI-only. Override the port with `CODES_UI_PORT` (digits only;
  ports 80 and 443 are refused -- browsers omit the default port from
  Host/Origin, which the server's exact loopback allowlist requires).

### Remote access (not supported yet)

The admin UI cannot be reached from a phone or another machine, **on purpose**:
the server only answers requests whose `Host` and `Origin` are loopback
(`127.0.0.1` / `localhost`). A proxy such as `tailscale serve` will collect 421s
and 403s -- its MagicDNS hostname and HTTPS origin are not on the allowlist, and
this tool does not check Tailscale's identity headers, so the proxy would add no
authentication even if it connected. Do not "fix" this by loosening the guard.

Enabling remote access safely is a separate future task with its own security
review: an explicit MagicDNS `Host` + `Origin` allowlist, enforcement of the
`Tailscale-User-Login` header against the maintainer's identity, run under a
foreground `tailscale serve` (never `--bg`), and shut down after use.

Until then: run the tool on the other machine directly, with that machine's own
`.env`.
````

- [ ] 3. Gates: `npm test` → 35 files / 861 tests; tsc → 14 baseline errors; `npm run build` → exit 0.
- [ ] 4. Manual check: `npm run codes:ui` from the worktree root boots the server, prints the three startup lines, and does **not** open a browser. `npm run codes -- help` still prints usage (the `codes` script is untouched).
- [ ] 5. Commit:

```
git add package.json README.md
git commit -m "feat(codes-ui): npm run codes:ui + honest remote-access deferral in README" -m "The README documents that the loopback Host/Origin guard blocks remote
use by design, and names what a future remote-access task must add
(MagicDNS allowlist + Tailscale-User-Login enforcement) instead of
shipping a tailscale serve recipe that breaks POSTs and overstates
identity guarantees.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7 — Full verification

No new files. This is the evidence pass: every gate re-run from a clean state, plus the manual server checks, plus an explicit statement of what is deliberately NOT verified here.

**Steps:**

- [ ] 1. `git status` → working tree clean (every change committed in Tasks 1-6); `git log --oneline master..HEAD` → 6 commits, one per task.
- [ ] 2. `npm run build` → exit 0. Then `node node_modules/typescript/bin/tsc --noEmit` → **exactly the 14 baseline errors** listed at the top of this plan — diff the output against that list, not just the count.
- [ ] 3. `npm test` (alone — never concurrent with a build) → **35 files passed, 861 tests passed, 0 failures**.
- [ ] 4. Invariant sweep over the diff (`git diff master...HEAD`):
  - `grep -n "console.log" scripts/codes-ui.ts scripts/codes-ui.html src/lib/codes-ui-server.ts src/lib/organizer-ops.ts` → no hits.
  - `grep -n "child_process\|spawn" scripts/codes-ui.ts src/lib/codes-ui-server.ts` → no hits — **no child process may inherit this env** (it holds the pepper + Netlify credentials); the browser is never auto-opened.
  - `grep -n "innerHTML" scripts/codes-ui.html` → no hits.
  - `grep -n "localStorage\|sessionStorage\|document.cookie" scripts/codes-ui.html` → no hits.
  - `grep -n "0.0.0.0" scripts/codes-ui.ts` → only ever inside a comment, never in `listen(...)`; confirm the single `server.listen(port, '127.0.0.1', ...)` call.
  - `grep -n "writeFile\|appendFile\|createWriteStream" scripts/codes-ui.ts src/lib/codes-ui-server.ts src/lib/organizer-ops.ts` → no hits (nothing in the new code writes any file).
  - Confirm `process.env.CONTEXT = 'production'` appears exactly once in each shell (`scripts/organizer-codes.ts`, `scripts/codes-ui.ts`), inside `main()`, before dispatch/`listen`, and nowhere in `src/lib/organizer-ops.ts` or `src/lib/codes-ui-server.ts`.
  - Confirm `decideHost` runs before `servePage` and before `handleApi` in `src/lib/codes-ui-server.ts` (Host allowlist first — nothing served to a rebound Host).
  - Confirm `deps.onCanary(...)` is invoked in `issueCode` and `revokeCode` immediately after `enforceCanary`, before any generate/lookup/write/sweep (the canary signal must survive a mid-operation failure).
  - Confirm `scripts/organizer-codes.ts` still parses argv before loading `.env` (the code-in-argv refusal must fire on an unconfigured machine).
- [ ] 5. Manual server pass (dummy `.env` acceptable): repeat the Task 4 step 8 checklist end-to-end — loopback-only `netstat`, no auto-opened browser, page 200 + zero unsubstituted placeholders, the 421 Host spot-check, the 403 spot-check, the missing-pepper hard error, and the `CODES_UI_PORT=4919junk` + `CODES_UI_PORT=80` refusals. Repeat the Task 5 step 3 page checks (including `http://localhost:4919/`).
- [ ] 6. **Deliberately NOT verified in this plan — say so in the PR description:** no real code is issued or revoked, and `/api/list` is not exercised against production. Those paths write to (or read) the PRODUCTION Blobs stores and require the maintainer's real credentials. The ops logic they run is fully covered by Task 1's fake-store unit tests and Task 4's fake-ops HTTP tests; the live walkthrough is a documented post-merge step **for the maintainer**: run `npm run codes:ui` with the real `.env`, issue a code for a throwaway pseudonym (e.g. `test-ui`), confirm the confirmation dialog names the pseudonym on revoke, confirm the code disappears after navigating away and pressing Back (bfcache clearing), confirm it appears in `npm run codes -- list`, copy it, then revoke it from the UI, confirm the row flips to revoked with a Retry takedown button and the CLI agrees. That single issue+revoke round-trip leaves one revoked record behind, which is harmless and honest history.
- [ ] 7. Push the branch and open the PR (merge commit per repo preference). PR description: link the design doc (revised after Sol round 1), list the deviations D1-D7, name the not-verified-here items from step 6, and flag that this diff touches credential-minting code so it goes back through Sol review per the design's review-emphasis section.

---

## Design-coverage map (self-review)

| Design section | Where it lands |
|---|---|
| §1 shared ops module, DI, structured results | Task 1 (`organizer-ops.ts`, 21 fake-store tests) |
| §1 wordlist checksum + canary enforced identically in every front-end | Task 1 (`readVerifiedWordlist` shared; canary inside `issueCode`/`revokeCode`) |
| §1 canary signal survives mid-operation failure (`onCanary` before any fallible work) | Task 1 (callback on `OpsDeps`; 3 failure-surfacing tests) + Task 2 (CLI prints via `onCanary`) + Task 4 (recorded + echoed in success AND error responses; HTTP test) + Task 5 (error messages append the echo) |
| §1 idempotent revoke (recovery for an interrupted cascade) | Task 1 (skip record re-write, always sweep; idempotency test) + Task 5 (Retry takedown) |
| §1 CLI keeps only presentation; tests stay green | Task 2 (full rewrite; `organizer-cli.test.ts` untouched; canary note/warning channels preserved via `onCanary`) |
| §2 Host allowlist, 421, DNS-rebinding defense, checked before anything is served | Task 3 (`decideHost`, 5 tests) + Task 4 (handler order + 3 HTTP tests; the foreign-Host test uses the real port with a wrong hostname) |
| §2 server: 127.0.0.1 only, digits-only env port (80/443 refused), prints URL, **no auto-open** | Task 4 (`listen(port, '127.0.0.1')`, port validation, no child processes — swept in Task 7) |
| §2 endpoints `POST /api/issue`, `GET /api/list`, `POST /api/revoke` | Task 4 |
| §2 per-run token + `X-Codes-Token` + Origin/Sec-Fetch-Site rejection, both loopback origins, no CORS | Task 3 (11 auth tests) + Task 4 (applied to every `/api/*`; HTTP tests incl. OPTIONS) |
| §2 `isValidPseudonym` + `looksLikeCode` refusals reach no store | Task 4 (`checkPseudonym`, CLI-identical messages; ops-untouched assertions) |
| §2 oversized body → delivered 413 | Task 4 (drain-not-destroy `readBody`; HTTP test) |
| §3 page: issue shown-once + Copy + warning; list without codes; named-confirm revoke + tombstone count; Retry takedown; fold surfaced | Task 5 (fold as reminder note — D4) |
| §3 plaintext lifecycle: cleared on dismiss/re-issue/`pagehide`/bfcache `pageshow`; residues documented | Task 5 (handlers + invariants paragraph) + Task 7 step 6 (manual back/forward check) |
| §4 `npm run codes:ui`, esbuild pattern, missing secret = hard error | Task 6 + Task 4 (`parseEnv` hard-fails at startup) |
| §5 remote access deferred honestly (no working-Tailscale recipe; future task named) | Task 6 |
| Testing: ops unit tests, CLI regression, guard unit tests, automated HTTP tests, manual pass | Tasks 1, 2, 3, 4, 7 |
| Security emphasis: no weakened invariant, code only memory/response/DOM, Host-first ordering, CSRF actually blocks, no env-inheriting child, CONTEXT ordering, loopback only, idempotent recovery, canary signal survives failure | Ground rules + Task 7 step 4 sweep + D2/D3 notes |
| Non-goals: no deploy, no auth service, no `set-intake` in UI, no generation changes, remote access deferred | Honored throughout (`set-intake` and fold-trigger stay CLI-only; `organizer-cli.ts`, `organizer-code.ts`, `blob-stores.ts` untouched) |
