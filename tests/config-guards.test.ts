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
