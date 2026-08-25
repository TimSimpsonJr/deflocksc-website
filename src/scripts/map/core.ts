/**
 * MapLibre map core.
 *
 * Owns instantiation, the navigation control, and resize. Scroll behaviour is
 * one of two mutually exclusive schemes chosen per map: the default is a manual
 * Ctrl/Cmd scroll-zoom lock (plain wheel scrolls the page, holding the modifier
 * zooms); passing `cooperativeGestures` instead hands scroll handling to
 * MapLibre's built-in cooperative gestures (plain wheel / one-finger scrolls the
 * page, Ctrl/Cmd+wheel or two-finger zooms/pans) and skips the manual lock.
 * Knows nothing about cameras or any other layer. The map instance lives in the
 * returned handle rather than in module scope, so two maps can coexist on one page.
 */

import maplibregl from 'maplibre-gl';

export interface MapCoreOptions {
  container: string;
  style: string;
  center: [number, number];
  zoom: number;
  interactive?: boolean;
  /**
   * If set, the map is constrained to these bounds: the user cannot pan the
   * viewport outside them, and cannot zoom out past the point where the whole
   * viewport would leave them. Used by the events map to keep the frame on
   * South Carolina.
   */
  maxBounds?: maplibregl.LngLatBoundsLike;
  /**
   * When true, use MapLibre's built-in cooperative gestures instead of the manual
   * Ctrl/Cmd scroll-zoom lock: a plain wheel or one-finger drag scrolls the PAGE,
   * and only Ctrl/Cmd+wheel (desktop) or a two-finger drag (mobile) zooms/pans the
   * map. MapLibre also shows a brief hint overlay. Used by the events map so the
   * page can scroll past the map on both desktop and touch. Defaults to false,
   * which keeps the manual scroll-lock the camera map and dev tuner rely on.
   */
  cooperativeGestures?: boolean;
}

export interface MapHandle {
  map: maplibregl.Map;
  destroy(): void;
  resize(): void;
  toggleScrollZoom(): boolean;
}

export function createMap(opts: MapCoreOptions): MapHandle {
  const map = new maplibregl.Map({
    container: opts.container,
    style: opts.style,
    center: opts.center,
    zoom: opts.zoom,
    interactive: opts.interactive ?? true,
    attributionControl: false,
    cooperativeGestures: opts.cooperativeGestures ?? false,
    // The manual lock path starts with scrollZoom off (a plain wheel then scrolls
    // the page) and toggles it via the keydown/keyup handlers below. Cooperative
    // gestures instead drives its own wheel handling and needs scrollZoom enabled
    // to zoom on Ctrl/Cmd+wheel, so leave it at MapLibre's default in that mode.
    ...(opts.cooperativeGestures ? {} : { scrollZoom: false }),
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  if (opts.maxBounds) map.setMaxBounds(opts.maxBounds);

  // Manual Ctrl/Cmd scroll-zoom lock — the default path. Skipped entirely when
  // cooperativeGestures is on, since MapLibre then owns wheel/touch handling and
  // this lock must not also run. Scroll zoom starts off so a plain mouse-wheel over
  // the map scrolls the PAGE rather than zooming or trapping the wheel (MapLibre
  // leaves the wheel event alone while scrollZoom is disabled, so it bubbles and the
  // page scrolls). Holding Control or Command (Mac) temporarily enables wheel-zoom;
  // toggleScrollZoom() unlocks it for good. scrollUnlocked stays in this scope so
  // toggleScrollZoom() keeps working on the non-cooperative path (the dev tuner).
  let scrollUnlocked = false;
  let onKeyDown: ((e: KeyboardEvent) => void) | undefined;
  let onKeyUp: ((e: KeyboardEvent) => void) | undefined;
  if (!opts.cooperativeGestures) {
    const isZoomModifier = (e: KeyboardEvent) => e.key === 'Control' || e.key === 'Meta';
    onKeyDown = (e: KeyboardEvent) => {
      if (isZoomModifier(e) && !scrollUnlocked) map.scrollZoom.enable();
    };
    onKeyUp = (e: KeyboardEvent) => {
      if (isZoomModifier(e) && !scrollUnlocked) map.scrollZoom.disable();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
  }

  return {
    map,

    destroy() {
      if (onKeyDown) document.removeEventListener('keydown', onKeyDown);
      if (onKeyUp) document.removeEventListener('keyup', onKeyUp);
      map.remove();
    },

    resize() {
      map.resize();
    },

    toggleScrollZoom() {
      scrollUnlocked = !scrollUnlocked;
      if (scrollUnlocked) map.scrollZoom.enable();
      else map.scrollZoom.disable();
      return scrollUnlocked;
    },
  };
}
