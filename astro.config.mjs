// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://deflocksc.org',
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