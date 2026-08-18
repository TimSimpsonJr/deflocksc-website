/**
 * Safe embedding of JSON into a `<script type="application/json">` element.
 *
 * `JSON.stringify` does not escape `</script>`. The HTML tokenizer ends a script
 * element at the first literal occurrence regardless of JS string context, so a
 * title of `</script><img src=x onerror=...>` breaks out of the data island.
 * U+2028 and U+2029 are legal in JSON but hostile in JS/HTML contexts.
 *
 * Escaping is lossless: `\uXXXX` is a legal JSON string escape, so the
 * output always `JSON.parse`s back to the original value.
 *
 * NOTE: U+2028 and U+2029 appear below only as `\u2028` / `\u2029` escapes. Never
 * paste them as literal characters — a literal U+2028 inside the regex literal
 * is a SyntaxError, because U+2028 is a LineTerminator in the ECMAScript grammar
 * and a regex literal may not contain one.
 */

/** Escape targets. Keys are the raw characters; values are JSON `\uXXXX` escapes. */
const ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Flat character class, no quantifiers, no alternation, no backreferences —
 * it cannot backtrack, so hostile input cannot make it expensive. The two
 * separators are spelled as escapes; a literal U+2028 here would not parse.
 */
const DANGEROUS = /[<>&\u2028\u2029]/g;

/**
 * Serialize `value` to a JSON string that is safe to place inside a
 * `<script type="application/json">` element.
 *
 * Returns the literal string `"null"` for values JSON cannot represent
 * (`undefined`, functions, symbols), so callers always get parseable output.
 */
export function toJsonIsland(value: unknown): string {
  const json = JSON.stringify(value);

  // JSON.stringify returns undefined for undefined, functions, and symbols.
  if (json === undefined) return 'null';

  // In JSON, none of the escaped characters can appear outside a string literal,
  // so a global replace can never touch structural punctuation.
  return json.replace(DANGEROUS, (ch) => ESCAPES[ch]);
}
