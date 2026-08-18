import type { Config, Context } from '@netlify/functions';
import { randomBytes } from 'node:crypto';

import { ContextRefusedError, codesStore, eventsStore } from '../../src/lib/blob-stores.js';
import { consume, hashSubject } from '../../src/lib/rate-limit.js';
import { validateSubmission } from '../../src/lib/event-schema.js';
import { digestCode } from '../../src/lib/organizer-code.js';
import { dedupeKey } from '../../src/lib/sanitize-text.js';
import type { StoredEvent } from '../../src/lib/public-event.js';

/** Hard body cap, design §6. Bounds every downstream normalization and regex. */
const MAX_BODY_BYTES = 8192;

/** Per-IP-per-day budget enforced inside the function (design §8). */
const DAILY_SUBMIT_LIMIT = 20;

/** RFC 4648 base32, lowercased. Matches the `/^[a-z2-7]{8}$/` id check in /go/:eventId. */
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Unknown code and revoked code MUST return the identical response. A
 * distinguishable rejection turns this endpoint into a code-status oracle.
 */
function rejectCode(): Response {
  return json(403, { error: 'invalid_code' });
}

/**
 * 8 base32 characters from 5 CSPRNG bytes: 40 bits in, 40 bits out, so there
 * is no modulo bias and no rejection loop. Never derived from request input.
 */
function generateEventId(): string {
  const bytes = randomBytes(5);
  let acc = 0;
  let bits = 0;
  let out = '';
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(acc >> bits) & 31];
    }
  }
  return out;
}

/**
 * Reads the body through a counting reader, aborting past MAX_BODY_BYTES.
 * Returns null when the cap is exceeded, so a chunked `Transfer-Encoding`
 * cannot evade the Content-Length check.
 */
