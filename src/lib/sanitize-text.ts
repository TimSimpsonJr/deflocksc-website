import { ok, err, type Ok, type Err } from './text-result.js';

export type SanitizeCode =
  | 'not_a_string'
  | 'too_many_bytes'
  | 'empty'
  | 'too_many_graphemes'
  | 'control_char'
  | 'bidi_control'
  | 'zero_width'
  | 'unassigned_or_private'
  | 'newline'
  | 'combining_run'
  | 'script_not_allowed'
  | 'emoji';

export interface SanitizeOptions {
  maxBytes: number;
  maxGraphemes: number;
}

// The caps, from the design doc, section 6. These are the single source of
// truth: callers import them rather than retyping the numbers, because
// sanitizeText enforces whatever it is handed and a mismatched copy would be
// invisible. Both axes matter -- bytes bound storage and the work done before
// normalization, graphemes bound what a reader actually sees.
export const TITLE_LIMITS: SanitizeOptions = { maxBytes: 1024, maxGraphemes: 80 };
export const DESCRIPTION_LIMITS: SanitizeOptions = { maxBytes: 3072, maxGraphemes: 300 };
export const ADDRESS_LIMITS: SanitizeOptions = { maxBytes: 512, maxGraphemes: 120 };

const ENCODER = new TextEncoder();

// Horizontal space characters, collapsed to a single U+0020.
// SHAPE: one flat character class, one quantifier, no nesting, no alternation,
// no backreferences. Cannot backtrack.
// Line breaks and tabs are deliberately absent: they must survive collapsing so
// that LINE_BREAK_OR_TAB below can reject them.
const HORIZONTAL_SPACE_RUN = /[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/gu;

// SHAPE: one flat character class, no quantifier at all. Cannot backtrack.
const LINE_BREAK_OR_TAB = /[\t\n\v\f\r\u0085\u2028\u2029]/u;

// C0 and C1 controls. Line breaks and tabs are inside this range but are
// rejected earlier, with their own code.
// SHAPE: one flat character class, no quantifier. Cannot backtrack.
const CONTROL_CHAR = /[\u0000-\u001F\u007F-\u009F]/u;

// Bidi overrides and isolates (Trojan Source).
// SHAPE: one flat character class, no quantifier. Cannot backtrack.
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/u;

// SHAPE: one flat character class, no quantifier. Cannot backtrack.
const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/u;
const ZERO_WIDTH_GLOBAL = /[\u200B\u200C\u200D\uFEFF]/gu;

// Unassigned code points and private use areas.
// SHAPE: one flat character class of two property escapes, no quantifier.
const UNASSIGNED_OR_PRIVATE = /[\p{Cn}\p{Co}]/u;

// Three consecutive combining marks: one more than the cap of two.
// SHAPE: one flat character class with a single fixed-count quantifier. No
// nesting, no alternation, no backreferences. Cannot backtrack.
const COMBINING_RUN = /[\p{Mn}\p{Mc}\p{Me}]{3}/u;

// Anything outside Latin, Common, and Inherited. Inherited is required, not
// optional: combining marks live there, and the cap above already permits two.
// SHAPE: one negated flat character class, no quantifier. Cannot backtrack.
const DISALLOWED_SCRIPT =
  /[^\p{Script_Extensions=Latin}\p{Script_Extensions=Common}\p{Script_Extensions=Inherited}]/u;

// Emoji, plus the variation selectors that drive emoji presentation.
// Deliberately not \p{Emoji}, which matches every ASCII digit and would reject
// "Meetup 2026".
// SHAPE: one flat character class, no quantifier. Cannot backtrack.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE00-\uFE0F]/u;

let graphemeSegmenter: Intl.Segmenter | null = null;

function countGraphemes(value: string): number {
  if (graphemeSegmenter === null) {
    graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  }
  let count = 0;
  for (const _segment of graphemeSegmenter.segment(value)) count += 1;
  return count;
}

export function sanitizeText(
  input: unknown,
  opts: SanitizeOptions
): Ok<string> | Err<SanitizeCode> {
  if (typeof input !== 'string') return err('not_a_string');

  // 1. Raw bytes, before anything else. NFKC can expand its input, so a cap
  //    applied after normalization is not a cap on the work done to get there.
  if (ENCODER.encode(input).length > opts.maxBytes) return err('too_many_bytes');

  // 2. NFKC, so fullwidth text cannot masquerade as a distinct value.
  const normalized = input.normalize('NFKC');

  // 3. Trim, then collapse internal horizontal-space runs to a single space.
  const collapsed = normalized.trim().replace(HORIZONTAL_SPACE_RUN, ' ');

  if (collapsed.length === 0) return err('empty');

  // 4. These are single-line fields.
  if (LINE_BREAK_OR_TAB.test(collapsed)) return err('newline');

  // 5. Grapheme clusters, not code units. This is what bounds display.
  if (countGraphemes(collapsed) > opts.maxGraphemes) return err('too_many_graphemes');

  // 6. Reject-list. Reject, never strip: a filter that rewrites input can
  //    usually be used to smuggle something past it.
  if (CONTROL_CHAR.test(collapsed)) return err('control_char');
  if (BIDI_CONTROL.test(collapsed)) return err('bidi_control');
  if (ZERO_WIDTH.test(collapsed)) return err('zero_width');
  if (UNASSIGNED_OR_PRIVATE.test(collapsed)) return err('unassigned_or_private');

  // 7. Content-quality tier: the worst case if these are wrong is an ugly
  //    calendar, not a compromise.
  if (COMBINING_RUN.test(collapsed)) return err('combining_run');
  if (DISALLOWED_SCRIPT.test(collapsed)) return err('script_not_allowed');
  if (EMOJI.test(collapsed)) return err('emoji');

  return ok(collapsed);
}

// Duplicate detection runs on the normalized string, never the raw body: one
// added space or zero-width character would otherwise defeat it. Zero-width
// characters cannot reach here through sanitizeText, but this function is also
// called on values read back out of storage, so it strips them defensively.
export function dedupeKey(sanitized: string): string {
  return sanitized
    .normalize('NFKC')
    .replace(ZERO_WIDTH_GLOBAL, '')
    .replace(HORIZONTAL_SPACE_RUN, ' ')
    .trim()
    .toLowerCase();
}
