import { describe, it, expect } from 'vitest';
import { validateSubmission, publicEventSchema, type FieldError } from './event-schema.js';

// --- fixtures ---------------------------------------------------------------

/** ISO (YYYY-MM-DD) date `offset` days from today, in UTC. */
function isoInDays(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** ISO (YYYY-MM-DD) date `months` calendar months from today, in UTC. */
function isoInMonths(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Four lowercase words. `normalizeCode()` only normalizes shape — it does not
// check wordlist membership. Membership is proven later by the digest lookup in
// the `codes` store (Task 12), which is not this module's job.
const CODE = 'drum yoga vivid clay';
const NORMALIZED_CODE = 'drum-yoga-vivid-clay';

const SIGNAL_URL = 'https://signal.group/#CjQKIExhbXBsZUtleQ';

const FUTURE_DATE = isoInDays(30);

function meetup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'meetup',
    title: 'Sign night',
    date: FUTURE_DATE,
    time: '19:00',
    city: 'greenville',
    signalUrl: SIGNAL_URL,
    organizerCode: CODE,
    ...overrides,
  };
}

function publicEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'public',
    title: 'Richland County Council meeting',
    description: 'Council votes on the Flock contract renewal.',
    date: FUTURE_DATE,
    time: '18:30',
    city: 'columbia',
    address: '1737 Main Street, Columbia',
    recurrence: null,
    organizerCode: CODE,
    ...overrides,
  };
}

type Result = ReturnType<typeof validateSubmission>;

function errorsOf(result: Result): FieldError[] {
  if (result.ok) {
    throw new Error(`expected a rejection, got ${JSON.stringify(result.value)}`);
  }
  return result.errors ?? [];
}

function hasError(result: Result, field: string, code: string): boolean {
  return errorsOf(result).some((e) => e.field === field && e.code === code);
}

// --- accepted submissions ---------------------------------------------------

describe('validateSubmission — accepted', () => {
  it('accepts a valid meetup and derives the county from the city', () => {
    const result = validateSubmission(meetup());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Whole-object equality is deliberate: it pins the exact field set, so a
    // field added here later breaks this test rather than silently flowing
    // into the Blobs record.
    expect(result.value).toEqual({
      type: 'meetup',
      title: 'Sign night',
      description: null,
      date: FUTURE_DATE,
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: null,
      signalUrl: SIGNAL_URL,
      recurrence: null,
      codeNormalized: NORMALIZED_CODE,
    });
  });

  it('accepts a valid public event, deriving a county unlike the city slug', () => {
    const result = validateSubmission(publicEvent());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // columbia -> richland proves the county is derived, not echoed.
    expect(result.value.county).toBe('richland');
    expect(result.value).toEqual({
      type: 'public',
      title: 'Richland County Council meeting',
      description: 'Council votes on the Flock contract renewal.',
      date: FUTURE_DATE,
      time: '18:30',
      city: 'columbia',
      county: 'richland',
      address: '1737 Main Street, Columbia',
      signalUrl: null,
      recurrence: null,
      codeNormalized: NORMALIZED_CODE,
    });
  });

  it('accepts an event dated today', () => {
    const result = validateSubmission(meetup({ date: isoInDays(0) }));
    expect(result.ok).toBe(true);
  });
});

// --- type-conditional fields ------------------------------------------------

describe('validateSubmission — meetup vs public fields', () => {
  it('rejects a meetup carrying an address', () => {
    const result = validateSubmission(meetup({ address: '123 Main Street' }));
    expect(result.ok).toBe(false);
    expect(hasError(result, 'address', 'not_allowed_for_meetup')).toBe(true);
  });

  it('rejects a meetup carrying a description', () => {
    const result = validateSubmission(meetup({ description: 'Bring signs.' }));
    expect(result.ok).toBe(false);
    expect(hasError(result, 'description', 'not_allowed_for_meetup')).toBe(true);
  });

  it('rejects a public event without an address', () => {
    const withoutAddress = publicEvent();
    delete withoutAddress.address;
    const result = validateSubmission(withoutAddress);
    expect(result.ok).toBe(false);
    expect(hasError(result, 'address', 'required_for_public')).toBe(true);
  });

  it('rejects a meetup without a Signal URL', () => {
    const withoutSignal = meetup();
    delete withoutSignal.signalUrl;
    const result = validateSubmission(withoutSignal);
    expect(result.ok).toBe(false);
    expect(hasError(result, 'signalUrl', 'required_for_meetup')).toBe(true);
  });
});

// --- mass assignment and prototype pollution --------------------------------

