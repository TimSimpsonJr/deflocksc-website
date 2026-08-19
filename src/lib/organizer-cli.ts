/**
 * The pure half of the organizer-codes CLI.
 *
 * `scripts/organizer-codes.ts` is a thin shell that does I/O and sets exit
 * codes; every decision it makes lives here as a pure function, which is the
 * only reason any of it is testable. Nothing in this file touches the network,
 * the filesystem, `process`, `console`, or the clock — callers pass in the
 * environment object, the file contents, and the timestamp.
 *
 * Three rules from the design are enforced here:
 *
 *   1. A plaintext organizer code must never appear in argv (it would land in
 *      shell history), so anything that looks like one is rejected before the
 *      subcommand is even identified. `set-intake` is the one subcommand whose
 *      argument is a URL rather than a code, so it is handled ahead of that
 *      scan (a signal.group URL would false-positive it).
 *   2. Missing credentials are a hard failure, never a fallback: a code issued
 *      into a local development store looks like success and fails in
 *      production.
 *   3. Anything that leaves the process is an explicit field projection, never
 *      a spread of a stored record, for the same reason toPublicEvent() is.
 */
import { ok, err, type Ok, type Err } from './text-result.js';
import { digestCode } from './organizer-code.js';

/** HMAC subject for the pepper canary. Already in normalized form (lowercase a-z plus hyphens). */
export const CANARY_SUBJECT = 'deflocksc-canary';

/** Key the canary lives under in the `meta` Blobs store. */
export const CANARY_KEY = 'pepper-canary';

/** EFF Short Wordlist #2 is exactly 1296 entries (6^4). */
export const WORDLIST_SIZE = 1296;

/** Filename of the GitHub Actions workflow that rebakes /events. */
export const FOLD_WORKFLOW = 'fold-events.yml';

/** Repo-relative paths to the committed wordlist, resolved by the shell against cwd. */
export const WORDLIST_TXT_REL = 'scripts/data/eff-short-wordlist-2.txt';
export const WORDLIST_SHA_REL = 'scripts/data/eff-short-wordlist-2.sha256';

const DIGEST_RE = /^[0-9a-f]{64}$/;
const SEGMENT_RE = /^[a-z0-9]+$/;
const WORD_RE = /^[a-z]+$/;
const DICE_RE = /^[1-6]{4}$/;
const NON_LETTER_RE = /[^a-z]+/;

export const USAGE = `organizer-codes — issue, revoke, list codes and set the intake link

Usage:
  npm run codes -- list [--json]
  npm run codes -- issue <pseudonym> [--clip]
  npm run codes -- revoke <pseudonym> [--digest <64-hex>] [--fold|--no-fold]
  npm run codes -- set-intake <signal-url>

Arguments:
  <pseudonym>   2-40 chars, lowercase a-z0-9, at most three hyphen-separated
                segments (for example: handle-jay). Never a real name.
  <signal-url>  the https://signal.group/#... invite that /go/intake redirects to.

Flags:
  --clip        copy the freshly issued code to the clipboard
  --json        machine-readable list output, for the offline backup
  --digest      disambiguate when one pseudonym holds more than one code
  --fold        trigger the fold without prompting
  --no-fold     skip the fold prompt entirely

Codes are never accepted as arguments — they would land in your shell history.
Requires ORGANIZER_CODE_PEPPER, NETLIFY_AUTH_TOKEN, and NETLIFY_SITE_ID in .env.

The npm script bundles this CLI with esbuild before running it. A bare
\`node\` invocation of the .ts entry point does not work: Node's type stripping
will not resolve this repo's './x.js' imports to x.ts.
`;

// --- argument parsing --------------------------------------------------------

export type FoldMode = 'prompt' | 'yes' | 'no';

export type CliCommand =
  | { name: 'issue'; pseudonym: string; clip: boolean }
  | { name: 'revoke'; pseudonym: string; digest: string | null; fold: FoldMode }
  | { name: 'list'; json: boolean }
  | { name: 'set-intake'; signalUrl: string };

export type CliArgCode =
  | 'no_command'
  | 'unknown_command'
  | 'looks_like_code'
  | 'missing_pseudonym'
  | 'invalid_pseudonym'
  | 'invalid_digest'
  | 'missing_url'
  | 'unknown_flag'
  | 'extra_argument';

