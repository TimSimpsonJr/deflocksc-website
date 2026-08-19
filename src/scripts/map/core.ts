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

  // Scroll zoom is off by default so the page keeps scrolling over the map.
  // Holding Control temporarily enables it; the toggle unlocks it for good.
  let scrollUnlocked = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Control' && !scrollUnlocked) map.scrollZoom.enable();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Control' && !scrollUnlocked) map.scrollZoom.disable();
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
