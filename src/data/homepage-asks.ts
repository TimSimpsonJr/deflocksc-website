// Homepage projection of the council "asks" for LegislationAsks.astro.
//
// The canonical, long-form provisions live in ./council-brief.ts (the two
// leave-behind briefs). This module carries the homepage-ABRIDGED titles and
// bodies, verbatim from the approved mockup
// (docs/plans/assets/2026-08-30-homepage-mockup.html), plus the closing
// ask-frame stats. Glyphs come from ./brief-icons.ts. See the design doc
// docs/plans/2026-08-30-homepage-rebuild-design.md §2.5.
//
// Cite-drift guard: each ask carries a CANONICAL `cite` that must exactly match
// a `cite` present on a city or county brief card (the union is exported below
// as `briefCites`). Any homepage-only trailing text (e.g. ", beyond Oconee")
// goes in `displaySuffix`, which is excluded from the guard. The rendered cite
// line is always `cite + (displaySuffix ?? '')`.

import { cityBrief, countyBrief } from './council-brief';

export interface HomepageAsk {
  /** Key into ICONS from ./brief-icons.ts. */
  icon: string;
  title: string;
  /** Homepage-abridged body; the canonical long-form lives in council-brief.ts. */
  body: string;
  /**
   * Canonical section cite. MUST be a member of `briefCites` (the guard checks
   * this field only). Homepage-only trailing text belongs in `displaySuffix`.
   */
  cite: string;
  /** Homepage-only suffix appended after `cite` when rendering (guard ignores it). */
  displaySuffix?: string;
  /** Scope badge for the two authority-specific asks. */
  scope?: 'City' | 'County';
}

/**
 * Every canonical cite present across the two briefs. The homepage asks below
 * each draw their `cite` from this set; the vitest drift guard asserts
 * membership so an abridged homepage cite can never silently diverge from the
 * canonical brief. Built from council-brief.ts so it tracks the source.
 */
export const briefCites: ReadonlySet<string> = new Set(
  [...cityBrief.model.cards, ...countyBrief.model.cards]
    .map((card) => card.cite)
    .filter((cite): cite is string => typeof cite === 'string'),
);

export const homepageAsks: HomepageAsk[] = [
  {
    icon: 'route',
    title: 'Define the problem by capability',
    body: 'It never names Flock: a system is covered when it logs people or vehicles in public and can build a searchable location history, track across places, run facial recognition, or share to an outside network, while a basic hot-list plate check is carved out.',
    cite: 'Oconee § 2-502',
  },
  {
    icon: 'cash-banknote-off',
    title: 'Keep public money and property out of it',
    body: 'No public funds, subscriptions, power, or communications may support a covered system, and none of it may sit on public property or road rights-of-way.',
    cite: 'Oconee §§ 2-504 to 506',
  },
  {
    icon: 'calendar-dot',
    title: 'Set a firm removal timeline',
    body: 'For a system already in place, outside data-sharing and funded connections stop within 10 business days of notice and the equipment comes down within 30, turning a pause into a removal on a fixed schedule.',
    cite: 'Oconee § 2-507',
  },
  {
    icon: 'clipboard-clock',
    title: 'Report publicly, and enforce it',
    body: 'The policy is administered, reported in public once a year, and backed by defined remedies when the rules are broken, so it stays accountable to the people it covers.',
    cite: 'Oconee §§ 2-514 to 515',
  },
  {
    icon: 'file-search',
    title: 'Publish the audit logs',
    body: 'Post a plain public record of every search on a regular schedule, who ran it, when, and the reason they gave, so audits catch misuse without waiting for a complaint.',
    cite: 'A city addition',
    displaySuffix: ', beyond Oconee',
    scope: 'City',
  },
  {
    icon: 'building-off',
    title: 'Close the side doors',
    body: 'The county can condition its discretionary money to towns, its accommodations-tax funds, and its sponsored events on the same rule, and bar anyone from routing the system through a nonprofit or festival committee to dodge it.',
    cite: 'Oconee §§ 2-508 to 510, 2-513',
    scope: 'County',
  },
];

export interface AskFrameStat {
  /** Displayed value string, e.g. "0" or "100+" (parsed by the count-up util). */
  value: string;
  /**
   * Screen-reader phrasing of the FINAL value. The visible `value` is animated
   * (and aria-hidden), so this stable node is what assistive tech reads — it
   * never sees a partial/zero mid-count value. Kept human-readable ("100 or
   * more" rather than "100+"). The caption and note are read normally after it.
   */
  srValue: string;
  /** Caption under the value. */
  caption: string;
  /** Amber ("zero") treatment instead of the default red. */
  zero?: boolean;
  /** Optional citation line under the caption. */
  note?: string;
}

/**
 * The two framing stats that close the legislation section (relocated out of
 * the impact band per design §2.3). Neither is camera-derived, so both are
 * static here rather than read from the generated impact-stats.json.
 *   - "0"    established site claim: SC has no ALPR statute (blog post
 *            "SC Has No License Plate Camera Law").
 *   - "100+" DeFlock's national cancellation tracker
 *            (https://deflocktheusa.com/cancellations/), 109 US jurisdictions
 *            canceled / rejected / deactivated / paused / removed / banned as of
 *            late Aug 2026. "rolled back" umbrellas the deactivated/removed/
 *            banned share so the 100+ claim spans the full count (design §4.3).
 *            Number, source, attribution, and as-of date live here together so
 *            they update as one unit.
 */
export const askFrameStats: AskFrameStat[] = [
  {
    value: '0',
    srValue: '0',
    caption: 'State laws regulating ALPR',
    zero: true,
  },
  {
    value: '100+',
    srValue: '100 or more',
    caption: 'Communities have canceled, rejected, paused, or rolled back Flock nationwide',
    note: 'As of Aug 2026 · DeFlock cancellation tracker',
  },
];