export const CLI_ARG_MESSAGES: Record<CliArgCode, string> = {
  no_command: 'no subcommand given.',
  unknown_command: 'unknown subcommand. Expected issue, revoke, list, or set-intake.',
  looks_like_code:
    'refusing to run: an argument looks like an organizer code. Codes are never passed on the command line — they would land in your shell history. Pass the pseudonym instead.',
  missing_pseudonym: 'missing pseudonym.',
  invalid_pseudonym:
    'invalid pseudonym. Use 2-40 characters, lowercase a-z and 0-9, at most three hyphen-separated segments (for example: handle-jay).',
  invalid_digest: '--digest requires a 64-character lowercase hex value.',
  missing_url: 'set-intake requires a Signal group URL argument.',
  unknown_flag: 'unknown flag.',
  extra_argument: 'unexpected extra argument.',
};

/**
 * True when a string plausibly is a four-word organizer code.
 *
 * Deliberately loose: it counts runs of a-z after lowercasing, so
 * "Drum Yoga Vivid Clay", "drum-yoga-vivid-clay", and "drum2yoga.vivid_clay"
 * all trip it. A 64-char hex digest is exempted first, because stripping its
 * digits would otherwise leave four-plus letter runs.
 */
export function looksLikeCode(value: string): boolean {
  const trimmed = value.trim();
  if (DIGEST_RE.test(trimmed)) return false;
  const tokens = trimmed
    .toLowerCase()
    .split(NON_LETTER_RE)
    .filter((token) => token.length > 0);
  return tokens.length >= 4;
}

/**
 * Pseudonym shape. Capped at three hyphen-separated segments, which is also
 * what keeps a four-word code from being mistaken for a pseudonym.
 */
export function isValidPseudonym(value: string): boolean {
  if (value.length < 2 || value.length > 40) return false;
  const parts = value.split('-');
  if (parts.length > 3) return false;
  return parts.every((part) => part.length > 0 && SEGMENT_RE.test(part));
}

export function parseCliArgs(argv: readonly string[]): Ok<CliCommand> | Err<CliArgCode> {
  const name = argv[0];
  if (name === undefined) return err('no_command');

  // set-intake carries a Signal URL argument, not a secret code. A signal.group
  // URL has four-plus letter runs and would trip the looksLikeCode scan below,
  // so it is handled before the scan. The URL itself is validated by
  // validateSignalUrl in the shell, never here.
  if (name === 'set-intake') {
    const rest = argv.slice(1);
    if (rest.length === 0) return err('missing_url');
    if (rest.length > 1) return err('extra_argument');
    return ok({ name: 'set-intake', signalUrl: rest[0] });
  }

  // A plaintext organizer code in argv is fatal for every other subcommand,
  // decided before the subcommand itself is validated.
  for (const raw of argv) {
    if (looksLikeCode(raw)) return err('looks_like_code');
  }

  const rest = argv.slice(1);

  if (name === 'issue') {
    let pseudonym: string | null = null;
    let clip = false;
    for (const arg of rest) {
      if (arg === '--clip') {
        clip = true;
        continue;
      }
      if (arg.startsWith('--')) return err('unknown_flag');
      if (pseudonym !== null) return err('extra_argument');
      pseudonym = arg;
    }
    if (pseudonym === null) return err('missing_pseudonym');
    if (!isValidPseudonym(pseudonym)) return err('invalid_pseudonym');
    return ok({ name: 'issue', pseudonym, clip });
  }

  if (name === 'revoke') {
    let pseudonym: string | null = null;
    let digest: string | null = null;
    let fold: FoldMode = 'prompt';
    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i];
      if (arg === '--fold') {
        fold = 'yes';
        continue;
      }
      if (arg === '--no-fold') {
        fold = 'no';
        continue;
      }
      if (arg === '--digest') {
        const value = rest[i + 1];
        if (value === undefined || !DIGEST_RE.test(value)) return err('invalid_digest');
        digest = value;
        i += 1;
        continue;
      }
      if (arg.startsWith('--')) return err('unknown_flag');
      if (pseudonym !== null) return err('extra_argument');
      pseudonym = arg;
    }
    if (pseudonym === null) return err('missing_pseudonym');
    if (!isValidPseudonym(pseudonym)) return err('invalid_pseudonym');
    return ok({ name: 'revoke', pseudonym, digest, fold });
  }

  if (name === 'list') {
    let json = false;
    for (const arg of rest) {
      if (arg === '--json') {
        json = true;
        continue;
      }
      return err(arg.startsWith('--') ? 'unknown_flag' : 'extra_argument');
    }
    return ok({ name: 'list', json });
  }

  return err('unknown_command');
}

