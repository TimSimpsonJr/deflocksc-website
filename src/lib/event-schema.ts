import { z } from 'zod';
import { ok, err, type Ok, type Err } from './text-result.js';
import {
  sanitizeText,
  TITLE_LIMITS,
  DESCRIPTION_LIMITS,
  ADDRESS_LIMITS,
  type SanitizeOptions,
} from './sanitize-text.js';
import { validateSignalUrl } from './signal-url.js';
import { normalizeCode } from './organizer-code.js';
import { isKnownCity, countyForCity } from './jurisdictions.js';

/**
 * The one validator every submission passes through.
 *
 * Runs as stage 4 of the submit pipeline: body cap -> rate limit -> validate ->
 * verify code. The 8192-byte body cap is already enforced upstream, so the
 * per-field byte caps below bound the work NFKC and grapheme segmentation are
 * asked to do, not the request size.
 */

// The title, description and address caps live in sanitize-text.ts and are
// imported (TITLE_LIMITS, DESCRIPTION_LIMITS, ADDRESS_LIMITS), never retyped
// here — a cap that drifts between call sites is how a limit silently widens.
// Each is { maxBytes, maxGraphemes }: raw UTF-8 bytes are checked before NFKC
// (normalization can expand input up to 18x), grapheme clusters after it.
const ORGANIZER_CODE_MAX_BYTES = 128;

const MAX_MONTHS_AHEAD = 12;
const MAX_RECURRENCE_MONTHS = 6;

// Flat character classes only: no nested quantifiers, no quantified
// alternation, no backreferences. Anchoring alone does not prevent
// catastrophic backtracking; the shape of the pattern does.
const ISO_DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const SNAKE_CASE_RE = /^[a-z0-9_]+$/;

const utf8 = new TextEncoder();

export interface ValidatedSubmission {
  type: 'meetup' | 'public';
  title: string;
  description: string | null;
  date: string;
  time: string;
  city: string;
  /** Derived from `city`. Never read from input. */
  county: string;
  address: string | null;
  signalUrl: string | null;
  /**
   * A strict SUBSET of `Recurrence` in ./recurrence.js: a submission can set
   * neither `nths` nor a null `until` (both are curated-council-only), so `until`
   * is always a concrete date here and there is no `nths` field.
   */
  recurrence: { freq: 'weekly' | 'monthly_nth'; until: string } | null;
  codeNormalized: string;
}

export type FieldError = { field: string; code: string };

// --- date helpers (all UTC, all string-comparable ISO) ----------------------

