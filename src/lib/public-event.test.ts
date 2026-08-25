import { describe, it, expect } from 'vitest';
import {
  toPublicEvent,
  PUBLIC_EVENT_FIELDS,
  type StoredEvent,
  type PublicEvent,
} from './public-event.js';

// Distinctive secret values, chosen so a substring search for them cannot
// collide with anything a legitimate public field would contain.
const SECRET_SIGNAL_URL = 'https://signal.group/#QUJDREVGZ2hpamtsbW5vcHFy';
const SECRET_CODE_DIGEST = 'deadbeef'.repeat(8); // 64 lowercase hex chars
const EXTRA_KEY = 'submitterIpHash';
const EXTRA_VALUE = 'do-not-publish-this-value';

const publicRecord: StoredEvent = {
  id: 'k7m29qxb',
  type: 'public',
  title: 'Greenville County Council meeting',
  description: 'Public comment period on the ALPR contract renewal.',
  date: '2026-08-22',
  time: '19:00',
  city: 'greenville',
  county: 'greenville',
  address: '301 University Ridge, Greenville',
  hasSignalGroup: true,
  recurrence: { freq: 'monthly_nth', until: '2027-02-22' },
  organizer: 'handle-jay',
  createdAt: '2026-08-17T14:22:00Z',
  signalUrl: SECRET_SIGNAL_URL,
  codeDigest: SECRET_CODE_DIGEST,
  revoked: false,
};

const meetupRecord: StoredEvent = {
  id: 'b3n81vqd',
  type: 'meetup',
  title: 'Sign night',
  description: null,
  date: '2026-09-04',
  time: '18:30',
  city: 'columbia',
  county: 'richland',
  address: null,
  hasSignalGroup: true,
  recurrence: null,
  organizer: 'handle-rae',
  createdAt: '2026-08-18T09:05:00Z',
  signalUrl: SECRET_SIGNAL_URL,
  codeDigest: SECRET_CODE_DIGEST,
  revoked: true,
};

// A record that also carries a property nobody declared — simulating a field
// added to the Blobs store by a later change that forgot about this module.
const recordWithExtraField = {
  ...publicRecord,
  [EXTRA_KEY]: EXTRA_VALUE,
} as unknown as StoredEvent;

describe('PUBLIC_EVENT_FIELDS', () => {
  it('lists exactly the thirteen public fields, in data-model order', () => {
    expect(PUBLIC_EVENT_FIELDS).toEqual([
      'id',
      'type',
      'title',
      'description',
      'date',
      'time',
      'city',
      'county',
      'address',
      'hasSignalGroup',
      'recurrence',
      'organizer',
      'createdAt',
    ]);
  });

  it('contains none of the secret field names', () => {
    const names: readonly string[] = PUBLIC_EVENT_FIELDS;
    expect(names).not.toContain('signalUrl');
    expect(names).not.toContain('codeDigest');
    expect(names).not.toContain('revoked');
  });
});