describe('validateSubmission — unknown keys', () => {
  it('rejects a submitted county, because county is derived', () => {
    const result = validateSubmission(meetup({ county: 'charleston' }));
    expect(result.ok).toBe(false);
    expect(hasError(result, 'county', 'unrecognized_key')).toBe(true);
  });

  it('rejects an extra unknown key', () => {
    const result = validateSubmission(meetup({ notAField: 'x' }));
    expect(result.ok).toBe(false);
    expect(hasError(result, 'notAField', 'unrecognized_key')).toBe(true);
  });

  it('rejects every server-owned field name', () => {
    for (const field of ['id', 'organizer', 'createdAt', 'revoked', 'codeDigest']) {
      const result = validateSubmission(meetup({ [field]: 'attacker-supplied' }));
      expect(result.ok, `${field} must be rejected`).toBe(false);
      expect(hasError(result, field, 'unrecognized_key'), `${field}`).toBe(true);
    }
  });

  it('rejects a body carrying __proto__', () => {
    // Built through JSON.parse on purpose. An object literal `{ __proto__: {} }`
    // sets the prototype instead of creating an own key, so it would not
    // reproduce what `req.json()` actually hands the function.
    const body = JSON.parse(
      `{"__proto__":{"polluted":true},"type":"meetup","title":"Sign night","date":"${FUTURE_DATE}",` +
        `"time":"19:00","city":"greenville","signalUrl":"${SIGNAL_URL}","organizerCode":"${CODE}"}`,
    );
    expect(Object.hasOwn(body, '__proto__')).toBe(true);

    const result = validateSubmission(body);
    expect(result.ok).toBe(false);
    expect(hasError(result, '__proto__', 'unrecognized_key')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// --- city and date ----------------------------------------------------------

describe('validateSubmission — city and date', () => {
  it('rejects an unknown city', () => {
    const result = validateSubmission(meetup({ city: 'atlantis' }));
    expect(result.ok).toBe(false);
    expect(hasError(result, 'city', 'unknown_city')).toBe(true);
  });

  it('rejects a past date', () => {
    const result = validateSubmission(meetup({ date: isoInDays(-1) }));
    expect(result.ok).toBe(false);
    expect(hasError(result, 'date', 'date_in_past')).toBe(true);
  });

  it('rejects a date 13 months out', () => {
    const result = validateSubmission(meetup({ date: isoInMonths(13) }));
    expect(result.ok).toBe(false);
    expect(hasError(result, 'date', 'date_too_far_out')).toBe(true);
  });
});

// --- body shape -------------------------------------------------------------

describe('validateSubmission — body shape', () => {
  it('rejects a non-object body', () => {
    expect(validateSubmission('nope').ok).toBe(false);
    expect(validateSubmission(null).ok).toBe(false);
    expect(validateSubmission(42).ok).toBe(false);
  });

  it('rejects an array body', () => {
    const result = validateSubmission([]);
    expect(result.ok).toBe(false);
    expect(hasError(result, '_body', 'not_an_object')).toBe(true);
  });
});

// --- publicEventSchema (the stored/public shape) ----------------------------

// Distinct from a *submission*: a stored PublicEvent carries `id` and
// `createdAt` and has no `organizerCode`. This is the exact shape of
// src/data/events.json, which src/pages/events.astro re-validates at build.
function publicEventRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'k7m29qxb',
    type: 'public',
    title: 'Richland County Council meeting',
    description: 'Council votes on the Flock contract renewal.',
    date: '2026-09-01',
    time: '18:30',
    city: 'columbia',
    county: 'richland',
    address: '1737 Main Street, Columbia',
    hasSignalGroup: false,
    recurrence: null,
    organizer: 'handle-jay',
    createdAt: '2026-08-17T14:22:00Z',
    ...overrides,
  };
}

describe('publicEventSchema — the stored/public shape', () => {
  it('accepts a valid PublicEvent record', () => {
    expect(publicEventSchema.safeParse(publicEventRecord()).success).toBe(true);
  });

  it('rejects a record carrying a server-only key via .strict()', () => {
    // signalUrl, codeDigest and revoked live on StoredEvent, never on the
    // published shape. `.strict()` makes a baked record that smuggles one fail
    // the build rather than flow to the client.
    for (const key of ['signalUrl', 'codeDigest', 'revoked']) {
      const parsed = publicEventSchema.safeParse(publicEventRecord({ [key]: 'x' }));
      expect(parsed.success, `${key} must be rejected`).toBe(false);
    }
  });

  it('accepts a council record with source, indefinite until, and nths', () => {
    const record = {
      id: 'council-greenville-city',
      type: 'council',
      title: 'Greenville City Council',
      description: 'Sign up with the clerk to speak. Each speaker gets 3 minutes.',
      date: '2026-09-14',
      time: '17:30',
      city: 'greenville',
      county: 'greenville',
      address: '206 S Main St, Greenville, SC 29601',
      hasSignalGroup: false,
      recurrence: { freq: 'monthly_nth', nths: [2, 4], until: null },
      organizer: 'Greenville City Council',
      createdAt: '2026-08-17T14:22:00Z',
      source: 'https://www.greenvillesc.gov/185/City-Council',
    };
    expect(publicEventSchema.safeParse(record).success).toBe(true);
  });
});