function isRealIsoDate(iso: string): boolean {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * True only for an absolute http(s) URL. The council `source` is rendered as an
 * href, so a value that does not parse to an http/https scheme (a `javascript:`
 * or `data:` URL, or free text that is not a URL at all) must not reach the
 * page. Same parse-and-check idiom as isRealIsoDate above.
 */
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Calendar-month arithmetic with end-of-month clamping (Aug 31 + 6 -> Feb 28). */
function addMonthsIso(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// --- field schemas that delegate to the shared primitives -------------------

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

const signalUrlField = z.unknown().transform((value, ctx) => {
  const result = validateSignalUrl(value);
  if (!result.ok) {
    ctx.addIssue({ code: 'custom', message: result.code });
    return z.NEVER;
  }
  return result.value;
});

const organizerCodeField = z.unknown().transform((value, ctx) => {
  // Byte cap before normalization, same reasoning as the text fields.
  if (typeof value === 'string' && utf8.encode(value).length > ORGANIZER_CODE_MAX_BYTES) {
    ctx.addIssue({ code: 'custom', message: 'too_many_bytes' });
    return z.NEVER;
  }
  const result = normalizeCode(value);
  if (!result.ok) {
    ctx.addIssue({ code: 'custom', message: result.code });
    return z.NEVER;
  }
  return result.value;
});

const recurrenceField = z
  .object({
    freq: z.enum(['weekly', 'monthly_nth']),
    until: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
  })
  .strict();

/**
 * `.strict()` is the mass-assignment defense, and it is doing more work than it
 * looks like it is.
 *
 * The stored record (StoredEvent) has `id`, `organizer`, `createdAt`,
 * `revoked`, `codeDigest` and `signalUrl` on it. Every one of those is
 * server-owned. Without `.strict()`, zod's default "strip" mode would silently
 * discard them here — which is safe only for as long as nobody downstream ever
 * spreads the raw body. `.strict()` makes an attempt to set them a hard 400
 * instead of a silent no-op, so the failure is loud at the boundary rather than
 * latent one refactor away.
 *
 * It is also what rejects a submitted `county`. County is derived from `city`
 * via countyForCity() below; the form never asks for it, and an input that
 * offers one is rejected rather than trusted.
 *
 * Prototype pollution is handled separately in validateSubmission(): zod 4.4.3
 * excludes `__proto__` from its unrecognized-key scan (verified — `constructor`
 * and `prototype` are flagged, `__proto__` is not), so `.strict()` alone does
 * not reject it.
 */
const submissionSchema = z
  .object({
    type: z.enum(['meetup', 'public']),
    title: sanitizedField(TITLE_LIMITS),
    description: sanitizedField(DESCRIPTION_LIMITS).optional(),
    date: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
    time: z.string().regex(TIME_RE, 'bad_format'),
    city: z.string().refine(isKnownCity, 'unknown_city'),
    address: sanitizedField(ADDRESS_LIMITS).optional(),
    signalUrl: signalUrlField.optional(),
    recurrence: recurrenceField.nullable().optional(),
    organizerCode: organizerCodeField,
  })
  .strict()
  .superRefine((value, ctx) => {
    const isMeetup = value.type === 'meetup';

    // A meetup has no free-text description and no address, by design: the
    // venue is shared inside the Signal group and never published.
    if (isMeetup && value.description !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'not_allowed_for_meetup' });
    }
    if (isMeetup && value.address !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'not_allowed_for_meetup' });
    }
    if (isMeetup && value.signalUrl === undefined) {
      ctx.addIssue({ code: 'custom', path: ['signalUrl'], message: 'required_for_meetup' });
    }
    if (!isMeetup && value.address === undefined) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'required_for_public' });
    }

    // Same-day events are allowed (amended design §6): organizers post
    // morning-of. /go/:id refuses to resolve a Signal link once the date has
    // actually passed.
    const today = todayIso();
    if (value.date < today) {
      ctx.addIssue({ code: 'custom', path: ['date'], message: 'date_in_past' });
    } else if (value.date > addMonthsIso(today, MAX_MONTHS_AHEAD)) {
      ctx.addIssue({ code: 'custom', path: ['date'], message: 'date_too_far_out' });
    }

    if (value.recurrence) {
      if (value.recurrence.until <= value.date) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'until'],
          message: 'until_not_after_date',
        });
      } else if (value.recurrence.until > addMonthsIso(value.date, MAX_RECURRENCE_MONTHS)) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'until'],
          message: 'until_too_far_out',
        });
      }
    }
  });

/**
 * The stored/public event shape: exactly the 13 PublicEvent fields, and no
 * more. `src/pages/events.astro` re-validates the git-baked src/data/events.json
 * against this at build time, so a later bad commit that adds a server-only
 * field (signalUrl, codeDigest, revoked) is rejected by `.strict()` and fails
 * the build rather than reaching a rendered card or the data island.
 *
 * This is the ONE schema for that shape — the page keeps no local copy that can
 * drift from it. It is deliberately separate from submissionSchema above:
 * a submission has `organizerCode` and no `id`/`createdAt`; a stored record is
 * the mirror image. The per-field text caps are the same imported constants, so
 * the two schemas cannot disagree on a limit.
 */
