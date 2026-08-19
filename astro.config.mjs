// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

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
    server: {
      proxy: {
        '/api/geocode': {
          target: 'https://geocoding.geo.census.gov',
          changeOrigin: true,
          rewrite: (path) => path.replace('/api/geocode', '/geocoder/geographies/onelineaddress'),
        },
      },
    },
  }
});