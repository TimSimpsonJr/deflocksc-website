#!/usr/bin/env node
/**
 * Organizer code CLI: issue / revoke / list / set-intake.
 *
 *   npm run codes -- list [--json]
 *   npm run codes -- issue <pseudonym> [--clip]
 *   npm run codes -- revoke <pseudonym> [--digest <64-hex>] [--fold|--no-fold]
 *   npm run codes -- set-intake <signal-url>
 *
 * This is the THIN SHELL. It reads the environment, wires stdin/stdout, talks to
 * Netlify Blobs, and sets exit codes. Every decision — argument parsing, the
 * canary check, the record shapes, all output text — lives in
 * src/lib/organizer-cli.ts, which is pure and unit tested.
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
import { createHash, randomInt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stderr, stdin, stdout } from 'node:process';

import { type Store } from '@netlify/blobs';

import * as cli from '../src/lib/organizer-cli.js';
import { digestCode, generateCode, normalizeCode } from '../src/lib/organizer-code.js';
import { validateSignalUrl } from '../src/lib/signal-url.js';
import {
  ContextRefusedError,
  codesStore,
  eventsStore,
  linksStore,
  metaStore,
} from '../src/lib/blob-stores.js';

const PROJECT_ROOT = process.cwd();
const WORDLIST_TXT = join(PROJECT_ROOT, cli.WORDLIST_TXT_REL);
const WORDLIST_SHA = join(PROJECT_ROOT, cli.WORDLIST_SHA_REL);
const FOLD_WORKFLOW_PATH = join(PROJECT_ROOT, '.github', 'workflows', cli.FOLD_WORKFLOW);
const ENV_FILE = join(PROJECT_ROOT, '.env');

function fail(message: string): never {
  stderr.write(`organizer-codes: ${message}\n`);
  process.exit(1);
}

function readWordlist(): string[] {
  if (!existsSync(WORDLIST_TXT)) {
    fail(`missing ${WORDLIST_TXT}. Run: npm run build-wordlist`);
  }
  const bytes = readFileSync(WORDLIST_TXT);
  const actual = createHash('sha256').update(bytes).digest('hex');
  const checked = cli.checkWordlistChecksum(actual, readFileSync(WORDLIST_SHA, 'utf-8'));
  if (!checked.ok) {
    fail(
      checked.code === 'mismatch'
        ? `wordlist checksum mismatch. The word source for every code you issue is not what was audited. Restore it with: git checkout -- ${cli.WORDLIST_TXT_REL}`
        : `${cli.WORDLIST_SHA_REL} is not a valid sha256sum record for the wordlist. Regenerate both with: npm run build-wordlist`,
    );
  }
  const list = cli.parseWordlist(bytes.toString('utf-8'));
  if (!list.ok) fail(`wordlist failed structural validation (${list.code})`);
  return list.value;
}

async function enforceCanary(pepper: string, strict: boolean): Promise<void> {
  const meta = metaStore();
  const stored = (await meta.get(cli.CANARY_KEY, { type: 'text' })) as string | null;
  const decision = cli.decideCanary(stored, cli.canaryDigest(pepper), strict);
  if (decision.action === 'write') {
    await meta.set(cli.CANARY_KEY, decision.value);
    stdout.write(decision.note);
    return;
  }
  if (decision.action === 'refuse') fail(decision.message);
  if (decision.action === 'warn') stderr.write(`organizer-codes: warning: ${decision.message}\n`);
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

async function listCodeRows(store: Store): Promise<cli.ListRow[]> {
  const { blobs } = await store.list();
  const rows: cli.ListRow[] = [];
  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: 'json' });
    if (record === null || record === undefined) continue;
    rows.push(cli.toListRow(blob.key, record));
  }
  return rows;
}

async function runIssue(
  command: { pseudonym: string; clip: boolean },
  pepper: string,
): Promise<void> {
  await enforceCanary(pepper, true);
  const words = readWordlist();

  const code = generateCode(words, (maxExclusive) => randomInt(maxExclusive));
  const normalized = normalizeCode(code);
  if (!normalized.ok) {
    fail(`generated code failed normalizeCode (${normalized.code}) — this is a bug`);
  }
  const digest = digestCode(normalized.value, pepper);

  const codes = codesStore();
  if ((await codes.get(digest, { type: 'json' })) !== null) {
    fail('the generated code collides with an existing code. Run issue again.');
  }
  await codes.setJSON(digest, cli.buildCodeRecord(command.pseudonym, new Date().toISOString()));

  stdout.write(cli.formatIssueBanner(command.pseudonym, code));

  if (command.clip) {
    stdout.write(
      copyToClipboard(code)
        ? '  Copied to the clipboard.\n\n'
        : '  Could not reach a clipboard tool; copy it by hand.\n\n',
    );
  }
}

async function runRevoke(
  command: { pseudonym: string; digest: string | null; fold: cli.FoldMode },
  pepper: string,
): Promise<void> {
  await enforceCanary(pepper, false);

  const codes = codesStore();
  const selection = cli.selectRevocationTarget(
    await listCodeRows(codes),
    command.pseudonym,
    command.digest,
  );

  if (selection.kind === 'none') fail(cli.formatNoCodeFound(command.pseudonym));
  if (selection.kind === 'many') {
    stderr.write(`organizer-codes: ${cli.formatAmbiguousRevoke(command.pseudonym, selection.rows)}`);
    process.exit(1);
  }

  const target = selection.row;
  await codes.setJSON(target.digest, cli.revokeRecord(target));

  // Cascade: tombstone every event this code created.
  const events = eventsStore();
  const { blobs } = await events.list();
  let tombstoned = 0;
  for (const blob of blobs) {
    const event = await events.get(blob.key, { type: 'json' });
    if (!cli.shouldTombstone(event, target.digest)) continue;
    await events.setJSON(blob.key, cli.tombstoneEvent(event as Record<string, unknown>));
    tombstoned += 1;
  }

  stdout.write(cli.formatRevokeSummary(command.pseudonym, target.digest, tombstoned));
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

async function runList(command: { json: boolean }): Promise<void> {
  const rows = await listCodeRows(codesStore());
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
  // Both variables are read lazily by the store factories, so setting them
  // after the imports is correct.
  process.env.CONTEXT = 'production';

  if (command.name === 'issue') await runIssue(command, env.value.pepper);
  else if (command.name === 'revoke') await runRevoke(command, env.value.pepper);
  else if (command.name === 'set-intake') await runSetIntake(command);
  else await runList(command);
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