describe('toPublicEvent', () => {
  it('copies every public field with its exact value', () => {
    const result = toPublicEvent(publicRecord);
    const expected: PublicEvent = {
      id: 'k7m29qxb',
      type: 'public',
      title: 'Greenville County Council meeting',
      description: 'Public comment period on the ALPR contract renewal.',
      date: '2026-08-22',
      time: '19:00',
      city: 'greenville',
      county: 'greenville',
      address: '301 University Ridge, Greenville',
      hasSignalGroup: true,
      recurrence: { freq: 'monthly_nth', until: '2027-02-22' },
      organizer: 'handle-jay',
      createdAt: '2026-08-17T14:22:00Z',
    };
    expect(result).toEqual(expected);
  });

  it('returns an object whose own keys are exactly PUBLIC_EVENT_FIELDS', () => {
    expect(Object.keys(toPublicEvent(publicRecord))).toEqual([...PUBLIC_EVENT_FIELDS]);
  });

  it('omits signalUrl, codeDigest and revoked', () => {
    const result = toPublicEvent(publicRecord);
    expect(Object.prototype.hasOwnProperty.call(result, 'signalUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'codeDigest')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'revoked')).toBe(false);
  });

  it('drops an unrecognized property added to the stored record', () => {
    const result = toPublicEvent(recordWithExtraField);
    expect(Object.prototype.hasOwnProperty.call(result, EXTRA_KEY)).toBe(false);
    expect(Object.keys(result)).toEqual([...PUBLIC_EVENT_FIELDS]);
  });

  it('serializes without any secret key name or secret value', () => {
    // The critical test: this is the exact shape of the /api/events response.
    const serialized = JSON.stringify(toPublicEvent(recordWithExtraField));

    expect(serialized).not.toContain('signalUrl');
    expect(serialized).not.toContain('codeDigest');
    expect(serialized).not.toContain('revoked');
    expect(serialized).not.toContain(EXTRA_KEY);

    expect(serialized).not.toContain(SECRET_SIGNAL_URL);
    expect(serialized).not.toContain('signal.group');
    expect(serialized).not.toContain(SECRET_CODE_DIGEST);
    expect(serialized).not.toContain('deadbeef');
    expect(serialized).not.toContain(EXTRA_VALUE);

    // And every public field survived the projection.
    const parsed = JSON.parse(serialized);
    for (const field of PUBLIC_EVENT_FIELDS) {
      expect(parsed).toHaveProperty(field);
      expect(parsed[field]).toEqual(publicRecord[field]);
    }
  });

  it('preserves nulls for a meetup record', () => {
    const result = toPublicEvent(meetupRecord);
    expect(result.description).toBeNull();
    expect(result.address).toBeNull();
    expect(result.recurrence).toBeNull();
    expect(Object.keys(result)).toEqual([...PUBLIC_EVENT_FIELDS]);
  });

  it('drops the secrets from a revoked meetup record too', () => {
    const serialized = JSON.stringify(toPublicEvent(meetupRecord));
    expect(serialized).not.toContain('revoked');
    expect(serialized).not.toContain(SECRET_SIGNAL_URL);
    expect(serialized).not.toContain(SECRET_CODE_DIGEST);
  });

  it('preserves the recurrence object', () => {
    const result = toPublicEvent(publicRecord);
    expect(result.recurrence).toEqual({ freq: 'monthly_nth', until: '2027-02-22' });
  });

  it('deep-picks recurrence so a nested extra property is not published', () => {
    // Simulates a property added under recurrence by a later change: the
    // top-level allowlist cannot see nested fields, so the projection itself
    // must strip them.
    const recordWithNestedExtra = {
      ...publicRecord,
      recurrence: {
        freq: 'monthly_nth',
        until: '2027-02-22',
        internalNote: 'SECRET-NESTED',
      },
    } as unknown as StoredEvent;

    const result = toPublicEvent(recordWithNestedExtra);
    expect(result.recurrence).toEqual({ freq: 'monthly_nth', until: '2027-02-22' });
    expect(Object.prototype.hasOwnProperty.call(result.recurrence, 'internalNote')).toBe(false);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('internalNote');
    expect(serialized).not.toContain('SECRET-NESTED');
  });

  it('does not alias the stored recurrence object', () => {
    const input: StoredEvent = {
      ...publicRecord,
      recurrence: { freq: 'weekly', until: '2027-01-01' },
    };
    const result = toPublicEvent(input);
    expect(result.recurrence).not.toBe(input.recurrence);
    // A caller mutating the projection must not corrupt the stored record.
    result.recurrence!.until = '1999-01-01';
    expect(input.recurrence!.until).toBe('2027-01-01');
  });

  it('does not mutate the input record', () => {
    const input: StoredEvent = { ...publicRecord };
    toPublicEvent(input);
    expect(input.signalUrl).toBe(SECRET_SIGNAL_URL);
    expect(input.codeDigest).toBe(SECRET_CODE_DIGEST);
    expect(input.revoked).toBe(false);
    expect(Object.keys(input).length).toBe(PUBLIC_EVENT_FIELDS.length + 3);
  });

  it('returns a new object, not the input reference', () => {
    const result = toPublicEvent(publicRecord);
    expect(result).not.toBe(publicRecord as unknown as PublicEvent);
  });
});
