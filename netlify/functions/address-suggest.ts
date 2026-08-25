import type { Config, Context } from '@netlify/functions';

/**
 * GET /api/address-suggest?q=<query> — same-origin typeahead proxy for the
 * PUBLIC-EVENT address field on the submit form.
 *
 * The owner chose Photon (keyless OSM geocoder) for real suggestions, accepting
 * that keystrokes transit this function to komoot. This is a public-events-only
 * field: the address it fills gets PUBLISHED, so the privacy stakes are low. The
 * form copy says so plainly rather than pretending the lookup is local.
 *
 * Conventions borrowed from the other functions and from src/lib/rate-limit.ts:
 *   - Fail SOFT. Any upstream fault (network, timeout, bad JSON, non-2xx)
 *     returns `[]` with 200, so the typeahead degrades to "no suggestions"
 *     rather than surfacing an error. The caught value is never logged or
 *     echoed: it can carry request-derived text.
 *   - Validate and CAP the query before it becomes an upstream request. Absent,
 *     too-short, and over-long queries are rejected (400) with an empty array
 *     body, so the client's `!res.ok -> []` fallback still holds.
 *   - Nothing is stored. This function reads no blob store and writes none.
 *
 * The route is wired by `config.path` below (same mechanism as events.ts,
 * submit-event.ts and go.ts), so the browser calls the same-origin path
 * `/api/address-suggest`. That is covered by the site CSP's `connect-src 'self'`
 * already, so no CSP change is needed. The Photon fetch is server-to-server and
 * never reaches the browser, so it is outside CSP entirely.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';

/** Match the address field: 120 graphemes / 512 bytes (ADDRESS_LIMITS). A
 *  query longer than the field can hold is a bug or abuse, so reject it. */
const MAX_QUERY_LENGTH = 120;
const MIN_QUERY_LENGTH = 3;

/** How many suggestions to request and return. */
const SUGGESTION_LIMIT = 5;

/** Longest label we will hand back. Kept at the field cap so every suggestion
 *  the organizer can pick is one the server validator will also accept. */
const MAX_LABEL_LENGTH = 120;

/** Point bias toward the centre of South Carolina. Photon takes a lat/lon
 *  point (not a bounding box); this nudges local results up without excluding
 *  an out-of-state venue an organizer might legitimately type. */
const SC_BIAS_LAT = 33.9;
const SC_BIAS_LON = -80.9;

/** Abort the upstream call rather than hang the function on a slow Photon. */
const UPSTREAM_TIMEOUT_MS = 4000;

/** Suggestions are stable enough to cache briefly at the CDN; browsers hold a
 *  little too so repeat keystrokes for the same prefix are cheap. */
const CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=120';

/** C0 controls, DEL, and the C1 range. Kept as an explicit escape class so no
 *  literal control byte ever lives in this source file. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

function jsonArray(status: number, body: unknown[], cacheable: boolean): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  headers.set('cache-control', cacheable ? CACHE_CONTROL : 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Collapse whitespace, drop control characters, and enforce the length bounds.
 * Returns null for a query that must be rejected (absent, too short, too long).
 */
function sanitizeQuery(raw: string | null): string | null {
  if (typeof raw !== 'string') return null;
  // Strip control chars, then fold every whitespace run to one space, so a
  // single-line query can never carry a newline into the upstream URL.
  const cleaned = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < MIN_QUERY_LENGTH) return null;
  if (cleaned.length > MAX_QUERY_LENGTH) return null;
  return cleaned;
}

function str(props: Record<string, unknown>, key: string): string {
  const value = props[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Turn one Photon GeoJSON feature's properties into a single-line address
 * label. Returns null when there is nothing usable or the label would exceed
 * the field cap (so a suggestion the organizer picks always validates).
 */
function formatLabel(properties: unknown): string | null {
  if (typeof properties !== 'object' || properties === null) return null;
  const props = properties as Record<string, unknown>;

  const name = str(props, 'name');
  const housenumber = str(props, 'housenumber');
  const street = str(props, 'street');
  const city =
    str(props, 'city') || str(props, 'town') || str(props, 'village') || str(props, 'district');
  const state = str(props, 'state');
  const postcode = str(props, 'postcode');

  const streetLine = housenumber && street ? `${housenumber} ${street}` : street;

  const parts: string[] = [];
  // A POI/building name only earns a slot when it is not just the street again.
  if (name && name !== streetLine && name !== city) parts.push(name);
  if (streetLine) parts.push(streetLine);
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (postcode) parts.push(postcode);

  const label = parts.join(', ').replace(/\s+/g, ' ').trim();
  if (label.length === 0 || label.length > MAX_LABEL_LENGTH) return null;
  return label;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const query = sanitizeQuery(new URL(req.url).searchParams.get('q'));
  if (query === null) {
    // Reject absent / too-short / over-long. Empty-array body so the client's
    // `!res.ok -> []` path renders the same "no suggestions" state.
    return jsonArray(400, [], false);
  }

  const upstream = new URL(PHOTON_URL);
  upstream.searchParams.set('q', query);
  upstream.searchParams.set('limit', String(SUGGESTION_LIMIT));
  upstream.searchParams.set('lang', 'en');
  upstream.searchParams.set('lat', String(SC_BIAS_LAT));
  upstream.searchParams.set('lon', String(SC_BIAS_LON));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  const suggestions: string[] = [];
  try {
    const res = await fetch(upstream, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        // Identify ourselves politely to the shared Photon instance.
        'user-agent': 'deflocksc.org address typeahead (+https://deflocksc.org)',
      },
    });
    if (!res.ok) {
      // Fail soft: upstream said no, the organizer just gets no suggestions.
      return jsonArray(200, [], false);
    }
    const data = (await res.json()) as unknown;
    const features =
      data && typeof data === 'object' && Array.isArray((data as { features?: unknown }).features)
        ? ((data as { features: unknown[] }).features as unknown[])
        : [];

    const seen = new Set<string>();
    for (const feature of features) {
      if (typeof feature !== 'object' || feature === null) continue;
      const label = formatLabel((feature as { properties?: unknown }).properties);
      if (label === null || seen.has(label)) continue;
      seen.add(label);
      suggestions.push(label);
      if (suggestions.length >= SUGGESTION_LIMIT) break;
    }
  } catch {
    // Network fault, timeout/abort, or unparseable JSON. Fail soft, uncached,
    // and do not log the caught value (it can embed request-derived strings).
    return jsonArray(200, [], false);
  } finally {
    clearTimeout(timer);
  }

  return jsonArray(200, suggestions, true);
};

export const config: Config = {
  path: '/api/address-suggest',
  method: ['GET'],
  // Edge burst shield, mirroring submit-event's config. windowSize is capped at
  // 180s by the platform; this bounds keystroke fan-out to the shared Photon
  // instance without a blob-backed counter (this endpoint stores nothing).
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: 'ip',
    windowSize: 60,
    windowLimit: 120,
  },
};
