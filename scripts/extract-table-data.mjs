#!/usr/bin/env node

/**
 * One-time script to extract product specification data from table images
 * Generates specs.json files for each slide folder
 * Run: node scripts/extract-table-data.mjs
 */

import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'src', 'assets');

// Categories to process
const categories = ['rugs', 'placemat', 'TableRunner', 'cushion', 'throw', 'bedding'];

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

// Fix common OCR errors in text
function fixOCRErrors(text) {
  let fixed = text.toUpperCase();
  
  // Fix common word OCR errors (do this first before number fixes)
  // Material fixes
  fixed = fixed.replace(/\bWOVEM\b/g, 'WOVEN');
  fixed = fixed.replace(/\bWOVEN\b/g, 'WOVEN');
  fixed = fixed.replace(/\bCORTON\b/g, 'COTTON');
  fixed = fixed.replace(/\bCOTTO\b/g, 'COTTON');
  fixed = fixed.replace(/\bCOTTO\s*N\b/g, 'COTTON');
  fixed = fixed.replace(/\bCOTTON\s*N\b/g, 'COTTON');
  fixed = fixed.replace(/\bCOTTON\s*O\b/g, 'COTTON');
  fixed = fixed.replace(/\bJUT\b/g, 'JUTE');
  fixed = fixed.replace(/\bJUT\s*E\b/g, 'JUTE');
  fixed = fixed.replace(/\bJUTE\s*E\b/g, 'JUTE');
  fixed = fixed.replace(/\bJACQUARD\b/g, 'JACQUARD');
  fixed = fixed.replace(/\bJACQUARO\b/g, 'JACQUARD');
  fixed = fixed.replace(/\bJACQUAR\s*D\b/g, 'JACQUARD');
  fixed = fixed.replace(/\bLINEN\b/g, 'LINEN');
  fixed = fixed.replace(/\bLINEM\b/g, 'LINEN');
  fixed = fixed.replace(/\bLINEN\s*N\b/g, 'LINEN');
  fixed = fixed.replace(/\bACRYLIC\b/g, 'ACRYLIC');
  fixed = fixed.replace(/\bACRYL\s*IC\b/g, 'ACRYLIC');
  fixed = fixed.replace(/\bACRYL\s*1C\b/g, 'ACRYLIC');
  fixed = fixed.replace(/\bPOLYESTER\b/g, 'POLYESTER');
  fixed = fixed.replace(/\bPOLYEST\s*ER\b/g, 'POLYESTER');
  fixed = fixed.replace(/\bPOLYEST\s*E\s*R\b/g, 'POLYESTER');
  fixed = fixed.replace(/\bMICROFIBER\b/g, 'MICROFIBER');
  fixed = fixed.replace(/\bMICROFI\s*BER\b/g, 'MICROFIBER');
  fixed = fixed.replace(/\bMICROFI\s*B\s*ER\b/g, 'MICROFIBER');
  
  // Season/Theme fixes
  fixed = fixed.replace(/\bEVERY\s*DAY\b/g, 'EVERYDAY');
  fixed = fixed.replace(/\bEVERY\s*OAY\b/g, 'EVERYDAY');
  fixed = fixed.replace(/\bEVERY\s*DA\s*Y\b/g, 'EVERYDAY');
  fixed = fixed.replace(/\bTERY\s*EV\b/g, 'EVERYDAY');
  fixed = fixed.replace(/\bTERY\s*EV\.\b/g, 'EVERYDAY');
  fixed = fixed.replace(/\bEVERY\s*O\s*AY\b/g, 'EVERYDAY');
  fixed = fixed.replace(/\bCHRISTMAS\b/g, 'CHRISTMAS');
  fixed = fixed.replace(/\bCHRISTM\s*AS\b/g, 'CHRISTMAS');
  fixed = fixed.replace(/\bCHRISTM\s*A\s*S\b/g, 'CHRISTMAS');
  fixed = fixed.replace(/\bMODERN\b/g, 'MODERN');
  fixed = fixed.replace(/\bMODER\s*N\b/g, 'MODERN');
  fixed = fixed.replace(/\bMODER\s*M\b/g, 'MODERN');
  fixed = fixed.replace(/\bTRADITIONAL\b/g, 'TRADITIONAL');
  fixed = fixed.replace(/\bTRADITIO\s*NAL\b/g, 'TRADITIONAL');
  fixed = fixed.replace(/\bTRADITIO\s*N\s*AL\b/g, 'TRADITIONAL');
  
  // Location fixes
  fixed = fixed.replace(/\bINDIA\b/g, 'INDIA');
  fixed = fixed.replace(/\bIN\s*DIA\b/g, 'INDIA');
  fixed = fixed.replace(/\bIN\s*D\s*IA\b/g, 'INDIA');
  
  // Field name fixes
  fixed = fixed.replace(/\bSTYLE\s*#\b/g, 'STYLE #');
  fixed = fixed.replace(/\bSTYLE\s*#\s*:\s*/g, 'STYLE # ');
  fixed = fixed.replace(/\bDESC\s*R\s*IPT\s*ION\b/g, 'DESCRIPTION');
  fixed = fixed.replace(/\bDESC\s*RIPT\s*ION\b/g, 'DESCRIPTION');
  fixed = fixed.replace(/\bDESC\s*R\s*IPT\s*I\s*ON\b/g, 'DESCRIPTION');
  fixed = fixed.replace(/\bTECHNIQUE\b/g, 'TECHNIQUE');
  fixed = fixed.replace(/\bTECHNI\s*QUE\b/g, 'TECHNIQUE');
  fixed = fixed.replace(/\bCONTENT\b/g, 'CONTENT');
  fixed = fixed.replace(/\bCON\s*TENT\b/g, 'CONTENT');
  fixed = fixed.replace(/\bSIZE\b/g, 'SIZE');
  fixed = fixed.replace(/\bSEASON\b/g, 'SEASON');
  fixed = fixed.replace(/\bSEA\s*SON\b/g, 'SEASON');
  
  // Fix number OCR errors (be careful not to break words)
  // Only fix standalone numbers, not in words
  fixed = fixed.replace(/\bSO\b/g, '90');
  fixed = fixed.replace(/\bS0\b/g, '90');
  fixed = fixed.replace(/\bS\s*O\b/g, '90');
  
  return fixed;
}

// Normalize extracted values to ensure consistency
function normalizeValue(value, fieldType) {
  if (!value) return null;
  
  let normalized = value.trim();
  
  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Field-specific normalization
  if (fieldType === 'styleNumber') {
    // Style numbers should be uppercase and preserve hyphens
    normalized = normalized.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
  } else if (fieldType === 'size') {
    // Size is already normalized in the size parsing logic
    return normalized;
  } else {
    // For text fields, capitalize properly
    normalized = normalized.toUpperCase();
    // Remove trailing punctuation that might be OCR errors
    normalized = normalized.replace(/[.,;:]+$/, '');
  }
  
  return normalized.length > 0 ? normalized : null;
}

// Parse OCR text to extract specification fields
// Extracts the following fields:
// - styleNumber (STYLE #): Product style code (e.g., "CHD-BD-1002")
// - description (DESCRIPTION/DESC): Product description text
// - technique (TECHNIQUE): Manufacturing technique (e.g., "WOVEN", "JACQUARD")
// - content (CONTENT): Material content (e.g., "COTTON", "JUTE")
// - size (SIZE): Product size (e.g., "90*90\"")
// - season (SEASON): Season/occasion (e.g., "EVERYDAY", "CHRISTMAS")
function parseTableText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const result = {};
  
  // Fix OCR errors in the entire text first
  const fixedText = fixOCRErrors(text);
  const fixedLines = fixedText.split('\n').map(l => l.trim()).filter(l => l);
  
  // Parse line by line to avoid capturing multiple fields
  for (let i = 0; i < fixedLines.length; i++) {
    const line = fixedLines[i];
    
    // STYLE # - Look for pattern like "STYLE # CHD-BD-1002"
    if (line.includes('STYLE') && !result.styleNumber) {
      const styleMatch = line.match(/STYLE\s*#?\s*:?\s*([A-Z0-9\-]+)/i);
      if (styleMatch && styleMatch[1]) {
        const normalized = normalizeValue(styleMatch[1], 'styleNumber');
        if (normalized) result.styleNumber = normalized;
        continue;
      }
    }
    
    // DESCRIPTION/DESC - Look for description field (can span multiple lines)
    // Try multiple patterns to catch description even with OCR errors
    if (!result.description) {
      // Pattern 1: Explicit DESCRIPTION or DESC label
      if (line.match(/(?:DESCRIPTION|DESC|DESC\s*R\s*IPT\s*ION|DESC\s*RIPT\s*ION)/i)) {
        // Try to match on same line first
        const descMatch = line.match(/(?:DESCRIPTION|DESC|DESC\s*R\s*IPT\s*ION|DESC\s*RIPT\s*ION)\s*:?\s*(.+?)(?:\s+(?:TECHNIQUE|CONTENT|SIZE|SEASON|THEME|COUNTRY|STYLE)|$)/i);
        if (descMatch && descMatch[1]) {
          let desc = descMatch[1].trim();
          desc = desc.replace(/\s*(TECHNIQUE|CONTENT|SIZE|SEASON|THEME|COUNTRY|STYLE).*$/i, '').trim();
          if (desc && desc.length > 2) {
            const normalized = normalizeValue(fixOCRErrors(desc), 'description');
            if (normalized) result.description = normalized;
            continue;
          }
        }
        // If description might be on next line(s), check next few lines
        if (i + 1 < fixedLines.length) {
          let desc = '';
          for (let j = i + 1; j < Math.min(i + 5, fixedLines.length); j++) {
            const nextLine = fixedLines[j];
            // Stop if we hit another field name
            if (nextLine.match(/^(TECHNIQUE|CONTENT|SIZE|SEASON|THEME|COUNTRY|STYLE|DESCRIPTION|DESC)/i)) {
              break;
            }
            if (desc) desc += ' ';
            desc += nextLine;
          }
          if (desc && desc.trim().length > 2) {
            const normalized = normalizeValue(fixOCRErrors(desc.trim()), 'description');
            if (normalized) result.description = normalized;
            continue;
          }
        }
      }
      
      // Pattern 2: Description might be between STYLE and TECHNIQUE (common position)
      // Look for text that's not a field name and appears before TECHNIQUE
      if (line.includes('STYLE') && i + 1 < fixedLines.length) {
        const nextLine = fixedLines[i + 1];
        // If next line doesn't start with a field name, it might be description
        if (!nextLine.match(/^(TECHNIQUE|CONTENT|SIZE|SEASON|THEME|COUNTRY|STYLE|DESCRIPTION|DESC)/i)) {
          // Check if it looks like descriptive text (has multiple words, not just numbers/symbols)
          if (nextLine.match(/[A-Z]{3,}/) && nextLine.length > 5) {
            let desc = nextLine;
            // Collect following lines until we hit a field name
            for (let j = i + 2; j < Math.min(i + 4, fixedLines.length); j++) {
              const followLine = fixedLines[j];
              if (followLine.match(/^(TECHNIQUE|CONTENT|SIZE|SEASON|THEME|COUNTRY|STYLE|DESCRIPTION|DESC)/i)) {
                break;
              }
              desc += ' ' + followLine;
            }
            if (desc && desc.trim().length > 5) {
              const normalized = normalizeValue(fixOCRErrors(desc.trim()), 'description');
              if (normalized && normalized.length > 5) {
                result.description = normalized;
                continue;
              }
            }
          }
        }
      }
      
      // Pattern 3: Fallback - look for any substantial text block that doesn't match field patterns
      // This catches descriptions that might not have explicit labels
      if (!line.match(/^(STYLE|TECHNIQUE|CONTENT|SIZE|SEASON|THEME|COUNTRY|DESCRIPTION|DESC)/i)) {
        // If line has substantial text (more than 10 chars, has letters) and we haven't found description yet
        if (line.length > 10 && line.match(/[A-Z]{4,}/i) && !result.styleNumber && !result.technique) {
          // This might be description if it's early in the text
          if (i < 3) {
            let desc = line;
            // Collect following lines until we hit a field name
            for (let j = i + 1; j < Math.min(i + 3, fixedLines.length); j++) {
              const followLine = fixedLines[j];
              if (followLine.match(/^(STYLE|TECHNIQUE|CONTENT|SIZE|SEASON|THEME|COUNTRY|DESCRIPTION|DESC)/i)) {
                break;
              }
              desc += ' ' + followLine;
            }
            if (desc && desc.trim().length > 10) {
              const normalized = normalizeValue(fixOCRErrors(desc.trim()), 'description');
              if (normalized && normalized.length > 10) {
                result.description = normalized;
                continue;
              }
            }
          }
        }
      }
    }
    
    // TECHNIQUE - Stop at next field name
    if (line.includes('TECHNIQUE') && !result.technique) {
      // Look for TECHNIQUE: value, stop at CONTENT, SIZE, SEASON, THEME, COUNTRY, DESCRIPTION
      const techMatch = line.match(/TECHNIQUE\s*:?\s*(.+?)(?:\s+(?:CONTENT|SIZE|SEASON|THEME|COUNTRY|DESCRIPTION|DESC|STYLE)|$)/i);
      if (techMatch && techMatch[1]) {
        let tech = techMatch[1].trim();
        // Remove any field names that might have been captured
        tech = tech.replace(/\s*(CONTENT|SIZE|SEASON|THEME|COUNTRY|DESCRIPTION|DESC|STYLE).*$/i, '').trim();
        // Fix common OCR errors
        tech = fixOCRErrors(tech);
        const normalized = normalizeValue(tech, 'technique');
        if (normalized) result.technique = normalized;
        continue;
      }
    }
    
    // CONTENT - Stop at next field name
    if (line.includes('CONTENT') && !result.content) {
      const contentMatch = line.match(/CONTENT\s*:?\s*(.+?)(?:\s+(?:SIZE|SEASON|THEME|COUNTRY|DESCRIPTION|DESC|TECHNIQUE|STYLE)|$)/i);
      if (contentMatch && contentMatch[1]) {
        let content = contentMatch[1].trim();
        content = content.replace(/\s*(SIZE|SEASON|THEME|COUNTRY|DESCRIPTION|DESC|TECHNIQUE|STYLE).*$/i, '').trim();
        // Fix common OCR errors
        content = fixOCRErrors(content);
        const normalized = normalizeValue(content, 'content');
        if (normalized) result.content = normalized;
        continue;
      }
    }
    
    // SIZE - Handle formats like "20*20"", "90*90"", "24X36"", etc.
    if (line.includes('SIZE') && !result.size) {
      // Match patterns like: SIZE: 20*20", SIZE: 90*90", SIZE: 24X36", etc.
      // Accept * or X as separator, with optional quotes
      const sizeMatch = line.match(/SIZE\s*:?\s*(.+?)(?:\s+(?:SEASON|THEME|COUNTRY|DESCRIPTION|DESC|TECHNIQUE|CONTENT|STYLE)|$)/i);
      if (sizeMatch && sizeMatch[1]) {
        let size = sizeMatch[1].trim();
        // Remove any field names
        size = size.replace(/\s*(SEASON|THEME|COUNTRY|DESCRIPTION|DESC|TECHNIQUE|CONTENT|STYLE).*$/i, '').trim();
        
        // Remove all spaces first
        size = size.replace(/\s+/g, '');
        
        // Fix OCR errors in numbers/letters BEFORE processing format
        // Common OCR errors: SO->90, S0->90, O->0, I->1, Z->2, etc.
        // Handle "SOXSO" pattern specifically
        size = size.replace(/SOXSO/gi, '90*90');
        size = size.replace(/S0XS0/gi, '90*90');
        size = size.replace(/SO\s*X\s*SO/gi, '90*90');
        size = size.replace(/S0\s*X\s*S0/gi, '90*90');
        size = size.replace(/SO/gi, '90');
        size = size.replace(/S0/gi, '90');
        
        // Fix other OCR letter-to-number errors
        size = size.replace(/([^0-9*X"])O([^0-9*X"])/g, '$10$2'); // O in middle -> 0
        size = size.replace(/^O([0-9*X"])/g, '0$1'); // O at start -> 0
        size = size.replace(/([0-9*X"])O$/g, '$10'); // O at end -> 0
        size = size.replace(/I([0-9*X"])/g, '1$1'); // I before -> 1
        size = size.replace(/([0-9*X"])I/g, '$11'); // I after -> 1
        size = size.replace(/Z([0-9*X"])/g, '2$1'); // Z before -> 2
        size = size.replace(/([0-9*X"])Z/g, '$12'); // Z after -> 2
        
        // Normalize separator: convert X to * (but preserve existing *)
        size = size.replace(/X/gi, '*');
        
        // Handle formats: "20*20", "20*20"", "20020" -> "20*20""
        // If it looks like numbers without separator (e.g., "20020"), add separator
        if (size.match(/^[0-9]{4,}$/)) {
          // Split in middle: "20020" -> "20*020" -> "20*20"
          const mid = Math.floor(size.length / 2);
          size = size.substring(0, mid) + '*' + size.substring(mid);
        }
        
        // If we have two numbers but no separator (e.g., "2020"), add *
        if (size.match(/^[0-9]{2,}[0-9]{2,}$/) && !size.includes('*')) {
          const mid = Math.floor(size.length / 2);
          size = size.substring(0, mid) + '*' + size.substring(mid);
        }
        
        // Ensure quote at end if it's a size format (has * separator)
        if (size.includes('*') && !size.endsWith('"')) {
          size = size + '"';
        }
        
        // Final cleanup: remove any non-size characters EXCEPT * and "
        size = size.replace(/[^0-9*"]/g, '');
        
        // Final validation: must have * separator to be valid
        if (size && size.includes('*')) {
          result.size = size;
        }
        continue;
      }
    }
    
    // SEASON - Stop at next field name
    if (line.includes('SEASON') && !result.season) {
      const seasonMatch = line.match(/SEASON\s*:?\s*(.+?)(?:\s+(?:THEME|COUNTRY|DESCRIPTION|DESC|TECHNIQUE|CONTENT|SIZE|STYLE)|$)/i);
      if (seasonMatch && seasonMatch[1]) {
        let season = seasonMatch[1].trim();
        season = season.replace(/\s*(THEME|COUNTRY|DESCRIPTION|DESC|TECHNIQUE|CONTENT|SIZE|STYLE).*$/i, '').trim();
        // Fix OCR errors
        season = fixOCRErrors(season);
        const normalized = normalizeValue(season, 'season');
        // Don't capture if it's just another field name
        if (normalized && !normalized.match(/^(THEME|COUNTRY|DESCRIPTION|DESC|TECHNIQUE|CONTENT|SIZE|STYLE)$/i)) {
          result.season = normalized;
        }
        continue;
      }
    }
    
    // THEME - Only capture if there's actual content
    if (line.includes('THEME') && !result.theme) {
      const themeMatch = line.match(/THEME\s*:?\s*(.+?)(?:\s+(?:COUNTRY|DESCRIPTION|DESC|TECHNIQUE|CONTENT|SIZE|SEASON|STYLE)|$)/i);
      if (themeMatch && themeMatch[1]) {
        let theme = themeMatch[1].trim();
        theme = theme.replace(/\s*(COUNTRY|DESCRIPTION|DESC|TECHNIQUE|CONTENT|SIZE|SEASON|STYLE).*$/i, '').trim();
        // Fix OCR errors
        theme = fixOCRErrors(theme);
        // Only set if there's actual content (not just empty or another field name)
        if (theme && !theme.match(/^(COUNTRY|DESCRIPTION|DESC|TECHNIQUE|CONTENT|SIZE|SEASON|STYLE)$/i) && theme.length > 1) {
          result.theme = theme;
        }
        continue;
      }
    }
    
    // COUNTRY - Last field
    if (line.includes('COUNTRY') && !result.country) {
      const countryMatch = line.match(/COUNTRY\s*:?\s*(.+?)(?:\s+(?:DESCRIPTION|DESC|TECHNIQUE|CONTENT|SIZE|SEASON|THEME|STYLE)|$)/i);
      if (countryMatch && countryMatch[1]) {
        let country = countryMatch[1].trim();
        country = country.replace(/\s*(DESCRIPTION|DESC|TECHNIQUE|CONTENT|SIZE|SEASON|THEME|STYLE).*$/i, '').trim();
        // Fix OCR errors
        country = fixOCRErrors(country);
        if (country && country.length > 1) result.country = country;
        continue;
      }
    }
  }
  
  // Final cleanup: ensure all string values are properly normalized
  const finalResult = {};
  if (result.styleNumber) finalResult.styleNumber = result.styleNumber;
  if (result.description) finalResult.description = result.description;
  if (result.technique) finalResult.technique = result.technique;
  if (result.content) finalResult.content = result.content;
  if (result.size) finalResult.size = result.size;
  if (result.season) finalResult.season = result.season;
  // Optional fields (not required but included if present)
  if (result.theme) finalResult.theme = result.theme;
  if (result.country) finalResult.country = result.country;
  
  return finalResult;
}

// Validate image file before processing
function validateImageFile(imagePath) {
  try {
    if (!fs.existsSync(imagePath)) {
      return { valid: false, reason: 'File does not exist' };
    }
    
    const stats = fs.statSync(imagePath);
    if (stats.size === 0) {
      return { valid: false, reason: 'File is empty' };
    }
    
    // Check if file is too small (likely corrupted)
    if (stats.size < 100) {
      return { valid: false, reason: 'File too small (likely corrupted)' };
    }
    
    // Check file extension
    const ext = path.extname(imagePath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)) {
      return { valid: false, reason: `Unsupported file format: ${ext}` };
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, reason: `Validation error: ${error.message}` };
  }
}

// Extract data from a single table image
async function extractFromTableImage(tableImagePath, category, slideNum, worker) {
  try {
    if (!fs.existsSync(tableImagePath)) {
      console.log(`  ⚠️  No table image found for ${category}/slide_${String(slideNum).padStart(3, '0')}`);
      return null;
    }
    
    // Validate image before processing
    const validation = validateImageFile(tableImagePath);
    if (!validation.valid) {
      console.log(`  ⚠️  Invalid image file for ${category}/slide_${String(slideNum).padStart(3, '0')}: ${validation.reason}`);
      return null;
    }
    
    console.log(`  📄 Processing ${category}/slide_${String(slideNum).padStart(3, '0')}...`);
    
    // Perform OCR using the shared worker with better settings
    // Wrap in additional try-catch to handle Tesseract-specific errors
    let text = '';
    try {
      const result = await Promise.race([
        worker.recognize(tableImagePath),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('OCR timeout after 30 seconds')), 30000)
        )
      ]);
      text = result.data.text;
    } catch (ocrError) {
      // Handle specific Tesseract errors
      if (ocrError.message.includes('Cannot read properties of null') || 
          ocrError.message.includes('left') ||
          ocrError.message.includes('timeout')) {
        console.error(`  ⚠️  OCR failed for ${category}/slide_${String(slideNum).padStart(3, '0')}: ${ocrError.message}`);
        console.error(`  💡 This might be due to corrupted image or unsupported format. Skipping...`);
        return null;
      }
      throw ocrError; // Re-throw if it's a different error
    }
    
    // Debug: log raw OCR text (commented out by default, uncomment for debugging)
    // console.log(`  Raw OCR: ${text.substring(0, 200)}...`);
    
    // Parse the text
    const specs = parseTableText(text);
    
    // If we got at least some data, return it
    if (Object.keys(specs).length > 0) {
      return specs;
    }
    
    return null;
  } catch (error) {
    console.error(`  ❌ Error processing ${category}/slide_${String(slideNum).padStart(3, '0')}:`, error.message);
    // Don't print full stack trace for known OCR errors
    if (!error.message.includes('Cannot read properties of null') && 
        !error.message.includes('left')) {
      console.error(`  Stack:`, error.stack);
    }
    return null;
  }
}

// Helper function to add a small delay between processing
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main extraction function
async function extractAllTableData() {
  console.log('🚀 Starting table data extraction...\n');
  
  let totalProcessed = 0;
  let totalSuccess = 0;
  let worker = null;
  let workerErrorCount = 0;
  const MAX_WORKER_ERRORS = 5; // Recreate worker after this many errors
  
  // Function to create and configure worker
  async function createAndConfigureWorker() {
    const newWorker = await createWorker('eng');
    // Configure OCR for better accuracy with tables
    await newWorker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-*":., ',
      tessedit_pageseg_mode: '6', // Assume uniform block of text
      preserve_interword_spaces: '1',
    });
    return newWorker;
  }
  
  try {
    // Create a single worker that will be reused for all images
    console.log('🔧 Initializing Tesseract worker...');
    worker = await createAndConfigureWorker();
    console.log('✅ Worker initialized\n');
    
    for (const category of categories) {
      const categoryPath = path.join(assetsDir, category);
      
      if (!fs.existsSync(categoryPath)) {
        console.log(`⚠️  Category folder not found: ${category}`);
        continue;
      }
      
      console.log(`\n📁 Processing category: ${category}`);
      const slides = findSlideFolders(categoryPath);
      console.log(`   Found ${slides.length} slides`);
      
      for (const slide of slides) {
        totalProcessed++;
        const tableImagePath = path.join(slide.path, 'table_01.png');
        const specsJsonPath = path.join(slide.path, 'specs.json');
        
        // Skip if already extracted (unless forced)
        if (fs.existsSync(specsJsonPath) && process.argv.includes('--force') === false) {
          console.log(`  ⏭️  Skipping ${category}/slide_${String(slide.number).padStart(3, '0')} (already exists)`);
          continue;
        }
        
        try {
          const specs = await extractFromTableImage(tableImagePath, category, slide.number, worker);
          
          // Reset error count on success
          workerErrorCount = 0;
          
          if (specs) {
            // Validate required fields (except theme and country)
            const requiredFields = ['styleNumber', 'description', 'technique', 'content', 'size', 'season'];
            const missingFields = requiredFields.filter(field => !specs[field]);
            
            if (missingFields.length > 0) {
              console.log(`  ⚠️  Missing fields: ${missingFields.join(', ')}`);
            }
            
            // Write JSON file
            fs.writeFileSync(specsJsonPath, JSON.stringify(specs, null, 2));
            console.log(`  ✅ Extracted and saved specs.json`);
            totalSuccess++;
          } else {
            console.log(`  ⚠️  No data extracted`);
          }
          
          // Add a small delay between images to prevent overwhelming the system
          await delay(100);
        } catch (error) {
          // Handle errors gracefully - don't let one bad image stop the whole process
          const errorMsg = error.message || 'Unknown error';
          
          // Check if this is a worker-level error that might require worker recreation
          if (errorMsg.includes('Cannot read properties of null') || 
              errorMsg.includes('left') ||
              errorMsg.includes('Worker') ||
              errorMsg.includes('timeout')) {
            workerErrorCount++;
            console.error(`  ⚠️  Skipping ${category}/slide_${String(slide.number).padStart(3, '0')} due to image processing error`);
            
            // Recreate worker if we've had too many errors
            if (workerErrorCount >= MAX_WORKER_ERRORS && worker) {
              console.log(`  🔄 Recreating worker after ${workerErrorCount} errors...`);
              try {
                await worker.terminate();
              } catch (e) {
                // Ignore termination errors
              }
              worker = await createAndConfigureWorker();
              workerErrorCount = 0;
              console.log(`  ✅ Worker recreated`);
            }
          } else {
            console.error(`  ❌ Failed to process ${category}/slide_${String(slide.number).padStart(3, '0')}:`, errorMsg);
          }
          // Continue processing other images even if one fails
          continue;
        }
      }
    }
  } catch (error) {
    console.error(`\n❌ Fatal error during extraction:`, error.message);
    console.error(`Stack:`, error.stack);
  } finally {
    // Always clean up the worker
    if (worker) {
      console.log('\n🧹 Cleaning up worker...');
      try {
        await worker.terminate();
        console.log('✅ Worker terminated');
      } catch (error) {
        console.error('⚠️  Error terminating worker:', error.message);
      }
    }
  }
  
  console.log(`\n✨ Extraction complete!`);
  console.log(`   Processed: ${totalProcessed} slides`);
  console.log(`   Success: ${totalSuccess} slides`);
  console.log(`\n💡 Tip: Run with --force to re-extract existing files`);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Run the extraction
extractAllTableData().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

