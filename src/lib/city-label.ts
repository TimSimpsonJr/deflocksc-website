/**
 * Display label for a city slug returned by `allCitySlugs()`.
 *
 * Pure string formatting: no registry lookup, no I/O. The slug remains the
 * only value ever submitted or stored; this is presentation for the <select>
 * on the submit form and for event cards.
 *
 * Accepts an optional `place:` prefix so a raw `registry.json` id also works.
 */
export function cityLabel(slug: string): string {
  const bare = slug.startsWith('place:') ? slug.slice('place:'.length) : slug;

  return bare
    .split(/[-\s]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
