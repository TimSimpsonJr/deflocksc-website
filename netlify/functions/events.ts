import type { Config, Context } from '@netlify/functions';
import { eventsStore } from '../../src/lib/blob-stores.js';
import { isStoredRecord, toPublicEvent, type PublicEvent, type StoredEvent } from '../../src/lib/public-event.js';

/**
 * How long a finished event stays in the overlay response.
 *
 * Past events remain listed on purpose (design §10) — `/go/:id` refuses to
 * resolve their Signal link, so listing them leaks nothing. Beyond this horizon
 * they are dropped so the payload does not grow without bound. The build-time
 * guard uses the same 30-day window, so a record that disappears from here is
 * also the one that fails the build if it was never folded.
 */
export const RETENTION_DAYS = 30;

const DAY_MS = 86_400_000;
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const CDN_CACHE = 'public, max-age=60, stale-while-revalidate=120';

/**
 * The last calendar date a record is relevant on: the end of the series when
 * there is one, otherwise the single event date.
 */
function lastRelevantDate(record: StoredEvent): string {
  const until = record.recurrence?.until;
  return typeof until === 'string' && until.length > 0 ? until : record.date;
}

/**
 * Revoked records are never published; neither are records past the retention
 * horizon. Dates are compared in UTC against the end of the last relevant day.
 */
export function isVisible(record: StoredEvent, nowMs: number): boolean {
  if (record.revoked === true) return false;

  const last = lastRelevantDate(record);
  if (!ISO_DATE.test(last)) return false;

  const lastMs = Date.parse(`${last}T23:59:59.999Z`);
  if (Number.isNaN(lastMs)) return false;

  return lastMs >= nowMs - RETENTION_DAYS * DAY_MS;
}

function byDateThenTime(a: PublicEvent, b: PublicEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function jsonResponse(body: unknown, status: number, cdnCacheable: boolean): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    // Browsers must not hold this; the CDN is the only cache tier that does.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (cdnCacheable) headers.set('Netlify-CDN-Cache-Control', CDN_CACHE);
  return new Response(JSON.stringify(body), { status, headers });
}

export default async (_req: Request, _context: Context): Promise<Response> => {
  const nowMs = Date.now();

  let events: PublicEvent[];
  try {
    const store = eventsStore();
    const { blobs } = await store.list();
    const records = await Promise.all(
      blobs.map((blob: { key: string }) => store.get(blob.key, { type: 'json' })),
    );

    events = records
      .filter(isStoredRecord)
      .filter((record) => isVisible(record, nowMs))
      // The allowlist projection. Never return, spread, or delete-from a stored
      // record — see design §5. This line is why the endpoint does not publish
      // every live Signal invite.
      .map(toPublicEvent)
      .sort(byDateThenTime);
  } catch {
    // Fail soft and uncached: the baked /events HTML still renders from
    // src/data/events.json, so a Blobs outage costs the overlay, not the page.
    // The caught error is deliberately not inspected or echoed — it can carry
    // internal hostnames. The whole pipeline (list, get, projection, sort) is
    // inside this try, and Promise.all rejects on any single get failure, so a
    // mid-read fault lands here too — never a raw or partial record.
    return jsonResponse({ events: [], error: 'unavailable' }, 503, false);
  }

  return jsonResponse({ events }, 200, true);
};

export const config: Config = {
  path: '/api/events',
  method: ['GET'],
};
