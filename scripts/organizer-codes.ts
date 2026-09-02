#!/usr/bin/env node
/**
 * Organizer code CLI: issue / revoke / list / set-intake.
 *
 *   npm run codes -- list [--json]
 *   npm run codes -- issue <pseudonym> [--clip]
 *   npm run codes -- revoke <pseudonym> [--digest <64-hex>] [--fold|--no-fold]
 *   npm run codes -- set-intake <signal-url>
 *
 * This is the THIN SHELL. It reads the environment, wires stdin/stdout, and
 * sets exit codes. Argument parsing, the record shapes, and all output text
 * live in src/lib/organizer-cli.ts (pure, unit tested); the issue/list/revoke
 * core — canary, wordlist checksum, collision check, tombstone cascade —
 * lives in src/lib/organizer-ops.ts (dependency-injected, unit tested), and
 * is shared with the local admin UI server (scripts/codes-ui.ts).
 *
 * `npm run codes` bundles this file with esbuild and runs the bundle. Bare
 * `node scripts/organizer-codes.ts` does not work: Node's type stripping will
 * not resolve this repo's './x.js' imports to x.ts. Because the bundle lives in
 * node_modules/.cache, import.meta.url is useless for locating repo files — all
 * paths below are resolved from process.cwd(), which npm sets to the repo root.
 *
 * This writes to the PRODUCTION Netlify Blobs stores. There is no dry run and
 * no local fallback: a code issued into a local development store looks like
 * success and then fails in production, so a missing credential is a hard
 * error, never a fallback.
 *
 * Invariants this script must never break:
 *   - never write a plaintext code to a file
 *   - never log a plaintext code
 *   - never accept a code as a command-line argument
 *   - never print a code during `list`
 *   - never print the intake URL during `list`
 *   - never commit anything
 */
import { randomInt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stderr, stdin, stdout } from 'node:process';

import * as cli from '../src/lib/organizer-cli.js';
import {
  issueCode,
  listCodes,
  readVerifiedWordlist,
  revokeCode,
  type OpsDeps,
} from '../src/lib/organizer-ops.js';
import { validateSignalUrl } from '../src/lib/signal-url.js';
import {
  ContextRefusedError,
  codesStore,
  eventsStore,
  linksStore,
  metaStore,
} from '../src/lib/blob-stores.js';

const PROJECT_ROOT = process.cwd();
const FOLD_WORKFLOW_PATH = join(PROJECT_ROOT, '.github', 'workflows', cli.FOLD_WORKFLOW);
const ENV_FILE = join(PROJECT_ROOT, '.env');

function fail(message: string): never {
  stderr.write(`organizer-codes: ${message}\n`);
  process.exit(1);
}

/**
 * The store factories run here, inside a subcommand — strictly after main()
 * has set NETLIFY_BLOBS_CONTEXT and CONTEXT=production.
 *
 * onCanary prints in the same channels and order as the old inline
 * enforceCanary — first-write note on stdout, mismatch warning on stderr —
 * and the ops fire it BEFORE any store lookup/write, so the signal reaches
 * the terminal even when the operation then fails mid-flight.
 */
function buildOpsDeps(pepper: string): OpsDeps {
  return {
    codes: codesStore(),
    events: eventsStore(),
    meta: metaStore(),
    pepper,
    now: () => new Date().toISOString(),
    rng: (maxExclusive) => randomInt(maxExclusive),
    onCanary: (note, warning) => {
      if (note !== null) stdout.write(note);
      if (warning !== null) stderr.write(`organizer-codes: warning: ${warning}\n`);
    },
  };
}

function copyToClipboard(text: string): boolean {
  const platform = process.platform;
  const tool =
    platform === 'win32'
      ? { file: 'clip', args: [] as string[] }
      : platform === 'darwin'
        ? { file: 'pbcopy', args: [] as string[] }
        : { file: 'xclip', args: ['-selection', 'clipboard'] };
  // Passed on stdin, never as an argument: the code must not reach argv or
  // shell history even for the clipboard hop.
  const result = spawnSync(tool.file, tool.args, {
    input: text,
    shell: platform === 'win32',
  });
  return result.status === 0;
}

async function runIssue(
  command: { pseudonym: string; clip: boolean },
  pepper: string,
): Promise<void> {
  const wordlist = readVerifiedWordlist(PROJECT_ROOT);
  if (!wordlist.ok) fail(wordlist.message);

  // The canary note/warning is printed by buildOpsDeps' onCanary, inside
  // issueCode, before any store work.
  const result = await issueCode(
    { ...buildOpsDeps(pepper), wordlist: wordlist.value },
    { pseudonym: command.pseudonym },
  );

  stdout.write(cli.formatIssueBanner(result.pseudonym, result.code));

  if (command.clip) {
    stdout.write(
      copyToClipboard(result.code)
        ? '  Copied to the clipboard.\n\n'
        : '  Could not reach a clipboard tool; copy it by hand.\n\n',
    );
  }
}

