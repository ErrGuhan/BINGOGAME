// scripts/build-sw.mjs
// Post-build script: compiles src/sw/sw.ts and injects Workbox precache manifest.
// Run automatically after `next build` via the package.json build script.

import { injectManifest } from 'workbox-build';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── 1. Read the Next.js build ID for cache versioning ──────────────────────
const buildIdPath = path.join(ROOT, '.next', 'BUILD_ID');
let buildId = 'dev';
if (fs.existsSync(buildIdPath)) {
  buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
}
console.log(`[build-sw] Build ID: ${buildId}`);

// ─── 2. Transpile src/sw/sw.ts → a temp JS file using esbuild ───────────────
// esbuild is available as a transitive dep from Next.js — no extra install needed.
const swSrcPath = path.join(ROOT, 'src', 'sw', 'sw.ts');
const swTempPath = path.join(ROOT, '.next', 'sw-temp.js');
const swOutPath = path.join(ROOT, 'public', 'sw.js');

console.log('[build-sw] Transpiling sw.ts with esbuild...');
execSync(
  `npx esbuild "${swSrcPath}" --bundle --minify --outfile="${swTempPath}" --platform=browser --target=es2017 --format=esm`,
  { cwd: ROOT, stdio: 'inherit' }
);

// ─── 3. Inject Workbox precache manifest ────────────────────────────────────
// This scans .next/static/** and creates the __WB_MANIFEST injection.
console.log('[build-sw] Injecting Workbox precache manifest...');
const { count, size } = await injectManifest({
  swSrc: swTempPath,
  swDest: swOutPath,
  globDirectory: path.join(ROOT, '.next'),
  globPatterns: [
    'static/**/*.js',
    'static/**/*.css',
    'static/media/*.{woff,woff2,ttf,otf}',
  ],
  globIgnores: ['static/**/*.map'],
  // Limit individual file size to avoid caching huge chunks
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
  injectionPoint: 'self.__WB_MANIFEST',
  // Adjust URL format so the SW can fetch these from /_next/static/
  modifyURLPrefix: {
    'static/': '/_next/static/',
  },
});

console.log(`[build-sw] Precached ${count} files (${(size / 1024).toFixed(1)} KB total)`);

// ─── 4. Stamp the build ID into the SW ──────────────────────────────────────
console.log('[build-sw] Stamping build ID...');
let swContent = fs.readFileSync(swOutPath, 'utf8');
swContent = swContent.replace(/__BUILD_ID__/g, buildId);
fs.writeFileSync(swOutPath, swContent, 'utf8');

// ─── 5. Clean up temp file ───────────────────────────────────────────────────
fs.unlinkSync(swTempPath);

console.log(`[build-sw] ✓ public/sw.js written successfully (build: ${buildId})`);
