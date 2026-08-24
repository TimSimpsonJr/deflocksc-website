import { describe, it, expect } from 'vitest';
import { parseCouncilEvents } from './council-events.js';

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
    // createdAt is synthesized from the anchor date (curated entries carry no timestamp).
    expect(event.createdAt).toBe('2026-09-14T00:00:00Z');
  });

  it('accepts a weekly council with a concrete until and no nths', () => {
    const [event] = parseCouncilEvents([
      councilEntry({ recurrence: { freq: 'weekly', until: '2027-02-01' } }),
    ]);
    expect(event.recurrence).toEqual({ freq: 'weekly', until: '2027-02-01' });
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
});
