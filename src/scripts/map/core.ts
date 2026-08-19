/**
 * MapLibre map core.
 *
 * Owns instantiation, the navigation control, resize, and the scroll-zoom
 * lock. Knows nothing about cameras or any other layer. The map instance
 * lives in the returned handle rather than in module scope, so two maps can
 * coexist on one page.
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
    scrollZoom: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  if (opts.maxBounds) map.setMaxBounds(opts.maxBounds);

  // Scroll zoom is off by default so a plain mouse-wheel over the map scrolls the
  // PAGE rather than zooming or trapping the wheel (MapLibre leaves the wheel event
  // alone while scrollZoom is disabled, so it bubbles and the page scrolls). Holding
  // Control or Command (Mac) temporarily enables wheel-zoom; the toggle unlocks it
  // for good. The default gesture stays page-scroll.
  let scrollUnlocked = false;
  const isZoomModifier = (e: KeyboardEvent) => e.key === 'Control' || e.key === 'Meta';

  const onKeyDown = (e: KeyboardEvent) => {
    if (isZoomModifier(e) && !scrollUnlocked) map.scrollZoom.enable();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (isZoomModifier(e) && !scrollUnlocked) map.scrollZoom.disable();
  };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return {
    map,

    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
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
