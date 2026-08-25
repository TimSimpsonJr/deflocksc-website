import { getStore, type Store } from '@netlify/blobs';

/**
 * The single source of Netlify Blobs handles for this site.
 *
 * Two rules are enforced here rather than at each call site:
 *
 * 1. Always `getStore`, never `getDeployStore`. A deploy-scoped store is
 *    discarded when its deploy is superseded, so every stored event would
 *    silently vanish on the next push.
 *
 * 2. Site-wide stores are shared across production, branch, and deploy-preview
 *    deploys. Without a guard, a preview deploy's functions could write to and
 *    delete from the real `codes` store, which has no backup and is therefore
 *    the one unrecoverable delete in the system. So every handle returned here
 *    is wrapped: writes and deletes throw ContextRefusedError unless
 *    `process.env.CONTEXT === 'production'`. Reads pass through unchanged.
 *
 * CONTEXT is read on every write call, not captured when the handle is created.
 *
 * The refusal is a synchronous throw rather than a rejected promise, so a call
 * site that forgets to await still fails loudly.
 *
 * `codes`, `events`, and `links` open with `consistency: 'strong'`. Under the
 * default eventual model a revoked code keeps validating, a tombstoned event
 * keeps resolving its Signal invite, and a just-set intake link stays stale,
 * for up to 60 seconds.
 *
 * One sanctioned bypass: the maintainer CLI (`scripts/organizer-codes.ts`)
 * writes to the real production store from a developer machine, where CONTEXT
 * is unset. It opts in explicitly by setting `process.env.CONTEXT = 'production'`
 * before calling these factories. That path already requires local possession of
 * both the Netlify token and the pepper.
 */

export class ContextRefusedError extends Error {
  readonly storeName: string;
  readonly operation: string;
  readonly context: string;

  constructor(storeName: string, operation: string, context: string) {
    super(
      `Refused ${operation}() on Blobs store "${storeName}": writes and deletes ` +
        `are only permitted when CONTEXT is "production" (CONTEXT is "${context}").`,
    );
    this.name = 'ContextRefusedError';
    this.storeName = storeName;
    this.operation = operation;
    this.context = context;
  }
}

const WRITE_METHODS: ReadonlySet<string> = new Set([
  'set',
  'setJSON',
  'delete',
  'deleteAll',
]);

function readOnlyOutsideProduction(store: Store, storeName: string): Store {
  return new Proxy(store, {
    get(target, property) {
      const value = Reflect.get(target, property);

      if (typeof property === 'string' && WRITE_METHODS.has(property)) {
        return (...args: unknown[]) => {
          const context = process.env.CONTEXT ?? 'unset';
          if (context !== 'production') {
            throw new ContextRefusedError(storeName, property, context);
          }
          return (value as (...callArgs: unknown[]) => unknown).apply(target, args);
        };
      }

      // Bind so the underlying methods keep their own `this` instead of the proxy.
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Event records, keyed by the 8-char opaque event id. Server-generated keys only. */
export function eventsStore(): Store {
  return readOnlyOutsideProduction(
    getStore({ name: 'events', consistency: 'strong' }),
    'events',
  );
}

/** Organizer code records, keyed by the HMAC digest of the normalized code. */
export function codesStore(): Store {
  return readOnlyOutsideProduction(
    getStore({ name: 'codes', consistency: 'strong' }),
    'codes',
  );
}

/** Daily rate-limit counters, keyed `rl/<yyyy-mm-dd>/<hashed-subject>`. */
export function rateLimitStore(): Store {
  return readOnlyOutsideProduction(getStore({ name: 'ratelimit' }), 'ratelimit');
}

/** Operational metadata, e.g. the `pepper-canary` key written by the CLI. */
export function metaStore(): Store {
  return readOnlyOutsideProduction(getStore({ name: 'meta' }), 'meta');
}

/**
 * Redirect targets for the /go function, currently a single `intake` key
 * holding the operator's vetting-page Signal link (set via the CLI's
 * `set-intake`). Strong consistency so a freshly set — or cleared — intake
 * link resolves immediately rather than lagging by up to 60 seconds.
 */
export function linksStore(): Store {
  return readOnlyOutsideProduction(
    getStore({ name: 'links', consistency: 'strong' }),
    'links',
  );
}
