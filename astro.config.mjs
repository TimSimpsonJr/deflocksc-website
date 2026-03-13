// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://deflocksc.org',
  integrations: [sitemap()],
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