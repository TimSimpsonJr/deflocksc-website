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

const VALID_ID = 'k7m25qxb';
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
    expect(await emptyCode.clone().text()).not.toContain('signal.group');
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
