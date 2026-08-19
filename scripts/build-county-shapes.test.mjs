import { describe, it, expect } from 'vitest';
import { dissolveRings, simplifyRing, ringArea } from './build-county-shapes.mjs';

// Two unit squares sharing the edge x=1. Dissolved, they are one 2x1 rectangle.
const left = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
const right = [[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]];

describe('dissolveRings', () => {
  it('returns a single ring for two squares sharing an edge', () => {
    const out = dissolveRings([left, right]);
    expect(out).toHaveLength(1);
    expect(Math.abs(ringArea(out[0]))).toBeCloseTo(2, 6);
  });

  it('closes the ring it returns', () => {
    const [ring] = dissolveRings([left, right]);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('drops the shared edge from the output', () => {
    const [ring] = dissolveRings([left, right]);
    const interior = ring.filter((p) => p[0] === 1 && p[1] > 0 && p[1] < 1);
    expect(interior).toEqual([]);
  });

  it('returns two rings for two disjoint squares', () => {
    const far = [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]];
    expect(dissolveRings([left, far])).toHaveLength(2);
  });

  it('snaps near-identical vertices so they still cancel', () => {
    const rightNudged = [[1.00001, 0], [2, 0], [2, 1], [1.00001, 1], [1.00001, 0]];
    expect(dissolveRings([left, rightNudged])).toHaveLength(1);
  });

  it('returns an empty array for no input', () => {
    expect(dissolveRings([])).toEqual([]);
  });
});

describe('simplifyRing', () => {
  it('drops collinear midpoints', () => {
    const ring = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
    const out = simplifyRing(ring, 0.001);
    expect(out).toHaveLength(5);
    expect(out.some((p) => p[0] === 1 && p[1] === 0)).toBe(false);
  });

  it('keeps a vertex whose deviation exceeds the tolerance', () => {
    const ring = [[0, 0], [1, 0.5], [2, 0], [2, 2], [0, 2], [0, 0]];
    expect(simplifyRing(ring, 0.1)).toHaveLength(6);
  });

  it('leaves the ring closed', () => {
    const ring = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
    const out = simplifyRing(ring, 0.001);
    expect(out[0]).toEqual(out[out.length - 1]);
  });

  it('never collapses a ring below a triangle', () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
    expect(simplifyRing(ring, 1000).length).toBeGreaterThanOrEqual(4);
  });
});

describe('ringArea', () => {
  it('is positive for a counter-clockwise ring', () => {
    expect(ringArea(left)).toBeCloseTo(1, 6);
  });

  it('is negative for a clockwise ring', () => {
    expect(ringArea([...left].reverse())).toBeCloseTo(-1, 6);
  });
});
