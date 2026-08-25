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
