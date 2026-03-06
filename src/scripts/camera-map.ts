/**
 * Camera map initialization and interaction.
 *
 * Loads Deflock camera data, renders clusters and directional cones
 * on a MapLibre GL JS map, and handles mobile toggle / glow frame tracking.
 */

import maplibregl from 'maplibre-gl';

const MAP_CENTER: [number, number] = [-82.39, 34.85];
const MAP_ZOOM = 11;

let map: maplibregl.Map | null = null;

interface DeflockCamera {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

// --- Vendor image lookup ---

const vendorImages = new Map<string, string>();

async function loadVendorImages(): Promise<void> {
  try {
    const res = await fetch('https://cms.deflock.me/items/lprVendors');
    if (!res.ok) return;
    const { data } = await res.json();
    for (const vendor of data) {
      if (vendor.urls?.length && vendor.fullName) {
        vendorImages.set(vendor.fullName, vendor.urls[0].url);
      }
    }
  } catch {
    // Non-critical — popups just won't have vendor images
  }
}

function getVendorImageUrl(manufacturer: string | null): string | null {
  if (!manufacturer) return null;
  return vendorImages.get(manufacturer) ?? null;
}

// --- Wikimedia thumbnail URL ---

function wikimediaThumbnailUrl(filename: string): string {
  const clean = filename.replace(/^File:/, '').replace(/ /g, '_');
  return `https://commons.wikimedia.org/w/thumb.php?f=${encodeURIComponent(clean)}&w=300`;
}

// --- Direction parsing ---

function parseDirection(tags: Record<string, string> | undefined): number | null {
  if (!tags) return null;
  const raw = tags['direction'] || tags['camera:direction'];
  if (!raw) return null;
  const first = String(raw).split(';')[0].trim();

  // Range format "138-183" -> midpoint
  if (/^\d+-\d+$/.test(first)) {
    const [a, b] = first.split('-').map(Number);
    return (a + b) / 2;
  }

  // Cardinal directions
  const cardinals: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  };
  const upper = first.toUpperCase();
  if (upper in cardinals) return cardinals[upper];

  // Numeric degrees
  const deg = Number(first);
  return isNaN(deg) ? null : deg;
}

// --- Directional cone image ---

function createConeImage(): { width: number; height: number; data: Uint8ClampedArray } {
  const coneSize = 80;
  const coneCanvas = document.createElement('canvas');
  coneCanvas.width = coneSize;
  coneCanvas.height = coneSize;
  const ctx = coneCanvas.getContext('2d')!;
  const cx = coneSize / 2;
  const cy = coneSize / 2;
  const radius = 36;
  const halfAngle = 25 * (Math.PI / 180);

  // Draw cone/wedge pointing up (0deg = north)
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const startAngle = -Math.PI / 2 - halfAngle;
  const endAngle = -Math.PI / 2 + halfAngle;
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.closePath();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.fill();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.fill();
  ctx.strokeStyle = '#991b1b';
  ctx.lineWidth = 1;
  ctx.stroke();

  return {
    width: coneSize,
    height: coneSize,
    data: ctx.getImageData(0, 0, coneSize, coneSize).data,
  };
}

// --- Camera popup ---

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showCameraPopup(e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) {
  if (!e.features?.length || !map) return;
  const feat = e.features[0];
  const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
  const props = feat.properties;

  // Parse properties (MapLibre stringifies nested values)
  const id = props.id;
  const manufacturer = props.manufacturer && props.manufacturer !== 'null' ? props.manufacturer : null;
  const operator = props.operator && props.operator !== 'null' ? props.operator : null;
  const direction = props.direction != null && props.direction !== 'null' ? Number(props.direction) : null;
  const wikimedia = props.wikimedia_commons && props.wikimedia_commons !== 'null' ? props.wikimedia_commons : null;

  // Resolve image: wikimedia photo takes priority, then vendor reference image
  const imageUrl = wikimedia
    ? wikimediaThumbnailUrl(wikimedia)
    : getVendorImageUrl(manufacturer);

  let html = '<div class="camera-popup">';

  if (imageUrl) {
    const label = manufacturer ? escapeHtml(manufacturer) + ' LPR' : 'ALPR Camera';
    html += `<div class="camera-popup-img"><img src="${escapeHtml(imageUrl)}" alt="${label}" loading="lazy" /><span class="camera-popup-img-label">${label}</span></div>`;
  } else {
    html += '<div class="camera-popup-img camera-popup-img-empty"><span>ALPR Camera</span></div>';
  }

  if (manufacturer) {
    html += `<div class="camera-popup-mfr">Made by<br><strong>${escapeHtml(manufacturer)}</strong></div>`;
  }

  if (operator && operator !== manufacturer) {
    html += `<div class="camera-popup-op">Operated by ${escapeHtml(operator)}</div>`;
  }

  if (direction !== null) {
    html += `<div class="camera-popup-dir">Facing ${Math.round(direction)}&deg;</div>`;
  }

  html += `<a class="camera-popup-link" href="https://www.openstreetmap.org/node/${encodeURIComponent(String(id))}" target="_blank" rel="noopener">&#x2197; VIEW ON OSM</a>`;

  html += '</div>';

  // Privacy-friendly analytics event (no personal data sent)
  if (typeof umami !== 'undefined') umami.track('camera-popup-viewed');

  new maplibregl.Popup({ closeButton: true, maxWidth: '260px', offset: 12 })
    .setLngLat(coords)
    .setHTML(html)
    .addTo(map);
}

