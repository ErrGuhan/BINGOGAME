// src/sw/sw.ts
// BingoDuel Service Worker — Workbox-powered caching with surgical Supabase exclusions.
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
// __BUILD_ID__ is replaced by scripts/build-sw.mjs with the actual Next.js build ID.
// Every new Vercel deploy → new build ID → old caches are invalidated automatically.
const CACHE_VERSION = '__BUILD_ID__';
const CACHE_PREFIX = 'bingoduel';

// ─── Claim clients immediately so the new SW controls all open tabs ────────────
self.skipWaiting();
clientsClaim();

// ─── Clean up old caches from previous SW versions ────────────────────────────
cleanupOutdatedCaches();

// ─── Precache Next.js static assets (hashed filenames — safe to cache forever) ─
// The __WB_MANIFEST array is injected by workbox-build.injectManifest().
precacheAndRoute(self.__WB_MANIFEST || []);

// ─── NetworkOnly: Supabase (REST + Realtime WebSocket) ────────────────────────
// CRITICAL: Supabase traffic must NEVER be intercepted by the service worker.
// The Realtime WebSocket in particular will break if proxied through the SW.
const supabaseHostname = 'tbdnklpyjsxvdgeajigu.supabase.co';

registerRoute(
  ({ url }: { url: URL }) => url.hostname === supabaseHostname,
  new NetworkOnly()
);

// ─── NetworkOnly: Next.js API routes ──────────────────────────────────────────
registerRoute(
  ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
  new NetworkOnly()
);

// ─── CacheFirst: Next.js static bundle files ──────────────────────────────────
// These files have content-hashes in their names and are safe to cache indefinitely.
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

// ─── NetworkFirst: HTML navigation (app shell) ────────────────────────────────
// Always tries the network first. Falls back to cached version or offline page.
// This ensures game routes always get fresh HTML from the server.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: `${CACHE_PREFIX}-navigation-${CACHE_VERSION}`,
      networkTimeoutSeconds: 5,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 16,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        }),
      ],
    }),
    {
      // Never intercept Supabase URLs with the navigation route
      denylist: [new RegExp(supabaseHostname)],
    }
  )
);

// ─── Offline fallback ─────────────────────────────────────────────────────────
// When NetworkFirst navigation fails (truly offline), serve the offline page.
// The offline.html is precached separately so it's always available.
self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(`${CACHE_PREFIX}-offline`).then((cache: any) =>
      cache.addAll(['/offline.html'])
    )
  );
});

// ─── Broadcast SW_UPDATED to all clients when this SW activates ───────────────
// The PWAContext in the app listens for this and shows the "New version" toast.
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

// ─── Handle SKIP_WAITING message from the update toast ────────────────────────
self.addEventListener('message', (event: any) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
