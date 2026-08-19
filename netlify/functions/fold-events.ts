import type { Config, Context } from '@netlify/functions';
import { eventsStore } from '../../src/lib/blob-stores.js';
import { isStoredRecord } from '../../src/lib/public-event.js';
import type { StoredEvent } from '../../src/lib/public-event.js';
import { commitEventsJson, foldStoredEvents, pruneExpired } from '../../src/lib/fold-events.js';
import type { CommitTarget } from '../../src/lib/fold-events.js';

export const config: Config = {
  schedule: '0 4 * * 0',
};

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`fold-events: missing required environment variable ${name}`);
  }
  return raw.trim();
}

/**
 * The GitHub credential is production-context-only (design §7). On a deploy
 * preview or branch deploy these are unset and the fold fails closed here,
 * before it can touch either the store or the repo.
 */
function resolveTarget(): CommitTarget {
  const token = requireEnv('GITHUB_FOLD_TOKEN');
  const slug = requireEnv('GITHUB_FOLD_REPO');
  const parts = slug.split('/');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
    throw new Error('fold-events: GITHUB_FOLD_REPO must be in "owner/repo" form');
  }
  const branch = process.env.GITHUB_FOLD_BRANCH?.trim() || 'master';
  return { owner: parts[0], repo: parts[1], branch, token };
}

async function readAllStoredEvents(): Promise<StoredEvent[]> {
  const store = eventsStore();
  const listing = (await store.list()) as { blobs: Array<{ key: string }> };
  const records = await Promise.all(
    listing.blobs.map(async (blob) => {
      const record = (await store.get(blob.key, { type: 'json' })) as unknown;
      return record;
    }),
  );
  // A key that lists but does not resolve is a transient store read, not a
  // reason to stall the whole week's fold. A key that resolves to something
  // that is not a `StoredEvent`-shaped object (null, a string, an array, a
  // half-written record) is dropped for the same reason the sibling
  // /api/events endpoint drops it — garbage must never reach the projection,
  // and here the projection commits permanently. Value-level validity (dates,
  // field types) is then enforced downstream by foldStoredEvents.
  return records.filter(isStoredRecord);
}

export default async (_req: Request, _context: Context): Promise<Response> => {
  try {
    const target = resolveTarget();
    const now = new Date();
    const events = pruneExpired(foldStoredEvents(await readAllStoredEvents()), now);
    const result = await commitEventsJson(target, events);
    return Response.json(
      { ok: true, total: events.length, committed: result.committed, added: result.added },
      { status: 200 },
    );
  } catch (error) {
    // Log the reason for the maintainer; never echo stored event text.
    console.error('fold-events failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ ok: false }, { status: 500 });
  }
};
