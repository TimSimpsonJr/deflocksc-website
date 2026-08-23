import { describe, it, expect } from 'vitest';
import {
  dissolveRings,
  simplifyRing,
  ringArea,
  ringSelfIntersects,
} from './build-county-shapes.mjs';

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

describe('ringSelfIntersects', () => {
  it('flags a bowtie (crossing chords) as self-intersecting', () => {
    // Edges (0,0)->(2,2) and (2,0)->(0,2) cross at (1,1): the classic self-crossing.
    const bowtie = [[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]];
    expect(ringSelfIntersects(bowtie)).toBe(true);
  });

  it('flags a spur that doubles back across the boundary', () => {
    // A thin spike whose returning edge crosses the top edge — the shape the old
    // edge-cancellation dissolve spliced in at multi-district junctions.
    const spur = [[0, 0], [4, 0], [4, 4], [1, 4], [3, 5], [1.5, 3], [0, 4], [0, 0]];
    expect(ringSelfIntersects(spur)).toBe(true);
  });

  it('does not flag a simple square', () => {
    expect(ringSelfIntersects(left)).toBe(false);
  });

  it('does not flag a simple convex polygon', () => {
    const hexagon = [[0, 1], [1, 0], [2, 0], [3, 1], [2, 2], [1, 2], [0, 1]];
    expect(ringSelfIntersects(hexagon)).toBe(false);
  });

  it('does not flag a triangle (too few edges to cross)', () => {
    expect(ringSelfIntersects([[0, 0], [1, 0], [0, 1], [0, 0]])).toBe(false);
  });

  it('accepts the outline dissolveRings actually produces', () => {
    const [ring] = dissolveRings([left, right]);
    expect(ringSelfIntersects(ring)).toBe(false);
  });
});
