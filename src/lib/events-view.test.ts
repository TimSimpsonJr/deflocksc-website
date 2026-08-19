import { describe, it, expect } from 'vitest';
import {
  mergeEvents,
  parseOverlayEnvelope,
  expandAll,
  splitByToday,
  monthAbbr,
  dayOfMonth,
  formatTime12,
  sortKey,
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
