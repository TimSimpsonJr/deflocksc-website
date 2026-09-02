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
