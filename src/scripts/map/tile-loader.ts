/**
 * Per-viewport Deflock CDN tile loader.
 *
 * Modeled on deflock.org's tile store (webapp/src/stores/tiles.ts in the
 * FoggedLens/deflock repo): fetch the tile index once, then fetch each
 * 20-degree tile intersecting the viewport that is not already cached, and
 * dedupe cameras across tiles by OSM id. Two deliberate deviations from
 * upstream (see docs/plans/2026-08-29-camera-map-live-data-design.md):
 * exact floor() tile-intersection math instead of upstream's over-fetching
 * ceil(), and expiration_utc treated as Unix SECONDS (upstream passes it to
 * new Date() unscaled, a latent bug).
 *
 * All requests go through the same-origin /deflock-tiles/* proxy —
 * netlify.toml in production, the Vite dev proxy in astro.config.mjs under
 * `astro dev` — because cdn.deflock.me only sends CORS headers for deflock.org.
 *
 * Failure policy: never throw. On the first failed (or contract-invalid)
 * index fetch or failed tile fetch, load the committed snapshot (fallbackUrl)
 * once so the map is never empty — then back off: a failed index latches a
 * 60 s cooldown, and a failed tile is not retried until the index's ?v=
 * rotates, so repeated moveend events never retry-storm. Tile requests are
 * generation-tagged with the index tile_url they were issued under; a
 * completion that arrives after the ?v= has rotated is discarded rather than
 * cached, so stale-version data can never satisfy the new generation. Live
 * tile records always take precedence over fallback records with the same
 * OSM id.
 */