async function readCappedBody(req: Request): Promise<Uint8Array | null> {
  const stream = req.body;
  if (!stream) return new Uint8Array(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** UTC day key, so the daily reset is implicit in the rate-limit blob key. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Collapse a submission to its normalized semantic tuple. dedupeKey() folds
 * the title the same way on both the incoming and the stored side, so an added
 * space or zero-width character cannot slip a duplicate past the check.
 */
function semanticKey(parts: { type: string; date: string; city: string; title: string }): string {
  return [parts.type, parts.date, parts.city, dedupeKey(parts.title)].join('\x00');
}

/**
 * The last calendar day a stored event still matters on: the end of the series
 * when there is one, otherwise the single date. Same rule the read-path
 * retention guard uses. Past this day every occurrence is behind us, so the
 * record is finished and cannot be a genuine duplicate of a new submission.
 */
function lastRelevantDate(record: StoredEvent): string {
  const until = record.recurrence?.until;
  return typeof until === 'string' && until.length > 0 ? until : record.date;
}

export default async (req: Request, context: Context): Promise<Response> => {
  // 0. Fail closed on missing secrets. Both are production-context-only,
  //    Functions-scoped Netlify variables; a deploy preview lands here.
  const pepper = process.env.ORGANIZER_CODE_PEPPER;
  const ipSalt = process.env.RATE_LIMIT_IP_SALT;
  if (!pepper || !ipSalt) {
    return json(503, { error: 'unavailable' });
  }

  // 1. Content-Length gate, before the body stream is touched at all.
  const declared = req.headers.get('content-length');
  if (declared === null) {
    return json(411, { error: 'length_required' });
  }
  const declaredBytes = Number(declared);
  if (!Number.isInteger(declaredBytes) || declaredBytes < 0) {
    return json(411, { error: 'length_required' });
  }
  if (declaredBytes > MAX_BODY_BYTES) {
    return json(413, { error: 'body_too_large' });
  }

  // 2. Counting reader.
  let bodyBytes: Uint8Array | null;
  try {
    bodyBytes = await readCappedBody(req);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (bodyBytes === null) {
    return json(413, { error: 'body_too_large' });
  }

  // 3. Parse, and reject anything that is not a plain JSON object.
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes));
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!isPlainObject(parsed)) {
    return json(400, { error: 'invalid_json' });
  }

  // 3b. Honeypot (design §6), acted on BEFORE the .strict() schema — which
  //     would otherwise reject `website` as an unrecognized key. ANY present,
  //     non-empty `website` is a bot, whatever its type: a real browser sends an
  //     empty string, so a number/object/array value is never a human. Return
  //     the SAME { ok, id } success shape with a throwaway id and write nothing,
  //     so the bot never learns it was caught, and never reach the rate limiter
  //     or the code store. Only the empty-string/absent (and defensively null)
  //     paths proceed; then strip the key so a real submission validates.
  if ('website' in parsed && parsed.website !== '' && parsed.website != null) {
    return json(201, { ok: true, id: generateEventId() });
  }
  delete parsed.website;

  // 4. Rate limit. The IP is hashed and never stored raw. Fails open on a
  //    Blobs error so an incident cannot silently kill submissions.
  const subject = hashSubject(context.ip ?? 'unknown', ipSalt);
  const verdict = await consume(subject, DAILY_SUBMIT_LIMIT, utcToday());
  if (!verdict.allowed) {
    return json(429, { error: 'rate_limited' });
  }

  // 5. Validate. `county` is derived inside the schema from `city`; a
  //    submitted `county` is a validation error, never trusted.
  const validated = validateSubmission(parsed);
  if (!validated.ok) {
    return json(400, { error: 'invalid', errors: validated.errors ?? [] });
  }
  const submission = validated.value;

  // 6. Verify the organizer code. The digest IS the blob key, so there is no
  //    comparison loop and no timing signal. codesStore() is opened with
  //    consistency: 'strong' — eventual reads keep a revoked code alive ~60s.
  const digest = digestCode(submission.codeNormalized, pepper);
  let codeRecord: unknown;
  try {
    codeRecord = await codesStore().get(digest, { type: 'json' });
  } catch {
    // Static line (no request data), matching rate-limit.ts's convention, so a
    // codes-store outage is visible in function logs instead of a silent 503.
    console.warn('submit-event: codes store read failed; returning 503');
    return json(503, { error: 'unavailable' });
  }
  // Fail closed on a malformed record. This endpoint never writes the codes
  // store, so anything that is not a plain object carrying a string `pseudonym`
  // and `revoked === false` is corrupt (partial write, manual seed, schema
  // drift), not a valid organizer. Refuse it exactly as an unknown code — a
  // truthy-but-shapeless record must never fall open to an `undefined`
  // organizer. Mirrors the dedupe loop's typeof-object defense below.
  if (
    !isPlainObject(codeRecord) ||
    typeof codeRecord.pseudonym !== 'string' ||
    codeRecord.revoked !== false
  ) {
    return rejectCode();
  }
  const organizer = codeRecord.pseudonym;

  // 6b. Dedupe (design §6). The real spam shape here is one Signal link posted
  //     for many cities, so check TWO things against every LIVE event: the
  //     normalized semantic tuple, and the Signal URL on its own. A match is a
  //     silent success with a throwaway id and no write — never a
  //     distinguishable rejection a spammer could probe. Best-effort: a Blobs
  //     read error here must not kill a legitimate submission, so it falls
  //     through to the write.
  const incomingKey = semanticKey({
    type: submission.type,
    date: submission.date,
    city: submission.city,
    title: submission.title,
  });
  const today = utcToday();
  try {
    const { blobs: liveKeys } = await eventsStore().list();
    for (const entry of liveKeys) {
      const existing = (await eventsStore().get(entry.key, { type: 'json' })) as StoredEvent | null;
      if (!existing || typeof existing !== 'object' || existing.revoked) continue;
      // Past events do not participate in dedupe. Signal invite links are stable
      // per group, so an organizer posting their NEXT event with the same link —
      // once a prior event has passed or its recurrence window has ended — must
      // not be silently dropped. Only current/future events can be a genuine
      // duplicate of a new submission; the spam shape §6 guards against is one
      // link fanned across many cities at once, which is concurrent and
      // future-dated. ISO YYYY-MM-DD strings compare chronologically as strings.
      if (lastRelevantDate(existing) < today) continue;
      const sameSemantics =
        semanticKey({
          type: existing.type,
          date: existing.date,
          city: existing.city,
          title: existing.title,
        }) === incomingKey;
      const sameSignal =
        submission.signalUrl !== null && existing.signalUrl === submission.signalUrl;
      if (sameSemantics || sameSignal) {
        return json(201, { ok: true, id: generateEventId() });
      }
    }
  } catch {
    // Dedupe is best-effort; a Blobs read error falls through to the write.
  }

  // 7. Write. The id and the blob key are server-generated. The key is the
  //    BARE id: the store is already named `events`, so an `events/<id>` key
  //    would double-namespace it and every reader looks it up bare.
  const id = generateEventId();
  const record: StoredEvent = {
    id,
    type: submission.type,
    title: submission.title,
    description: submission.description,
    date: submission.date,
    time: submission.time,
    city: submission.city,
    county: submission.county,
    address: submission.address,
    hasSignalGroup: submission.signalUrl !== null,
    recurrence: submission.recurrence,
    organizer,
    createdAt: new Date().toISOString(),
    signalUrl: submission.signalUrl,
    codeDigest: digest,
    revoked: false,
  };

  try {
    await eventsStore().setJSON(id, record);
  } catch (error) {
    // Static line (no request data), matching rate-limit.ts's convention, so an
    // events-store write outage is visible in function logs instead of a silent
    // 503. The caught value is never logged: it can embed request-derived text.
    console.warn('submit-event: events store write failed; returning 503');
    if (error instanceof ContextRefusedError) {
      return json(503, { error: 'unavailable' });
    }
    return json(503, { error: 'unavailable' });
  }

  return json(201, { ok: true, id });
};

export const config: Config = {
  path: '/api/submit-event',
  method: ['POST'],
  // Edge shield only. windowSize is capped at 180s by the platform, so this
  // is a burst wall, not the daily budget — that lives in step 4 above.
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: 'ip',
    windowSize: 180,
    windowLimit: 10,
  },
};
