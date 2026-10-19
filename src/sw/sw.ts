/* eslint-disable @typescript-eslint/no-explicit-any */
// src/sw/sw.ts
// BingoDuel Service Worker — Workbox-powered offline caching with surgical exclusions.
// This file is compiled by scripts/build-sw.mjs after `next build`.
// DO NOT import from src/ here — this runs in the SW context, not Next.js.

import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
} from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import {
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: any;

// ─── Cache versioning ──────────────────────────────────────────────────────────
const CACHE_VERSION = '__BUILD_ID__';
const CACHE_PREFIX = 'bingoduel';

// ─── Claim clients immediately so the new SW controls all open tabs ────────────
self.skipWaiting();
clientsClaim();

// ─── Clean up old caches from previous SW versions ────────────────────────────
cleanupOutdatedCaches();

// ─── Precache Next.js static assets (hashed filenames — safe to cache forever) ─
precacheAndRoute(self.__WB_MANIFEST || []);

// ─── NetworkOnly: Supabase (REST + Realtime WebSocket) ────────────────────────
const supabaseHostname = 'tbdnklpyjsxvdgeajigu.supabase.co';

registerRoute(
  ({ url }: { url: URL }) => url.hostname === supabaseHostname,
  new NetworkOnly()
);

// ─── NetworkFirst with Offline Mock: Next.js API routes ───────────────────────
// In offline mode, if the API call fails because network is down, return a safe JSON fallback
registerRoute(
  ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
  async ({ request }: { request: Request }) => {
    try {
      return await fetch(request);
    } catch {
      return new Response(
        JSON.stringify({ offline: true, success: true, message: 'Running in offline mode' }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }
  }
);

// ─── CacheFirst: Next.js static bundle files ──────────────────────────────────
registerRoute(
  ({ url }: { url: URL }) => url.pathname.startsWith('/_next/static/'),
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-static-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        maxEntries: 256,
      }),
    ],
  })
);

// ─── CacheFirst: App icons and static images ──────────────────────────────────
registerRoute(
  ({ url }: { url: URL }) =>
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.svg' ||
    url.pathname === '/favicon.ico',
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-icons-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        maxEntries: 32,
      }),
    ],
  })
);

// ─── StaleWhileRevalidate: Google Fonts CSS ───────────────────────────────────
registerRoute(
  ({ url }: { url: URL }) => url.hostname === 'fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: `${CACHE_PREFIX}-google-fonts-css`,
    plugins: [
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// ─── CacheFirst: Google Fonts actual font files (immutable) ───────────────────
registerRoute(
  ({ url }: { url: URL }) => url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-google-fonts-files`,
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        maxEntries: 32,
      }),
    ],
  })
);

// ─── NetworkFirst with App Shell Offline Fallback ─────────────────────────────
// When user opens the app offline, serve the cached root app shell so the game
// boots up immediately with full offline gameplay!
const navigationStrategy = new NetworkFirst({
  cacheName: `${CACHE_PREFIX}-navigation-${CACHE_VERSION}`,
  networkTimeoutSeconds: 3,
  plugins: [
    new ExpirationPlugin({
      maxEntries: 16,
      maxAgeSeconds: 24 * 60 * 60, // 1 day
    }),
  ],
});

registerRoute(
  new NavigationRoute(
    async (params: any) => {
      try {
        const response = await navigationStrategy.handle(params);
        if (response) return response;
      } catch {}

      // Fallback: Return cached app shell or offline page
      const cache = await caches.open(`${CACHE_PREFIX}-navigation-${CACHE_VERSION}`);
      const cachedApp = (await cache.match('/')) || (await cache.match(params.request));
      if (cachedApp) return cachedApp;

      const offlineCache = await caches.open(`${CACHE_PREFIX}-offline`);
      return (await offlineCache.match('/offline.html')) || Response.error();
    },
    {
      denylist: [new RegExp(supabaseHostname)],
    }
  )
);

// ─── Precache App Shell & Offline fallback on install ─────────────────────────
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(`${CACHE_PREFIX}-offline`).then((cache: any) =>
      cache.addAll(['/', '/offline.html', '/favicon.ico'])
    )
  );
});

// ─── Broadcast SW_UPDATED to all clients when this SW activates ───────────────
self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client: any) => {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
      });
    })()
  );
});

// ─── Handle SKIP_WAITING message ──────────────────────────────────────────────
self.addEventListener('message', (event: any) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
