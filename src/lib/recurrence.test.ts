// The suite deliberately runs in a timezone that is NOT UTC and that observes
// DST. A local-time implementation of expandOccurrences passes under TZ=UTC
// and fails here, which is the whole point of the DST block below.
//
// ESM hoists the import above this assignment, but recurrence.ts reads no
// timezone at import time, so the ordering is harmless. Node re-reads
// process.env.TZ on the next Date operation.
process.env.TZ = 'America/New_York';

import { describe, it, expect } from 'vitest';
import { expandOccurrences } from './recurrence.js';

describe('test environment', () => {
  it('runs in America/New_York so local-time bugs are observable', () => {
    // 2026-01-15T00:00:00Z is 19:00 on 2026-01-14 in America/New_York (UTC-5).
    // If this fails, your Node build did not pick up the runtime TZ change --
    // re-run the suite with the variable set in the shell instead:
    //   PowerShell: $env:TZ='America/New_York'; npm test
    //   bash:       TZ=America/New_York npm test
    const probe = new Date(Date.UTC(2026, 0, 15));
    expect(probe.getHours()).toBe(19);
    expect(probe.getDate()).toBe(14);
  });
});

describe('expandOccurrences: no recurrence', () => {
  it('returns just the start date when rec is null', () => {
    expect(expandOccurrences('2026-08-22', null, '2027-01-31')).toEqual(['2026-08-22']);
  });

  it('returns nothing when the start date is past the horizon', () => {
    expect(expandOccurrences('2027-02-01', null, '2027-01-31')).toEqual([]);
  });
});

