import { describe, it, expect } from 'vitest';
import { cityLabel } from './city-label.js';

describe('cityLabel', () => {
  it('capitalizes a single-word slug', () => {
    expect(cityLabel('greenville')).toBe('Greenville');
  });

  it('capitalizes every word of a hyphenated slug', () => {
    expect(cityLabel('mount-pleasant')).toBe('Mount Pleasant');
  });

  it('strips a registry place: prefix', () => {
    expect(cityLabel('place:north-charleston')).toBe('North Charleston');
  });

  it('returns an empty string for an empty slug', () => {
    expect(cityLabel('')).toBe('');
  });

  it('ignores repeated and trailing hyphens', () => {
    expect(cityLabel('fort--mill-')).toBe('Fort Mill');
  });

  it('leaves already-capitalized input alone', () => {
    expect(cityLabel('Aiken')).toBe('Aiken');
  });

  it('is idempotent', () => {
    expect(cityLabel(cityLabel('mount-pleasant'))).toBe('Mount Pleasant');
  });
});
