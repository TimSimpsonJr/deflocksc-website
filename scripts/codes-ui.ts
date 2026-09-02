#!/usr/bin/env node
/**
 * Organizer codes — local admin UI: the thin bootstrap entry.
 *
 *   npm run codes:ui
 *
 * All request handling lives in src/lib/codes-ui-server.ts (exercised by
 * automated loopback HTTP tests with fake ops); the shared credential core
 * lives in src/lib/organizer-ops.ts. This entry only: loads .env, validates
 * it (a missing secret is a hard error — no dry run, no local fallback), sets
 * NETLIFY_BLOBS_CONTEXT and CONTEXT=production, wires the real ops, binds
 * 127.0.0.1, and prints the URL.
 *
 * It deliberately does NOT open the browser: a spawned cmd/open/xdg-open
 * child would inherit this process's environment, which holds
 * ORGANIZER_CODE_PEPPER and the Netlify credentials. Click the printed URL.
 *
 * Bundled and run by esbuild exactly like `npm run codes`; bare `node` on
 * this file does not resolve './x.js' imports. Repo paths resolve from
 * process.cwd(), which npm sets to the repo root.
 *
 * Like the CLI, this writes to the PRODUCTION Netlify Blobs stores.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { stderr, stdout } from 'node:process';

import * as cli from '../src/lib/organizer-cli.js';
import {
  UiRefusal,
  createRequestHandler,
  type OnCanary,
} from '../src/lib/codes-ui-server.js';
import {
  issueCode,
  listCodes,
  readVerifiedWordlist,
  revokeCode,
  type OpsDeps,
} from '../src/lib/organizer-ops.js';
import { codesStore, eventsStore, metaStore } from '../src/lib/blob-stores.js';

const PROJECT_ROOT = process.cwd();
const ENV_FILE = join(PROJECT_ROOT, '.env');
const PAGE_FILE = join(PROJECT_ROOT, 'scripts', 'codes-ui.html');

function fail(message: string): never {
  stderr.write(`codes-ui: ${message}\n`);
  process.exit(1);
}

/**
 * Store factories run per request — strictly after main()'s bootstrap below.
 * The handler's per-request onCanary recorder is passed straight through so
 * the canary outcome reaches the HTTP response even when the op then fails.
 */
function buildOpsDeps(pepper: string, onCanary: OnCanary): OpsDeps {
  return {
    codes: codesStore(),
    events: eventsStore(),
    meta: metaStore(),
    pepper,
    now: () => new Date().toISOString(),
    rng: (maxExclusive) => randomInt(maxExclusive),
    onCanary,
  };
}

function main(): void {
  // Same .env handling as the CLI: loadEnvFile never overrides an already-set
  // variable, which keeps `FOO= npm run codes:ui` meaningful.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

  const env = cli.parseEnv(process.env);
  if (!env.ok) fail(cli.ENV_MESSAGES[env.code]);
  const pepper = env.value.pepper;

  process.env.NETLIFY_BLOBS_CONTEXT = cli.buildBlobsContext(env.value);

  // The same deliberate, single, visible opt-in as the CLI: blob-stores.ts
  // refuses every write unless CONTEXT === 'production'. Set BEFORE any store
  // factory can run — buildOpsDeps executes only inside request handlers,
  // which run only after listen() below.
  process.env.CONTEXT = 'production';

  // Digits-only, then range: Number.parseInt('4919junk', 10) returns 4919
  // and would silently accept a mangled value.
  const rawPort = process.env.CODES_UI_PORT ?? '4919';
  if (!/^[0-9]{1,5}$/.test(rawPort)) fail('CODES_UI_PORT must be digits only (1-65535)');
  const port = Number(rawPort);
  if (port < 1 || port > 65535) fail('CODES_UI_PORT must be a port number (1-65535)');
  // Scheme-default ports break the exact Host/Origin allowlist: browsers
  // serialize http://127.0.0.1:80 as Host "127.0.0.1" (no :80), which the
  // allowlist's ":<port>" form would 421. A local dev tool has no business
  // on 80/443 anyway — refuse loudly instead of failing mysteriously.
  if (port === 80 || port === 443) {
    fail('CODES_UI_PORT must not be 80 or 443: browsers omit the default port from Host/Origin, which the loopback allowlist requires. Pick a non-default port (default 4919).');
  }

  if (!existsSync(PAGE_FILE)) {
    fail(`missing ${PAGE_FILE} — the UI page ships next to this script`);
  }

  const handler = createRequestHandler({
    token: randomBytes(32).toString('hex'),
    port,
    // Re-read per request: the file is tiny, and edits show up on refresh.
    pageHtml: () => readFileSync(PAGE_FILE, 'utf-8'),
    log: (line) => stderr.write(line),
    ops: {
      issue: async (pseudonym, onCanary) => {
        const wordlist = readVerifiedWordlist(PROJECT_ROOT);
        if (!wordlist.ok) throw new UiRefusal(500, 'wordlist', wordlist.message);
        return issueCode(
          { ...buildOpsDeps(pepper, onCanary), wordlist: wordlist.value },
          { pseudonym },
        );
      },
      // list never runs the canary; a no-op recorder satisfies OpsDeps.
      list: async () => listCodes(buildOpsDeps(pepper, () => undefined)),
      revoke: async (pseudonym, digest, onCanary) =>
        revokeCode(buildOpsDeps(pepper, onCanary), { pseudonym, digest }),
    },
  });

  const server = createServer(handler);
  server.on('error', (error: NodeJS.ErrnoException) => {
    fail(
      error.code === 'EADDRINUSE'
        ? `port ${port} is already in use. Stop the other codes-ui, or set CODES_UI_PORT.`
        : error.message,
    );
  });
  // 127.0.0.1 ONLY. Never '0.0.0.0', never '::', never a hostname.
  server.listen(port, '127.0.0.1', () => {
    stdout.write(`organizer codes admin UI: http://127.0.0.1:${port}\n`);
    stdout.write('Bound to 127.0.0.1 only. Writes go to the PRODUCTION Blobs stores.\n');
    stdout.write('Open the URL above yourself (nothing is auto-launched). Ctrl+C stops the server.\n');
  });
}

main();
