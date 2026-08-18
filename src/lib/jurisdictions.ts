/**
 * Jurisdictions -- the city allowlist for event submission, and the
 * city-to-county derivation.
 *
 * `county` is never submitted by a user. It is derived here from the
 * submitted `city`, which itself must be a member of the allowlist. That
 * makes both fields enums rather than free text, which is the injection
 * defense described in the events-calendar design doc (section 6).
 *
 * Source of truth is src/data/registry.json. Entries whose `id` starts with
 * 'place:' are cities; the slug is the id with that prefix removed. The
 * county slug is the entry's `county` field lowercased.
 *
 * That last step is deliberately just a lowercase. Every place: entry in the
 * registry carries a bare single-word county ("Greenville", "McCormick") --
 * no embedded whitespace, no trailing "County" -- so there is nothing else to
 * normalize. jurisdictions.test.ts asserts that shape against registry.json
 * directly, so if the registry is ever regenerated under a different
 * convention the test fails rather than this module silently emitting a
 * malformed slug.
 */

import { ok, err } from './text-result.js';
import type { Ok, Err } from './text-result.js';
import registry from '../data/registry.json';

interface RegistryEntry {
  id?: unknown;
  county?: unknown;
}

interface Registry {
  jurisdictions?: RegistryEntry[];
}

const PLACE_PREFIX = 'place:';

/**
 * Registry county values are bare single words, so the slug is the lowercased
 * name. See the module doc comment and the 'registry consistency' tests for
 * why no further normalization belongs here.
 * "Greenville" -> "greenville", "McCormick" -> "mccormick".
 */
function slugifyCounty(name: string): string {
  return name.trim().toLowerCase();
}

function buildCityToCounty(): Map<string, string> {
  const map = new Map<string, string>();
  const entries = (registry as Registry).jurisdictions ?? [];

  for (const entry of entries) {
    if (typeof entry.id !== 'string') continue;
    if (!entry.id.startsWith(PLACE_PREFIX)) continue;
    if (typeof entry.county !== 'string') continue;

    const slug = entry.id.slice(PLACE_PREFIX.length);
    const county = slugifyCounty(entry.county);
    if (slug === '' || county === '') continue;

    map.set(slug, county);
  }

  return map;
}

// A Map, not a plain object, so lookups cannot hit inherited keys like
// 'constructor' or '__proto__'.
const CITY_TO_COUNTY: ReadonlyMap<string, string> = buildCityToCounty();

const CITY_SLUGS: readonly string[] = Object.freeze([...CITY_TO_COUNTY.keys()]);

export function allCitySlugs(): readonly string[] {
  return CITY_SLUGS;
}

export function isKnownCity(slug: string): boolean {
  return CITY_TO_COUNTY.has(slug);
}

export function countyForCity(slug: string): Ok<string> | Err<'unknown_city'> {
  const county = CITY_TO_COUNTY.get(slug);
  if (county === undefined) return err('unknown_city');
  return ok(county);
}
