import { toPublicEvent } from './public-event.js';
import type { PublicEvent, StoredEvent } from './public-event.js';
import { publicEventSchema } from './event-schema.js';

/**
 * The one and only path the fold ever writes. Deliberately a module constant
 * and never a function parameter: nothing a caller or a stored record carries
 * can redirect the commit at another file in the repo.
 */
export const EVENTS_FILE_PATH = 'src/data/events.json';

const GITHUB_API = 'https://api.github.com';

export interface CommitTarget {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface CommitResult {
  /** false when the committed file already matched, so no deploy was spent. */
  committed: boolean;
  added: number;
  message: string | null;
}

/**
 * The commit message is a constant plus a server-computed integer. No event
 * field is ever interpolated. GitHub interprets commit messages on the default
 * branch, so a title containing `#123` or `@someone` would close an issue or
 * fire a mention from the repo owner's identity.
 */
export function buildCommitMessage(addedCount: number): string {
  if (!Number.isInteger(addedCount) || addedCount < 0) {
    throw new RangeError('buildCommitMessage: addedCount must be a non-negative integer');
  }
  return `chore: fold events (${addedCount} added)`;
}

/**
 * Projects stored records to the public field set, drops tombstones and any
 * record that would not survive the build guard, and sorts by date then id.
 *
 * The sort is what makes the weekly diff stable: the Blobs `list()` order is
 * not guaranteed, and an unsorted file would churn every row on every fold.
 * Expiry pruning is a separate pass (`pruneExpired`) so the caller supplies the
 * clock and the projection stays a pure function of its argument.
 *
 * Every projection is gated against `publicEventSchema` — the SAME strict
 * schema `events.astro` re-applies to src/data/events.json at build time
 * (design §16.1). The fold's sink is the highest-consequence one in the system
 * (a permanent commit to master), so it fails toward non-publication: a
 * non-conforming record is dropped here rather than committed, where it would
 * otherwise fail every later build until a human intervened. This is also the
 * guard that catches a malformed date — `isExpired()` deliberately keeps an
 * unparseable date (deferring to this schema check), so without this gate such
 * a record would sail through `pruneExpired` and land in the file forever.
 *
 * A `council` record is dropped too, even though `publicEventSchema` now admits
 * `type: 'council'` (for council-events.ts's loader). events.json holds ONLY
 * folded submissions (meetup/public); curated council meetings live in
 * council-meetings.json and merge in via loadCouncilEvents(). Committing a
 * council record here would pass this schema yet fail the very next build's
 * events.astro guard, stalling every deploy until a human reverted — the exact
 * fail-open direction this fold is built against. Reachable only via store
 * corruption (submissionSchema still rejects 'council'), so this is
 * defense-in-depth, mirroring the explicit council rejection in events.astro.
 *
 * Both gates fail closed. The tombstone check publishes only a record whose
 * `revoked` is exactly `false` — matching go.ts and submit-event.ts, where a
 * `revoked` that is truthy-but-not-`true` or absent entirely is treated as a
 * corrupt record, not a live one. `revoked` marks a burned organizer; the
 * schema gate cannot see it (`toPublicEvent` drops it before parsing), so if
 * this check were `!== true` a corrupted tombstone would be committed to git
 * history permanently. And what is published is the schema's PARSED output, not
 * the raw projection: `publicEventSchema` runs `sanitizeText` over the text
 * fields, so a stored value that is non-canonical but still acceptable (a
 * leading BOM, fullwidth glyphs NFKC maps to ASCII, a doubled space) is
 * committed in its sanitized form rather than verbatim. Publishing the raw
 * projection would let rewrite-class corruption slip past the build guard,
 * which re-applies this same accept-and-rewrite schema and so cannot catch it.
 */
export function foldStoredEvents(records: readonly StoredEvent[]): PublicEvent[] {
  const published: PublicEvent[] = [];
  for (const record of records) {
    if (record.revoked !== false) continue;
    const projected = toPublicEvent(record);
    const parsed = publicEventSchema.safeParse(projected);
    if (!parsed.success) continue;
    // Never commit a council record to events.json (see docstring): it would
    // pass this schema but fail the next build's events.astro guard.
    if (parsed.data.type === 'council') continue;
    published.push(parsed.data as PublicEvent);
  }
  return published.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

// --- expiry (design §10) -----------------------------------------------------

/** One horizon, used by both the fold's pruning and the build-time guard. */
export const EXPIRY_HORIZON_DAYS = 30;
const EXPIRY_HORIZON_MS = EXPIRY_HORIZON_DAYS * 24 * 60 * 60 * 1000;

// Sourced directly from PublicEvent so it cannot drift from the published shape:
// `until` is nullable (a curated council record may recur indefinitely) and
// `nths` is an optional monthly-nth selection. A PublicEvent is therefore
// assignable to DatedEvent without a cast.
type EventRecurrence = PublicEvent['recurrence'];

interface DatedEvent {
  readonly date: string;
  readonly recurrence: EventRecurrence;
}

/**
 * The last day an event is active: recurrence.until when it recurs to a fixed
 * end, else its own date. Returns null for an indefinite recurrence
 * (recurrence.until === null), which isExpired() reads as "no final date, never
 * expires".
 */
export function finalDateOf(event: DatedEvent): string | null {
  return event.recurrence ? event.recurrence.until : event.date;
}

/**
 * True when an event's final date is more than EXPIRY_HORIZON_DAYS before `now`.
 * The horizon is measured from the end of that calendar day in UTC, so an event
 * is not counted expired on the very day it turns 30 days old. `now` is passed
 * in rather than read from the clock so both the fold and the build guard are
 * deterministic. An indefinite recurrence (until: null) has no final date and is
 * never expired; an unparseable date is likewise never treated as expired — the
 * strict schema guard, not this predicate, is what rejects a malformed date.
 */
export function isExpired(event: DatedEvent, now: Date): boolean {
  const finalDate = finalDateOf(event);
  if (finalDate === null) return false;
  const end = Date.parse(`${finalDate}T23:59:59.999Z`);
  if (Number.isNaN(end)) return false;
  return now.getTime() - end > EXPIRY_HORIZON_MS;
}

/**
 * Drop every event past the expiry horizon. The fold applies this so
 * events.json cannot grow without bound as events age out (single 30-day
 * horizon, design §10).
 */
export function pruneExpired<T extends DatedEvent>(events: readonly T[], now: Date): T[] {
  return events.filter((event) => !isExpired(event, now));
}

/**
 * Build-time expiry guard (design §10). The events-page task calls this in
 * events.astro frontmatter, after schema-parsing src/data/events.json, so a
 * neglected calendar fails the deploy instead of rotting silently. The weekly
 * fold already prunes expired records, so in normal operation nothing here
 * fires; it catches a hand-edited or fold-stalled file.
 */
export function assertEventsFresh(
  events: readonly (DatedEvent & { readonly id: string })[],
  now: Date,
): void {
  const stale = events.filter((event) => isExpired(event, now));
  if (stale.length > 0) {
    const ids = stale.map((event) => event.id).join(', ');
    throw new Error(
      `assertEventsFresh: ${stale.length} event(s) are more than ${EXPIRY_HORIZON_DAYS} days ` +
        `past their final date and were never expired: ${ids}. Run the fold ` +
        `(.github/workflows/fold-events.yml) or resubmit/expire them.`,
    );
  }
}

/** Two-space JSON with a trailing newline, matching the repo's other data files. */
export function serializeEventsFile(events: readonly PublicEvent[]): string {
  return `${JSON.stringify(events, null, 2)}\n`;
}

/**
 * How many ids in the new set are absent from the committed file. An
 * unreadable or missing file counts everything as added rather than throwing:
 * the fold's job is to publish, and a wrong count is a cosmetic defect while a
 * thrown fold is a stalled calendar.
 */
export function countAdded(
  existingJson: string | null,
  next: readonly PublicEvent[],
): number {
  const known = new Set<string>();
  if (existingJson !== null) {
    try {
      const parsed: unknown = JSON.parse(existingJson);
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string') {
            known.add((entry as { id: string }).id);
          }
        }
      }
    } catch {
      // Unparseable committed file: fall through with an empty known set.
    }
  }
  let added = 0;
  for (const event of next) {
    if (!known.has(event.id)) added += 1;
  }
  return added;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'user-agent': 'deflocksc-fold-events',
    'x-github-api-version': '2022-11-28',
  };
}

