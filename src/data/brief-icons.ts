// Shared inline-SVG Tabler glyphs for the council briefs and the homepage
// legislation asks. Each value is the INNER markup of a Tabler icon; render it
// inside an <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
// stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">.
//
// Extracted from CouncilBrief.astro's former private ICONS map so both
// CouncilBrief.astro and LegislationAsks.astro draw from one source and the
// glyphs can never drift apart. The council-brief keys are byte-for-byte
// identical to the originals, so CouncilBrief's rendered output is unchanged.
//
// The homepage keys use the path data from the approved mockup
// (docs/plans/assets/2026-08-30-homepage-mockup.html, the visual source of
// truth). Five of the six homepage glyphs are their own drawings, distinct from
// the council-brief keys of the same rough meaning (route vs scan,
// cash-banknote-off vs money-off, calendar-dot vs clock, clipboard-clock vs
// clipboard, building-off vs door); only `file-search` is genuinely shared, so
// the homepage reuses that one key rather than duplicating it. Per the design
// doc §2.5, the council-brief `clipboard` glyph is left untouched — the
// homepage's clock-faced card-4 glyph lives under its own `clipboard-clock` key.

export const ICONS: Record<string, string> = {
  // ── Council-brief glyphs (rendered output must stay identical) ──
  scan: '<path d="M5 12h14"/><path d="M3 7v-2a2 2 0 0 1 2 -2h2"/><path d="M3 17v2a2 2 0 0 0 2 2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M17 21h2a2 2 0 0 0 2 -2v-2"/>',
  'money-off': '<path d="M13 9h6a2 2 0 0 1 2 2v6m-2 2h-10a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2"/><path d="M12.582 12.59a2 2 0 0 0 2.83 2.826"/><path d="M17 9v-2a2 2 0 0 0 -2 -2h-6m-4 0a2 2 0 0 0 -2 2v6a2 2 0 0 0 2 2h2"/><path d="M3 3l18 18"/>',
  clock: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 12l3 2"/><path d="M12 7v5"/>',
  clipboard: '<path d="M8 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h5.697"/><path d="M18 14v4h4"/><path d="M18 11v-4a2 2 0 0 0 -2 -2h-2"/><path d="M8 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2"/><path d="M8 11h4"/><path d="M8 15h3"/>',
  'file-search': '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M12 21h-5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v4.5"/><path d="M14 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0"/><path d="M18.5 19.5l2.5 2.5"/>',
  door: '<path d="M14 12v.01"/><path d="M3 21h18"/><path d="M6 21v-16a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v16"/>',

  // ── Homepage legislation-ask glyphs (mockup path data governs) ──
  route: '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z"/><path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5"/>',
  'cash-banknote-off': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9.88 9.878a3 3 0 1 0 4.242 4.243m.58 -3.425a3.012 3.012 0 0 0 -1.412 -1.405"/><path d="M10 6h9a2 2 0 0 1 2 2v8c0 .294 -.064 .574 -.178 .825m-2.822 1.175h-13a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2h1"/><path d="M18 12l.01 0"/><path d="M6 12l.01 0"/><path d="M3 3l18 18"/>',
  'calendar-dot': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 5m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  'clipboard-clock': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M8 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h5.697"/><path d="M18 14v4h4"/><path d="M18 11v-4a2 2 0 0 0 -2 -2h-2"/><path d="M8 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2"/><path d="M14 18a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M8 11h4"/><path d="M8 15h3"/>',
  'building-off': '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 21h18"/><path d="M6 21v-15"/><path d="M7.18 3.175c.25 -.112 .528 -.175 .82 -.175h8a2 2 0 0 1 2 2v9"/><path d="M18 18v3"/><path d="M3 3l18 18"/>',
};