async function runRevoke(
  command: { pseudonym: string; digest: string | null; fold: cli.FoldMode },
  pepper: string,
): Promise<void> {
  // The canary note/warning is printed by buildOpsDeps' onCanary, inside
  // revokeCode — before the lookup and the writes, exactly like the old
  // inline enforceCanary, so it survives a mid-revoke failure.
  const result = await revokeCode(buildOpsDeps(pepper), {
    pseudonym: command.pseudonym,
    digest: command.digest,
  });

  if (result.kind === 'none') fail(cli.formatNoCodeFound(command.pseudonym));
  if (result.kind === 'many') {
    stderr.write(`organizer-codes: ${cli.formatAmbiguousRevoke(command.pseudonym, result.rows)}`);
    process.exit(1);
  }

  stdout.write(cli.formatRevokeSummary(command.pseudonym, result.digest, result.tombstoned));
  await maybeTriggerFold(command.fold);
}

async function maybeTriggerFold(mode: cli.FoldMode): Promise<void> {
  let go = mode === 'yes';

  if (mode === 'no') {
    stdout.write(cli.formatFoldReminder());
    return;
  }

  if (mode === 'prompt') {
    if (!stdin.isTTY) {
      stdout.write(cli.formatFoldReminder());
      return;
    }
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(
      'Trigger the fold now, so the takedown reaches the static HTML in ~2 minutes? [y/N] ',
    );
    rl.close();
    go = cli.parseFoldAnswer(answer);
  }

  if (!go) {
    stdout.write(cli.formatFoldReminder());
    return;
  }

  if (!existsSync(FOLD_WORKFLOW_PATH)) {
    fail(
      `cannot trigger the fold: ${FOLD_WORKFLOW_PATH} does not exist. If the fold workflow was renamed, update FOLD_WORKFLOW in src/lib/organizer-cli.ts.`,
    );
  }

  const result = spawnSync('gh', ['workflow', 'run', cli.FOLD_WORKFLOW], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    stderr.write('organizer-codes: `gh workflow run` failed.\n');
    stdout.write(cli.formatFoldReminder());
    return;
  }
  stdout.write(`Fold dispatched. Watch it with: gh run list --workflow ${cli.FOLD_WORKFLOW}\n`);
}

async function runSetIntake(command: { signalUrl: string }): Promise<void> {
  const validated = validateSignalUrl(command.signalUrl);
  if (!validated.ok) fail(cli.formatBadIntakeUrl(validated.code));
  // Stored as a JSON record { url }, using the normalized href. The /go/intake
  // reader (Task 14) reads it with { type: 'json' } and validates record.url,
  // so both sides agree on the { url } shape.
  await linksStore().setJSON('intake', { url: validated.value });
  stdout.write(cli.formatIntakeUpdated());
}

async function runList(command: { json: boolean }, pepper: string): Promise<void> {
  const rows = await listCodes(buildOpsDeps(pepper));
  if (command.json) {
    stdout.write(cli.toListJson(rows));
    return;
  }
  // Whether /go/intake is configured — never the URL itself.
  const intake = await linksStore().get('intake', { type: 'text' });
  stdout.write(`${cli.formatListTable(rows)}\n`);
  stdout.write(cli.formatIntakeStatus(typeof intake === 'string' && intake.length > 0));
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  if (
    rawArgs.length === 0 ||
    rawArgs[0] === 'help' ||
    rawArgs.includes('--help') ||
    rawArgs.includes('-h')
  ) {
    stdout.write(cli.USAGE);
    process.exit(0);
  }

  // Parse before touching the environment, so the code-in-argv refusal fires
  // even on a machine with nothing configured.
  const parsed = cli.parseCliArgs(rawArgs);
  if (!parsed.ok) {
    stderr.write(`organizer-codes: ${cli.CLI_ARG_MESSAGES[parsed.code]}\n\n${cli.USAGE}`);
    process.exit(1);
  }
  const command = parsed.value;

  // The npm script cannot pass --env-file (it runs a bundle, not this path), so
  // the .env file is loaded here. loadEnvFile does not override a variable that
  // is already set, which is what keeps `FOO= npm run codes` meaningful.
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

  const env = cli.parseEnv(process.env);
  if (!env.ok) fail(cli.ENV_MESSAGES[env.code]);

  process.env.NETLIFY_BLOBS_CONTEXT = cli.buildBlobsContext(env.value);

  // blob-stores.ts refuses every write unless CONTEXT === 'production'. That
  // guard exists to stop deploy previews and branch deploys from writing to the
  // shared stores. This CLI is the one caller that is *supposed* to write to
  // production — run deliberately, from a maintainer's machine, with a
  // production token — so it opts in here, explicitly and in one visible place.
  // Both variables are read lazily by the store factories, and buildOpsDeps
  // only runs inside the subcommands below, so setting them here is correct.
  process.env.CONTEXT = 'production';

  if (command.name === 'issue') await runIssue(command, env.value.pepper);
  else if (command.name === 'revoke') await runRevoke(command, env.value.pepper);
  else if (command.name === 'set-intake') await runSetIntake(command);
  else await runList(command, env.value.pepper);
}

try {
  await main();
} catch (error) {
  if (error instanceof ContextRefusedError) {
    fail(
      `the Blobs store refused a write: ${error.message}. This CLI sets CONTEXT=production before calling any store factory — if you are seeing this, that ordering broke.`,
    );
  }
  fail(error instanceof Error ? error.message : String(error));
}