export interface DeflockCamera {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface TileBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface TileIndex {
  /** Unix timestamp in SECONDS (observed: 1788010667 ≈ 2026-08-29). */
  expiration_utc: number;
  /** Available tile-origin keys, e.g. "20/-80". */
  regions: string[];
  /** e.g. "https://cdn.deflock.me/regions/{lat}/{lon}.json?v=1788006947" */
  tile_url: string;
  /** Observed: 20. */
  tile_size_degrees: number;
}

export interface TileLoaderOptions {
  /** Called with ALL currently loaded cameras (deduped by id) after data changes. */
  onUpdate: (cameras: DeflockCamera[]) => void;
  /** Same-origin proxy prefix. Default '/deflock-tiles'. */
  proxyPrefix?: string;
  /** Snapshot fetched at most once if the CDN fails. Default '/camera-data.json'. */
  fallbackUrl?: string;
}

const CDN_REGIONS_PREFIX = 'https://cdn.deflock.me/regions';

/** Minimum index lifetime; also the cooldown latched after an index failure. */
const INDEX_MIN_TTL_MS = 60_000;

/**
 * Max tiles fetched for a single viewport. The live index lists ~54 regions
 * at ~1-2.8 MB each; a zoomed-out world view intersecting them all would pull
 * 30-60 MB. SC/regional viewports intersect at most a handful of tiles and
 * are unaffected. (A map minZoom would also bound this, but that touches map
 * init — out of scope; noted as a follow-up alternative in the design doc.)
 */
const MAX_TILES_PER_VIEWPORT = 8;

/**
 * Tile-origin keys ("lat/lon") for every tile intersecting the bounds.
 * A tile with origin o covers [o, o+size), so intersecting origins run from
 * floor(min/size)*size to floor(max/size)*size inclusive. Keys not in the
 * index's `available` list are skipped.
 *
 * Wrapped bounds are NOT normalized: this map is SC-focused and globe-wrapped
 * views (west > east across the antimeridian, or longitudes outside ±180) are
 * unsupported. Such bounds are still safe here — west > east makes the lon
 * loop run zero times, and out-of-range origins are never in `available`.
 */
export function visibleTileKeys(
  bounds: TileBounds,
  sizeDeg: number,
  available: string[]
): string[] {
  // Defense-in-depth: a non-finite or non-positive size would make the loops
  // below non-terminating. createTileLoader validates the index before ever
  // calling this, but keep the exported function safe standalone.
  if (!Number.isFinite(sizeDeg) || sizeDeg <= 0) return [];
  const keys: string[] = [];
  const latEnd = Math.floor(bounds.north / sizeDeg) * sizeDeg;
  const lonEnd = Math.floor(bounds.east / sizeDeg) * sizeDeg;
  for (let lat = Math.floor(bounds.south / sizeDeg) * sizeDeg; lat <= latEnd; lat += sizeDeg) {
    for (let lon = Math.floor(bounds.west / sizeDeg) * sizeDeg; lon <= lonEnd; lon += sizeDeg) {
      const key = `${lat}/${lon}`;
      if (available.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * Rewrite the CDN's tile_url template onto the same-origin proxy, preserving
 * the ?v= cache-buster. If the CDN ever changes host — or the template loses
 * its {lat}/{lon} placeholders — degrade to a plain proxy template rather
 * than emit tile URLs that could never resolve (the proxy target is pinned
 * in netlify.toml anyway). isValidTileIndex already rejects a
 * placeholder-less tile_url before the loader gets here; this keeps the
 * exported helper safe standalone.
 */
export function proxiedTileTemplate(tileUrl: string, proxyPrefix: string): string {
  const usable =
    tileUrl.startsWith(CDN_REGIONS_PREFIX) &&
    tileUrl.includes('{lat}') &&
    tileUrl.includes('{lon}');
  return usable
    ? proxyPrefix + tileUrl.slice(CDN_REGIONS_PREFIX.length)
    : `${proxyPrefix}/{lat}/{lon}.json`;
}

/**
 * Contract validation for the CDN index, run on every fetched index BEFORE it
 * is stored. A malformed index must never make the loader throw or hang: a
 * zero/negative/missing tile_size_degrees would make visibleTileKeys
 * non-terminating (or NaN math) without this gate. tile_url must carry both
 * the {lat} and {lon} placeholders — a template without them would aim every
 * tile fetch at the same URL, so it is rejected here (the loader falls back
 * to the snapshot) instead of a bad template ever being stored.
 */
function isValidTileIndex(value: unknown): value is TileIndex {
  if (typeof value !== 'object' || value === null) return false;
  const idx = value as Record<string, unknown>;
  return (
    typeof idx.expiration_utc === 'number' &&
    Number.isFinite(idx.expiration_utc) &&
    Array.isArray(idx.regions) &&
    idx.regions.every((r) => typeof r === 'string') &&
    typeof idx.tile_url === 'string' &&
    idx.tile_url.includes('{lat}') &&
    idx.tile_url.includes('{lon}') &&
    typeof idx.tile_size_degrees === 'number' &&
    Number.isFinite(idx.tile_size_degrees) &&
    idx.tile_size_degrees > 0
  );
}

export function createTileLoader(opts: TileLoaderOptions) {
  const proxyPrefix = opts.proxyPrefix ?? '/deflock-tiles';
  const fallbackUrl = opts.fallbackUrl ?? '/camera-data.json';

  let index: TileIndex | null = null;
  let indexExpiresAtMs = 0;
  /** Single-flight: concurrent loadViewport calls share one index request. */
  let indexInflight: Promise<TileIndex | null> | null = null;
  /** After an index failure, no re-attempt before this time (back-off latch). */
  let indexRetryAtMs = 0;
  const loadedTiles = new Set<string>();
  /** Tiles that failed under the current ?v=; retried only after it rotates. */
  const failedTiles = new Set<string>();
  /**
   * In-flight tile fetches, keyed `${generation}|${tileKey}` where the
   * generation is the index tile_url the request was issued under. Keying by
   * generation means a request still in flight for a rotated-away ?v= never
   * blocks — or satisfies — the new generation's fetch. loadedTiles and
   * failedTiles stay keyed by bare tile key: they are cleared on rotation and
   * stale-generation completions are discarded before insert (see fetchTile),
   * so they only ever hold current-generation entries.
   */
  const inflight = new Set<string>();
  /** Live CDN cameras — always win over fallback records with the same id. */
  const liveById = new Map<number, DeflockCamera>();
  /** Snapshot cameras — only fill in ids the live tiles did not supply. */
  const fallbackById = new Map<number, DeflockCamera>();
  let fallbackUsed = false;

  function emit(): void {
    // Deterministic precedence: seed with fallback, overwrite with live —
    // regardless of which source finished fetching last.
    const combined = new Map(fallbackById);
    for (const [id, cam] of liveById) combined.set(id, cam);
    opts.onUpdate([...combined.values()]);
  }

  function merge(target: Map<number, DeflockCamera>, cameras: DeflockCamera[]): void {
    for (const cam of cameras) target.set(cam.id, cam);
  }

  /** Fetch the committed snapshot at most once; emits on success. */
  async function useFallback(): Promise<void> {
    if (fallbackUsed) return;
    fallbackUsed = true;
    try {
      const res = await fetch(fallbackUrl);
      if (!res.ok) throw new Error(`Fallback responded ${res.status}`);
      merge(fallbackById, await res.json());
      emit();
    } catch (err) {
      console.error('Camera data fallback failed:', err);
    }
  }

  async function fetchIndex(): Promise<TileIndex | null> {
    try {
      const res = await fetch(`${proxyPrefix}/index.json`);
      if (!res.ok) throw new Error(`Tile index responded ${res.status}`);
      const next: unknown = await res.json();
      if (!isValidTileIndex(next)) throw new Error('Tile index failed contract validation');
      // Clamp to a 60 s minimum lifetime: a stalled or already-past
      // expiration_utc must not force an index refetch on every moveend.
      indexExpiresAtMs = Math.max(next.expiration_utc * 1000, Date.now() + INDEX_MIN_TTL_MS);
      if (index !== null && index.tile_url !== next.tile_url) {
        // The ?v= cache-buster actually rotated: cached tiles are stale.
        // (An unchanged tile_url keeps the caches — no refetch churn.)
        loadedTiles.clear();
        failedTiles.clear();
      }
      index = next;
      return index;
    } catch (err) {
      console.error('Failed to load camera tile index:', err);
      indexRetryAtMs = Date.now() + INDEX_MIN_TTL_MS;
      await useFallback();
      // A stale-but-valid previous index keeps serving during the back-off.
      return index;
    }
  }

  function ensureIndex(): Promise<TileIndex | null> {
    if (indexInflight) return indexInflight; // single-flight
    if (index && Date.now() < indexExpiresAtMs) return Promise.resolve(index);
    if (Date.now() < indexRetryAtMs) return Promise.resolve(index); // backing off
    indexInflight = fetchIndex().finally(() => {
      indexInflight = null;
    });
    return indexInflight;
  }

  /**
   * @param gen the index tile_url (generation) this request was issued under.
   * @returns true if the tile fetched and merged successfully.
   */
  async function fetchTile(key: string, template: string, gen: string): Promise<boolean> {
    const flightKey = `${gen}|${key}`;
    if (loadedTiles.has(key) || failedTiles.has(key) || inflight.has(flightKey)) return false;
    inflight.add(flightKey);
    try {
      const res = await fetch(template.replace('{lat}/{lon}', key));
      if (!res.ok) throw new Error(`Tile ${key} responded ${res.status}`);
      const cameras: DeflockCamera[] = await res.json();
      if (index?.tile_url !== gen) {
        // The index's ?v= rotated while this request was in flight: this
        // payload is the OLD tile version. Discard it — merging it or marking
        // the key loaded would let stale data suppress the new generation's
        // fetch.
        return false;
      }
      merge(liveById, cameras);
      loadedTiles.add(key);
      return true;
    } catch (err) {
      console.error(`Failed to load camera tile ${key}:`, err);
      if (index?.tile_url === gen) {
        // Latch the failure: no per-moveend retry storm. The key becomes
        // eligible again when the index's ?v= rotates (failedTiles is
        // cleared). A stale-generation failure is NOT latched — the sets
        // already belong to the newer generation.
        failedTiles.add(key);
        await useFallback();
      }
      return false;
    } finally {
      inflight.delete(flightKey);
    }
  }

  return {
    /**
     * Fetch any missing tiles for the viewport, then emit the merged camera
     * set if anything new arrived. Resolves when done; never rejects.
     */
    async loadViewport(bounds: TileBounds): Promise<void> {
      const idx = await ensureIndex();
      if (!idx) return;
      const intersecting = visibleTileKeys(bounds, idx.tile_size_degrees, idx.regions);
      // Bound the worst case: a world/continent viewport can intersect dozens
      // of tiles. Skip the fetch entirely and keep the currently loaded
      // cameras; SC/regional viewports never hit this.
      if (intersecting.length > MAX_TILES_PER_VIEWPORT) return;
      const template = proxiedTileTemplate(idx.tile_url, proxyPrefix);
      const keys = intersecting.filter(
        (k) => !loadedTiles.has(k) && !failedTiles.has(k) && !inflight.has(`${idx.tile_url}|${k}`)
      );
      if (keys.length === 0) return;
      const results = await Promise.all(keys.map((k) => fetchTile(k, template, idx.tile_url)));
      if (results.some(Boolean)) emit();
    },
  };
}
