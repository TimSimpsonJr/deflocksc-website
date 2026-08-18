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
 */
export function toPublicEvent(record: StoredEvent): PublicEvent {
  const projected: Partial<PublicEvent> = {};

  for (const field of PUBLIC_EVENT_FIELDS) {
    // Cast because TypeScript cannot see, inside the loop, that the key and
    // the value type line up. The key itself is statically an allowlisted one.
    (projected as Record<string, unknown>)[field] = record[field];
  }

  return projected as PublicEvent;
}
