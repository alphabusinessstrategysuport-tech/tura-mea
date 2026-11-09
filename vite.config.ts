/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/tura-mea/").
// Locally the app is served from "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Tura Mea – planificator șofer',
        short_name: 'Tura Mea',
        description: 'Planifică, urmărește și motivează-ți săptămâna de lucru ca șofer ride-sharing.',
        lang: 'ro',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0f14',
        theme_color: '#0b0f14',
        // Long-press the app icon on Android for these shortcuts.
        shortcuts: [
          { name: 'Adaugă cursă', short_name: '+ Cursă', url: `${base}#/actiune/cursa`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Pornește tura', short_name: 'Tura', url: `${base}#/actiune/tura`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Planul săptămânii', short_name: 'Plan', url: `${base}#/plan`, icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Only Latin + Latin Extended (Romanian diacritics) font files are kept offline.
        globIgnores: ['**/*cyrillic*', '**/*greek*', '**/*vietnamese*'],
        // OCR engine is loaded on demand only (bonus import from screenshots).
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // OCR engine + Romanian language data: downloaded once, then works offline.
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'tessdata.projectnaptha.com',
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-engine', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
        navigateFallback: 'index.html',
        importScripts: ['sw-notify.js'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
