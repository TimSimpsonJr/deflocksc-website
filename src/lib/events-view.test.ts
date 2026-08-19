import { describe, it, expect } from 'vitest';
import {
  mergeEvents,
  parseOverlayEnvelope,
  expandAll,
  splitByToday,
  collapseSeries,
  recurrenceLabel,
  monthAbbr,
  dayOfMonth,
  formatTime12,
  sortKey,
  ALL_EVENTS,
  matchesFilter,
  filterEvents,
  filterOccurrences,
  countyOptions,
  facetCounts,
  filterHash,
  parseFilterHash,
  emptyStateProof,
} from './events-view.js';
import type { PublicEvent } from './public-event.js';

function ev(over: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: 'aaaaaaaa',
    type: 'meetup',
    title: 'Meetup',
    description: null,
    date: '2026-09-01',
    time: '19:00',
    city: 'greenville',
    county: 'greenville',
    address: null,
    hasSignalGroup: true,
    recurrence: null,
    organizer: 'handle-jay',
    createdAt: '2026-08-17T14:22:00Z',
    ...over,
  } as PublicEvent;
}

describe('mergeEvents', () => {
  it('returns the baked set unchanged when the overlay is null', () => {
    const baked = [ev({ id: 'aaaaaaaa' }), ev({ id: 'bbbbbbbb' })];
    expect(mergeEvents(baked, null).map((e) => e.id)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  });

  it('baked wins for an id present in both', () => {
    const baked = [ev({ id: 'aaaaaaaa', title: 'baked title' })];
    const overlay = [ev({ id: 'aaaaaaaa', title: 'overlay title' })];
    const merged = mergeEvents(baked, overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('baked title');
  });

  it('keeps a baked event the overlay omits (overlay never tombstones)', () => {
    const baked = [ev({ id: 'aaaaaaaa' }), ev({ id: 'bbbbbbbb' })];
    const overlay = [ev({ id: 'aaaaaaaa' })];
    // bbbbbbbb is absent from the overlay, but absence is not a tombstone: the
    // overlay legitimately filters revoked and past events, so a baked id it
    // omits stays visible. Revocation is handled by the fold rewriting events.json.
    expect(mergeEvents(baked, overlay).map((e) => e.id)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  });

  it('appends overlay-only events', () => {
    const baked = [ev({ id: 'aaaaaaaa', date: '2026-09-01' })];
    const overlay = [ev({ id: 'aaaaaaaa', date: '2026-09-01' }), ev({ id: 'cccccccc', date: '2026-08-20' })];
    expect(mergeEvents(baked, overlay).map((e) => e.id)).toEqual(['cccccccc', 'aaaaaaaa']);
  });

  it('shows all baked events when the overlay is empty', () => {
    const baked = [ev({ id: 'aaaaaaaa' }), ev({ id: 'bbbbbbbb' })];
    // An empty overlay means "nothing to add", not "delete everything".
    expect(mergeEvents(baked, []).map((e) => e.id)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  });

  it('sorts by date, then time, then id', () => {
    const baked = [
      ev({ id: 'dddddddd', date: '2026-09-01', time: '19:00' }),
      ev({ id: 'cccccccc', date: '2026-09-01', time: '19:00' }),
      ev({ id: 'bbbbbbbb', date: '2026-09-01', time: '08:00' }),
      ev({ id: 'aaaaaaaa', date: '2026-08-31', time: '23:00' }),
    ];
    expect(mergeEvents(baked, null).map((e) => e.id)).toEqual([
      'aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd',
    ]);
  });
});

describe('parseOverlayEnvelope', () => {
  it('returns the events array from the { events } envelope', () => {
    const events = [ev({ id: 'aaaaaaaa' }), ev({ id: 'bbbbbbbb' })];
    expect(parseOverlayEnvelope({ events })).toEqual(events);
  });

  it('returns an empty array for an empty overlay, so the merge shows baked', () => {
    // { events: [] } is a valid envelope; mergeEvents(baked, []) then keeps baked.
    expect(parseOverlayEnvelope({ events: [] })).toEqual([]);
  });

  it('returns null for any body that is not the { events: [...] } envelope', () => {
    expect(parseOverlayEnvelope(null)).toBeNull();
    expect(parseOverlayEnvelope([ev()])).toBeNull();
    expect(parseOverlayEnvelope({ events: 'nope' })).toBeNull();
    expect(parseOverlayEnvelope({})).toBeNull();
  });
});

describe('expandAll', () => {
  it('emits one occurrence for a non-recurring event', () => {
    const out = expandAll([ev({ date: '2026-09-01', recurrence: null })], '2027-08-18');
    expect(out.map((o) => o.date)).toEqual(['2026-09-01']);
    expect(out[0].event.id).toBe('aaaaaaaa');
  });

  it('expands a weekly series and keeps occurrences sorted across events', () => {
    const out = expandAll(
      [
        ev({ id: 'bbbbbbbb', date: '2026-09-03', recurrence: null }),
        ev({ id: 'aaaaaaaa', date: '2026-09-01', recurrence: { freq: 'weekly', until: '2026-09-15' } }),
      ],
      '2027-08-18',
    );
    expect(out.map((o) => `${o.date}:${o.event.id}`)).toEqual([
      '2026-09-01:aaaaaaaa',
      '2026-09-03:bbbbbbbb',
      '2026-09-08:aaaaaaaa',
      '2026-09-15:aaaaaaaa',
    ]);
  });

  it('never emits an occurrence past the horizon', () => {
    const out = expandAll(
      [ev({ date: '2026-09-01', recurrence: { freq: 'weekly', until: '2027-02-01' } })],
      '2026-09-20',
    );
    expect(out.every((o) => o.date <= '2026-09-20')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('splitByToday', () => {
  it('puts today in upcoming and yesterday in past', () => {
    const occ = expandAll(
      [
        ev({ id: 'aaaaaaaa', date: '2026-08-17' }),
        ev({ id: 'bbbbbbbb', date: '2026-08-18' }),
        ev({ id: 'cccccccc', date: '2026-08-19' }),
      ],
      '2027-08-18',
    );
    const { upcoming, past } = splitByToday(occ, '2026-08-18');
    expect(upcoming.map((o) => o.date)).toEqual(['2026-08-18', '2026-08-19']);
    expect(past.map((o) => o.date)).toEqual(['2026-08-17']);
  });

  it('returns past newest-first', () => {
    const occ = expandAll(
      [ev({ id: 'aaaaaaaa', date: '2026-08-10' }), ev({ id: 'bbbbbbbb', date: '2026-08-15' })],
      '2027-08-18',
    );
    expect(splitByToday(occ, '2026-08-18').past.map((o) => o.date)).toEqual(['2026-08-15', '2026-08-10']);
  });
});

describe('collapseSeries', () => {
  it('keeps a one-off event as its single row', () => {
    const occ = expandAll([ev({ id: 'aaaaaaaa', date: '2026-09-01', recurrence: null })], '2027-09-01');
    expect(collapseSeries(occ).map((o) => `${o.date}:${o.event.id}`)).toEqual(['2026-09-01:aaaaaaaa']);
  });

  it('collapses a recurring series to one row at its next (earliest) occurrence', () => {
    const occ = expandAll(
      [ev({ id: 'gvweekly', date: '2026-09-01', recurrence: { freq: 'weekly', until: '2026-09-22' } })],
      '2027-09-01',
    );
    expect(occ.length).toBeGreaterThan(1); // fixture guard: it really recurs
    const rows = collapseSeries(occ);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-09-01');
    expect(rows[0].event.id).toBe('gvweekly');
  });

  it('emits one row per distinct event, ordered by each event next occurrence', () => {
    const occ = expandAll(
      [
        ev({ id: 'gvweekly', date: '2026-09-01', recurrence: { freq: 'weekly', until: '2026-10-13' } }),
        ev({ id: 'ch1once', date: '2026-09-03', recurrence: null }),
        ev({ id: 'ri1once', date: '2026-09-02', recurrence: null }),
      ],
      '2027-09-01',
    );
    // gvweekly's next occurrence (09-01) sorts first, then the two one-offs.
    expect(collapseSeries(occ).map((o) => `${o.date}:${o.event.id}`)).toEqual([
      '2026-09-01:gvweekly',
      '2026-09-02:ri1once',
      '2026-09-03:ch1once',
    ]);
  });

  it('returns an empty list for no occurrences and never mutates the input', () => {
    expect(collapseSeries([])).toEqual([]);
    const occ = expandAll([ev({ recurrence: { freq: 'weekly', until: '2026-09-22' } })], '2027-09-01');
    const before = occ.length;
    collapseSeries(occ);
    expect(occ).toHaveLength(before);
  });

  it('makes facetCounts count distinct events, not occurrences', () => {
    // A greenville weekly series (many occurrences) plus three one-offs. Per-
    // occurrence facets would inflate greenville; the collapsed facets must not.
    const events = [
      ev({ id: 'gvweekly', county: 'greenville', type: 'meetup', date: '2026-09-01', recurrence: { freq: 'weekly', until: '2026-11-01' } }),
      ev({ id: 'gv2once', county: 'greenville', type: 'public', date: '2026-09-04', recurrence: null }),
      ev({ id: 'ch1once', county: 'charleston', type: 'meetup', date: '2026-09-02', recurrence: null }),
      ev({ id: 'ri1once', county: 'richland', type: 'public', date: '2026-09-03', recurrence: null }),
    ];
    const occ = expandAll(events, '2027-09-01');
    const collapsed = collapseSeries(occ);
    const f = facetCounts(collapsed, ALL_EVENTS);
    expect(f.countyAll).toBe(4);
    expect(f.countyCounts).toEqual({ greenville: 2, charleston: 1, richland: 1 });
    expect(f.typeCounts).toEqual({ all: 4, meetup: 2, public: 2 });
  });
});

describe('recurrenceLabel', () => {
  it('returns null for a one-off event (no badge)', () => {
    expect(recurrenceLabel(null)).toBeNull();
  });

  it('labels a weekly series', () => {
    expect(recurrenceLabel({ freq: 'weekly', until: '2026-12-01' })).toBe('Repeats weekly');
  });

  it('labels a monthly series', () => {
    expect(recurrenceLabel({ freq: 'monthly_nth', until: '2026-12-01' })).toBe('Repeats monthly');
  });
});

describe('formatters', () => {
  it('formats the month abbreviation without touching the local time zone', () => {
    expect(monthAbbr('2026-01-01')).toBe('JAN');
    expect(monthAbbr('2026-12-31')).toBe('DEC');
  });

  it('strips the leading zero from the day', () => {
    expect(dayOfMonth('2026-09-05')).toBe('5');
    expect(dayOfMonth('2026-09-22')).toBe('22');
  });

  it('converts 24h to 12h', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM');
    expect(formatTime12('00:30')).toBe('12:30 AM');
    expect(formatTime12('09:05')).toBe('9:05 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
    expect(formatTime12('19:00')).toBe('7:00 PM');
    expect(formatTime12('23:59')).toBe('11:59 PM');
  });

  it('builds a lexically sortable key', () => {
    expect(sortKey('2026-09-01', '19:00', 'aaaaaaaa')).toBe('2026-09-01T19:00#aaaaaaaa');
    expect(sortKey('2026-09-01', '08:00', 'zzzzzzzz') < sortKey('2026-09-01', '19:00', 'aaaaaaaa')).toBe(true);
  });
});

// Four events across three counties and both types. Every filter test reads from
// this one set so a filter's result is always checkable by eye against it.
const MIXED = [
  ev({ id: 'gv1meet', county: 'greenville', city: 'greenville', type: 'meetup', date: '2026-09-01' }),
  ev({ id: 'gv2publ', county: 'greenville', city: 'greer', type: 'public', date: '2026-09-04' }),
  ev({ id: 'ch1meet', county: 'charleston', city: 'charleston', type: 'meetup', date: '2026-09-02' }),
  ev({ id: 'ri1publ', county: 'richland', city: 'columbia', type: 'public', date: '2026-09-03' }),
];

describe('matchesFilter', () => {
  it('accepts everything under the all/all filter', () => {
    expect(MIXED.every((e) => matchesFilter(e, ALL_EVENTS))).toBe(true);
  });

  it('rejects an event in another county', () => {
    expect(matchesFilter(MIXED[0], { county: 'charleston', type: 'all' })).toBe(false);
  });

  it('rejects an event of another type', () => {
    expect(matchesFilter(MIXED[0], { county: 'all', type: 'public' })).toBe(false);
  });
});

describe('filterEvents', () => {
  it('returns every event under the all/all filter', () => {
    expect(filterEvents(MIXED, ALL_EVENTS).map((e) => e.id)).toEqual([
      'gv1meet', 'gv2publ', 'ch1meet', 'ri1publ',
    ]);
  });

  it('returns a fresh array rather than the input', () => {
    expect(filterEvents(MIXED, ALL_EVENTS)).not.toBe(MIXED);
  });

  it('filters by county slug', () => {
    expect(filterEvents(MIXED, { county: 'greenville', type: 'all' }).map((e) => e.id)).toEqual([
      'gv1meet', 'gv2publ',
    ]);
  });

  it('filters by event type', () => {
    expect(filterEvents(MIXED, { county: 'all', type: 'meetup' }).map((e) => e.id)).toEqual([
      'gv1meet', 'ch1meet',
    ]);
  });

  it('composes county and type', () => {
    expect(filterEvents(MIXED, { county: 'greenville', type: 'public' }).map((e) => e.id)).toEqual([
      'gv2publ',
    ]);
  });

  it('returns empty for an unknown county without throwing', () => {
    expect(() => filterEvents(MIXED, { county: 'not-a-county', type: 'all' })).not.toThrow();
    expect(filterEvents(MIXED, { county: 'not-a-county', type: 'all' })).toEqual([]);
  });

  it('returns empty for an unknown county composed with a type', () => {
    expect(filterEvents(MIXED, { county: 'not-a-county', type: 'meetup' })).toEqual([]);
  });

  it('returns empty for a county with no event of the requested type', () => {
    expect(filterEvents(MIXED, { county: 'richland', type: 'meetup' })).toEqual([]);
  });
});

describe('filtering and recurrence expansion', () => {
  const RECURRING = [
    ev({
      id: 'gvweekly',
      county: 'greenville',
      date: '2026-09-01',
      recurrence: { freq: 'weekly', until: '2026-09-22' },
    }),
    ev({ id: 'ch1once', county: 'charleston', date: '2026-09-03', recurrence: null }),
  ];

  it('really does recur (fixture guard)', () => {
    const all = expandAll(RECURRING, '2027-09-01');
    expect(all.filter((o) => o.event.id === 'gvweekly').length).toBeGreaterThan(1);
  });

  it('leaks no occurrence of a recurring event that the filter excludes', () => {
    const out = expandAll(filterEvents(RECURRING, { county: 'charleston', type: 'all' }), '2027-09-01');
    expect(out.map((o) => o.event.id)).toEqual(['ch1once']);
  });

  it('leaks no occurrence when the filter is applied after expansion either', () => {
    const all = expandAll(RECURRING, '2027-09-01');
    expect(filterOccurrences(all, { county: 'charleston', type: 'all' }).map((o) => o.event.id)).toEqual([
      'ch1once',
    ]);
  });

  it('agrees whether the filter runs before or after expansion', () => {
    const filter = { county: 'greenville', type: 'all' as const };
    const before = expandAll(filterEvents(RECURRING, filter), '2027-09-01');
    const after = filterOccurrences(expandAll(RECURRING, '2027-09-01'), filter);
    expect(after.map((o) => `${o.date}:${o.event.id}`)).toEqual(
      before.map((o) => `${o.date}:${o.event.id}`),
    );
  });
});

describe('countyOptions', () => {
  it('lists only counties that actually have occurrences', () => {
    const occ = expandAll(MIXED, '2027-09-01');
    expect(countyOptions(occ).map((c) => c.county).sort()).toEqual([
      'charleston', 'greenville', 'richland',
    ]);
  });

  it('counts occurrences, not events, and sorts busiest first', () => {
    const occ = expandAll(MIXED, '2027-09-01');
    expect(countyOptions(occ)).toEqual([
      { county: 'greenville', count: 2 },
      { county: 'charleston', count: 1 },
      { county: 'richland', count: 1 },
    ]);
  });

  it('returns an empty list for no occurrences', () => {
    expect(countyOptions([])).toEqual([]);
  });
});

describe('facetCounts', () => {
  const OCC = expandAll(MIXED, '2027-09-01');

  it('reports full totals under the all/all filter', () => {
    const f = facetCounts(OCC, ALL_EVENTS);
    expect(f.countyAll).toBe(4);
    expect(f.countyCounts).toEqual({ greenville: 2, charleston: 1, richland: 1 });
    expect(f.typeCounts).toEqual({ all: 4, meetup: 2, public: 2 });
  });

  it('facets the county counts by the active type', () => {
    const f = facetCounts(OCC, { county: 'all', type: 'meetup' });
    expect(f.countyCounts).toEqual({ greenville: 1, charleston: 1 });
    expect(f.countyAll).toBe(2);
  });

  it('facets the type counts by the active county', () => {
    const f = facetCounts(OCC, { county: 'greenville', type: 'all' });
    expect(f.typeCounts).toEqual({ all: 2, meetup: 1, public: 1 });
  });

  it('leaves the county counts untouched by the active county', () => {
    const f = facetCounts(OCC, { county: 'greenville', type: 'all' });
    expect(f.countyCounts).toEqual({ greenville: 2, charleston: 1, richland: 1 });
  });

  it('reports zeros for an unknown active county', () => {
    const f = facetCounts(OCC, { county: 'not-a-county', type: 'all' });
    expect(f.typeCounts).toEqual({ all: 0, meetup: 0, public: 0 });
  });
});

describe('filterHash and parseFilterHash', () => {
  it('maps the all/all filter to an empty hash', () => {
    expect(filterHash(ALL_EVENTS)).toBe('');
  });

  it('maps a county filter to a county hash', () => {
    expect(filterHash({ county: 'greenville', type: 'all' })).toBe('#county=greenville');
  });

  it('maps a type filter to a type hash', () => {
    expect(filterHash({ county: 'all', type: 'meetup' })).toBe('#type=meetups');
    expect(filterHash({ county: 'all', type: 'public' })).toBe('#type=public');
  });

  it('puts the county first in a composed hash', () => {
    expect(filterHash({ county: 'greenville', type: 'meetup' })).toBe(
      '#county=greenville&type=meetups',
    );
  });

  it('round-trips every shape', () => {
    for (const filter of [
      ALL_EVENTS,
      { county: 'greenville', type: 'all' as const },
      { county: 'all', type: 'meetup' as const },
      { county: 'all', type: 'public' as const },
      { county: 'greenville', type: 'meetup' as const },
    ]) {
      expect(parseFilterHash(filterHash(filter))).toEqual(filter);
    }
  });

  it('parses a hash string with the leading # already stripped', () => {
    expect(parseFilterHash('county=greenville&type=meetups')).toEqual({
      county: 'greenville',
      type: 'meetup',
    });
  });

  it('keeps an unknown county so the filter resolves to empty rather than to everything', () => {
    const filter = parseFilterHash('#county=not-a-county');
    expect(filter).toEqual({ county: 'not-a-county', type: 'all' });
    expect(filterEvents(MIXED, filter)).toEqual([]);
  });

  it('falls back to all events for an empty hash and for junk', () => {
    expect(parseFilterHash('')).toEqual(ALL_EVENTS);
    expect(parseFilterHash('#')).toEqual(ALL_EVENTS);
    expect(parseFilterHash('#nonsense')).toEqual(ALL_EVENTS);
  });

  it('skips a malformed percent-escape instead of throwing (crafted-link DoS)', () => {
    // decodeURIComponent('%') throws a URIError; a shared #county=% must not take
    // the whole page module down with it. The bad part is dropped.
    expect(() => parseFilterHash('#county=%')).not.toThrow();
    expect(parseFilterHash('#county=%')).toEqual(ALL_EVENTS);
    expect(parseFilterHash('#type=%zz')).toEqual(ALL_EVENTS);
    // A malformed part next to a good one keeps the good one.
    expect(parseFilterHash('#county=%&type=meetups')).toEqual({ county: 'all', type: 'meetup' });
  });
});

describe('emptyStateProof', () => {
  it('points to the Signal group when nothing has run', () => {
    expect(emptyStateProof(0)).toBe(
      "Nothing has run in the last 90 days either. Join the Signal group and you'll hear when the first one lands.",
    );
  });

  it('uses the singular for one past event', () => {
    expect(emptyStateProof(1)).toBe('1 event has run in the last 90 days.');
  });

  it('uses the plural for several', () => {
    expect(emptyStateProof(3)).toBe('3 events have run in the last 90 days.');
  });
});
