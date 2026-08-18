import { createHash } from 'node:crypto';
import { rateLimitStore } from './blob-stores.js';

/**
 * Blobs-backed daily token bucket for POST /api/submit-event.
 *
 * This is a spend shield, not a security boundary. The security boundary is the
 * 41.4-bit organizer code (see design §7). Consequently every failure path here
 * FAILS OPEN: a Blobs incident must not silently kill submissions. That includes
 * the `rateLimitStore()` factory throwing (missing site id, refused context) —
 * it is called inside the try below precisely so a factory throw fails open too.
 *
 * Netlify ships an `onlyIfMatch` CAS API while also documenting that Blobs has no
 * concurrency-control mechanism (design §8, open item 5). Atomicity is therefore
 * undocumented and this counter is best-effort. Size limits with slack.
 */

/** Optimistic-concurrency attempts before we give up and let the request through. */
const MAX_ATTEMPTS = 3;

/**
 * Salted SHA-256 of a client IP. The result is the only form of the address that
 * ever reaches a Blobs key or value — a plaintext IP submission log is exactly the
 * artifact this site criticizes.
 *
 * @param ip   Client address, e.g. from the `x-nf-client-connection-ip` header.
 * @param salt Server-side secret, supplied by the caller. Not the code pepper.
 * @returns 64-char lowercase hex digest.
 */
export function hashSubject(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}\x00${ip}`, 'utf8').digest('hex');
}

export interface RateLimitVerdict {
  /** False only when the subject is provably at or over the limit. */
  allowed: boolean;
  /** Attempts recorded today after this call, best-effort. */
  used: number;
  /** The limit this verdict was measured against, echoed for logging. */
  limit: number;
}

interface Bucket {
  count: number;
}

/** Coerce a stored bucket to a non-negative integer, defaulting to 0. */
function readCount(entry: { data?: unknown } | null): number {
  const raw = (entry?.data as Partial<Bucket> | undefined)?.count;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

/**
 * Record one attempt against `subject` for `today` and report whether it is allowed.
 *
 * Keys are `rl/<today>/<subject>`, so yesterday's buckets age out on their own and
 * the daily reset is implicit — no sweep job.
 *
 * @param subject Output of {@link hashSubject}. Never a raw IP.
 * @param limit   Maximum attempts per subject per day.
 * @param today   ISO date, `YYYY-MM-DD`, computed by the caller in UTC.
 */
export async function consume(
  subject: string,
  limit: number,
  today: string,
): Promise<RateLimitVerdict> {
  const key = `rl/${today}/${subject}`;
  let lastSeen = 0;

  try {
    // Inside the try so a throwing factory fails open just like a throwing method.
    const store = rateLimitStore();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Strong consistency: an eventual read would let a spender run ~60s past the
      // limit on every edge that has not caught up.
      const entry = await store.getWithMetadata(key, {
        type: 'json',
        consistency: 'strong',
      });

      lastSeen = readCount(entry);
      if (lastSeen >= limit) {
        return { allowed: false, used: lastSeen, limit };
      }

      const next: Bucket = { count: lastSeen + 1 };
      const etag = entry?.etag;

      // Branch rather than build a union-typed options object: @netlify/blobs types
      // onlyIfMatch and onlyIfNew as mutually exclusive shapes.
      const result =
        typeof etag === 'string'
          ? await store.setJSON(key, next, { onlyIfMatch: etag })
          : await store.setJSON(key, next, { onlyIfNew: true });

      // modified === false means someone else wrote first. Anything else (true, or
      // an older client returning undefined) counts as a successful write.
      if (result?.modified !== false) {
        return { allowed: true, used: next.count, limit };
      }
    }

    // Retry budget exhausted under contention. Fail open, but not silently: a
    // static line (no request data) makes persistent contention visible in
    // function logs instead of degrading the spend shield invisibly.
    console.warn('rate-limit: optimistic-concurrency retries exhausted; failing open');
    return { allowed: true, used: lastSeen, limit };
  } catch {
    // Store factory or method threw, refused by the non-production context guard, or
    // malformed. Deliberately swallowed: the error must not reach the caller as a
    // 500, and the caught value is never logged because it can embed
    // request-derived strings. A static line still fires so a permanent
    // misconfiguration (missing site id, Blobs auth rot) surfaces in function logs
    // instead of disabling the spend shield invisibly forever.
    console.warn('rate-limit: store unavailable; failing open');
    return { allowed: true, used: 0, limit };
  }
}
