# Table Data Extraction Guide

## Overview

This project uses a hybrid approach for extracting product specification data from table images:
1. **One-time extraction script** - Uses OCR to extract data from `table_01.png` images
2. **Fast JSON loading** - Production code loads pre-extracted JSON files (no OCR in production!)

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install `tesseract.js` as a dev dependency (only needed for extraction).

### 2. Run Extraction Script

Extract all table data and generate JSON files:

```bash
npm run extract-specs
```

This will:
- Scan all slide folders in `src/assets/`
- Extract data from `table_01.png` images using OCR
- Generate `specs.json` files in each slide folder
- Skip already extracted files (use `--force` to re-extract)

### 3. Verify Extraction

Check that `specs.json` files were created:

```bash
ls src/assets/rugs/slide_001/specs.json
```

## How It Works

### Extraction Script (`scripts/extract-table-data.mjs`)

- Uses Tesseract.js OCR to read text from table images
- Parses extracted text to find specification fields:
  - STYLE #
  - TECHNIQUE
  - CONTENT
  - SIZE
  - SEASON
  - THEME (optional)
  - COUNTRY (optional)
- Saves data as JSON files in each slide folder

### Production Code

- Uses Vite's `import.meta.glob` to pre-load all `specs.json` files at build time
- Fast synchronous access - no OCR in production!
- Falls back to default values if JSON file doesn't exist

## JSON File Format

Each `specs.json` file contains:

```json
{
  "styleNumber": "CHD-RG-1120",
  "technique": "WOVEN",
  "content": "COTTON + JUTE",
  "size": "24X36\"",
  "season": "EVERYDAY",
  "theme": "MODERN",
  "country": "INDIA"
}
```

## Performance

- **Extraction**: One-time process (can take 10-30 minutes for all products)
- **Production**: Instant loading (JSON files are pre-loaded at build time)
- **Bundle size**: Minimal impact (JSON files are small, ~100 bytes each)

## Troubleshooting

### OCR Not Working

If extraction fails:
1. Check that `table_01.png` exists in the slide folder
2. Ensure image quality is good (clear text, good contrast)
3. Try running with `--force` to re-extract

### Missing Specs

If a product shows default values:
1. Check if `specs.json` exists in the slide folder
2. Verify the JSON file has valid data
3. Re-run extraction for that specific category if needed

## Re-extracting

To re-extract all data:

```bash
npm run extract-specs -- --force
```

To extract only specific categories, modify the `categories` array in `scripts/extract-table-data.mjs`.

