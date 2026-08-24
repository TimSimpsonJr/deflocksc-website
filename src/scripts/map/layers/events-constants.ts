/**
 * Events-layer constants with no MapLibre dependency.
 *
 * CROSSFADE_ZOOM lives here rather than in events.ts so the events-page composer
 * can import it WITHOUT statically pulling in map/layers/events.ts, which imports
 * maplibre-gl at module scope. A static import from events.ts drags the ~1 MB
 * maplibre bundle into the events page's eager chunk and defeats the lazy map load
 * the page depends on (see the events.ts / events-page.ts headers, design §11).
 * events.ts imports and re-exports this, so the constant keeps a single definition
 * and both the layer and the composer read the same value.
 */

/**
 * Zoom at which the county choropleth has fully faded out and the city pins have
 * fully faded in (see the fill-opacity / circle-opacity interpolations in events.ts,
 * which both reach their end state at zoom 8). Click ownership switches here so an
 * invisible layer never wins a click: below it, clicks are counties; at or above it,
 * clicks are city pins. The composer also uses it to guarantee a county fit reaches
 * this zoom, so the city pins become visible and clickable at any map size.
 */
export const CROSSFADE_ZOOM = 8;
