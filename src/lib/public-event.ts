/**
 * The event record as it is stored in the Netlify Blobs `events` store.
 *
 * It carries three fields that must never reach a browser: `signalUrl` (a live
 * Signal invite), `codeDigest` (which would cluster events by organizer across
 * pseudonyms), and `revoked` (which would publish which organizer was burned
 * and when).
 */
export interface StoredEvent {
  id: string;
  type: 'meetup' | 'public';
  title: string;
  description: string | null;
  date: string;
  time: string;
  city: string;
  county: string;
  address: string | null;
  hasSignalGroup: boolean;
  recurrence: { freq: 'weekly' | 'monthly_nth'; until: string } | null;
  organizer: string;
  createdAt: string;
  signalUrl: string | null;
  codeDigest: string;
  revoked: boolean;
}

/**
 * The event record as it is published: the exact field set of
 * `src/data/events.json` and of the `/api/events` response.
 */
export interface PublicEvent {
  id: string;
  type: 'meetup' | 'public';
  title: string;
  description: string | null;
  date: string;
  time: string;
  city: string;
  county: string;
  address: string | null;
  hasSignalGroup: boolean;
  recurrence: { freq: 'weekly' | 'monthly_nth'; until: string } | null;
  organizer: string;
  createdAt: string;
}

/**
 * The allowlist. Adding a field to `StoredEvent` does NOT publish it; a field
 * only becomes public by being added here and to `PublicEvent` deliberately.
 */
export const PUBLIC_EVENT_FIELDS: readonly (keyof PublicEvent)[] = [
  'id',
  'type',
  'title',
  'description',
  'date',
  'time',
  'city',
  'county',
  'address',
  'hasSignalGroup',
  'recurrence',
  'organizer',
  'createdAt',
];

/**
 * Project a stored record down to its publishable fields.
 *
 * This picks each allowlisted field by name. It must never spread the record
 * (`{ ...record }`) and must never delete fields from a copy: both of those
 * publish anything added to the store later, which is exactly the failure this
 * function exists to prevent.
 *
 * `recurrence` is the one object-valued field and is deep-picked, not copied by
 * reference. A shallow copy would alias the stored record's recurrence object,
 * which would publish any property added under it later (the top-level allowlist
 * cannot see nested fields) and would let a caller mutating the projection
 * corrupt the stored record in memory.
 */
export function toPublicEvent(record: StoredEvent): PublicEvent {
  const projected: Partial<PublicEvent> = {};

  for (const field of PUBLIC_EVENT_FIELDS) {
    if (field === 'recurrence') {
      // Deep-pick so the projected recurrence is a fresh object carrying only
      // its two allowlisted properties, never an alias of the stored record's.
      projected.recurrence = record.recurrence
        ? { freq: record.recurrence.freq, until: record.recurrence.until }
        : null;
      continue;
    }
    // Cast because TypeScript cannot see, inside the loop, that the key and
    // the value type line up. The key itself is statically an allowlisted one.
    (projected as Record<string, unknown>)[field] = record[field];
  }

  return projected as PublicEvent;
}

/**
 * Narrow an untyped blob payload to a `StoredEvent`-shaped object.
 *
 * This is a shape check, not validation: it keeps garbage (nulls, strings,
 * arrays, half-written records) out of any pipeline that reads the `events`
 * store, so nothing downstream projects or sorts a non-record. `toPublicEvent`
 * stays the confidentiality boundary and `publicEventSchema` the value-level
 * one; this only guarantees a real object carrying the three fields every
 * consumer sorts and dedupes on.
 *
 * Shared by the /api/events read path (netlify/functions/events.ts) and the
 * weekly fold (netlify/functions/fold-events.ts) so both gate the store the
 * same way — the fold's sink is a permanent commit, so garbage must never
 * reach its projection either.
 */
export function isStoredRecord(value: unknown): value is StoredEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.date === 'string' &&
    typeof record.time === 'string'
  );
}
