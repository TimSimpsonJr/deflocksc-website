import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = join(repoRoot, 'node_modules', '.cache', 'build-impact-stats.exec-test.mjs');

// A square covering the SC test coords (lon -83..-79, lat 33..35), GeoJSON [lng, lat].
const scSquare = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-83, 33], [-79, 33], [-79, 35], [-83, 35], [-83, 33]]],
      },
    },
  ],
};

// Two cameras inside the square, one outside the SC bbox (pre-filtered out).
const cameras = [
  { id: 1, lat: 34, lon: -81 },
  { id: 2, lat: 34.5, lon: -80 },
  { id: 3, lat: 40, lon: -100 },
];

let fixtureRoot: string;

beforeAll(async () => {
  // Bundle the generator with the EXACT flags the `build-impact-stats` npm script
  // uses (bundle + platform node + esm + external packages). This produces the
  // same node_modules/.cache artifact whose ROOT resolution is under test.
  await build({
    entryPoints: [join(repoRoot, 'scripts', 'build-impact-stats.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: bundlePath,
  });

  // A throwaway project root holding ONLY the inputs the generator reads, so a
  // pass proves it resolved them from process.cwd() (this dir), not from the
  // bundle's own location under node_modules/.cache.
  fixtureRoot = mkdtempSync(join(tmpdir(), 'impact-stats-exec-'));
  mkdirSync(join(fixtureRoot, 'public', 'districts'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'src', 'data'), { recursive: true });
  writeFileSync(join(fixtureRoot, 'public', 'camera-data.json'), JSON.stringify(cameras));
  writeFileSync(
    join(fixtureRoot, 'public', 'districts', 'state-outline.json'),
    JSON.stringify(scSquare),
  );
  writeFileSync(
    join(fixtureRoot, 'public', 'districts', 'county-test.json'),
    JSON.stringify(scSquare),
  );
}, 120_000);

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(bundlePath, { force: true });
});

describe('build-impact-stats bundled execution (cluster: bundled-script-root)', () => {
  it('resolves public/ + src/data from process.cwd() and writes correct figures', () => {
    // Run the bundle from the fixture root. A throw here (ENOENT) is the failure
    // signal that ROOT regressed to an import.meta.url walk into node_modules.
    execFileSync(process.execPath, [bundlePath], {
      cwd: fixtureRoot,
      env: { ...process.env, IMPACT_STATS_DATE: '2026-09-04T00:00:00Z' },
      stdio: 'ignore',
    });

    const stats = JSON.parse(
      readFileSync(join(fixtureRoot, 'src', 'data', 'impact-stats.json'), 'utf8'),
    );
    const counts = JSON.parse(
      readFileSync(join(fixtureRoot, 'public', 'camera-counts.json'), 'utf8'),
    );

    // ids 1 + 2 are inside the square; id 3 is outside the SC bbox.
    expect(stats.scTotal).toBe(2);
    expect(stats.jurisdictions).toBe(1);
    expect(stats.generatedAt).toBe('2026-09-04T00:00:00.000Z');
    expect(counts).toEqual({ 'county:test': 2 });
  });
});
