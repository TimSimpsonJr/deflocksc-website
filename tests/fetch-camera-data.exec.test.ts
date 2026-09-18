import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OVERPASS_MIRRORS } from '../src/lib/overpass.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = join(repoRoot, 'node_modules', '.cache', 'fetch-camera-data.exec-test.mjs');

const [MIRROR_1, MIRROR_2] = OVERPASS_MIRRORS;

// A prior committed snapshot the fetch step must NOT clobber on a bad payload,
// plus the two downstream artifacts the fetch step never writes (seeded so the
// "artifacts unchanged" guarantee is literal — the build step that would write
// them never runs because fetch fails first). ONE record inside SC: the
// regression check then projects it to 1, so the threshold is the floor (1000).
const PRIOR_SNAPSHOT = JSON.stringify([{ id: 42, lat: 34, lon: -81 }]);
const PRIOR_COUNTS = JSON.stringify({ 'county:test': 5 }) + '\n';
const PRIOR_STATS = JSON.stringify({ scTotal: 5, jurisdictions: 1, generatedAt: 'x' }) + '\n';

// --- Overpass fixtures ---

type OverpassNode = {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

function node(id: number, lat: number, lon: number, tags?: Record<string, string>): OverpassNode {
  return { type: 'node', id, lat, lon, ...(tags ? { tags } : {}) };
}

/** n well-formed nodes inside SC_BOUNDS on a small grid (clears the 1000 regression floor at n >= 1000). */
function scNodes(n: number): OverpassNode[] {
  return Array.from({ length: n }, (_, i) =>
    node(i + 1, 34 + (i % 100) * 0.001, -81 - Math.floor(i / 100) * 0.001, {
      manufacturer: 'Flock Safety',
    }),
  );
}

/** What the script writes for a node list: type dropped, tags preserved. */
function expectedCameras(nodes: OverpassNode[]) {
  return nodes.map(({ id, lat, lon, tags }) => ({ id, lat, lon, tags }));
}

/** A well-formed Overpass JSON envelope. Default timestamp is "now" (fresh). */
function envelope(elements: unknown[], timestampOsmBase: string = new Date().toISOString()) {
  return {
    version: 0.6,
    generator: 'Overpass API 0.7.62',
    osm3s: { timestamp_osm_base: timestampOsmBase, copyright: 'ODbL' },
    elements,
  };
}

// --- fetch stub, keyed by request URL so mirror fallback can be simulated ---

type MockResponse = { status: number; body: unknown } | { throw: string };
type MockPlan = Record<string, MockResponse>;

/** The same response from every mirror. */
function everyMirror(res: MockResponse): MockPlan {
  return Object.fromEntries(OVERPASS_MIRRORS.map((url) => [url, res]));
}

// A preload module that stubs global fetch. Evaluated (via `node --import`)
// BEFORE the bundle's entry point, so the bundle's fetch(mirrorUrl) calls hit
// this stub — no network, no port. A URL with no plan entry throws like a
// network failure would.
function preload(plan: MockPlan): string {
  return [
    `const PLAN = ${JSON.stringify(plan)};`,
    'globalThis.fetch = async (input) => {',
    "  const url = typeof input === 'string' ? input : input.url;",
    '  const spec = PLAN[url];',
    "  if (!spec) throw new TypeError('fetch failed: no mock for ' + url);",
    "  if ('throw' in spec) throw new TypeError(spec.throw);",
    '  return new Response(JSON.stringify(spec.body), {',
    "    status: spec.status, headers: { 'content-type': 'application/json' } });",
    '};',
    '',
  ].join('\n');
}

let fixtureRoot: string;
let cameraData: string;
let countsOut: string;
let statsOut: string;

beforeAll(async () => {
  // Bundle the fetch step with the EXACT flags the `fetch-camera-data` npm script
  // uses, producing the same node_modules/.cache artifact whose behavior is under
  // test.
  await build({
    entryPoints: [join(repoRoot, 'scripts', 'fetch-camera-data.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: bundlePath,
  });
}, 120_000);

afterAll(() => {
  rmSync(bundlePath, { force: true });
});

function seedFixture(priorSnapshot: string = PRIOR_SNAPSHOT): void {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'fetch-camera-exec-'));
  mkdirSync(join(fixtureRoot, 'public'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'src', 'data'), { recursive: true });
  cameraData = join(fixtureRoot, 'public', 'camera-data.json');
  countsOut = join(fixtureRoot, 'public', 'camera-counts.json');
  statsOut = join(fixtureRoot, 'src', 'data', 'impact-stats.json');
  writeFileSync(cameraData, priorSnapshot);
  writeFileSync(countsOut, PRIOR_COUNTS);
  writeFileSync(statsOut, PRIOR_STATS);
}

// Run the bundle from the fixture cwd with `fetch` stubbed per `plan`. Returns
// whether the process exited 0. A throw (non-zero exit) is the failure signal
// the validation boundary produces. Retry delay is zeroed so failing cases do
// not sleep between attempts.
function runBundle(plan: MockPlan, env: Record<string, string> = {}): boolean {
  const preloadPath = join(fixtureRoot, 'mock-fetch.mjs');
  writeFileSync(preloadPath, preload(plan));
  try {
    execFileSync(process.execPath, ['--import', pathToFileURL(preloadPath).href, bundlePath], {
      cwd: fixtureRoot,
      stdio: 'ignore',
      env: { ...process.env, OVERPASS_RETRY_DELAY_MS: '0', ...env },
    });
    return true;
  } catch {
    return false;
  }
}

function expectUntouched(): void {
  expect(readFileSync(countsOut, 'utf8')).toBe(PRIOR_COUNTS);
  expect(readFileSync(statsOut, 'utf8')).toBe(PRIOR_STATS);
}

describe('fetch-camera-data validation boundary (cluster: refresh-boundary-validation)', () => {
  it('FAILS non-zero on a MIXED valid+malformed payload and overwrites NOTHING', () => {
    seedFixture();
    // 1200 well-formed nodes + one malformed: the shared all-or-nothing gate must
    // reject the WHOLE payload, so no filtered undercount is ever written. (1200
    // clears the regression floor, so this exercises the STRUCTURAL gate, not
    // the regression check.)
    const ok = runBundle(
      everyMirror({
        status: 200,
        body: envelope([...scNodes(1200), { type: 'node', id: 9999, lat: 'x', lon: 'y' }]),
      }),
    );
    expect(ok).toBe(false); // process exited non-zero -> refresh step failed
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS non-zero on an EMPTY elements array and does not write an empty snapshot', () => {
    seedFixture();
    expect(runBundle(everyMirror({ status: 200, body: envelope([]) }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('positive control: a fresh, complete envelope exits 0 and DOES write the mapped snapshot', () => {
    seedFixture();
    const nodes = scNodes(1200);
    expect(runBundle(everyMirror({ status: 200, body: envelope(nodes) }))).toBe(true); // exited 0
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes)); // snapshot replaced
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});

describe('Overpass envelope integrity (design 2026-09-17 §1)', () => {
  it('FAILS on a 200 that carries a remark (server-side abort) even with a plausible elements array', () => {
    seedFixture();
    const aborted = {
      ...envelope(scNodes(1200)),
      remark: 'runtime error: Query timed out in "query" at line 2 after 120 seconds.',
    };
    expect(runBundle(everyMirror({ status: 200, body: aborted }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS on a stale timestamp_osm_base (mirror serving an old replica)', () => {
    seedFixture();
    const threeDaysAgo = new Date(Date.now() - 72 * 3_600_000).toISOString();
    expect(
      runBundle(everyMirror({ status: 200, body: envelope(scNodes(1200), threeDaysAgo) })),
    ).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS on a missing timestamp_osm_base', () => {
    seedFixture();
    const { osm3s: _omit, ...noTimestamp } = envelope(scNodes(1200));
    expect(runBundle(everyMirror({ status: 200, body: noTimestamp }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});

describe('implausible-regression guard (like-scope compare)', () => {
  // Seed a prior with 2000 in-SC cameras; a 1200-camera candidate is a 40% drop.
  const priorLarge = JSON.stringify(expectedCameras(scNodes(2000)));

  it('FAILS when the SC-projected count drops more than 10% vs the prior snapshot', () => {
    seedFixture(priorLarge);
    expect(runBundle(everyMirror({ status: 200, body: envelope(scNodes(1200)) }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(priorLarge);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('ALLOW_CAMERA_DROP=1 lets a genuine large removal through (logged override)', () => {
    seedFixture(priorLarge);
    const nodes = scNodes(1200);
    expect(
      runBundle(everyMirror({ status: 200, body: envelope(nodes) }), { ALLOW_CAMERA_DROP: '1' }),
    ).toBe(true);
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});

describe('prior-snapshot integrity (a corrupt committed prior must fail-red, not bypass the floor)', () => {
  // readPriorSnapshot returns null ONLY when the file is absent. A present but
  // unreadable/invalid prior must throw BEFORE any mirror is queried, otherwise a
  // null prior would skip assertNoRegression (regression check AND floor) and let
  // this otherwise-acceptable 1200-camera envelope overwrite the corrupt file.
  const MALFORMED_JSON = '[{"id":1,"lat":34,"lon":-81}'; // truncated -> JSON.parse throws
  const INVALID_ARRAY = JSON.stringify([{ id: 1, lat: 34, lon: -81 }, { id: 2, lat: 'x', lon: 'y' }]); // parses, fails assertValidCameraPayload

  it('FAILS non-zero when the committed prior is not valid JSON, touching nothing', () => {
    seedFixture(MALFORMED_JSON);
    expect(runBundle(everyMirror({ status: 200, body: envelope(scNodes(1200)) }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(MALFORMED_JSON);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS non-zero when the committed prior is a structurally invalid array, touching nothing', () => {
    seedFixture(INVALID_ARRAY);
    expect(runBundle(everyMirror({ status: 200, body: envelope(scNodes(1200)) }))).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(INVALID_ARRAY);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});

describe('mirror fallback + fail-red', () => {
  it('advances to the next mirror on a network error and writes the second mirror\'s good envelope', () => {
    seedFixture();
    const nodes = scNodes(1200);
    const plan: MockPlan = {
      [MIRROR_1]: { throw: 'fetch failed: ECONNRESET' },
      [MIRROR_2]: { status: 200, body: envelope(nodes) },
      // MIRROR_3 deliberately absent: it must never be reached.
    };
    expect(runBundle(plan)).toBe(true);
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('treats a validation failure (200 + remark) as a mirror failure and advances', () => {
    seedFixture();
    const nodes = scNodes(1200);
    const plan: MockPlan = {
      [MIRROR_1]: { status: 200, body: { ...envelope(scNodes(5)), remark: 'runtime error: out of memory' } },
      [MIRROR_2]: { status: 200, body: envelope(nodes) },
    };
    expect(runBundle(plan)).toBe(true);
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('advances on a non-2xx status', () => {
    seedFixture();
    const nodes = scNodes(1200);
    const plan: MockPlan = {
      [MIRROR_1]: { status: 504, body: 'Gateway Timeout' },
      [MIRROR_2]: { status: 200, body: envelope(nodes) },
    };
    expect(runBundle(plan)).toBe(true);
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(expectedCameras(nodes));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS non-zero and leaves the snapshot untouched when EVERY mirror fails (fail-red)', () => {
    seedFixture();
    expect(runBundle({})).toBe(false); // every fetch throws (no plan entries)
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    expectUntouched();
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});
