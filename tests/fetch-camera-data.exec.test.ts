import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const bundlePath = join(repoRoot, 'node_modules', '.cache', 'fetch-camera-data.exec-test.mjs');

// A prior committed snapshot the fetch step must NOT clobber on a bad payload,
// plus the two downstream artifacts the fetch step never writes (seeded so the
// "artifacts unchanged" guarantee is literal — the build step that would write
// them never runs because fetch fails first).
const PRIOR_SNAPSHOT = JSON.stringify([{ id: 42, lat: 34, lon: -81 }]);
const PRIOR_COUNTS = JSON.stringify({ 'county:test': 5 }) + '\n';
const PRIOR_STATS = JSON.stringify({ scTotal: 5, jurisdictions: 1, generatedAt: 'x' }) + '\n';

// A preload module that stubs global fetch to return `records` as the CDN body.
// Evaluated (via `node --import`) BEFORE the bundle's entry point, so the
// bundle's fetch(CDN_URL) call hits this stub — no network, no port.
function preload(records: unknown): string {
  return (
    'globalThis.fetch = async () => new Response(' +
    JSON.stringify(JSON.stringify(records)) +
    ", { status: 200, headers: { 'content-type': 'application/json' } });\n"
  );
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

function seedFixture(): void {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'fetch-camera-exec-'));
  mkdirSync(join(fixtureRoot, 'public'), { recursive: true });
  mkdirSync(join(fixtureRoot, 'src', 'data'), { recursive: true });
  cameraData = join(fixtureRoot, 'public', 'camera-data.json');
  countsOut = join(fixtureRoot, 'public', 'camera-counts.json');
  statsOut = join(fixtureRoot, 'src', 'data', 'impact-stats.json');
  writeFileSync(cameraData, PRIOR_SNAPSHOT);
  writeFileSync(countsOut, PRIOR_COUNTS);
  writeFileSync(statsOut, PRIOR_STATS);
}

// Run the bundle from the fixture cwd with `fetch` stubbed to return `records`.
// Returns whether the process exited 0. A throw (non-zero exit) is the failure
// signal the validation boundary produces on a bad payload.
function runBundle(records: unknown): boolean {
  const preloadPath = join(fixtureRoot, 'mock-fetch.mjs');
  writeFileSync(preloadPath, preload(records));
  try {
    execFileSync(process.execPath, ['--import', pathToFileURL(preloadPath).href, bundlePath], {
      cwd: fixtureRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

describe('fetch-camera-data validation boundary (cluster: refresh-boundary-validation)', () => {
  it('FAILS non-zero on a MIXED valid+malformed payload and overwrites NOTHING', () => {
    seedFixture();
    // Two well-formed records + one malformed: the shared all-or-nothing gate must
    // reject the WHOLE payload, so no filtered undercount is ever written.
    const ok = runBundle([
      { id: 1, lat: 34, lon: -81 }, // well-formed, inside SC
      { id: 2, lat: 34.5, lon: -80 }, // well-formed, inside SC
      { id: 3, lat: 'x', lon: 'y' }, // malformed -> poisons the whole payload
    ]);
    expect(ok).toBe(false); // process exited non-zero -> refresh step failed
    // Prior snapshot + both downstream artifacts are byte-for-byte intact.
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    expect(readFileSync(countsOut, 'utf8')).toBe(PRIOR_COUNTS);
    expect(readFileSync(statsOut, 'utf8')).toBe(PRIOR_STATS);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('FAILS non-zero on an EMPTY array and does not write an empty snapshot', () => {
    seedFixture();
    expect(runBundle([])).toBe(false);
    expect(readFileSync(cameraData, 'utf8')).toBe(PRIOR_SNAPSHOT);
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('positive control: a fully well-formed payload exits 0 and DOES write the new snapshot', () => {
    seedFixture();
    const fresh = [
      { id: 1, lat: 34, lon: -81 },
      { id: 2, lat: 34.5, lon: -80 },
    ];
    expect(runBundle(fresh)).toBe(true); // exited 0
    expect(JSON.parse(readFileSync(cameraData, 'utf8'))).toEqual(fresh); // snapshot replaced
    rmSync(fixtureRoot, { recursive: true, force: true });
  });
});
