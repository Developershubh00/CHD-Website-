#!/usr/bin/env node

/**
 * Script to organize assets from "One Folder to rule them all"
 * - Copies images to public/images
 * - Keeps data.json in assets
 * - Removes old duplicate folders
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const sourceDir = path.join(rootDir, 'src/assets/One Folder to rule them all');
const publicImagesDir = path.join(rootDir, 'public/images');
const oldAssetsDirs = [
  path.join(rootDir, 'src/assets/rugs'),
  path.join(rootDir, 'src/assets/placemat'),
  path.join(rootDir, 'src/assets/TableRunner'),
  path.join(rootDir, 'src/assets/bedding'),
  path.join(rootDir, 'src/assets/throw'),
  path.join(rootDir, 'src/assets/cushion'),
];

// Category mapping
const categoryMap = {
  'rugs': 'rugs',
  'placemat': 'placemat',
  'TableRunner': 'TableRunner',
  'bedding': 'bedding',
  'throw': 'throw',
  'cushion': 'cushion', // if exists
};

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function removeDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Removed: ${dir}`);
  }
}

console.log('🚀 Starting asset organization...\n');

// Step 1: Copy images from "One Folder to rule them all" to public/images
console.log('📁 Copying images to public/images...');
if (fs.existsSync(sourceDir)) {
  const categories = fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  for (const category of categories) {
    const categoryPath = path.join(sourceDir, category);
    const publicCategoryPath = path.join(publicImagesDir, category);
    
    if (!fs.existsSync(categoryPath)) continue;
    
    console.log(`  Copying ${category}...`);
    
    // Find all slide folders
    const slides = fs.readdirSync(categoryPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('slide_'))
      .map(entry => entry.name);
    
    for (const slide of slides) {
      const slideSrcPath = path.join(categoryPath, slide);
      const slideDestPath = path.join(publicCategoryPath, slide);
      
      // Create destination directory
      if (!fs.existsSync(slideDestPath)) {
        fs.mkdirSync(slideDestPath, { recursive: true });
      }
      
      // Copy image files only (not data.json)
      const files = fs.readdirSync(slideSrcPath);
      for (const file of files) {
        if (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg')) {
          copyFile(
            path.join(slideSrcPath, file),
            path.join(slideDestPath, file)
          );
        }
      }
    }
    
    console.log(`  ✓ Copied ${slides.length} slides for ${category}`);
  }
} else {
  console.log('  ⚠️  Source directory not found:', sourceDir);
}

// Step 2: Copy data.json files to assets (keep structure)
console.log('\n📄 Organizing data.json files...');
if (fs.existsSync(sourceDir)) {
  const categories = fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  
  for (const category of categories) {
    const categoryPath = path.join(sourceDir, category);
    const assetsCategoryPath = path.join(rootDir, 'src/assets', category);
    
    if (!fs.existsSync(categoryPath)) continue;
    
    console.log(`  Organizing ${category} data.json files...`);
    
    // Find all slide folders
    const slides = fs.readdirSync(categoryPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('slide_'))
      .map(entry => entry.name);
    
    for (const slide of slides) {
      const slideSrcPath = path.join(categoryPath, slide);
      const slideDestPath = path.join(assetsCategoryPath, slide);
      const dataJsonSrc = path.join(slideSrcPath, 'data.json');
      
      if (fs.existsSync(dataJsonSrc)) {
        // Create destination directory
        if (!fs.existsSync(slideDestPath)) {
          fs.mkdirSync(slideDestPath, { recursive: true });
        }
        
        // Copy data.json
        copyFile(dataJsonSrc, path.join(slideDestPath, 'data.json'));
      }
    }
    
    console.log(`  ✓ Organized ${slides.length} data.json files for ${category}`);
  }
} else {
  console.log('  ⚠️  Source directory not found:', sourceDir);
}

// Step 3: Remove old duplicate folders (but keep "One Folder to rule them all" and newly created folders)
console.log('\n🗑️  Removing old duplicate folders...');
for (const oldDir of oldAssetsDirs) {
  // Only remove if it exists and is NOT the source directory
  // Also check if it's a different path (not the newly organized one)
  if (fs.existsSync(oldDir) && 
      oldDir !== sourceDir && 
      !oldDir.includes('One Folder to rule them all')) {
    // Check if this folder has the old structure (with images) vs new structure (only data.json)
    const hasImages = fs.readdirSync(oldDir, { withFileTypes: true })
      .some(entry => {
        if (!entry.isDirectory()) return false;
        const slidePath = path.join(oldDir, entry.name);
        if (fs.existsSync(slidePath)) {
          const files = fs.readdirSync(slidePath);
          return files.some(f => f.endsWith('.jpg') || f.endsWith('.png'));
        }
        return false;
      });
    
    // Only remove if it has images (old structure), not if it only has data.json (new structure)
    if (hasImages) {
      removeDirectory(oldDir);
    }
  }
}

console.log('\n✅ Asset organization complete!');
console.log('\n📝 Next steps:');
console.log('  1. Verify images are in public/images/{category}/slide_XXX/');
console.log('  2. Verify data.json files are in src/assets/{category}/slide_XXX/');
console.log('  3. Test the application');
console.log('  4. Once verified, you can remove "One Folder to rule them all" if desired');

