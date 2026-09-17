import { describe, it, expect } from 'vitest';
import { homepageAsks, askFrameStats } from './homepage-asks.js';
import { cityBrief, countyBrief } from './council-brief.js';
import { ICONS } from './brief-icons.js';
import { parseStat } from '../scripts/count-up.js';

// Independently derive the cite vocabulary from the two briefs, rather than
// reusing homepage-asks' own `briefCites` export, so this stays a genuine drift
// guard: if a homepage cite is edited to something the briefs no longer carry,
// this fails.
const briefCites = new Set<string>(
  [...cityBrief.model.cards, ...countyBrief.model.cards]
    .map((card) => card.cite)
    .filter((cite): cite is string => typeof cite === 'string'),
);

/**
 * The cite line as rendered on the homepage: canonical cite + optional suffix,
 * or nothing at all when a general ask carries no cite (LegislationAsks.astro
 * only renders the `.dcite` node when `ask.cite` is present).
 */
function citeLine(ask: (typeof homepageAsks)[number]): string {
  return ask.cite ? ask.cite + (ask.displaySuffix ?? '') : '';
}

describe('homepageAsks', () => {
  it('has exactly six asks', () => {
    expect(homepageAsks).toHaveLength(6);
  });

  it('every canonical cite present exactly matches a cite in council-brief.ts', () => {
    for (const ask of homepageAsks) {
      if (ask.cite === undefined) continue;
      expect(briefCites).toContain(ask.cite);
    }
  });

  it('references only glyphs present in brief-icons.ts', () => {
    for (const ask of homepageAsks) {
      expect(Object.keys(ICONS)).toContain(ask.icon);
    }
  });

  it('renders the audit-logs ask as a general ask: no cite line and no scope', () => {
    const auditLogs = homepageAsks.find((a) => a.title === 'Publish the audit logs');
    expect(auditLogs).toBeDefined();
    expect(auditLogs!.cite).toBeUndefined();
    expect(auditLogs!.displaySuffix).toBeUndefined();
    expect(auditLogs!.scope).toBeUndefined();
    expect(citeLine(auditLogs!)).toBe('');
  });

  it('renders the cite line as cite + displaySuffix when a cite is present, else nothing', () => {
    for (const ask of homepageAsks) {
      if (ask.cite === undefined) {
        expect(citeLine(ask)).toBe('');
      } else {
        expect(citeLine(ask)).toBe(ask.cite + (ask.displaySuffix ?? ''));
      }
    }
  });

  it('scopes only the county-specific ask', () => {
    const scoped = homepageAsks
      .filter((a) => a.scope)
      .map((a) => [a.title, a.scope]);
    expect(scoped).toEqual([['Close the side doors', 'County']]);
  });
});

describe('askFrameStats', () => {
  it('has the two closing framing stats', () => {
    expect(askFrameStats).toHaveLength(2);
  });

  it('every displayed value is parseable by the shared count-up util', () => {
    for (const stat of askFrameStats) {
      expect(parseStat(stat.value)).not.toBeNull();
    }
  });

  it('marks the "0 state laws" stat with the amber zero treatment', () => {
    const zero = askFrameStats.find((s) => s.value === '0');
    expect(zero).toBeDefined();
    expect(zero!.zero).toBe(true);
  });
});
