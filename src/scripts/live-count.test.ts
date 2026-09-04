import { describe, it, expect } from 'vitest';
import { parseLiveCount, cameraFloor } from './live-count.js';

describe('parseLiveCount', () => {
  it('returns the floored total for a valid live payload', () => {
    expect(parseLiveCount({ scTotal: 1700, stale: false })).toBe(1700);
    expect(parseLiveCount({ scTotal: 1699.9, stale: false })).toBe(1699);
  });

  it('returns null for the stale sentinel', () => {
    expect(parseLiveCount({ stale: true })).toBeNull();
  });

  it('returns null for missing / non-numeric / non-positive totals', () => {
    expect(parseLiveCount({})).toBeNull();
    expect(parseLiveCount({ scTotal: '1700' as unknown as number })).toBeNull();
    expect(parseLiveCount({ scTotal: Number.NaN })).toBeNull();
    expect(parseLiveCount({ scTotal: 0 })).toBeNull();
    expect(parseLiveCount({ scTotal: -5 })).toBeNull();
  });

  it('returns null for null / undefined', () => {
    expect(parseLiveCount(null)).toBeNull();
    expect(parseLiveCount(undefined)).toBeNull();
  });
});

describe('cameraFloor', () => {
  it('rounds down to the nearest hundred (the Hero "more than N" floor)', () => {
    expect(cameraFloor(1624)).toBe(1600);
    expect(cameraFloor(1700)).toBe(1700);
    expect(cameraFloor(1699)).toBe(1600);
  });
});
