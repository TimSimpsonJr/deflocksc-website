/**
 * live-count.ts — daily-fresh SC camera total on the homepage (design §3.3).
 *
 * Fetches the same-origin /api/sc-camera-count endpoint and, on a valid live
 * number, updates every surface that shows the SC total: the ImpactBand
 * count-up, the Hero "more than N" floor, and the MapSection statline. On any
 * failure — network error, non-numeric payload, or the endpoint's { stale:true }
 * sentinel — it does nothing: every element already server-rendered the
 * build-time number (impact-stats.json), so the value is never blank and JS-off
 * visitors are unaffected.
 *
 * Surfaces are tagged data-live-sc="exact" (ImpactBand, MapSection) or
 * data-live-sc="floor" (Hero). The count-up animation and prefers-reduced-motion
 * are handled entirely by the existing observeCountUps (count-up.ts, unchanged).
 * The three components exclude their SC element from their OWN observeCountUps
 * call, so live-count is the sole owner of the SC count-up — no double-observe.
 */
import { observeCountUps } from './count-up.js';

export interface LiveCountResponse {
  scTotal?: unknown;
  stale?: unknown;
}

/**
 * Extract a usable SC total from the endpoint payload, or null. Returns null for
 * a stale sentinel, a missing/non-finite/non-positive scTotal, or anything
 * non-numeric, so a bad payload can never overwrite the good build-time value.
 */
export function parseLiveCount(payload: LiveCountResponse | null | undefined): number | null {
  if (!payload || payload.stale === true) return null;
  const value = payload.scTotal;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

/** The Hero's "more than N" floor: the live total rounded down to the hundred. */
export function cameraFloor(scTotal: number): number {
  return Math.floor(scTotal / 100) * 100;
}

let started = false;
let cached: Promise<number | null> | null = null;

/** Fetch the endpoint once per page; memoized so three components share one hit. */
export function getLiveCount(): Promise<number | null> {
  if (!cached) {
    cached = fetch('/api/sc-camera-count', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<LiveCountResponse>) : null))
      .then(parseLiveCount)
      .catch(() => null);
  }
  return cached;
}

/** Set a surface's visible text and its .sr-only sibling (if any) to `text`. */
function setStatText(el: HTMLElement, text: string): void {
  const srOnly = el.querySelector<HTMLElement>('.sr-only');
  if (srOnly) srOnly.textContent = text;
  const visible = el.querySelector<HTMLElement>('[data-count-up]');
  if (visible) visible.textContent = text;
  else el.textContent = text; // plain prose target (the Hero floor span)
}

/**
 * Update every [data-live-sc] surface to the live value. "exact" shows the
 * total (ImpactBand, MapSection); "floor" shows the Hero floor. A count-up
 * surface is (re-)handed to observeCountUps so it animates to the fresh value on
 * view; the Hero floor is inline prose and is set directly.
 */
export function applyLiveCount(root: ParentNode, scTotal: number): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-live-sc]'))) {
    const value = el.getAttribute('data-live-sc') === 'floor' ? cameraFloor(scTotal) : scTotal;
    setStatText(el, value.toLocaleString('en-US'));
    const countUp = el.matches('[data-count-up]')
      ? el
      : el.querySelector<HTMLElement>('[data-count-up]');
    if (countUp) observeCountUps([countUp]);
  }
}

/** Fallback: animate the build-time value already in the DOM on scroll. */
function observeBuildValues(root: ParentNode): void {
  const countUps = root.querySelectorAll<HTMLElement>(
    '[data-live-sc] [data-count-up], [data-live-sc][data-count-up]',
  );
  if (countUps.length) observeCountUps(countUps);
}

/** Wire the live counter once per page (idempotent across the 3 components). */
export function initLiveCount(root: ParentNode = document): void {
  if (started) return;
  started = true;
  void getLiveCount().then((scTotal) => {
    if (scTotal == null) observeBuildValues(root);
    else applyLiveCount(root, scTotal);
  });
}
