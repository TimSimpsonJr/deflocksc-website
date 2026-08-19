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

  it('drops a malformed-date record that the build guard would reject', () => {
    // isExpired() keeps an unparseable date (fail-open, by design), so only this
    // schema gate stops such a record from being committed forever.
    const out = foldStoredEvents([
      storedEvent({ id: 'aaaaaaaa', date: '2026-09-01' }),
      storedEvent({ id: 'bbbbbbbb', date: 'not-a-real-date' }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['aaaaaaaa']);
  });

  it('drops a record with a non-conforming field value, failing toward non-publication', () => {
    const out = foldStoredEvents([
      storedEvent({ id: 'aaaaaaaa' }),
      storedEvent({ id: 'bbbbbbbb', time: '99:99' }),
      // hasSignalGroup must be a boolean; a corrupted value is dropped, not shipped.
      storedEvent({ id: 'cccccccc', hasSignalGroup: 'yes' as unknown as boolean }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['aaaaaaaa']);
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
