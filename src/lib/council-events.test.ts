import { describe, it, expect } from 'vitest';
import { parseCouncilEvents, loadCouncilEvents } from './council-events.js';
import { expandAll, addMonths } from './events-view.js';

function councilEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'council-greenville-city',
    type: 'council',
    title: 'Greenville City Council',
    description: 'Sign up with the clerk to speak. Each speaker gets 3 minutes.',
    date: '2026-09-14',
    time: '17:30',
    city: 'greenville',
    county: 'greenville',
    address: '206 S Main St, Greenville, SC 29601',
    recurrence: { freq: 'monthly_nth', nths: [2, 4], until: null },
    source: 'https://www.greenvillesc.gov/185/City-Council',
    organizer: 'Greenville City Council',
    ...overrides,
  };
}

describe('parseCouncilEvents — accepted', () => {
  it('projects a valid entry into a council PublicEvent', () => {
    const events = parseCouncilEvents([councilEntry()]);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.type).toBe('council');
    expect(event.hasSignalGroup).toBe(false);
    expect(event.source).toBe('https://www.greenvillesc.gov/185/City-Council');
    expect(event.city).toBe('greenville');
    expect(event.county).toBe('greenville');
    expect(event.recurrence).toEqual({ freq: 'monthly_nth', nths: [2, 4], until: null });
    // organizer and createdAt are backend-only fields, absent from PublicEvent:
    // a council entry may carry `organizer` as metadata, but the projection must
    // not publish it, and no createdAt is synthesized onto the public shape.
    expect(Object.prototype.hasOwnProperty.call(event, 'organizer')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(event, 'createdAt')).toBe(false);
  });

  it('accepts a weekly council with a concrete until and no nths', () => {
    const [event] = parseCouncilEvents([
      councilEntry({ recurrence: { freq: 'weekly', until: '2027-02-01' } }),
    ]);
    expect(event.recurrence).toEqual({ freq: 'weekly', until: '2027-02-01' });
  });

  it('accepts and projects skipMonths on a monthly_nth council recurrence', () => {
    const [event] = parseCouncilEvents([
      councilEntry({
        recurrence: { freq: 'monthly_nth', nths: [2, 4], until: null, skipMonths: [7, 8] },
      }),
    ]);
    expect(event.recurrence).toEqual({
      freq: 'monthly_nth',
      nths: [2, 4],
      until: null,
      skipMonths: [7, 8],
    });
  });
});

describe('parseCouncilEvents — rejected (a bad entry fails the build)', () => {
  it('rejects an entry with no source', () => {
    const bad = councilEntry();
    delete bad.source;
    expect(() => parseCouncilEvents([bad])).toThrow(/source/);
  });

  it('rejects a source that is not an http(s) URL', () => {
    expect(() => parseCouncilEvents([councilEntry({ source: 'not-a-url' })])).toThrow();
  });

  it('rejects a county that does not match the city', () => {
    expect(() => parseCouncilEvents([councilEntry({ county: 'spartanburg' })])).toThrow(/county/);
  });

  it('rejects an unknown city slug', () => {
    expect(() => parseCouncilEvents([councilEntry({ city: 'atlantis' })])).toThrow();
  });

  it('rejects nths on a weekly recurrence', () => {
    expect(() =>
      parseCouncilEvents([councilEntry({ recurrence: { freq: 'weekly', nths: [1], until: null } })]),
    ).toThrow();
  });

  it('rejects skipMonths on a weekly recurrence', () => {
    expect(() =>
      parseCouncilEvents([
        councilEntry({ recurrence: { freq: 'weekly', until: null, skipMonths: [7] } }),
      ]),
    ).toThrow();
  });

  it('rejects a skipMonths member out of 1..12', () => {
    expect(() =>
      parseCouncilEvents([
        councilEntry({
          recurrence: { freq: 'monthly_nth', nths: [2], until: null, skipMonths: [13] },
        }),
      ]),
    ).toThrow();
  });

  it('rejects a bad until format', () => {
    expect(() =>
      parseCouncilEvents([councilEntry({ recurrence: { freq: 'weekly', until: '2027-2-1' } })]),
    ).toThrow();
  });

  it('rejects a server-only field via strict()', () => {
    expect(() =>
      parseCouncilEvents([councilEntry({ signalUrl: 'https://signal.group/#x' })]),
    ).toThrow();
  });

  it('rejects a non-council type', () => {
    expect(() => parseCouncilEvents([councilEntry({ type: 'public' })])).toThrow();
  });

  it('names the record index and field in the error', () => {
    const bad = councilEntry({ county: 'spartanburg' });
    expect(() => parseCouncilEvents([councilEntry(), bad])).toThrow(/record 1/);
  });

  it('throws naming the id when two entries share an id', () => {
    // Both entries validate per-entry; the second collides on id. Without the
    // Set pass it would silently collapse downstream instead of failing here.
    expect(() => parseCouncilEvents([councilEntry(), councilEntry()])).toThrow(
      /council-greenville-city/,
    );
  });

  it('rejects a source longer than 300 chars', () => {
    const longUrl = `https://example.com/${'a'.repeat(300)}`;
    expect(() => parseCouncilEvents([councilEntry({ source: longUrl })])).toThrow();
  });

  it('rejects an organizer carrying a zero-width character', () => {
    // organizer now flows through sanitizeText (like title/description/address),
    // so an invisible-format char is rejected rather than shipped in the island.
    expect(() =>
      parseCouncilEvents([councilEntry({ organizer: 'Greenville City Council\u200BX' })]),
    ).toThrow();
  });

  it('rejects an own __proto__ key', () => {
    // JSON.parse materializes `__proto__` as an own enumerable key; the guard
    // rejects it, mirroring validateSubmission on the sibling boundary.
    const withProto = JSON.parse('{"__proto__": {"polluted": true}, "id": "council-x"}');
    expect(() => parseCouncilEvents([withProto])).toThrow(/__proto__/);
  });
});

describe('loadCouncilEvents — the committed seed', () => {
  it('loads council-meetings.json as valid council PublicEvents', () => {
    const events = loadCouncilEvents();
    // 30 original big-city/county councils + 53 metro-satellite city councils.
    expect(events.length).toBe(83);
    for (const e of events) {
      expect(e.type).toBe('council');
      expect(e.hasSignalGroup).toBe(false);
      expect(typeof e.source).toBe('string');
      expect(e.id.startsWith('council-')).toBe(true);
    }
  });

  it('includes the Greenville and Columbia city councils', () => {
    const ids = loadCouncilEvents().map((e) => e.id);
    expect(ids).toContain('council-greenville-city');
    expect(ids).toContain('council-columbia-city');
    // Every id is unique (parseCouncilEvents also throws on a duplicate).
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('expands every seed anchor without throwing (a bad anchor fails npm test, not deploy)', () => {
    // loadCouncilEvents only validates the schema; the startDate-is-a-slot and
    // skipped-anchor invariants are enforced by expandOccurrences. Run the same
    // 12-month expansion the page build runs so a bad anchor (a non-slot date, or
    // an anchor in a skipMonths month) fails here in `npm test`, not at deploy.
    const today = new Date().toISOString().slice(0, 10);
    expect(() => expandAll(loadCouncilEvents(), addMonths(today, 12))).not.toThrow();
  });
});
