// scripts/generate-icons.js
// One-time script to generate PNG icons from public/logo.svg using sharp.
// Run: node scripts/generate-icons.js
// Output: public/icons/icon-{size}[-maskable].png

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'public', 'logo.svg');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// For maskable icons, Google's guidance says to keep the icon within the
// central 80% of the canvas (the "safe zone"). We add ~12.5% padding on
// each side, making the icon fill 75% of the canvas.
async function generateIcon(size, maskable = false) {
  const padding = maskable ? Math.round(size * 0.125) : 0;
  const iconSize = size - padding * 2;

  const svgBuffer = fs.readFileSync(SVG_PATH);

  // Render SVG at the inner icon size
  const iconBuffer = await sharp(svgBuffer)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Composite onto background canvas
  const bg = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      // Dark navy background (#0f1222) for maskable; transparent for regular
      background: maskable
        ? { r: 15, g: 18, b: 34, alpha: 1 }
        : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const suffix = maskable ? '-maskable' : '';
  const outPath = path.join(OUT_DIR, `icon-${size}${suffix}.png`);

  await bg
    .composite([{ input: iconBuffer, top: padding, left: padding }])
    .png()
    .toFile(outPath);

  console.log(`✓ ${outPath}`);
}

async function main() {
  console.log('Generating PWA icons from', SVG_PATH);
  await generateIcon(192, false);
  await generateIcon(192, true);
  await generateIcon(512, false);
  await generateIcon(512, true);
  // 180x180 apple-touch-icon (maskable style — solid bg, safe zone)
  await generateIcon(180, true);
  // Rename 180-maskable to apple-touch-icon for convention
  fs.renameSync(
    path.join(OUT_DIR, 'icon-180-maskable.png'),
    path.join(OUT_DIR, 'apple-touch-icon.png')
  );
  console.log('✓ Renamed icon-180-maskable.png → apple-touch-icon.png');
  console.log('\nAll icons generated in public/icons/');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
