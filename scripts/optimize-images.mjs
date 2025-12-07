#!/usr/bin/env node

/**
 * Image Optimization Script
 * Compresses all JPG/PNG images in src/assets to reduce file size
 * 
 * Usage: 
 *   npm install sharp
 *   node scripts/optimize-images.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.join(__dirname, '..', 'src', 'assets');

// Configuration
const CONFIG = {
  jpeg: {
    quality: 80,        // 80% quality (good balance)
    mozjpeg: true,      // Use mozjpeg for better compression
  },
  png: {
    quality: 80,
    compressionLevel: 9,
  },
  webp: {
    quality: 80,
  },
  maxWidth: 1200,       // Max width for product images
  maxHeight: 1200,      // Max height for product images
};

let totalOriginalSize = 0;
let totalOptimizedSize = 0;
let processedCount = 0;
let skippedCount = 0;

// Find all image files recursively
function findImages(dir, images = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      findImages(fullPath, images);
    } else if (/\.(jpg|jpeg|png)$/i.test(entry.name)) {
      images.push(fullPath);
    }
  }
  
  return images;
}

// Optimize a single image
async function optimizeImage(imagePath) {
  try {
    const originalStats = fs.statSync(imagePath);
    const originalSize = originalStats.size;
    
    // Skip if already small (< 100KB)
    if (originalSize < 100 * 1024) {
      skippedCount++;
      return;
    }
    
    const ext = path.extname(imagePath).toLowerCase();
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    
    // Resize if too large
    let pipeline = image;
    if (metadata.width > CONFIG.maxWidth || metadata.height > CONFIG.maxHeight) {
      pipeline = pipeline.resize(CONFIG.maxWidth, CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    
    // Apply format-specific optimization
    let outputBuffer;
    if (ext === '.png') {
      outputBuffer = await pipeline.png(CONFIG.png).toBuffer();
    } else {
      outputBuffer = await pipeline.jpeg(CONFIG.jpeg).toBuffer();
    }
    
    const optimizedSize = outputBuffer.length;
    
    // Only save if we achieved compression
    if (optimizedSize < originalSize) {
      fs.writeFileSync(imagePath, outputBuffer);
      totalOriginalSize += originalSize;
      totalOptimizedSize += optimizedSize;
      processedCount++;
      
      const savings = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
      console.log(`✅ ${path.relative(assetsDir, imagePath)}: ${formatBytes(originalSize)} → ${formatBytes(optimizedSize)} (${savings}% saved)`);
    } else {
      skippedCount++;
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${imagePath}:`, error.message);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function main() {
  console.log('🖼️  Image Optimization Script\n');
  console.log(`📁 Scanning: ${assetsDir}\n`);
  
  const images = findImages(assetsDir);
  console.log(`Found ${images.length} images to process\n`);
  
  for (let i = 0; i < images.length; i++) {
    await optimizeImage(images[i]);
    
    // Progress indicator every 50 images
    if ((i + 1) % 50 === 0) {
      console.log(`\n📊 Progress: ${i + 1}/${images.length}\n`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Optimized: ${processedCount} images`);
  console.log(`⏭️  Skipped: ${skippedCount} images (already small)`);
  console.log(`💾 Original size: ${formatBytes(totalOriginalSize)}`);
  console.log(`💾 Optimized size: ${formatBytes(totalOptimizedSize)}`);
  console.log(`🎉 Total saved: ${formatBytes(totalOriginalSize - totalOptimizedSize)} (${((1 - totalOptimizedSize / totalOriginalSize) * 100).toFixed(1)}%)`);
}

main().catch(console.error);


