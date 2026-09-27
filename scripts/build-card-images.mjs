// Backfills card.webp for every slide in the library. Idempotent: existing
// cards are kept unless --force is given.
//   node scripts/build-card-images.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { CARD_FILE, cardSourceFor, writeCardImage } from './lib/card-image.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const force = process.argv.includes('--force');
const sharp = (await import('sharp')).default;

let written = 0;
let bytes = 0;
let kept = 0;
const missing = [];
for (const dir of fs.readdirSync(path.join(REPO, 'src/assets'))) {
  const assetDir = path.join(REPO, 'src/assets', dir);
  if (!fs.statSync(assetDir).isDirectory()) continue;
  const slides = fs.readdirSync(assetDir).filter((d) => /^slide_\d+$/.test(d)).sort();
  for (const slide of slides) {
    const imagesDir = path.join(REPO, 'public/images', dir, slide);
    const dest = path.join(imagesDir, CARD_FILE);
    if (!force && fs.existsSync(dest)) { kept++; continue; }
    const source = cardSourceFor(imagesDir);
    if (!source) { missing.push(`${dir}/${slide}`); continue; }
    bytes += await writeCardImage(sharp, source, dest);
    written++;
  }
}
console.log(`card images: ${written} written (${(bytes / 1048576).toFixed(1)} MB), ${kept} kept`);
if (missing.length) console.log(`no source image for: ${missing.join(', ')}`);
