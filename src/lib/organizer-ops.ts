/**
 * The shared impure core of the organizer-code operations: issue, list,
 * revoke. Both front-ends — the CLI (`scripts/organizer-codes.ts`) and the
 * local admin UI server (`scripts/codes-ui.ts`) — call these functions, so
 * there is a single audited implementation of the credential logic: the
 * pepper canary, the wordlist checksum, the collision check, and the
 * revoke + tombstone cascade.
 *
 * Everything here takes injected dependencies (stores, pepper, wordlist,
 * clock, rng) and returns structured data. No stdout, no clipboard, no
 * process.exit — presentation belongs to the front-ends. The injection is
 * also what makes this file unit-testable with in-memory fake stores.
 *
 * Invariants inherited from the CLI (must never break):
 *   - the plaintext code exists only in the returned IssueResult, in memory;
 *     only its HMAC digest is ever persisted
 *   - listCodes returns rows, never code material (none is stored to return)
 *   - CONTEXT=production and NETLIFY_BLOBS_CONTEXT are the front-end
 *     bootstrap's job, set BEFORE any store factory is called — never here
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Store } from '@netlify/blobs';

import * as cli from './organizer-cli.js';
import { digestCode, generateCode, normalizeCode } from './organizer-code.js';

export type OpsErrorCode = 'canary_mismatch' | 'collision' | 'generate_bug';

/** A refusal from the ops core. Front-ends map it to exit codes / HTTP statuses. */
export class OpsError extends Error {
  readonly code: OpsErrorCode;

  constructor(code: OpsErrorCode, message: string) {
    super(message);
    this.name = 'OpsError';
    this.code = code;
  }
}

export interface OpsDeps {
  codes: Store;
  events: Store;
  meta: Store;
  pepper: string;
  /** () => new Date().toISOString() in production; fixed in tests. */
  now: () => string;
  /** crypto.randomInt in production (rejection-sampled); deterministic in tests. */
  rng: (maxExclusive: number) => number;
  /**
   * The canary signal channel. Invoked exactly once per issue/revoke,
   * IMMEDIATELY after the canary check and BEFORE any generate/lookup/write/
   * sweep — so a mid-operation store failure can never swallow a first-write
   * note (the canary is already written by then) or a mismatch warning.
   * `note` is the first-write note; `warning` the non-strict mismatch
   * warning; both null when the stored canary simply matched. This callback
   * is the ONLY carrier — results do not duplicate the canary outcome.
   */
  onCanary: (note: string | null, warning: string | null) => void;
}

/** Only issueCode needs the wordlist; list/revoke must not require one (D1). */
export interface IssueDeps extends OpsDeps {
  wordlist: readonly string[];
}

export interface IssueResult {
  pseudonym: string;
  /** Plaintext, IN MEMORY ONLY. Shown once by the caller, then dropped. Never persisted, never logged. */
  code: string;
}

export type RevokeResult =
  | { kind: 'ok'; digest: string; pseudonym: string; tombstoned: number }
  | { kind: 'none' }
  | { kind: 'many'; rows: cli.ListRow[] };

interface CanaryOutcome {
  note: string | null;
  warning: string | null;
}

/**
 * The canary check runs INSIDE issueCode/revokeCode rather than as a helper a
 * front-end could forget to call: every front-end enforces it identically by
 * construction (design §1).
 */
async function enforceCanary(deps: OpsDeps, strict: boolean): Promise<CanaryOutcome> {
  const stored = (await deps.meta.get(cli.CANARY_KEY, { type: 'text' })) as string | null;
  const decision = cli.decideCanary(stored, cli.canaryDigest(deps.pepper), strict);
  if (decision.action === 'write') {
    await deps.meta.set(cli.CANARY_KEY, decision.value);
    return { note: decision.note, warning: null };
  }
  if (decision.action === 'refuse') throw new OpsError('canary_mismatch', decision.message);
  if (decision.action === 'warn') return { note: null, warning: decision.message };
  return { note: null, warning: null };
}

/**
 * Issue one code: canary (strict) -> onCanary -> generate -> digest ->
 * collision check -> store the record under the digest. The plaintext code is
 * returned in memory only; the caller shows it once and drops it. onCanary
 * fires before the fallible work so a first-write note survives a later
 * collision or store failure.
 */
