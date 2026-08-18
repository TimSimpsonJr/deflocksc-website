import { createHmac } from 'node:crypto';
import { ok, err } from './text-result.js';
import type { Ok, Err } from './text-result.js';

export type CodeCode = 'not_a_string' | 'too_many_bytes' | 'wrong_shape';

/**
 * Raw byte cap applied BEFORE NFKC. NFKC can expand its input, so a cap
 * applied after normalization is not a cap on the work done to get there.
 */
const MAX_CODE_BYTES = 128;

/** 4 words from the EFF short wordlist #2 (1296^4 ~= 2^41.4). */
const CODE_WORD_COUNT = 4;

/**
 * Flat negated character class with a single quantifier: no nested quantifiers,
 * no quantified alternation, no backreferences. Shape is what prevents
 * catastrophic backtracking; anchoring and length bounds do not.
 */
const NON_LETTER_RUN = /[^a-z]+/g;

const encoder = new TextEncoder();

/**
 * Canonicalize an organizer code: NFKC -> lowercase -> strip everything
 * outside a-z -> rejoin exactly four words with single hyphens.
 *
 * This normalization is FIXED. Changing it invalidates every issued code,
 * and the failure is silent: codes simply stop validating.
 */
export function normalizeCode(input: unknown): Ok<string> | Err<CodeCode> {
  if (typeof input !== 'string') return err('not_a_string');
  if (encoder.encode(input).length > MAX_CODE_BYTES) return err('too_many_bytes');

  // Every non-letter run becomes a single space, so hyphens, tabs, underscores
  // and stray punctuation all act as word separators.
  const letters = input.normalize('NFKC').toLowerCase().replace(NON_LETTER_RUN, ' ');
  const words = letters.split(' ').filter((word) => word.length > 0);

  if (words.length !== CODE_WORD_COUNT) return err('wrong_shape');

  return ok(words.join('-'));
}

/**
 * HMAC-SHA256 of the normalized code under the server-side pepper.
 * The returned hex digest IS the Blobs key in the `codes` store, so there is
 * no comparison loop and therefore no timing signal to exploit.
 */
export function digestCode(normalized: string, pepper: string): string {
  return createHmac('sha256', pepper).update(normalized, 'utf8').digest('hex');
}

/**
 * Draw a fresh code from the wordlist. `randomInt` is injected so callers pass
 * `crypto.randomInt` (rejection-sampled, never `Math.random`) in production and
 * a deterministic stub in tests.
 */
export function generateCode(
  wordlist: readonly string[],
  randomInt: (maxExclusive: number) => number,
): string {
  if (wordlist.length === 0) {
    throw new RangeError('generateCode: wordlist is empty');
  }

  const words: string[] = [];
  for (let i = 0; i < CODE_WORD_COUNT; i += 1) {
    words.push(wordlist[randomInt(wordlist.length)]);
  }

  return words.join('-');
}
