// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// Netlify Functions do not run under `astro dev`. To exercise them locally, run
//   npx netlify functions:serve
// in a second terminal (serves netlify/functions/ on port 9999); the proxies below
// forward the production URLs to it so client code can use the real paths.
//
// Caveat: `functions:serve` routes by file name, not by each function's
// `config.path`, so `context.params` is NOT populated behind this proxy.
// `/go/:eventId` parameter handling is verified against a Netlify deploy preview,
// never against `astro dev`.
const FUNCTIONS_SERVER = 'http://127.0.0.1:9999';

// https://astro.build/config
export default defineConfig({
  site: 'https://deflocksc.org',
  integrations: [
    sitemap({
      // The submit form is organizer-code gated and sends robots noindex.
      // Keep it out of the sitemap so the two signals agree.
      filter: (page) => !page.includes('/events/submit'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // maplibre-gl 5.x ships native class fields in its UMD bundle and builds its
    // web worker by string-serializing modules into a blob. If esbuild downlevels
    // those class fields (default target < es2022), it rewrites them to a
    // `__publicField(...)` helper defined in module scope — a reference the
    // blob-ified worker cannot see, so the worker throws "__publicField is not
    // defined" and ALL GeoJSON tiling silently fails (the events choropleth/badges
    // and the camera map both go blank). Targeting es2022 keeps class fields native,
    // so no helper is emitted. See maplibre/maplibre-gl-js#7069.
    esbuild: { target: 'es2022' },
    build: { target: 'es2022' },
    optimizeDeps: { esbuildOptions: { target: 'es2022' } },
    server: {
      proxy: {
        '/api/geocode': {
          target: 'https://geocoding.geo.census.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace('/api/geocode', '/geocoder/geographies/onelineaddress'),
        },
        '/api/events': {
          target: FUNCTIONS_SERVER,
          changeOrigin: true,
          rewrite: (path) => path.replace('/api/events', '/.netlify/functions/events'),
        },
        '/api/submit-event': {
          target: FUNCTIONS_SERVER,
          changeOrigin: true,
          rewrite: (path) => path.replace('/api/submit-event', '/.netlify/functions/submit-event'),
        },
        '/api/address-suggest': {
          target: FUNCTIONS_SERVER,
          changeOrigin: true,
          rewrite: (path) =>
            path.replace('/api/address-suggest', '/.netlify/functions/address-suggest'),
        },
        // Regex key (leading ^) so this matches only /go/<id> and never a future
        // page route that happens to start with "go".
        '^/go/[A-Za-z0-9_-]+$': {
          target: FUNCTIONS_SERVER,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/go\//, '/.netlify/functions/go/'),
        },
      },
    },
  }
});
