/**
 * Signal CTA redirect — homepage §2.6c.
 *
 * The redirect target must not appear anywhere a scraper can grep in the
 * prerendered HTML. The button (#signal-cta) carries no href and no data-* URL,
 * and the destination is decoded and assigned to window.location only at click
 * time, so a scraper reading the static markup harvests nothing.
 *
 * Why the value is base64-encoded rather than a plain literal: Astro inlines a
 * small hoisted script straight into the page markup (a no-import chunk is not
 * externalized, even when imported as a module — rollup merges it back inline).
 * Encoding, not externalization, is therefore what actually keeps the path out
 * of view-source here. The events page's intake script (src/scripts/events-page.ts)
 * gets externalized for free only because it happens to import heavy modules; a
 * standalone click handler does not, so this matches the mockup's atob wrapper,
 * which the design spec names as the equivalent countermeasure.
 *
 * The decoded target is the existing Netlify redirect function
 * (netlify/functions/go.ts) keyed "intake", which resolves the operator's vetted
 * Signal link from the Blobs `links` store; no new endpoint is created. NO
 * analytics fire here (Rev 2, Fable#14): a record of who moved toward the Signal
 * group is exactly what a subpoena would want, which is why Base.astro also
 * excludes /events/* from analytics entirely.
 */
const button = document.getElementById('signal-cta');
if (button) {
  button.addEventListener('click', () => {
    // Decodes to the internal /go/ intake redirect path at click time.
    window.location.href = atob('L2dvL2ludGFrZQ==');
  });
}