describe('expandOccurrences: weekly', () => {
  it('steps across a month boundary', () => {
    expect(
      expandOccurrences('2026-08-29', { freq: 'weekly', until: '2026-09-26' }, '2027-01-31'),
    ).toEqual(['2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
  });

  it('treats until as INCLUSIVE: an occurrence landing on until is returned', () => {
    expect(
      expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-09-19' }, '2027-01-31'),
    ).toEqual(['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19']);
  });

  it('drops an occurrence one day past until', () => {
    expect(
      expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-09-18' }, '2027-01-31'),
    ).toEqual(['2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12']);
  });

  it('clamps on the horizon when the horizon is the tighter bound', () => {
    expect(
      expandOccurrences('2026-08-22', { freq: 'weekly', until: '2027-02-20' }, '2026-09-05'),
    ).toEqual(['2026-08-22', '2026-08-29', '2026-09-05']);
  });

  it('clamps on until when until is the tighter bound', () => {
    expect(
      expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-09-05' }, '2027-02-20'),
    ).toEqual(['2026-08-22', '2026-08-29', '2026-09-05']);
  });

  it('returns nothing when until precedes the start date', () => {
    expect(
      expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-08-01' }, '2027-01-31'),
    ).toEqual([]);
  });
});

describe('expandOccurrences: monthly_nth', () => {
  it('tracks the 2nd Tuesday as the day-of-month shifts', () => {
    // August 2026 has four Tuesdays (4, 11, 18, 25); September has five
    // (1, 8, 15, 22, 29). The 2nd Tuesday therefore moves from the 11th to
    // the 8th -- a naive "same day number each month" rule gets this wrong.
    expect(
      expandOccurrences('2026-08-11', { freq: 'monthly_nth', until: '2026-12-31' }, '2027-01-31'),
    ).toEqual(['2026-08-11', '2026-09-08', '2026-10-13', '2026-11-10', '2026-12-08']);
  });

  it('skips months that have no 5th Tuesday rather than sliding to the 4th', () => {
    // Oct 2026, Nov 2026, Jan 2027 and Feb 2027 have only four Tuesdays.
    expect(
      expandOccurrences('2026-09-29', { freq: 'monthly_nth', until: '2027-03-31' }, '2027-12-31'),
    ).toEqual(['2026-09-29', '2026-12-29', '2027-03-30']);
  });

  it('returns only the start date when until falls before the next occurrence', () => {
    // The next 2nd Tuesday is 2026-09-08, one day past until.
    expect(
      expandOccurrences('2026-08-11', { freq: 'monthly_nth', until: '2026-09-07' }, '2027-01-31'),
    ).toEqual(['2026-08-11']);
  });
});

describe('expandOccurrences: DST boundaries do not shift the day', () => {
  it('crosses spring-forward (2026-03-08) without losing or repeating a day', () => {
    expect(
      expandOccurrences('2026-03-01', { freq: 'weekly', until: '2026-03-29' }, '2026-12-31'),
    ).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29']);
  });

  it('crosses fall-back (2026-11-01) without losing or repeating a day', () => {
    expect(
      expandOccurrences('2026-10-25', { freq: 'weekly', until: '2026-11-15' }, '2026-12-31'),
    ).toEqual(['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15']);
  });

  it('lands monthly_nth on the correct weekday across fall-back', () => {
    expect(
      expandOccurrences('2026-10-11', { freq: 'monthly_nth', until: '2026-12-31' }, '2027-01-31'),
    ).toEqual(['2026-10-11', '2026-11-08', '2026-12-13']);
  });
});

describe('expandOccurrences: input guards', () => {
  it('caps a runaway expansion at 400 occurrences', () => {
    // Validation caps until at 6 months (~27 weekly occurrences); this is the
    // defence-in-depth stop for a hand-edited or fold-corrupted events.json.
    const out = expandOccurrences(
      '2026-01-01',
      { freq: 'weekly', until: '2046-01-01' },
      '2046-01-01',
    );
    expect(out.length).toBe(400);
  });

  it('throws RangeError on a start date that is not YYYY-MM-DD', () => {
    expect(() => expandOccurrences('08/22/2026', null, '2026-12-31')).toThrow(RangeError);
  });

  it('throws RangeError on a date that matches the shape but is not real', () => {
    expect(() => expandOccurrences('2026-02-30', null, '2026-12-31')).toThrow(
      /must be a real calendar date/,
    );
  });

  it('throws RangeError on a malformed until', () => {
    expect(() =>
      expandOccurrences('2026-08-22', { freq: 'weekly', until: '2026-9-5' }, '2026-12-31'),
    ).toThrow(RangeError);
  });

  it('throws RangeError on an unknown freq', () => {
    expect(() =>
      expandOccurrences(
        '2026-08-22',
        { freq: 'daily' as unknown as 'weekly', until: '2026-09-05' },
        '2026-12-31',
      ),
    ).toThrow(RangeError);
  });

  it('does not echo the offending value in the error message', () => {
    const hostile = 'notadate-\u202Eevil';
    let message = '';
    try {
      expandOccurrences(hostile, null, '2026-12-31');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('startDate must be a YYYY-MM-DD calendar date');
    expect(message).not.toContain('evil');
  });
});

describe('expandOccurrences: indefinite until (until === null)', () => {
  it('weekly with null until expands to the horizon and no further', () => {
    expect(
      expandOccurrences('2026-09-01', { freq: 'weekly', until: null }, '2026-09-22'),
    ).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']);
  });

  it('monthly_nth with null until expands to the horizon and no further', () => {
    // 2026-08-11 is the 2nd Tuesday; the horizon (Nov 30) is the only bound.
    expect(
      expandOccurrences('2026-08-11', { freq: 'monthly_nth', until: null }, '2026-11-30'),
    ).toEqual(['2026-08-11', '2026-09-08', '2026-10-13', '2026-11-10']);
  });

  it('still caps a null-until runaway at 400 occurrences', () => {
    const out = expandOccurrences(
      '2026-01-01',
      { freq: 'weekly', until: null },
      '2046-01-01',
    );
    expect(out.length).toBe(400);
  });
});

describe('expandOccurrences: monthly_nth with an nths list', () => {
  it('emits 1st & 3rd Monday of every month in date order', () => {
    // Sep 2026 Mondays: 7, 14, 21, 28 -> 1st = Sep 7, 3rd = Sep 21.
    expect(
      expandOccurrences('2026-09-07', { freq: 'monthly_nth', nths: [1, 3], until: null }, '2026-11-30'),
    ).toEqual([
      '2026-09-07', '2026-09-21',
      '2026-10-05', '2026-10-19',
      '2026-11-02', '2026-11-16',
    ]);
  });

  it('keeps startDate as occurrence #1 and skips earlier same-month slots', () => {
    // startDate is the 3rd Monday; the 1st Monday (Sep 7) is before it and is dropped.
    expect(
      expandOccurrences('2026-09-21', { freq: 'monthly_nth', nths: [1, 3], until: null }, '2026-10-31'),
    ).toEqual(['2026-09-21', '2026-10-05', '2026-10-19']);
  });

  it("resolves 'last' to the final weekday of each month (4th or 5th)", () => {
    // Last Tuesday: Sep 29 (5th), Oct 27 (4th), Nov 24 (4th), Dec 29 (5th).
    expect(
      expandOccurrences('2026-09-29', { freq: 'monthly_nth', nths: ['last'], until: null }, '2026-12-31'),
    ).toEqual(['2026-09-29', '2026-10-27', '2026-11-24', '2026-12-29']);
  });

  it('skips a listed slot that a month does not contain (a missing 5th)', () => {
    // 1st & 5th Monday: only November 2026 has a 5th Monday (Nov 30).
    expect(
      expandOccurrences('2026-09-07', { freq: 'monthly_nth', nths: [1, 5], until: null }, '2026-11-30'),
    ).toEqual(['2026-09-07', '2026-10-05', '2026-11-02', '2026-11-30']);
  });

  it('de-duplicates a month where two slots resolve to the same date', () => {
    // 5th & last Tuesday collapse to one date in a five-Tuesday month (Sep 29),
    // and 'last' still fires in a four-Tuesday month (Oct 27) where 5 does not.
    expect(
      expandOccurrences('2026-09-29', { freq: 'monthly_nth', nths: [5, 'last'], until: '2026-10-31' }, '2026-12-31'),
    ).toEqual(['2026-09-29', '2026-10-27']);
  });

  it('is UTC-correct across the fall-back DST boundary (Nov 1 2026)', () => {
    // 1st & 3rd Sunday spanning the fall-back date; the day must not shift.
    expect(
      expandOccurrences('2026-10-04', { freq: 'monthly_nth', nths: [1, 3], until: null }, '2026-11-30'),
    ).toEqual(['2026-10-04', '2026-10-18', '2026-11-01', '2026-11-15']);
  });

  it('absent nths behaves identically to an explicit single-nth list', () => {
    const absent = expandOccurrences('2026-08-11', { freq: 'monthly_nth', until: '2026-12-31' }, '2027-01-31');
    const explicit = expandOccurrences('2026-08-11', { freq: 'monthly_nth', nths: [2], until: '2026-12-31' }, '2027-01-31');
    expect(explicit).toEqual(absent);
    expect(absent).toEqual(['2026-08-11', '2026-09-08', '2026-10-13', '2026-11-10', '2026-12-08']);
  });

  it('throws when startDate is not one of the listed slots', () => {
    // 2026-09-14 is the 2nd Monday; nths [1, 3] does not include it.
    expect(() =>
      expandOccurrences('2026-09-14', { freq: 'monthly_nth', nths: [1, 3], until: null }, '2026-12-31'),
    ).toThrow(RangeError);
  });
});