// --- environment -------------------------------------------------------------

export type EnvCode = 'missing_pepper' | 'missing_token' | 'missing_site_id';

export const ENV_MESSAGES: Record<EnvCode, string> = {
  missing_pepper:
    'ORGANIZER_CODE_PEPPER is not set. Put it in .env (see .env.example). It must be byte-identical to the Functions-scoped, production-context value in the Netlify UI, or every code you issue will fail to validate.',
  missing_token:
    'NETLIFY_AUTH_TOKEN is not set. Create a personal access token at https://app.netlify.com/user/applications and put it in .env. Refusing to fall back to a local Blobs store — a code issued there would look like success and fail in production.',
  missing_site_id:
    'NETLIFY_SITE_ID is not set. Find it under Site configuration -> General -> Site information -> Site ID, and put it in .env.',
};

export interface CliEnv {
  pepper: string;
  token: string;
  siteId: string;
  region: string;
}

/**
 * Validate the three required secrets. Pure: the shell hands in a plain object
 * so the fail-closed behaviour is unit tested rather than shell-tested.
 */
export function parseEnv(
  env: Readonly<Record<string, string | undefined>>,
): Ok<CliEnv> | Err<EnvCode> {
  const pepper = (env.ORGANIZER_CODE_PEPPER ?? '').trim();
  if (pepper.length === 0) return err('missing_pepper');

  const token = (env.NETLIFY_AUTH_TOKEN ?? '').trim();
  if (token.length === 0) return err('missing_token');

  const siteId = (env.NETLIFY_SITE_ID ?? '').trim();
  if (siteId.length === 0) return err('missing_site_id');

  const region = (env.NETLIFY_BLOBS_REGION ?? '').trim() || 'us-east-1';
  return ok({ pepper, token, siteId, region });
}

/**
 * @netlify/blobs takes its credentials from NETLIFY_BLOBS_CONTEXT when it is not
 * running inside a Netlify deploy. Building the value here lets blob-stores.ts
 * keep its zero-argument factory signature, shared with the functions. The
 * pepper is deliberately absent: it never leaves this process.
 */
export function buildBlobsContext(env: CliEnv): string {
  return Buffer.from(
    JSON.stringify({ siteID: env.siteId, token: env.token, primaryRegion: env.region }),
    'utf-8',
  ).toString('base64');
}

// --- the pepper canary -------------------------------------------------------

export const CANARY_MISMATCH_MESSAGE =
  'pepper canary mismatch. ORGANIZER_CODE_PEPPER does not match the pepper that issued the existing codes. Fix .env to match the Netlify Functions-scoped production value before issuing anything.';

export type CanaryDecision =
  | { action: 'write'; value: string; note: string }
  | { action: 'accept' }
  | { action: 'refuse'; message: string }
  | { action: 'warn'; message: string };

/** The digest the canary key should hold for a given pepper. */
export function canaryDigest(pepper: string): string {
  return digestCode(CANARY_SUBJECT, pepper);
}

/**
 * The canary decision, as a pure function of what is stored and what is
 * expected. The CLI reads ORGANIZER_CODE_PEPPER from .env; production reads it
 * from a Functions-scoped Netlify variable. If those diverge, every newly
 * issued code fails validation and nothing announces it.
 *
 * `issue` is strict: a mismatch means the code would be born dead, so refuse.
 * `revoke` only warns: a revocation is a takedown, and it must still work even
 * when the local pepper is wrong.
 *
 * Neither digest appears in the message. A digest is one-way, but there is no
 * reason to put one on a maintainer's terminal.
 */
export function decideCanary(
  stored: string | null | undefined,
  expected: string,
  strict: boolean,
): CanaryDecision {
  if (stored === null || stored === undefined || stored.length === 0) {
    return {
      action: 'write',
      value: expected,
      note: `note: wrote the pepper canary for the first time (meta/${CANARY_KEY}).\n`,
    };
  }
  if (stored === expected) return { action: 'accept' };
  return strict
    ? { action: 'refuse', message: CANARY_MISMATCH_MESSAGE }
    : { action: 'warn', message: CANARY_MISMATCH_MESSAGE };
}

// --- stored record shapes ----------------------------------------------------

