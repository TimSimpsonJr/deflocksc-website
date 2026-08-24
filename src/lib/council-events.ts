/**
 * Curated council meetings — a build-time data source, not a submission path.
 *
 * src/data/council-meetings.json is version-controlled so every entry is
 * reviewable in the PR diff (the "verify each before shipping" bar). Each entry
 * is validated by the strict councilEventSchema and projected to a council
 * PublicEvent; a bad entry THROWS, which fails the Astro build so no unverified
 * or malformed council data can ship. Council entries never touch Netlify Blobs,
 * /go, or the organizer submission path: they are type 'council', carry a
 * required official-schedule `source`, and have hasSignalGroup === false and no
 * signalUrl (nothing to leak).
 */

import { z } from 'zod';
import type { PublicEvent } from './public-event.js';
import {
  sanitizeText,
  TITLE_LIMITS,
  DESCRIPTION_LIMITS,
  ADDRESS_LIMITS,
  type SanitizeOptions,
} from './sanitize-text.js';
import { isKnownCity, countyForCity } from './jurisdictions.js';
import councilData from '../data/council-meetings.json';

const ISO_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const ID_RE = /^[a-z0-9-]+$/;

/** UTC real-calendar-day check, mirroring event-schema.ts's isRealIsoDate. */
function isRealIsoDate(iso: string): boolean {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Delegates to the shared sanitizer, the same idiom event-schema.ts uses. */
function sanitizedField(limits: SanitizeOptions) {
  return z.unknown().transform((value, ctx) => {
    const result = sanitizeText(value, limits);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.code });
      return z.NEVER;
    }
    return result.value;
  });
}

const councilRecurrenceSchema = z
  .object({
    freq: z.enum(['weekly', 'monthly_nth']),
    until: z
      .string()
      .regex(ISO_DATE_RE, 'bad_format')
      .refine(isRealIsoDate, 'not_a_real_date')
      .nullable(),
    nths: z
      .array(
        z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal('last'),
        ]),
      )
      .min(1)
      .optional(),
  })
  .strict();

/**
 * The strict shape of one council-meetings.json entry. `.strict()` rejects any
 * unexpected key (a smuggled signalUrl/codeDigest). It does NOT enforce
 * id-uniqueness across entries — that is a cross-entry invariant a per-entry
 * schema cannot see, so parseCouncilEvents enforces it with a Set pass that
 * throws on a duplicate id. The superRefine
 * enforces two cross-field rules: `county` must be the county the registry
 * derives from `city` (a typo like city greenville / county spartanburg fails),
 * and `nths` is only meaningful for monthly_nth.
 *
 * The startDate-is-a-slot invariant (startDate must fall on one of nths) is not
 * re-checked here: expandOccurrences enforces it at build and throws, which fails
 * the build the same way (locked by a recurrence.test.ts case).
 */
export const councilEventSchema = z
  .object({
    id: z.string().regex(ID_RE, 'bad_id'),
    type: z.literal('council'),
    title: sanitizedField(TITLE_LIMITS),
    description: sanitizedField(DESCRIPTION_LIMITS),
    date: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
    time: z.string().regex(TIME_RE, 'bad_format'),
    city: z.string().refine(isKnownCity, 'unknown_city'),
    county: z.string(),
    address: sanitizedField(ADDRESS_LIMITS),
    recurrence: councilRecurrenceSchema.nullable(),
    source: z.string().max(300).refine(isHttpUrl, 'bad_source'),
    organizer: sanitizedField(TITLE_LIMITS),
  })
  .strict()
  .superRefine((value, ctx) => {
    const derived = countyForCity(value.city);
    if (!derived.ok || derived.value !== value.county) {
      ctx.addIssue({ code: 'custom', path: ['county'], message: 'county_mismatch' });
    }
    if (value.recurrence?.nths && value.recurrence.freq !== 'monthly_nth') {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence', 'nths'],
        message: 'nths_requires_monthly_nth',
      });
    }
  });

/**
 * Validate a raw array and project each entry to a council PublicEvent. Pure
 * (takes the array as an argument) so it is unit-testable without the file.
 * Throws on the first bad entry, naming its index and field, so the Astro build
 * aborts rather than shipping unverified council data.
 */
export function parseCouncilEvents(raw: readonly unknown[]): PublicEvent[] {
  const seenIds = new Set<string>();
  return raw.map((entry, index) => {
    // Mirror validateSubmission's guard on the sibling boundary. JSON.parse
    // materializes `__proto__` as an own enumerable key rather than setting the
    // prototype, and zod 4 skips it during its unrecognized-key scan, so
    // `.strict()` alone would not reject it. Inert today (the projection below is
    // explicit, never a spread), but kept so the two boundaries stay consistent.
    if (entry !== null && typeof entry === 'object' && Object.hasOwn(entry, '__proto__')) {
      throw new Error(
        `src/data/council-meetings.json: record ${index} has an own "__proto__" key`,
      );
    }
    const parsed = councilEventSchema.safeParse(entry);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const at = issue.path.length > 0 ? issue.path.join('.') : '_record';
      const detail = issue.code === 'unrecognized_keys' ? 'unexpected_field' : issue.message;
      throw new Error(
        `src/data/council-meetings.json: record ${index} at "${at}" failed validation (${detail})`,
      );
    }
    const c = parsed.data;
    // Id-uniqueness is a cross-entry invariant the per-entry schema cannot see.
    // Two entries sharing an id pass validation, then silently collapse
    // downstream (events-view.ts collapseSeries dedupes by id, mergeEvents drops
    // baked-id overlay matches) — a curation typo would hide a meeting instead of
    // failing the build. Throw so the Astro build aborts, naming the id and index.
    if (seenIds.has(c.id)) {
      throw new Error(
        `src/data/council-meetings.json: record ${index} has duplicate id "${c.id}"`,
      );
    }
    seenIds.add(c.id);
    // Explicit construction, never a spread — the same discipline toPublicEvent
    // and validateSubmission use. hasSignalGroup is forced false; there is no
    // signalUrl on a council PublicEvent, and createdAt is synthesized from the
    // anchor date so the value is deterministic across build machines.
    return {
      id: c.id,
      type: 'council',
      title: c.title,
      description: c.description,
      date: c.date,
      time: c.time,
      city: c.city,
      county: c.county,
      address: c.address,
      hasSignalGroup: false,
      recurrence: c.recurrence,
      organizer: c.organizer,
      createdAt: `${c.date}T00:00:00Z`,
      source: c.source,
    };
  });
}

/** Read + validate the committed council-meetings.json into council PublicEvents. */
export function loadCouncilEvents(): PublicEvent[] {
  return parseCouncilEvents(councilData as unknown[]);
}
