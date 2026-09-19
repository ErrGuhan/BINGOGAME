import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // ─── Security headers applied to all routes ─────────────────────────────
      {
        source: '/(.*)',
        headers: [
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Block the page from being framed (clickjacking protection)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Control how much referrer info is shared
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Enforce HTTPS for 2 years, include subdomains, allow preloading
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Disable powerful browser features not used by this app
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          // Content Security Policy:
          //   - default-src 'self': only load resources from own origin by default
          //   - script-src 'self' 'unsafe-inline': Next.js inline scripts need unsafe-inline
          //   - style-src 'self' 'unsafe-inline': Tailwind CSS uses inline styles
          //   - connect-src: allow Supabase HTTPS + WSS realtime connections
          //   - img-src 'self' data: blob:: allow data URIs and blob URLs for icons/canvas
          //   - frame-ancestors 'none': reinforce X-Frame-Options at CSP level
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.io wss://*.supabase.io",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      // ─── Service Worker ──────────────────────────────────────────────────────
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      // ─── Web App Manifest ────────────────────────────────────────────────────
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;

