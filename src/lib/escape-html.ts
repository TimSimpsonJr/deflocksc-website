/**
 * Escape a string for interpolation into HTML, including quoted-attribute
 * context.
 *
 * Escapes the five characters that are unsafe in element text AND in a
 * double- or single-quoted attribute value: `&`, `<`, `>`, `"`, `'`.
 * Quote escaping is included on purpose: callers interpolate the output into
 * attributes fed by third-party data (e.g. `src="${escapeHtml(url)}"`,
 * `alt="${escapeHtml(name)}"`), where a raw `"` would close the attribute and,
 * under a `script-src 'unsafe-inline'` policy, execute an injected handler.
 *
 * Implemented as a single-pass character-class replace with a static map, so
 * it needs no DOM and runs in a node test environment. `&` is in the class,
 * so each source character is rewritten exactly once — there is no double
 * escaping of the entities this function itself emits.
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
