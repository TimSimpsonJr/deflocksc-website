import { describe, it, expect } from 'vitest';
import { parseStat, formatStat } from './count-up.js';

describe('parseStat', () => {
  it('parses a plain integer (the action-modal path: no commas, no suffix)', () => {
    expect(parseStat('214')).toEqual({ value: 214, suffix: '', comma: false });
  });

  it('parses zero', () => {
    expect(parseStat('0')).toEqual({ value: 0, suffix: '', comma: false });
  });

  it('parses a comma-grouped value', () => {
    expect(parseStat('1,624')).toEqual({ value: 1624, suffix: '', comma: true });
  });

  it('parses a plus suffix', () => {
    expect(parseStat('110+')).toEqual({ value: 110, suffix: '+', comma: false });
  });

  it('parses an "M+" suffix', () => {
    expect(parseStat('422M+')).toEqual({ value: 422, suffix: 'M+', comma: false });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseStat('  100+  ')).toEqual({ value: 100, suffix: '+', comma: false });
  });

  it('returns null for content with no leading integer', () => {
    expect(parseStat('')).toBeNull();
    expect(parseStat('none')).toBeNull();
    expect(parseStat('+5')).toBeNull();
  });
});

describe('formatStat', () => {
  it('formats a plain integer with no commas and no suffix (no regression)', () => {
    const fmt = parseStat('214')!;
    expect(formatStat(0, fmt)).toBe('0');
    expect(formatStat(107, fmt)).toBe('107');
    expect(formatStat(214, fmt)).toBe('214');
  });

  it('rounds intermediate frame values', () => {
    const fmt = parseStat('214')!;
    expect(formatStat(106.7, fmt)).toBe('107');
  });

  it('preserves comma grouping every frame', () => {
    const fmt = parseStat('1,624')!;
    expect(formatStat(0, fmt)).toBe('0');
    expect(formatStat(1624, fmt)).toBe('1,624');
    expect(formatStat(1000, fmt)).toBe('1,000');
  });

  it('preserves the suffix every frame', () => {
    const plus = parseStat('110+')!;
    expect(formatStat(0, plus)).toBe('0+');
    expect(formatStat(110, plus)).toBe('110+');

    const millions = parseStat('422M+')!;
    expect(formatStat(422, millions)).toBe('422M+');
  });

  it('round-trips a parsed value back to its source string', () => {
    for (const src of ['0', '214', '1,624', '110+', '422M+']) {
      const fmt = parseStat(src)!;
      expect(formatStat(fmt.value, fmt)).toBe(src);
    }
  });
});
