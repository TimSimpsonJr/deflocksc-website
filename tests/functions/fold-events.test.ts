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

  it('drops a store record that is not object-shaped before it can be committed', async () => {
    listMock.mockResolvedValue({
      blobs: [{ key: 'aaaaaaaa' }, { key: 'garbage0' }],
    });
    getMock.mockImplementation(async (key: string) =>
      key === 'aaaaaaaa' ? storedEvent({ id: key }) : 'not-an-object',
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

  it('drops a malformed-date record so a bad commit cannot stall every later build', async () => {
    // The store write path validates dates, so this needs corruption to occur —
    // but if it does, the record must never reach the permanent commit, because
    // the build-time schema guard would then reject events.json on every deploy.
    listMock.mockResolvedValue({
      blobs: [{ key: 'aaaaaaaa' }, { key: 'baddate0' }],
    });
    getMock.mockImplementation(async (key: string) =>
      key === 'aaaaaaaa'
        ? storedEvent({ id: key })
        : storedEvent({ id: key, date: 'not-a-real-date' }),
    );

    const mod = await import('../../netlify/functions/fold-events.js');
    const res = await mod.default(new Request('https://deflocksc.org/'), {} as any);

    expect(res.status).toBe(200);
    const committed = JSON.parse(
      Buffer.from(calls[1].body.content, 'base64').toString('utf8'),
    );
    expect(committed.map((e: any) => e.id)).toEqual(['aaaaaaaa']);
  });
});