interface FileState {
  sha: string | null;
  content: string | null;
}

async function readEventsFile(target: CommitTarget): Promise<FileState> {
  const url =
    `${GITHUB_API}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}` +
    `/contents/${EVENTS_FILE_PATH}?ref=${encodeURIComponent(target.branch)}`;
  const res = await fetch(url, { method: 'GET', headers: githubHeaders(target.token) });
  if (res.status === 404) return { sha: null, content: null };
  if (!res.ok) {
    throw new Error(`fold-events: GitHub GET ${EVENTS_FILE_PATH} failed with ${res.status}`);
  }
  const body = (await res.json()) as { sha?: unknown; content?: unknown };
  const content =
    typeof body.content === 'string'
      ? Buffer.from(body.content, 'base64').toString('utf8')
      : null;
  return { sha: typeof body.sha === 'string' ? body.sha : null, content };
}

async function putEventsFile(
  target: CommitTarget,
  payload: { message: string; contentBase64: string; sha: string | null },
): Promise<Response> {
  const url =
    `${GITHUB_API}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}` +
    `/contents/${EVENTS_FILE_PATH}`;
  // `author` and `committer` are deliberately absent so GitHub attributes the
  // commit to the token identity.
  const body: Record<string, string> = {
    message: payload.message,
    content: payload.contentBase64,
    branch: target.branch,
  };
  if (payload.sha !== null) body.sha = payload.sha;
  return fetch(url, {
    method: 'PUT',
    headers: githubHeaders(target.token),
    body: JSON.stringify(body),
  });
}

/**
 * GET for the sha, PUT with that sha, retry once on 409. A 409 means another
 * writer (the camera-refresh automation, or a human) touched the file between
 * the read and the write; re-reading the sha and replaying the same message is
 * the whole recovery. One retry, then fail loudly.
 */
export async function commitEventsJson(
  target: CommitTarget,
  events: readonly PublicEvent[],
): Promise<CommitResult> {
  const nextContent = serializeEventsFile(events);
  let state = await readEventsFile(target);

  if (state.content === nextContent) {
    return { committed: false, added: 0, message: null };
  }

  const added = countAdded(state.content, events);
  const message = buildCommitMessage(added);
  const contentBase64 = Buffer.from(nextContent, 'utf8').toString('base64');

  let res = await putEventsFile(target, { message, contentBase64, sha: state.sha });
  if (res.status === 409) {
    state = await readEventsFile(target);
    res = await putEventsFile(target, { message, contentBase64, sha: state.sha });
  }
  if (!res.ok) {
    throw new Error(`fold-events: GitHub PUT ${EVENTS_FILE_PATH} failed with ${res.status}`);
  }

  return { committed: true, added, message };
}
