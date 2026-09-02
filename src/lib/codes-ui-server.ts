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
