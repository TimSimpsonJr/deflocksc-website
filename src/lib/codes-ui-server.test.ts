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
  // requireHostHeader:false so a Host-less request reaches the handler under
  // test instead of being pre-empted by node:http's built-in 400 — the
  // "rejects a missing Host with 421" case exercises the handler's own
  // decideHost branch (defense in depth; production keeps node's default,
  // where a missing Host is 400'd before the handler, which is also a refusal).
  server = createServer({ requireHostHeader: false });
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