export const publicEventSchema = z
  .object({
    id: z.string(),
    type: z.enum(['meetup', 'public', 'council']),
    title: sanitizedField(TITLE_LIMITS),
    description: sanitizedField(DESCRIPTION_LIMITS).nullable(),
    date: z.string().regex(ISO_DATE_RE, 'bad_format').refine(isRealIsoDate, 'not_a_real_date'),
    time: z.string().regex(TIME_RE, 'bad_format'),
    city: z.string(),
    county: z.string(),
    address: sanitizedField(ADDRESS_LIMITS).nullable(),
    hasSignalGroup: z.boolean(),
    recurrence: z
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
        // Calendar month numbers (1-12) a curated council skips entirely (a full
        // summer recess). Empty is allowed ("no skip"); monthly_nth-only, coupled
        // below the same way `nths` is.
        skipMonths: z.array(z.number().int().min(1).max(12)).optional(),
      })
      .strict()
      .superRefine((r, ctx) => {
        // Fail-closed: `nths` is a monthly_nth-only selection. A curated
        // { freq: 'weekly', nths: [...] } would otherwise validate here and then
        // be SILENTLY IGNORED by expandOccurrences, which reads nths only in its
        // monthly_nth branch — rendering a plain weekly series instead of the
        // curated slots. Reject it at the boundary so the mistake fails loudly.
        if (r.nths !== undefined && r.freq !== 'monthly_nth') {
          ctx.addIssue({ code: 'custom', path: ['nths'], message: 'nths_requires_monthly_nth' });
        }
        // Same fail-closed reasoning for `skipMonths`: expandOccurrences reads it
        // only in its monthly_nth branch, so a weekly recurrence carrying one
        // would validate and then skip nothing. Reject it at the boundary.
        if (r.skipMonths !== undefined && r.freq !== 'monthly_nth') {
          ctx.addIssue({
            code: 'custom',
            path: ['skipMonths'],
            message: 'skip_months_requires_monthly_nth',
          });
        }
      })
      .nullable(),
    organizer: z.string(),
    createdAt: z.string(),
    // Council-only official-schedule URL. Capped and scheme-checked here so the
    // render schema is self-sufficient: the value is bound for an href, so an
    // unbounded or non-http(s) string must never pass this gate on its own.
    source: z.string().max(300).refine(isHttpUrl, 'bad_source').nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Type coupling for the three council-only fields. Widening the shape to
    // admit `source`, an indefinite (`null`) `until`, and `nths` is what lets a
    // curated council record validate — but those fields are legitimate ONLY on
    // a `council` record. A curated council entry enters via council-events.ts's
    // loadCouncilEvents(), never this gate's fold/submission path, so on a
    // folded meetup/public record they cannot legitimately occur: toPublicEvent
    // projects neither `source` nor `nths`, and a submission's recurrence.until
    // is always a concrete date. Without this refinement the widening is
    // fail-open — a hand-edited src/data/events.json record (the exact "later bad
    // commit" this schema exists to catch) carrying council-style recurrence
    // would pass, then render with silently wrong dates, because toPublicEvent's
    // deep-pick drops `nths` and the series falls back to startDate's own nth.
    // Rejecting them here unless `type === 'council'` keeps the failure loud at
    // the boundary and makes the "Absent on submitted (meetup/public) events"
    // invariant documented on PublicEvent something the schema actually enforces.
    if (value.type === 'council') return;

    if (value.source !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['source'], message: 'source_requires_council' });
    }
    if (value.recurrence !== null) {
      if (value.recurrence.until === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'until'],
          message: 'null_until_requires_council',
        });
      }
      if (value.recurrence.nths !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'nths'],
          message: 'nths_requires_council',
        });
      }
      // Same coupling for `skipMonths`: a full-recess skip list is a curated
      // council-only field. toPublicEvent never projects it onto a folded
      // meetup/public record, so its presence here is the same "later bad commit"
      // signal as a stray `nths`. Without this it passed silently -- the one
      // council-only field whose sibling checks forgot it -- so a hand-edited
      // record could smuggle a skip list past the gate. Reject it and fail loud.
      if (value.recurrence.skipMonths !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['recurrence', 'skipMonths'],
          message: 'skip_months_requires_council',
        });
      }
    }
  });

function invalid(errors: FieldError[]): Err<'invalid'> & { errors: FieldError[] } {
  return { ...err('invalid'), errors };
}

function toFieldErrors(error: z.ZodError): FieldError[] {
  const out: FieldError[] = [];
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        out.push({ field: [...issue.path, key].join('.'), code: 'unrecognized_key' });
      }
      continue;
    }
    const field = issue.path.length > 0 ? issue.path.join('.') : '_body';
    // Our own messages are snake_case machine codes (from sanitizeText,
    // validateSignalUrl, normalizeCode, and the refinements above). Anything
    // else is zod's English prose, so fall back to zod's issue code and never
    // echo submitted text back to the caller.
    const code = SNAKE_CASE_RE.test(issue.message) ? issue.message : issue.code;
    out.push({ field, code });
  }
  return out;
}

export function validateSubmission(
  raw: unknown,
): Ok<ValidatedSubmission> | (Err<'invalid'> & { errors?: FieldError[] }) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return invalid([{ field: '_body', code: 'not_an_object' }]);
  }

  // JSON.parse creates `__proto__` as an own enumerable property rather than
  // setting the prototype, and zod 4.4.3 skips it during its unrecognized-key
  // scan. Reject it explicitly.
  if (Object.hasOwn(raw, '__proto__')) {
    return invalid([{ field: '__proto__', code: 'unrecognized_key' }]);
  }

  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(toFieldErrors(parsed.error));
  }

  const data = parsed.data;

  // County is derived here and nowhere else. isKnownCity() already gated the
  // slug, so this is belt-and-braces; it must still never fall through.
  const county = countyForCity(data.city);
  if (!county.ok) {
    return invalid([{ field: 'city', code: 'unknown_city' }]);
  }

  // Explicit construction, never a spread of `data`. Same rule as
  // toPublicEvent(): the output field set is written out, not inherited.
  return ok({
    type: data.type,
    title: data.title,
    description: data.description ?? null,
    date: data.date,
    time: data.time,
    city: data.city,
    county: county.value,
    address: data.address ?? null,
    signalUrl: data.signalUrl ?? null,
    recurrence: data.recurrence ?? null,
    codeNormalized: data.organizerCode,
  });
}
