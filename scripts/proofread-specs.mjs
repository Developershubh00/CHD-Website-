#!/usr/bin/env node

/**
 * Proofreading script to quickly review all extracted specs.json files
 * Shows missing fields and allows quick review
 * Run: node scripts/proofread-specs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'src', 'assets');

// Categories to check
const categories = ['rugs', 'placemat', 'TableRunner', 'cushion', 'throw', 'bedding'];

// Required fields (excluding theme and country)
const requiredFields = ['styleNumber', 'description', 'technique', 'content', 'size', 'season'];

// Helper to find all slide folders
function findSlideFolders(categoryPath) {
  const slides = [];
  if (!fs.existsSync(categoryPath)) return slides;
  
  const entries = fs.readdirSync(categoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith('slide_')) {
      const slideNum = parseInt(entry.name.replace('slide_', ''));
      if (!isNaN(slideNum)) {
        slides.push({ path: path.join(categoryPath, entry.name), number: slideNum });
      }
    }
  }
  return slides.sort((a, b) => a.number - b.number);
}

// Main proofreading function
function proofreadAllSpecs() {
  console.log('🔍 Proofreading all specs.json files...\n');
  
  const issues = [];
  const allSpecs = [];
  let totalSlides = 0;
  let totalWithIssues = 0;
  
  for (const category of categories) {
    const categoryPath = path.join(assetsDir, category);
    
    if (!fs.existsSync(categoryPath)) {
      console.log(`⚠️  Category folder not found: ${category}`);
      continue;
    }
    
    const slides = findSlideFolders(categoryPath);
    
    for (const slide of slides) {
      totalSlides++;
      const specsJsonPath = path.join(slide.path, 'specs.json');
      
      if (!fs.existsSync(specsJsonPath)) {
        issues.push({
          category,
          slide: slide.number,
          type: 'missing_file',
          message: 'specs.json file does not exist'
        });
        totalWithIssues++;
        continue;
      }
      
      try {
        const specsContent = fs.readFileSync(specsJsonPath, 'utf-8');
        const specs = JSON.parse(specsContent);
        
        // Check for missing required fields
        const missingFields = requiredFields.filter(field => !specs[field] || specs[field].trim() === '');
        
        if (missingFields.length > 0) {
          issues.push({
            category,
            slide: slide.number,
            type: 'missing_fields',
            message: `Missing: ${missingFields.join(', ')}`,
            missingFields,
            specs
          });
          totalWithIssues++;
        }
        
        allSpecs.push({
          category,
          slide: slide.number,
          specs,
          missingFields
        });
      } catch (error) {
        issues.push({
          category,
          slide: slide.number,
          type: 'parse_error',
          message: `Error parsing JSON: ${error.message}`
        });
        totalWithIssues++;
      }
    }
  }
  
  // Display summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total slides checked: ${totalSlides}`);
  console.log(`Slides with issues: ${totalWithIssues}`);
  console.log(`Slides OK: ${totalSlides - totalWithIssues}`);
  console.log('');
  
  // Show quick overview table
  if (missingFieldsIssues.length > 0) {
    console.log('📋 QUICK OVERVIEW - Missing Fields by Category:');
    console.log('');
    const byCategory = {};
    missingFieldsIssues.forEach(issue => {
      if (!byCategory[issue.category]) {
        byCategory[issue.category] = { total: 0, fields: {} };
      }
      byCategory[issue.category].total++;
      issue.missingFields.forEach(field => {
        if (!byCategory[issue.category].fields[field]) {
          byCategory[issue.category].fields[field] = 0;
        }
        byCategory[issue.category].fields[field]++;
      });
    });
    
    for (const [category, stats] of Object.entries(byCategory)) {
      console.log(`  ${category}: ${stats.total} slides with issues`);
      for (const [field, count] of Object.entries(stats.fields)) {
        console.log(`    - ${field}: missing in ${count} slides`);
      }
    }
    console.log('');
  }
  
  if (issues.length === 0) {
    console.log('✅ All slides have all required fields!');
    return;
  }
  
  // Group issues by type
  const missingFileIssues = issues.filter(i => i.type === 'missing_file');
  const missingFieldsIssues = issues.filter(i => i.type === 'missing_fields');
  const parseErrors = issues.filter(i => i.type === 'parse_error');
  
  // Display issues by category
  console.log('═══════════════════════════════════════════════════════════');
  console.log('❌ ISSUES FOUND');
  console.log('═══════════════════════════════════════════════════════════');
  
  if (missingFileIssues.length > 0) {
    console.log(`\n📄 Missing specs.json files (${missingFileIssues.length}):`);
    missingFileIssues.forEach(issue => {
      console.log(`   ${issue.category}/slide_${String(issue.slide).padStart(3, '0')}: ${issue.message}`);
    });
  }
  
  if (parseErrors.length > 0) {
    console.log(`\n⚠️  Parse errors (${parseErrors.length}):`);
    parseErrors.forEach(issue => {
      console.log(`   ${issue.category}/slide_${String(issue.slide).padStart(3, '0')}: ${issue.message}`);
    });
  }
  
  if (missingFieldsIssues.length > 0) {
    console.log(`\n🔍 Missing required fields (${missingFieldsIssues.length}):`);
    console.log('');
    
    // Group by category for easier review
    const byCategory = {};
    missingFieldsIssues.forEach(issue => {
      if (!byCategory[issue.category]) {
        byCategory[issue.category] = [];
      }
      byCategory[issue.category].push(issue);
    });
    
    for (const [category, categoryIssues] of Object.entries(byCategory)) {
      console.log(`📁 ${category.toUpperCase()} (${categoryIssues.length} issues):`);
      categoryIssues.forEach(issue => {
        const slideNum = String(issue.slide).padStart(3, '0');
        console.log(`   slide_${slideNum}:`);
        console.log(`      Missing: ${issue.missingFields.join(', ')}`);
        
        // Show what fields ARE present
        const presentFields = requiredFields.filter(f => !issue.missingFields.includes(f));
        if (presentFields.length > 0) {
          presentFields.forEach(field => {
            const value = issue.specs[field];
            const displayValue = value && value.length > 50 ? value.substring(0, 50) + '...' : value;
            console.log(`      ✓ ${field}: ${displayValue || '(empty)'}`);
          });
        }
        console.log('');
      });
    }
  }
  
  // Generate quick fix suggestions
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💡 QUICK FIX SUGGESTIONS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('1. Re-run extraction: npm run extract-specs -- --force');
  console.log('2. For slides missing description, check if it exists in the table image');
  console.log('3. Manually edit specs.json files for any remaining issues');
  console.log('');
  
  // Export issues to a file for reference
  const issuesFile = path.join(rootDir, 'specs-issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify({
    generated: new Date().toISOString(),
    totalSlides,
    totalWithIssues,
    issues: issues.map(i => ({
      category: i.category,
      slide: i.slide,
      type: i.type,
      message: i.message,
      missingFields: i.missingFields || []
    }))
  }, null, 2));
  console.log(`📝 Issues exported to: ${issuesFile}`);
}

// Run proofreading
proofreadAllSpecs();

