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
