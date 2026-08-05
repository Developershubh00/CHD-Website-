#!/usr/bin/env node

/**
 * Image Optimization Script
 *
 * Recompresses catalog images in place with a per-file quality gate:
 *   - JPG: re-encoded with mozjpeg (quality 82), metadata stripped.
 *   - PNG: palette quantization (libimagequant, quality 90) is tried first,
 *     then ACCEPTED ONLY IF the alpha-weighted pixel difference against the
 *     original stays below a strict threshold and real transparency is
 *     preserved. Rejected files fall back to a pixel-identical full-color
 *     recompress (zopfli-style filtering, no data loss).
 *
 * The alpha weighting matters: many catalog PNGs are cutouts whose fully
 * transparent pixels carry arbitrary hidden RGB values. Quantizers rewrite
 * those invisible pixels freely, so an unweighted diff wildly overstates
 * the visible change.
 *
 * Images are NEVER resized (the product-detail zoom needs full resolution)
 * and file names/extensions never change (the site's jpg->png onError
 * fallback depends on them). A file is only rewritten when the accepted
 * result is at least 10% smaller.
 *
 * Usage:
 *   bun install
 *   bun scripts/optimize-images.mjs [--dir public/images] [--dry-run]
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dirArg = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'public/images';
const DRY_RUN = args.includes('--dry-run');
const targetDir = path.resolve(path.join(__dirname, '..'), dirArg);

const CONFIG = {
  jpeg: { quality: 82, mozjpeg: true },
  pngPalette: { palette: true, quality: 90, effort: 7, compressionLevel: 9 },
  pngLossless: { palette: false, compressionLevel: 9, adaptiveFiltering: true },
  minSizeToProcess: 150 * 1024, // skip files already under 150KB
  minSavings: 0.1,              // only rewrite when >=10% smaller
  maxMeanDiff: 3.0,             // alpha-weighted mean abs diff gate (0-255)
  concurrency: Math.min(8, os.cpus().length),
};

function findImages(dir, images = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) findImages(fullPath, images);
    else if (/\.(jpg|jpeg|png)$/i.test(entry.name)) images.push(fullPath);
  }
  return images;
}

// Mean absolute difference between two images, in RGBA space, with RGB
// differences weighted by the ORIGINAL's alpha (invisible pixels don't
// count) and alpha differences always counted at full weight.
async function alphaWeightedMeanDiff(originalPath, candidateBuffer) {
  const a = await sharp(originalPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(candidateBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return Infinity;

  let sum = 0;
  const pixels = a.info.width * a.info.height;
  for (let p = 0; p < pixels; p++) {
    const i = p * 4;
    const alphaWeight = a.data[i + 3] / 255;
    sum +=
      (Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2])) * alphaWeight / 3 +
      Math.abs(a.data[i + 3] - b.data[i + 3]);
  }
  return sum / pixels;
}

const stats = {
  jpg: 0, pngPalette: 0, pngLossless: 0,
  skippedSmall: 0, skippedNoGain: 0, gateRejected: 0, errors: 0,
  before: 0, after: 0,
};

async function optimizeImage(imagePath) {
  try {
    const originalSize = fs.statSync(imagePath).size;
    if (originalSize < CONFIG.minSizeToProcess) {
      stats.skippedSmall++;
      return;
    }

    const isPng = path.extname(imagePath).toLowerCase() === '.png';
    let outputBuffer = null;
    let method = null;

    if (!isPng) {
      outputBuffer = await sharp(imagePath).jpeg(CONFIG.jpeg).toBuffer();
      method = 'jpg';
    } else {
      const candidate = await sharp(imagePath).png(CONFIG.pngPalette).toBuffer();
      const diff = await alphaWeightedMeanDiff(imagePath, candidate);
      if (diff <= CONFIG.maxMeanDiff) {
        outputBuffer = candidate;
        method = 'pngPalette';
      } else {
        stats.gateRejected++;
        outputBuffer = await sharp(imagePath).png(CONFIG.pngLossless).toBuffer();
        method = 'pngLossless';
      }
    }

    if (outputBuffer.length > originalSize * (1 - CONFIG.minSavings)) {
      stats.skippedNoGain++;
      return;
    }

    if (!DRY_RUN) {
      const tmpPath = `${imagePath}.tmp`;
      fs.writeFileSync(tmpPath, outputBuffer);
      fs.renameSync(tmpPath, imagePath);
    }
    stats[method]++;
    stats.before += originalSize;
    stats.after += outputBuffer.length;
  } catch (error) {
    stats.errors++;
    console.error(`ERROR ${imagePath}: ${error.message}`);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function main() {
  console.log(`Scanning ${targetDir}${DRY_RUN ? ' (dry run)' : ''}`);
  const images = findImages(targetDir);
  console.log(`Found ${images.length} images, processing with concurrency ${CONFIG.concurrency}\n`);

  let next = 0;
  let done = 0;
  async function worker() {
    while (next < images.length) {
      const index = next++;
      await optimizeImage(images[index]);
      done++;
      if (done % 200 === 0) {
        console.log(`progress: ${done}/${images.length} | saved so far: ${formatBytes(stats.before - stats.after)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONFIG.concurrency }, worker));

  console.log('\n===== SUMMARY =====');
  console.log(`jpg re-encoded:      ${stats.jpg}`);
  console.log(`png palette:         ${stats.pngPalette}`);
  console.log(`png lossless:        ${stats.pngLossless} (${stats.gateRejected} failed the quality gate)`);
  console.log(`skipped (small):     ${stats.skippedSmall}`);
  console.log(`skipped (no gain):   ${stats.skippedNoGain}`);
  console.log(`errors:              ${stats.errors}`);
  console.log(`size before:         ${formatBytes(stats.before)}`);
  console.log(`size after:          ${formatBytes(stats.after)}`);
  if (stats.before > 0) {
    console.log(`saved:               ${formatBytes(stats.before - stats.after)} (${((1 - stats.after / stats.before) * 100).toFixed(1)}%)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
