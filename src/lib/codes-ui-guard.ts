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