export async function issueCode(
  deps: IssueDeps,
  input: { pseudonym: string },
): Promise<IssueResult> {
  const canary = await enforceCanary(deps, true);
  deps.onCanary(canary.note, canary.warning);

  const code = generateCode(deps.wordlist, deps.rng);
  const normalized = normalizeCode(code);
  if (!normalized.ok) {
    throw new OpsError(
      'generate_bug',
      `generated code failed normalizeCode (${normalized.code}) — this is a bug`,
    );
  }
  const digest = digestCode(normalized.value, deps.pepper);

  if ((await deps.codes.get(digest, { type: 'json' })) !== null) {
    throw new OpsError('collision', 'the generated code collides with an existing code. Run issue again.');
  }
  await deps.codes.setJSON(digest, cli.buildCodeRecord(input.pseudonym, deps.now()));

  return { pseudonym: input.pseudonym, code };
}

/** Every code record as a ListRow. Rows carry digests — never codes. */
export async function listCodes(deps: OpsDeps): Promise<cli.ListRow[]> {
  const { blobs } = await deps.codes.list();
  const rows: cli.ListRow[] = [];
  for (const blob of blobs) {
    const record = await deps.codes.get(blob.key, { type: 'json' });
    if (record === null || record === undefined) continue;
    rows.push(cli.toListRow(blob.key, record));
  }
  return rows;
}

/**
 * Revoke one code: canary (non-strict — a takedown must work even with a wrong
 * local pepper) -> onCanary -> select target -> rewrite the record ->
 * tombstone every event this code created.
 *
 * IDEMPOTENT: an already-revoked target skips the record re-write but still
 * runs the tombstone sweep over every remaining codeDigest-matching,
 * non-tombstoned event. The record flips to revoked BEFORE the sweep, so a
 * failure mid-cascade would otherwise strand events with no way to finish the
 * takedown — re-running the revoke is the recovery path (the UI exposes it as
 * "Retry takedown" on revoked rows).
 */
export async function revokeCode(
  deps: OpsDeps,
  input: { pseudonym: string; digest: string | null },
): Promise<RevokeResult> {
  const canary = await enforceCanary(deps, false);
  // BEFORE the lookup and the writes: a store failure below must not swallow
  // the canary signal (on first use the canary is already written by now).
  deps.onCanary(canary.note, canary.warning);

  const selection = cli.selectRevocationTarget(
    await listCodes(deps),
    input.pseudonym,
    input.digest,
  );
  if (selection.kind === 'none') return { kind: 'none' };
  if (selection.kind === 'many') return { kind: 'many', rows: selection.rows };

  const target = selection.row;
  if (!target.revoked) {
    await deps.codes.setJSON(target.digest, cli.revokeRecord(target));
  }

  // Cascade: tombstone every event this code created. Runs even when the
  // record was already revoked — that is the idempotent recovery sweep.
  const { blobs } = await deps.events.list();
  let tombstoned = 0;
  for (const blob of blobs) {
    const event = await deps.events.get(blob.key, { type: 'json' });
    if (!cli.shouldTombstone(event, target.digest)) continue;
    await deps.events.setJSON(blob.key, cli.tombstoneEvent(event as Record<string, unknown>));
    tombstoned += 1;
  }

  return { kind: 'ok', digest: target.digest, pseudonym: target.pseudonym, tombstoned };
}

export type WordlistReadResult =
  | { ok: true; value: string[] }
  | { ok: false; message: string };

/**
 * Read + checksum-verify + structurally validate the committed wordlist.
 * Shared by both front-ends so the checksum enforcement cannot diverge
 * (design §1). Paths resolve from the given project root: both front-ends run
 * as esbuild bundles out of node_modules/.cache, so import.meta.url is
 * useless — they pass process.cwd(), which npm sets to the repo root.
 * Message texts are byte-identical to the pre-refactor CLI's.
 */
export function readVerifiedWordlist(projectRoot: string): WordlistReadResult {
  const txtPath = join(projectRoot, cli.WORDLIST_TXT_REL);
  const shaPath = join(projectRoot, cli.WORDLIST_SHA_REL);
  if (!existsSync(txtPath)) {
    return { ok: false, message: `missing ${txtPath}. Run: npm run build-wordlist` };
  }
  const bytes = readFileSync(txtPath);
  const actual = createHash('sha256').update(bytes).digest('hex');
  const checked = cli.checkWordlistChecksum(actual, readFileSync(shaPath, 'utf-8'));
  if (!checked.ok) {
    return {
      ok: false,
      message:
        checked.code === 'mismatch'
          ? `wordlist checksum mismatch. The word source for every code you issue is not what was audited. Restore it with: git checkout -- ${cli.WORDLIST_TXT_REL}`
          : `${cli.WORDLIST_SHA_REL} is not a valid sha256sum record for the wordlist. Regenerate both with: npm run build-wordlist`,
    };
  }
  const list = cli.parseWordlist(bytes.toString('utf-8'));
  if (!list.ok) return { ok: false, message: `wordlist failed structural validation (${list.code})` };
  return { ok: true, value: list.value };
}
