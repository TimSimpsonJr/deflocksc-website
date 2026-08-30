import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = path.join(repoRoot, 'dist');

// Substrings that identify the Umami beacon in built HTML. The tag renders as:
//   <script defer src="/u/script.js" data-website-id="c0ff812f-..."></script>
const UMAMI_SRC = '/u/script.js';
const UMAMI_ATTR = 'data-website-id';

function readBuilt(relPath: string): string {
  const full = path.join(distDir, relPath);
  if (!existsSync(full)) {
    throw new Error(
      `Expected build output at dist/${relPath}, but it does not exist. ` +
        `If /events has not been implemented yet, this guard cannot run.`
    );
  }
  return readFileSync(full, 'utf8');
}

beforeAll(() => {
  // Invoke Astro directly rather than `npm run build`: that would fire the
  // prebuild open-civics sync, which hits the network. Calling the module
  // through process.execPath avoids npx/npm PATH resolution on Windows.
  execFileSync(
    process.execPath,
    [path.join('node_modules', 'astro', 'astro.js'), 'build'],
    { cwd: repoRoot, stdio: 'ignore' }
  );
}, 300_000);

describe('Umami beacon exclusion (design §14)', () => {
  it('omits the Umami script from the built /events page', () => {
    const html = readBuilt('events/index.html');
    expect(html).not.toContain(UMAMI_SRC);
    expect(html).not.toContain(UMAMI_ATTR);
  });

  it('omits the Umami script from a child route under /events (the submit page)', () => {
    // The exclusion must hold for every /events/* route, not just the index.
    // The organizer submit page and any future event-detail page are the most
    // subpoena-sensitive pages in the design — a regression that narrowed the
    // gate to the index alone would silently re-enable tracking here.
    const html = readBuilt('events/submit/index.html');
    expect(html).not.toContain(UMAMI_SRC);
    expect(html).not.toContain(UMAMI_ATTR);
  });

  it('keeps the Umami script on the built homepage', () => {
    const html = readBuilt('index.html');
    expect(html).toContain(UMAMI_SRC);
    expect(html).toContain(UMAMI_ATTR);
  });

  it('keeps the Umami script on an interior page outside /events', () => {
    const html = readBuilt('toolkit/index.html');
    expect(html).toContain(UMAMI_SRC);
    expect(html).toContain(UMAMI_ATTR);
  });
});

// --- Config-content guards (CSP, caching, lighthouse, gitignore) ---
// These read the config files directly rather than dist/, so unlike the Umami
// guard above they do not depend on the build. They share the file only so all
// config regressions live in one place.

// tests/ sits one directory below the repo root
const rootUrl = new URL('../', import.meta.url);
const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, rootUrl), 'utf8');

/**
 * Parse a Netlify `_headers` file into { pathPattern: [headerLine, ...] }.
 * Unindented non-comment lines are path patterns; indented lines are header values.
 */
function parseHeadersFile(text: string): Record<string, string[]> {
  const blocks: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = trimmed;
      blocks[current] = [];
    } else if (current !== null) {
      blocks[current].push(trimmed);
    }
  }
  return blocks;
}

const headerBlocks = parseHeadersFile(read('public/_headers'));
const cspLine =
  (headerBlocks['/*'] ?? []).find((l) => /^content-security-policy:/i.test(l)) ?? '';

const netlifyToml = read('netlify.toml');
const tomlHeaderPaths = [...netlifyToml.matchAll(/^\s*for\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);

describe('public/_headers', () => {
  it('declares exactly one header block, for /*', () => {
    expect(Object.keys(headerBlocks)).toEqual(['/*']);
  });

  it('adds base-uri, form-action and object-src to the CSP', () => {
    for (const directive of ["base-uri 'none'", "form-action 'self'", "object-src 'none'"]) {
      expect(cspLine).toContain(directive);
      // exactly once: a duplicated directive is a merge artifact, and the
      // browser honours the most restrictive occurrence, hiding the mistake
      expect(cspLine.split(directive).length - 1).toBe(1);
    }
  });

  it('sets no Cache-Control on the /* rule', () => {
    const cacheLines = (headerBlocks['/*'] ?? []).filter((l) => /^cache-control:/i.test(l));
    expect(cacheLines).toEqual([]);
  });

  it('sets no header rule on /api/*', () => {
    expect(Object.keys(headerBlocks).filter((p) => p.startsWith('/api'))).toEqual([]);
  });

  it('allows Wikimedia Commons thumbnails in img-src (camera popup images)', () => {
    // cameras.ts builds commons.wikimedia.org/w/thumb.php URLs, which redirect
    // to upload.wikimedia.org — CSP must allow both hops.
    expect(cspLine).toMatch(/img-src[^;]*https:\/\/commons\.wikimedia\.org/);
    expect(cspLine).toMatch(/img-src[^;]*https:\/\/upload\.wikimedia\.org/);
  });
});

describe('netlify.toml', () => {
  it('marks /_astro/* immutable for a year', () => {
    expect(tomlHeaderPaths).toEqual(['/*', '/_astro/*']);
    expect(netlifyToml).toContain('Cache-Control = "public, max-age=31536000, immutable"');
  });

  it('declares no header rule on /api/*', () => {
    expect(tomlHeaderPaths.filter((p) => p.startsWith('/api'))).toEqual([]);
  });

  it('does not redefine the CSP (public/_headers is the only definition)', () => {
    // netlify.toml wins on a same-path same-header conflict, so a stale copy here
    // would silently override the real policy
    expect(netlifyToml).not.toMatch(/^\s*Content-Security-Policy\s*=/im);
  });

  it('proxies /deflock-tiles/* to the Deflock CDN regions path', () => {
    // cdn.deflock.me only sends Access-Control-Allow-Origin for deflock.org,
    // so the camera map must fetch tiles same-origin through this rewrite.
    expect(netlifyToml).toMatch(
      /from = "\/deflock-tiles\/\*"\s*\r?\n\s*to = "https:\/\/cdn\.deflock\.me\/regions\/:splat"\s*\r?\n\s*status = 200/
    );
  });
});

describe('repo config', () => {
  it('audits /events in lighthouserc.json', () => {
    const lhci = JSON.parse(read('lighthouserc.json'));
    // The events-page task added this entry; this guard only stops a later edit
    // from dropping it. This task does not modify lighthouserc.json.
    expect(lhci.ci.collect.url).toContain('/events');
  });

  it('gitignores .env', () => {
    const lines = read('.gitignore').split(/\r?\n/).map((l) => l.trim());
    expect(lines).toContain('.env');
  });
});