/** The full shape of a record in the `codes` store. Three fields, no more. */
export interface CodeRecord {
  pseudonym: string;
  issuedAt: string;
  revoked: boolean;
}

export function buildCodeRecord(pseudonym: string, issuedAt: string): CodeRecord {
  return { pseudonym, issuedAt, revoked: false };
}

export interface ListRow {
  digest: string;
  pseudonym: string;
  issuedAt: string;
  revoked: boolean;
}

/** Defensive read of a stored code record into a row. A malformed blob must not crash `list`. */
export function toListRow(digest: string, record: unknown): ListRow {
  const source =
    record !== null && typeof record === 'object' ? (record as Record<string, unknown>) : {};
  return {
    digest,
    pseudonym: typeof source.pseudonym === 'string' ? source.pseudonym : '(unknown)',
    issuedAt: typeof source.issuedAt === 'string' ? source.issuedAt : '',
    revoked: source.revoked === true,
  };
}

/**
 * Rebuild a code record with `revoked` set. Explicit reconstruction rather than
 * a spread: the `codes` store owns exactly three fields, and a stray field that
 * somehow got written should not be preserved by a revocation.
 */
export function revokeRecord(row: ListRow): CodeRecord {
  return { pseudonym: row.pseudonym, issuedAt: row.issuedAt, revoked: true };
}

/** True when this event belongs to the revoked code and is not already tombstoned. */
export function shouldTombstone(event: unknown, digest: string): boolean {
  if (event === null || typeof event !== 'object') return false;
  const source = event as Record<string, unknown>;
  return source.codeDigest === digest && source.revoked !== true;
}

/**
 * Flip one field on an event record. Unlike a code record, the event record's
 * shape is owned by the submit path, so this preserves it and spreads.
 */
export function tombstoneEvent(event: Record<string, unknown>): Record<string, unknown> {
  return { ...event, revoked: true };
}

export type RevokeSelection =
  | { kind: 'one'; row: ListRow }
  | { kind: 'none' }
  | { kind: 'many'; rows: ListRow[] };

export function selectRevocationTarget(
  rows: readonly ListRow[],
  pseudonym: string,
  digest: string | null,
): RevokeSelection {
  const matches = rows.filter(
    (row) => row.pseudonym === pseudonym && (digest === null || row.digest === digest),
  );
  if (matches.length === 0) return { kind: 'none' };
  if (matches.length === 1) return { kind: 'one', row: matches[0] };
  return { kind: 'many', rows: matches };
}

// --- output formatting -------------------------------------------------------

/**
 * Human-readable `list` output: pseudonym, issue date, revoked state. No
 * digest column — the terminal is the least controlled place a digest can end
 * up, and nothing in the day-to-day workflow needs it. No code column either,
 * because the code is not stored and could not be printed even by mistake.
 */
export function formatListTable(rows: readonly ListRow[]): string {
  if (rows.length === 0) return 'No codes issued.';
  const sorted = [...rows].sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  const width = Math.max(9, ...sorted.map((row) => row.pseudonym.length));
  const header = `${'PSEUDONYM'.padEnd(width)}  ${'ISSUED'.padEnd(10)}  REVOKED`;
  const lines = sorted.map(
    (row) =>
      `${row.pseudonym.padEnd(width)}  ${row.issuedAt.slice(0, 10).padEnd(10)}  ${row.revoked ? 'yes' : 'no'}`,
  );
  return [header, ...lines].join('\n');
}

/**
 * `list --json` output, used for the offline backup of the codes store (§5:
 * the codes store has no backup and a delete there is unrecoverable). The
 * digest is included here — and only here — because without it the backup
 * cannot restore anything. It is a one-way value, not a code.
 *
 * Explicit projection, not a spread: an extra field added to the stored record
 * later must not silently start appearing in a file the maintainer keeps.
 */
export function toListJson(rows: readonly ListRow[]): string {
  const projected = rows.map((row) => ({
    digest: row.digest,
    pseudonym: row.pseudonym,
    issuedAt: row.issuedAt,
    revoked: row.revoked,
  }));
  return JSON.stringify(projected, null, 2) + '\n';
}

/** The one and only time a plaintext code is rendered anywhere. */
export function formatIssueBanner(pseudonym: string, code: string): string {
  return [
    '',
    `  Code for ${pseudonym}:`,
    '',
    `      ${code}`,
    '',
    '  This is the only time it is shown. It is not stored, not logged, and',
    '  cannot be recovered — only revoked and reissued. Hand it over out of',
    '  band, then clear your scrollback.',
    '',
    '',
  ].join('\n');
}