// --- Map layer setup ---

function addCameraLayers(geojson: GeoJSON.FeatureCollection) {
  if (!map) return;

  map.addSource('cameras', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 15,
    clusterRadius: 50,
  });

  // Cluster glow (much larger blurred circle behind)
  map.addLayer({
    id: 'cluster-glow',
    type: 'circle',
    source: 'cameras',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'interpolate', ['linear'], ['get', 'point_count'],
        2, 'rgba(255,255,255,0.6)',
        10, 'rgba(200,200,200,0.5)',
        25, 'rgba(239,68,68,0.5)',
        50, 'rgba(220,38,38,0.5)',
      ],
      'circle-radius': ['step', ['get', 'point_count'], 28, 10, 36, 50, 48],
      'circle-opacity': 0.4,
      'circle-blur': 1,
    },
  });

  // Cluster circles
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'cameras',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'interpolate', ['linear'], ['get', 'point_count'],
        2, '#dc2626',
        15, '#b91c1c',
        50, '#991b1b',
      ],
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
      'circle-opacity': 0.95,
      'circle-stroke-width': 2,
      'circle-stroke-color': [
        'interpolate', ['linear'], ['get', 'point_count'],
        2, 'rgba(255,255,255,0.7)',
        15, 'rgba(200,200,200,0.6)',
        50, 'rgba(239,68,68,0.8)',
      ],
      'circle-stroke-opacity': 0.9,
    },
  });

  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'cameras',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-size': 13,
      'text-font': ['Noto Sans Regular'],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  });

  map.addLayer({
    id: 'camera-dots',
    type: 'circle',
    source: 'cameras',
    filter: ['all', ['!', ['has', 'point_count']], ['!', ['get', 'hasDirection']]],
    paint: {
      'circle-color': '#ef4444',
      'circle-radius': 5,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#991b1b',
    },
  });

  // Directional cone icon
  map.addImage('cone', createConeImage());

  map.addLayer({
    id: 'camera-cones',
    type: 'symbol',
    source: 'cameras',
    filter: ['all', ['!', ['has', 'point_count']], ['get', 'hasDirection']],
    layout: {
      'icon-image': 'cone',
      'icon-size': 1.0,
      'icon-rotate': ['get', 'direction'],
      'icon-allow-overlap': true,
      'icon-rotation-alignment': 'map',
    },
  });
}

// --- Map event handlers ---

function bindMapEvents() {
  if (!map) return;

  // Cluster click -> zoom in
  map.on('click', 'clusters', (e) => {
    const features = map!.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    const source = map!.getSource('cameras') as maplibregl.GeoJSONSource;
    source.getClusterExpansionZoom(clusterId).then((zoom) => {
      map!.easeTo({
        center: (features[0].geometry as GeoJSON.Point).coordinates as [number, number],
        zoom,
      });
    });
  });

  // Pointer cursors on clusters
  map.on('mouseenter', 'clusters', () => { map!.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'clusters', () => { map!.getCanvas().style.cursor = ''; });

  // Camera dot and cone clicks -> popup
  map.on('click', 'camera-dots', showCameraPopup);
  map.on('click', 'camera-cones', showCameraPopup);

  // Pointer cursors on camera features
  map.on('mouseenter', 'camera-dots', () => { map!.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'camera-dots', () => { map!.getCanvas().style.cursor = ''; });
  map.on('mouseenter', 'camera-cones', () => { map!.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'camera-cones', () => { map!.getCanvas().style.cursor = ''; });
}

// --- Map initialization ---

function initMap() {
  map = new maplibregl.Map({
    container: 'camera-map',
    style: '/map-style.json',
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    attributionControl: false,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  map.on('load', async () => {
    try {
      const [res] = await Promise.all([
        fetch('/camera-data.json'),
        loadVendorImages(),
      ]);
      if (!res.ok) throw new Error(`Failed to load camera data: ${res.status}`);
      const cameras: DeflockCamera[] = await res.json();

      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: cameras.map((cam) => {
          const direction = parseDirection(cam.tags);
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [cam.lon, cam.lat],
            },
            properties: {
              id: cam.id,
              direction,
              hasDirection: direction !== null,
              manufacturer: cam.tags?.manufacturer || null,
              operator: cam.tags?.operator || null,
              wikimedia_commons: cam.tags?.wikimedia_commons || null,
            },
          };
        }),
      };

      addCameraLayers(geojson);
      bindMapEvents();
    } catch (err) {
      console.error('Failed to load camera data:', err);
    }
  });
}

// --- Public API ---

export { initMap, map };

export function resizeMap() {
  if (map) map.resize();
}
