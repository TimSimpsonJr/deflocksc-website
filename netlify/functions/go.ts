import type { Config, Context } from '@netlify/functions';
import { eventsStore, codesStore, linksStore } from '../../src/lib/blob-stores.js';
import { validateSignalUrl } from '../../src/lib/signal-url.js';

/**
 * GET /go/:eventId — resolve an opaque event id to its Signal invite.
 *
 * Four rules drive everything below.
 *
 * 1. The invite is delivered in the response BODY, never a Location header.
 *    Netlify function logs cannot be disabled and are readable by any team
 *    member; response bodies appear in no documented log schema, headers do.
 *
 * 2. Every refusal — malformed id, unknown event, tombstoned event, revoked
 *    owning code, past event, a stored invite that no longer validates, or a
 *    store failure — returns ONE byte-identical response: same status, same
 *    headers, same body. Otherwise a maintainer who declines the fold prompt
 *    after a revoke leaks "this organizer was pulled" for up to a week, because
 *    the baked page still lists the event.
 *
 * 3. `context.params.eventId` is NEVER interpolated into the body, a header,
 *    an ETag, or a cache tag. "No event found for <id>" is reflected XSS on
 *    the deflocksc.org origin, delivered by a link, needing no organizer code
 *    and no stored value — and the site CSP still carries 'unsafe-inline', so
 *    nothing catches it downstream.
 *
 * 4. Nothing read from the store is trusted on shape alone. Both the event and
 *    its owning code record are shape-checked — a truthy but empty {} is NOT a
 *    live record: `revoked` must be explicitly false, not merely absent — and
 *    the stored signalUrl is re-validated with validateSignalUrl at render time
 *    (design §196). HTML-escaping is a backstop, not validation.
 *
 * The literal id `intake` is special-cased BEFORE the id regex: it resolves the
 * operator's vetting-page Signal link from the `links` store (key `intake`,
 * written by the CLI's set-intake). The events page points a click — never
 * static markup — at /go/intake, so a non-clicking scraper never sees even that
 * path. It refuses identically when the link is unset or fails re-validation.
 *
 * Every blob read is strongly consistent (the stores are opened that way in
 * src/lib/blob-stores.ts). Eventual reads would resolve a tombstoned event's
 * real invite for up to 60 seconds after revocation, which is exactly the
 * window a burned code creates.
 */

/** Opaque 8-char lowercase base32. Flat character class: no nested quantifiers. */
const ID_PATTERN = /^[a-z2-7]{8}$/;

/**
 * Server-generated stand-in used when no event record was found, so the codes
 * lookup still happens and the work stays constant-shaped across branches.
 * Never derived from user input.
 */
const ABSENT_CODE_DIGEST = '0'.repeat(64);

/** One header set for every response this function can produce. */
const HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
};

/** Static. Contains no request-derived substring of any kind. */
const REFUSAL_BODY = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Link unavailable</title>
</head>
<body>
<h1>This link is not available</h1>
<p>The group behind this link has ended, or the organizer closed it.</p>
<p><a href="/events">See the events calendar</a></p>
</body>
</html>
`;

type RefusalReason =
  | 'malformed_id'
  | 'unknown_event'
  | 'event_revoked'
  | 'code_missing'
  | 'code_revoked'
  | 'event_passed'
  | 'no_signal_url'
  | 'intake_unset'
  | 'store_error';

/**
 * The distinguishing reason goes to structured logs only. The id is
 * deliberately omitted even here: it already appears in Netlify's `path`
 * field, and repeating it buys nothing.
 */
function refuse(reason: RefusalReason): Response {
  console.log(JSON.stringify({ event: 'go_refusal', reason }));
  return new Response(REFUSAL_BODY, { status: 404, headers: HEADERS });
}

/** Narrow an unknown store read to a plain object before touching its fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** HTML attribute escaping. Lossless; a backstop applied to the stored URL. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Last date on which this event still resolves. A recurring series stays live
 * until `recurrence.until`; a one-off until its own date. ISO dates compare
 * correctly as strings. A missing or non-string date yields '' — earlier than
 * any real day — so a corrupt record fails closed as "passed".
 */
function lastActiveDate(record: Record<string, unknown>): string {
  const date = typeof record.date === 'string' ? record.date : '';
  const recurrence = record.recurrence;
  const until =
    isRecord(recurrence) && typeof recurrence.until === 'string' ? recurrence.until : undefined;
  if (until !== undefined && until > date) return until;
  return date;
}

/** Today in UTC as YYYY-MM-DD. An event resolves through the whole of its day. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function succeed(signalUrl: string): Response {
  const href = escapeAttr(signalUrl);
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="refresh" content="0;url=${href}">
<title>Opening Signal</title>
</head>
<body>
<h1>Opening Signal</h1>
<p>If nothing happens, use the link below.</p>
<p><a href="${href}" rel="noreferrer">Join the group</a></p>
</body>
</html>
`;
  return new Response(body, { status: 200, headers: HEADERS });
}

export default async (_req: Request, context: Context): Promise<Response> => {
  const eventId = context.params?.eventId;

  // Special-case the sole non-event target BEFORE the id regex. The intake link
  // is stored under `intake` in the links store as a JSON record `{ url }` (the
  // CLI's set-intake writes it with setJSON), and its url is re-validated exactly
  // like a stored event invite. Absent, malformed, or invalid → the same refusal
  // as any other.
  if (eventId === 'intake') {
    let stored: unknown;
    try {
      stored = await linksStore().get('intake', { type: 'json' });
    } catch {
      return refuse('store_error');
    }
    // The stored shape is { url }. A missing record, a non-object, or a bad url
    // all fall through validateSignalUrl to the identical refusal.
    const storedUrl = isRecord(stored) ? stored.url : undefined;
    const intake = validateSignalUrl(storedUrl);
    if (!intake.ok) return refuse('intake_unset');
    return succeed(intake.value);
  }

  // Validate the parameter BEFORE any lookup. A malformed id never becomes a
  // blob key and never reaches the store.
  if (typeof eventId !== 'string' || !ID_PATTERN.test(eventId)) {
    return refuse('malformed_id');
  }

  // Both reads happen before any branching, so the refusal branches do the
  // same amount of work as each other. They are read as `unknown`: what comes
  // back from the store is shape-checked below, never trusted by its cast.
  let record: unknown;
  let code: unknown;
  try {
    record = await eventsStore().get(eventId, { type: 'json' });
    const digest =
      isRecord(record) && typeof record.codeDigest === 'string'
        ? record.codeDigest
        : ABSENT_CODE_DIGEST;
    code = await codesStore().get(digest, { type: 'json' });
  } catch {
    return refuse('store_error');
  }

  // Shape-check BOTH records. `revoked` must be explicitly false: a truthy but
  // empty {} (revoked absent) is corrupt, not live.
  if (!isRecord(record)) return refuse('unknown_event');
  if (record.revoked !== false) return refuse('event_revoked');
  if (!isRecord(code)) return refuse('code_missing');
  if (code.revoked !== false) return refuse('code_revoked');
  if (lastActiveDate(record) < todayIso()) return refuse('event_passed');

  // Re-validate the stored invite at render (design §196). Only validateSignalUrl
  // guarantees a real signal.group URL; escapeAttr in succeed() is a backstop,
  // never the primary defense.
  const invite = validateSignalUrl(record.signalUrl);
  if (!invite.ok) return refuse('no_signal_url');

  return succeed(invite.value);
};

export const config: Config = {
  path: '/go/:eventId',
  method: ['GET'],
};