export function formatRevokeSummary(
  pseudonym: string,
  digest: string,
  tombstoned: number,
): string {
  return `Revoked ${pseudonym} (${digest.slice(0, 8)}...). Tombstoned ${tombstoned} event(s).\n`;
}

export function formatFoldReminder(): string {
  return (
    'The overlay is already correct. The baked /events page still lists the tombstoned events until the next fold. Run the fold when you are ready:\n' +
    `  gh workflow run ${FOLD_WORKFLOW}\n`
  );
}

export function formatAmbiguousRevoke(pseudonym: string, rows: readonly ListRow[]): string {
  const lines = rows.map(
    (row) => `  ${row.digest}  issued ${row.issuedAt.slice(0, 10)}  revoked=${row.revoked}`,
  );
  return [
    `${rows.length} codes are issued to "${pseudonym}". Re-run with --digest <one of>:`,
    ...lines,
    '',
  ].join('\n');
}

export function formatNoCodeFound(pseudonym: string): string {
  return `no code found for pseudonym "${pseudonym}"`;
}

// --- intake link (design §9) -------------------------------------------------

/**
 * Whether the /go/intake redirect currently has a stored target. `list` reports
 * this so a maintainer can confirm the link is configured. It never prints the
 * URL itself — the whole point of /go/intake is that the invite is absent from
 * markup, the search index, and scrollback.
 */
export function formatIntakeStatus(isSet: boolean): string {
  return `Intake link: ${isSet ? 'set' : 'not set'}\n`;
}

/** Confirmation after set-intake writes links/intake. Never echoes the URL. */
export function formatIntakeUpdated(): string {
  return 'Intake link updated. It is served only through /go/intake and never appears in page markup.\n';
}

/**
 * Refusal when a set-intake URL fails Signal-link validation. `code` is the
 * machine-readable SignalUrlCode from validateSignalUrl; the offending URL is
 * not echoed back.
 */
export function formatBadIntakeUrl(code: string): string {
  return `refusing to set intake: the URL failed Signal-link validation (${code}). It must be an https://signal.group/#... invite.`;
}

/** Only an explicit y/yes triggers the fold. Anything else, including EOF, does not. */
export function parseFoldAnswer(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

// --- wordlist ----------------------------------------------------------------

export type ChecksumCode = 'bad_record' | 'mismatch';

/** Compare a freshly computed hash against the committed sha256sum-format record. */
export function checkWordlistChecksum(
  actualHex: string,
  record: string,
): Ok<string> | Err<ChecksumCode> {
  const fields = record.trim().split(/\s+/);
  if (fields.length < 2) return err('bad_record');
  const [recorded, name] = fields;
  if (!DIGEST_RE.test(recorded)) return err('bad_record');
  if (!name.endsWith('eff-short-wordlist-2.txt')) return err('bad_record');
  if (recorded !== actualHex.toLowerCase()) return err('mismatch');
  return ok(recorded);
}

export type WordlistCode =
  | 'bad_line'
  | 'bad_word'
  | 'duplicate_word'
  | 'duplicate_prefix'
  | 'bad_count';

/**
 * Parse and structurally validate an EFF short wordlist file.
 *
 * Format: 1296 lines of "<4 dice digits>\t<word>". The structural rules below
 * are documented properties of EFF Short Wordlist #2, so passing them is
 * evidence the right file was downloaded — not just an intact one.
 */
export function parseWordlist(text: string): Ok<string[]> | Err<WordlistCode> {
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const words: string[] = [];
  const seenWords = new Set<string>();
  const seenPrefixes = new Set<string>();

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length !== 2) return err('bad_line');
    const [dice, word] = parts;
    if (!DICE_RE.test(dice)) return err('bad_line');
    if (!WORD_RE.test(word) || word.length < 3 || word.length > 15) return err('bad_word');
    if (seenWords.has(word)) return err('duplicate_word');
    const prefix = word.slice(0, 3);
    if (seenPrefixes.has(prefix)) return err('duplicate_prefix');
    seenWords.add(word);
    seenPrefixes.add(prefix);
    words.push(word);
  }

  if (words.length !== WORDLIST_SIZE) return err('bad_count');
  return ok(words);
}
