// Single source of truth for the design library's backup layout.
//
// The library is: src/assets/<dir>/slide_NNN/data.json (the specs) and
// public/images/<dir>/slide_NNN/* (the pictures). The pipeline appends the
// next slide_NNN for every published design, so a higher slide number = added
// later. This module turns that into a plain-JSON index (library-index.json)
// that every backup/export consumer reads, so folder and file NAMES are
// decided in exactly one place:
//   - scripts/export-library.mjs   (portable export / restore / verify)
//   - scripts/chd-library-backup.gs (Google Drive sync, runs in Apps Script)
//
// The index is deterministic (no timestamps): regenerating it when nothing
// changed produces a byte-identical file, so git sees no diff.
import fs from 'node:fs';
import path from 'node:path';

export const INDEX_VERSION = 1;
export const REPO_SLUG = 'Developershubh00/CHD-Website-';
export const BRANCH = 'main';
export const SITE_BASE = 'https://www.creativehomedecorllp.com';

/** site category id (/category/:id), display name, repo folder name. Order = catalog order. */
export const CATEGORIES = [
  { id: 'rugs', name: 'Rugs', dir: 'rugs' },
  { id: 'placemats', name: 'Placemats', dir: 'placemat' },
  { id: 'runners', name: 'Table Runners', dir: 'TableRunner' },
  { id: 'cushions', name: 'Cushions', dir: 'cushion' },
  { id: 'throws', name: 'Throws', dir: 'throw' },
  { id: 'bedding', name: 'Bedding', dir: 'bedding' },
  { id: 'bathmats', name: 'Bath Mats', dir: 'bathmat' },
  { id: 'chairpads', name: 'Tote Bags', dir: 'totebag' },
];

/** Files in a slide's image folder that are NOT backed up: the card is derived from the lifestyle image. */
export const DERIVED_FILES = new Set(['card.webp']);

export const pad3 = (n) => String(n).padStart(3, '0');

/** Safe folder/file-name fragment for a style number (keeps letters, digits, . _ -). */
export function sanitizeName(s) {
  const clean = String(s ?? '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_.-]+/, '')
    .replace(/[_.]+$/, '');
  // Windows cannot create files named after its device names (CON, NUL, COM1 ...), with or without an extension.
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(clean) ? `_${clean}` : clean;
}

/**
 * Assigns each design its backup folder name. Style numbers are NOT unique in
 * this catalog (the same style can be published twice), so the first design
 * (lowest slide number) keeps the plain style name and later ones get
 * "__slide_NNN" appended. Because designs are only ever appended, a folder
 * name never changes once assigned.
 */
export function assignFolderNames(designs) {
  const sorted = [...designs].sort((a, b) => (a.dir === b.dir ? a.slide - b.slide : a.dir < b.dir ? -1 : 1));
  const perDirTaken = new Map();
  for (const d of sorted) {
    if (!perDirTaken.has(d.dir)) perDirTaken.set(d.dir, new Set());
    const used = perDirTaken.get(d.dir);
    let name = sanitizeName(d.style) || `slide_${pad3(d.slide)}`;
    if (used.has(name.toLowerCase())) {
      const base = `${name}__slide_${pad3(d.slide)}`;
      name = base;
      // the suffixed name could itself be taken (a style literally ending in __slide_NNN): keep counting
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}_${n}`;
    }
    used.add(name.toLowerCase());
    d.folder = name;
  }
  return designs;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Scans the repo and returns the index object. */
export function buildIndex(repoRoot) {
  const designs = [];
  for (const cat of CATEGORIES) {
    const assetsDir = path.join(repoRoot, 'src/assets', cat.dir);
    if (!fs.existsSync(assetsDir)) continue;
    const slides = fs
      .readdirSync(assetsDir)
      .filter((d) => /^slide_\d+$/.test(d))
      .sort();
    for (const slideDir of slides) {
      const slide = parseInt(slideDir.slice(6), 10);
      const dataFile = path.join(assetsDir, slideDir, 'data.json');
      const specs = fs.existsSync(dataFile) ? readJson(dataFile) : {};
      const imagesDir = path.join(repoRoot, 'public/images', cat.dir, slideDir);
      const files = fs.existsSync(imagesDir)
        ? fs
            .readdirSync(imagesDir)
            .filter((f) => !DERIVED_FILES.has(f) && fs.statSync(path.join(imagesDir, f)).isFile())
            .sort()
            .map((name) => ({ name, bytes: fs.statSync(path.join(imagesDir, name)).size }))
        : [];
      designs.push({
        cat: cat.id,
        dir: cat.dir,
        slide,
        style: String(specs.styleNumber ?? '').trim(),
        folder: '',
        specs,
        files,
      });
    }
  }
  assignFolderNames(designs);
  const seen = new Set();
  for (const d of designs) {
    const key = `${d.dir}/${d.folder.toLowerCase()}`;
    if (!d.folder || seen.has(key)) throw new Error(`library index: empty or duplicate folder name "${d.folder}" in ${d.dir}`);
    seen.add(key);
  }
  designs.sort((a, b) => {
    const ca = CATEGORIES.findIndex((c) => c.dir === a.dir);
    const cb = CATEGORIES.findIndex((c) => c.dir === b.dir);
    return ca - cb || a.slide - b.slide;
  });
  return {
    version: INDEX_VERSION,
    repo: REPO_SLUG,
    branch: BRANCH,
    siteBase: SITE_BASE,
    categories: CATEGORIES,
    count: designs.length,
    designs,
  };
}

/** Index file contents: stable key order, one design per line so git diffs stay small. */
export function serializeIndex(index) {
  const head = { ...index, designs: undefined };
  delete head.designs;
  const lines = index.designs.map((d) => '    ' + JSON.stringify(d));
  const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  return `${headJson},\n  "designs": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

/** Name a design's file gets inside its backup folder. */
export const backupFileName = (design, fileName) => `${design.folder}_${fileName}`;

/** Where a design's picture lives on GitHub (raw) and on the live site. */
export const rawUrl = (index, design, fileName) =>
  `https://raw.githubusercontent.com/${index.repo}/${index.branch}/public/images/${design.dir}/slide_${pad3(design.slide)}/${encodeURIComponent(fileName)}`;
export const siteUrl = (index, design, fileName) =>
  `${index.siteBase}/images/${design.dir}/slide_${pad3(design.slide)}/${encodeURIComponent(fileName)}`;
