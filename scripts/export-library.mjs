#!/usr/bin/env node
// Portable export / restore / verify for the design library.
//
//   node scripts/export-library.mjs index   [--check]
//   node scripts/export-library.mjs export  --out DIR [--category rugs,throws] [--zip] [--force]
//   node scripts/export-library.mjs restore --from DIR [--apply] [--force]
//   node scripts/export-library.mjs verify  --from DIR [--deep]
//   (every mode also takes --repo-root DIR; default: the repo this script lives in)
//
// The library is src/assets/<dir>/slide_NNN/data.json (specs) plus
// public/images/<dir>/slide_NNN/* (pictures). Folder and file NAMES in the
// backup are decided by scripts/lib/library-index.mjs, the same module the
// Google Drive sync reads (through library-index.json), so an export, the
// Drive folder and a download of the Drive folder all look like this:
//
//   <Category name>/<design.folder>/<design.folder>_<original file name>
//   <Category name>/<design.folder>/design.json
//   (an export adds catalog.csv, catalog.json and README.txt at the top)
//
// design.json is all `restore` and `verify` need from a backup, so they work
// on an export and on a plain download of the Drive folder alike. Plain Node
// 22 (also runs under bun), no dependencies.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, pad3, buildIndex, serializeIndex, backupFileName, rawUrl, siteUrl } from './lib/library-index.mjs';

const SCRIPT_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_JSON = 'design.json';
const CONCURRENCY = 16;
const SHOW_LIMIT = 25; // lines listed per problem group unless --verbose

const CSV_COLUMNS = [
  'Category', 'Style No.', 'Slide', 'Description', 'Technique', 'Content', 'Size', 'Season', 'Country',
  'Files', 'Folder (relative path)', 'Lifestyle', 'Image 1', 'Back', 'Image 2', 'Website image URL',
];

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// small helpers

const FLAGS = {
  index: { bool: ['check'], value: [] },
  export: { bool: ['zip', 'force'], value: ['out', 'category'] },
  restore: { bool: ['apply', 'force', 'verbose'], value: ['from'] },
  verify: { bool: ['deep', 'verbose'], value: ['from', 'category'] },
};

const USAGE = `usage:
  node scripts/export-library.mjs index   [--check]
  node scripts/export-library.mjs export  --out DIR [--category rugs,throws,...] [--zip] [--force]
  node scripts/export-library.mjs restore --from DIR [--apply] [--force] [--verbose]
  node scripts/export-library.mjs verify  --from DIR [--deep] [--category rugs,...] [--verbose]
every mode also takes --repo-root DIR (default: the repo this script lives in)

  index    rewrite library-index.json from the repo; --check only reports whether it is stale (exit 1)
  export   build the backup layout (Category/Style/pictures + design.json, catalog, README) in DIR
  restore  rebuild public/images + src/assets from an export or a download of the Drive folder
           (dry run unless --apply; never overwrites a different file unless --force)
  verify   compare an export / downloaded Drive folder with the repo; --deep also compares sha1,
           --category limits the check to some categories (for a partial export)`;

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (!mode || ['help', '-h', '--help'].includes(mode)) return { mode: 'help' };
  const spec = FLAGS[mode];
  if (!spec) throw new CliError(`unknown mode "${mode}"\n${USAGE}`, 2);
  const opts = { mode };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '-h' || arg === '--help') return { mode: 'help' };
    if (!arg.startsWith('--')) throw new CliError(`unexpected argument "${arg}"\n${USAGE}`, 2);
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (spec.bool.includes(name)) {
      if (inline !== undefined) throw new CliError(`--${name} does not take a value`, 2);
      opts[key] = true;
    } else if (spec.value.includes(name) || name === 'repo-root') {
      const value = inline ?? rest[++i];
      if (value === undefined || value.startsWith('--')) throw new CliError(`--${name} needs a value`, 2);
      opts[key] = value;
    } else {
      throw new CliError(`unknown option --${name} for "${mode}"\n${USAGE}`, 2);
    }
  }
  return opts;
}

const fmtN = (n) => n.toLocaleString('en-US');
function fmtBytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${fmtN(n)} B`;
}
const fmtSecs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const jsonText = (obj) => JSON.stringify(obj, null, 2) + '\n';
const slideDir = (slide) => `slide_${pad3(slide)}`;
const keyOf = (dir, slide) => `${dir}/${slideDir(slide)}`;
const catOf = (d) => CATEGORIES.find((c) => c.id === d.cat);
const stemOf = (name) => name.replace(/\.[^.]+$/, '');
const pickFile = (d, stem) => d.files.find((f) => stemOf(f.name) === stem);
const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** Runs fn over items with at most `limit` in flight; stops pulling new items after the first error. */
async function pool(items, limit, fn) {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        await fn(items[i], i);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Prints "label: NN%" at every 10% for big jobs; quiet for small ones. */
function ticker(label, total) {
  let done = 0;
  let nextPct = 10;
  return () => {
    done++;
    if (total < 200) return;
    const pct = Math.floor((done * 100) / total);
    if (pct >= nextPct) {
      console.log(`  ${label}: ${pct}% (${fmtN(done)}/${fmtN(total)})`);
      nextPct = (Math.floor(pct / 10) + 1) * 10;
    }
  };
}

const sha1 = async (file) => crypto.createHash('sha1').update(await fsp.readFile(file)).digest('hex');

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

/** realpath of the deepest existing ancestor + the part that does not exist yet. */
function realish(p) {
  let cur = path.resolve(p);
  const rest = [];
  while (!fs.existsSync(cur)) {
    const up = path.dirname(cur);
    if (up === cur) break;
    rest.unshift(path.basename(cur));
    cur = up;
  }
  return path.join(fs.realpathSync(cur), ...rest);
}
function isInside(child, parent) {
  const r = path.relative(parent, child);
  return r === '' || (r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r));
}

function resolveRepoRoot(opts, { needsLibrary = true } = {}) {
  const root = path.resolve(opts.repoRoot ?? SCRIPT_REPO);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new CliError(`--repo-root ${root} is not a folder`);
  if (needsLibrary && !fs.existsSync(path.join(root, 'src/assets'))) {
    throw new CliError(`${root} has no src/assets folder - not the CHD website repo (use --repo-root DIR)`);
  }
  return root;
}

function resolveCategories(list) {
  if (!list) return new Set(CATEGORIES.map((c) => c.id));
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const chosen = new Set();
  for (const token of list.split(',').map((t) => t.trim()).filter(Boolean)) {
    const hit = CATEGORIES.find((c) => [c.id, c.dir, c.name].some((v) => norm(v) === norm(token)));
    if (!hit) throw new CliError(`unknown category "${token}" - use: ${CATEGORIES.map((c) => c.id).join(', ')}`, 2);
    chosen.add(hit.id);
  }
  if (!chosen.size) throw new CliError('--category is empty', 2);
  return chosen;
}

/** The design.json object for one design (also the base of its catalog.json record). */
function designRecord(index, d) {
  return {
    category: d.cat,
    categoryName: catOf(d).name,
    dir: d.dir,
    slide: d.slide,
    style: d.style,
    folder: d.folder,
    specs: d.specs,
    files: d.files.map((f) => ({ original: f.name, backup: backupFileName(d, f.name), bytes: f.bytes })),
    source: { repo: index.repo, branch: index.branch, path: `public/images/${d.dir}/${slideDir(d.slide)}` },
  };
}

// ---------------------------------------------------------------------------
// index

function describeIndexDiff(oldText, fresh) {
  let old;
  try {
    old = JSON.parse(oldText);
  } catch {
    return ['library-index.json is not valid JSON'];
  }
  const toMap = (list) => new Map((list ?? []).map((d) => [keyOf(d.dir, d.slide), JSON.stringify(d)]));
  const a = toMap(old.designs);
  const b = toMap(fresh.designs);
  const added = [...b.keys()].filter((k) => !a.has(k));
  const removed = [...a.keys()].filter((k) => !b.has(k));
  const changed = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k));
  const lines = [];
  const sample = (label, keys) => keys.length && lines.push(`${keys.length} design(s) ${label}: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', ...' : ''}`);
  sample('in the repo but not in the index', added);
  sample('in the index but gone from the repo', removed);
  sample('whose specs or files changed', changed);
  if (!lines.length) lines.push('same designs, but the header or formatting differs');
  return lines;
}

async function cmdIndex(opts) {
  const root = resolveRepoRoot(opts);
  const file = path.join(root, 'library-index.json');
  const fresh = buildIndex(root);
  const freshText = serializeIndex(fresh);
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  // compare with line endings normalised so a CRLF checkout (autocrlf) is not "stale"
  const same = current !== null && current.replace(/\r\n/g, '\n') === freshText;
  if (opts.check) {
    if (same) {
      console.log(`library-index.json is up to date (${fmtN(fresh.count)} designs)`);
      return 0;
    }
    console.log(current === null ? 'library-index.json does not exist' : 'library-index.json is STALE:');
    if (current !== null) for (const l of describeIndexDiff(current, fresh)) console.log(`  - ${l}`);
    console.log('fix: node scripts/export-library.mjs index   (then commit library-index.json)');
    return 1;
  }
  if (same) {
    console.log(`library-index.json unchanged (${fmtN(fresh.count)} designs)`);
    return 0;
  }
  fs.writeFileSync(file, freshText);
  console.log(`library-index.json written (${fmtN(fresh.count)} designs)`);
  return 0;
}

// ---------------------------------------------------------------------------
// export

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Same rule as cell_() in chd-library-backup.gs, so catalog.csv and the Drive Catalog sheet stay identical:
 *  text starting with = + - @ would be read as a formula by Excel / Sheets, so it gets a leading space. */
function sheetText(v) {
  if (v === undefined || v === null) return '';
  const t = String(v);
  return /^[=+\-@]/.test(t) ? ` ${t}` : t;
}

function buildCatalog(index, designs, stats, exportedAt) {
  const rows = [];
  const records = [];
  for (const d of designs) {
    const cat = catOf(d);
    const folderRel = `${cat.name}/${d.folder}`;
    const relFile = (f) => (f ? `${folderRel}/${backupFileName(d, f.name)}` : '');
    const web = pickFile(d, 'lifestyle') ?? pickFile(d, 'image_01') ?? d.files.find((f) => f.name !== 'data.json');
    const s = d.specs;
    rows.push([
      cat.name, sheetText(d.style), d.slide, sheetText(s.description), sheetText(s.technique), sheetText(s.content), sheetText(s.size), sheetText(s.season),
      sheetText(s.country), // only if the specs have one (none do today; the website itself falls back to INDIA)
      d.files.length, folderRel,
      relFile(pickFile(d, 'lifestyle')), relFile(pickFile(d, 'image_01')), relFile(pickFile(d, 'back')), relFile(pickFile(d, 'image_02')),
      web ? siteUrl(index, d, web.name) : '',
    ]);
    const rec = designRecord(index, d);
    records.push({
      ...rec,
      path: folderRel,
      files: d.files.map((f) => ({
        original: f.name,
        backup: backupFileName(d, f.name),
        bytes: f.bytes,
        path: relFile(f),
        siteUrl: siteUrl(index, d, f.name),
        rawUrl: rawUrl(index, d, f.name),
      })),
    });
  }
  // UTF-8 BOM so Excel reads accents/quotes correctly; CRLF lines are the CSV standard
  const csv = '\uFEFF' + [CSV_COLUMNS, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const json = jsonText({
    version: index.version,
    repo: index.repo,
    branch: index.branch,
    siteBase: index.siteBase,
    exportedAt,
    designCount: stats.designs,
    fileCount: stats.files,
    bytes: stats.bytes,
    categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, dir: c.dir, designs: designs.filter((d) => d.cat === c.id).length })).filter((c) => c.designs),
    designs: records,
  });
  return { csv, json };
}

function buildReadme(index, stats, perCat, exportedAt, zipped) {
  const L = [];
  L.push('CHD DESIGN LIBRARY - EXPORT');
  L.push('===========================');
  L.push(`Created : ${exportedAt}`);
  L.push(`Source  : github.com/${index.repo} (branch ${index.branch}), website ${index.siteBase}`);
  L.push(`Content : ${fmtN(stats.designs)} designs, ${fmtN(stats.files)} picture files, ${fmtBytes(stats.bytes)}`);
  L.push(`          ${perCat.map((c) => `${c.name} ${fmtN(c.designs)}`).join(', ')}`);
  L.push('');
  L.push('WHAT THIS IS');
  L.push('  Every product design of the Creative Home Decor website library: one folder per');
  L.push('  design with its pictures and its specs (description, technique, content, size,');
  L.push('  season) side by side. It needs no website, GitHub or Google Drive to be used.');
  L.push('');
  L.push('LAYOUT');
  L.push('  <Category>/<Style folder>/<Style folder>_<picture name>   the pictures');
  L.push('  <Category>/<Style folder>/design.json                     the specs + file list of that design');
  L.push('  catalog.csv    one row per design - open it in Excel or Google Sheets');
  L.push('  catalog.json   the same, complete, for programs (adds a website and a GitHub URL per picture)');
  L.push('  README.txt     this file');
  if (zipped) L.push('  <Category>.zip one zip per category folder, for easy transfer');
  L.push('');
  L.push('NAMING RULES');
  L.push('  Style folder  = the style number made safe for file names: every run of characters other');
  L.push('                  than letters, digits, . _ - becomes "_" (so "CHD-TR-1018 (A)" is the');
  L.push('                  folder CHD-TR-1018_A).');
  L.push('  Same style published twice: the first keeps the plain name, later ones end in');
  L.push('                  __slide_NNN (for example CHD-RG-1337__slide_072).');
  L.push('  Every picture starts with its folder name (CHD-RG-1120_lifestyle.png), so it stays');
  L.push('                  identifiable after it leaves its folder.');
  L.push('  Pictures      = lifestyle (the product shown in a room or scene), image_01 (front picture),');
  L.push('                  image_02 (close-up), back (back side, a few designs), image_03 / image_04');
  L.push('                  (extra pictures, a few designs). Some folders also hold a <name>_data.json,');
  L.push('                  a spec file that was stored among the pictures; design.json has the specs.');
  L.push('  Some designs have no lifestyle picture; their Lifestyle column in catalog.csv is empty.');
  L.push('');
  L.push('USING IT TO UPLOAD DESIGNS SOMEWHERE ELSE (marketplace, another website)');
  L.push('  1. Open catalog.csv and find the design by Style No. (filter by Category if needed).');
  L.push('  2. Specs: the Description, Technique, Content, Size, Season and Country columns');
  L.push('     (a column is empty when the design has no such spec; fill it in on the upload form).');
  L.push('  3. Pictures: the Lifestyle, Image 1, Back and Image 2 columns give the picture path');
  L.push('     from this top folder; upload straight from the design folder. "Files" counts every');
  L.push('     file in it (image_03 / image_04 are only in the folder, design.json and catalog.json).');
  L.push('  4. "Website image URL" is the live picture on the website (lifestyle, or image_01 when');
  L.push('     the design has no lifestyle picture) for tools that fetch pictures by link.');
  L.push('  5. Programs: read design.json (one design) or catalog.json (all designs).');
  L.push('');
  L.push('RESTORING THE WEBSITE FOLDERS (e.g. if GitHub were ever lost)');
  L.push('  You need Node.js 22 (or bun) and two small files of the website repo (github.com/' + index.repo + '):');
  L.push('  scripts/export-library.mjs and scripts/lib/library-index.mjs. This backup does not contain');
  L.push('  them, so keep a copy of both next to it (same two paths) in case GitHub is not there later.');
  L.push('  Run these in the website repo, or in an empty folder that holds just those two files:');
  L.push('    node scripts/export-library.mjs restore --from "<this folder>"          (dry run: shows the plan)');
  L.push('    node scripts/export-library.mjs restore --from "<this folder>" --apply  (writes the files)');
  L.push('  It recreates public/images/<category>/slide_NNN/ (pictures) and');
  L.push('  src/assets/<category>/slide_NNN/data.json (specs), and never overwrites a different');
  L.push('  file unless you add --force.');
  L.push('  The small card pictures (card.webp) are not part of the backup. In a copy of the website');
  L.push('  repo with its packages installed (bun install or npm install), run');
  L.push('  node scripts/build-card-images.mjs to make them again.');
  L.push('  The same command works on a plain download of the Google Drive folder. If Drive hands you');
  L.push('  several zip files, unzip them all into one and the same folder first.');
  L.push('  To check a copy against the repo: node scripts/export-library.mjs verify --from "<folder>" --deep');
  L.push('');
  return L.join('\n') + '\n';
}

/** Zips each category folder next to the folders: system `zip`, else python3's zipfile. Returns [{name, bytes}]. */
function zipCategories(out, catNames) {
  const ok = (cmd, args) => {
    const r = spawnSync(cmd, args, { stdio: 'ignore' });
    return !r.error && r.status === 0;
  };
  let tool = null;
  if (ok('zip', ['-v'])) tool = 'zip';
  else if (ok('python3', ['-c', 'import zipfile'])) tool = 'python3';
  if (!tool) {
    console.log('zip: neither the "zip" command nor python3 (zipfile) is available - zips were NOT created (folders are complete).');
    return [];
  }
  const py = [
    'import os, sys, zipfile',
    'root, name = sys.argv[1], sys.argv[2]',
    "with zipfile.ZipFile(os.path.join(root, name + '.zip'), 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as z:",
    '    for base, dirs, files in os.walk(os.path.join(root, name)):',
    '        dirs.sort()',
    '        for f in sorted(files):',
    '            p = os.path.join(base, f)',
    "            z.write(p, os.path.relpath(p, root).replace(os.sep, '/'))",
  ].join('\n');
  const made = [];
  for (const name of catNames) {
    const zipFile = path.join(out, `${name}.zip`);
    fs.rmSync(zipFile, { force: true }); // a re-export must not keep stale entries
    const r = tool === 'zip'
      ? spawnSync('zip', ['-r', '-q', '-X', '-1', `${name}.zip`, name], { cwd: out, encoding: 'utf8' })
      : spawnSync('python3', ['-I', '-c', py, out, name], { encoding: 'utf8' });
    if (r.error || r.status !== 0) throw new CliError(`${tool} failed for ${name}: ${r.error?.message ?? r.stderr}`);
    made.push({ name: `${name}.zip`, bytes: fs.statSync(zipFile).size });
  }
  console.log(`zip: ${made.length} file(s) made with ${tool}`);
  return made;
}

async function cmdExport(opts) {
  if (!opts.out) throw new CliError('export needs --out DIR', 2);
  const root = resolveRepoRoot(opts);
  const out = path.resolve(opts.out);
  if (isInside(realish(out), realish(root))) {
    throw new CliError(`--out ${out} is inside the repo (${root}); pick a folder outside it, e.g. ../library-export`);
  }
  if (fs.existsSync(out)) {
    if (!fs.statSync(out).isDirectory()) throw new CliError(`--out ${out} exists and is not a folder`);
    if (fs.readdirSync(out).length && !opts.force) {
      throw new CliError(`${out} is not empty; use an empty folder, or --force (same-named files are overwritten, nothing is deleted)`);
    }
  }
  const wanted = resolveCategories(opts.category);
  const t0 = Date.now();
  const index = buildIndex(root);
  const designs = index.designs.filter((d) => wanted.has(d.cat));
  if (!designs.length) throw new CliError('no designs found to export');
  const committed = path.join(root, 'library-index.json');
  if (!fs.existsSync(committed) || fs.readFileSync(committed, 'utf8').replace(/\r\n/g, '\n') !== serializeIndex(index)) {
    console.log('note: library-index.json is out of date (this export is built from the repo itself); run: node scripts/export-library.mjs index');
  }

  // plan: every picture copy + one design.json per design
  const copies = [];
  const folders = new Set();
  const stats = { designs: designs.length, files: 0, bytes: 0 };
  for (const d of designs) {
    const folderAbs = path.join(out, catOf(d).name, d.folder);
    folders.add(folderAbs);
    for (const f of d.files) {
      copies.push({ src: path.join(root, 'public/images', d.dir, slideDir(d.slide), f.name), dst: path.join(folderAbs, backupFileName(d, f.name)), bytes: f.bytes });
      stats.files++;
      stats.bytes += f.bytes;
    }
  }
  console.log(`export: ${fmtN(stats.designs)} designs, ${fmtN(stats.files)} files, ${fmtBytes(stats.bytes)} -> ${out}`);
  for (const folder of folders) await fsp.mkdir(folder, { recursive: true });

  const tick = ticker('copy', copies.length);
  await pool(copies, CONCURRENCY, async (c) => {
    await fsp.copyFile(c.src, c.dst, fs.constants.COPYFILE_FICLONE); // reflink where the filesystem has it, else a plain copy
    const size = (await fsp.stat(c.dst)).size;
    if (size !== c.bytes) throw new CliError(`${c.src} is ${size} bytes but the index says ${c.bytes} - did the repo change during the export?`);
    tick();
  });
  for (const d of designs) {
    await fsp.writeFile(path.join(out, catOf(d).name, d.folder, DESIGN_JSON), jsonText(designRecord(index, d)));
  }

  const exportedAt = new Date().toISOString();
  const perCat = CATEGORIES.filter((c) => wanted.has(c.id)).map((c) => ({ ...c, designs: designs.filter((d) => d.cat === c.id).length })).filter((c) => c.designs);
  const { csv, json } = buildCatalog(index, designs, stats, exportedAt);
  await fsp.writeFile(path.join(out, 'catalog.csv'), csv);
  await fsp.writeFile(path.join(out, 'catalog.json'), json);
  const zips = opts.zip ? zipCategories(out, perCat.map((c) => c.name)) : [];
  await fsp.writeFile(path.join(out, 'README.txt'), buildReadme(index, stats, perCat, exportedAt, zips.length > 0));

  console.log(`export done: ${fmtN(stats.designs)} designs, ${fmtN(stats.files)} files (+ ${fmtN(stats.designs)} design.json, catalog.csv, catalog.json, README.txt), ${fmtBytes(stats.bytes)} in ${fmtSecs(Date.now() - t0)}`);
  for (const z of zips) console.log(`  ${z.name}  ${fmtBytes(z.bytes)}`);
  return 0;
}

// ---------------------------------------------------------------------------
// reading a backup (export or downloaded Drive folder): restore + verify

const safeName = (s) => typeof s === 'string' && s.length > 0 && s.length <= 200 && !/[\\/\0]/.test(s) && s !== '.' && s !== '..';

/** Reasons a design.json cannot be trusted; names become file paths, so they are checked hard. */
function validateDesign(dj) {
  if (!dj || typeof dj !== 'object' || Array.isArray(dj)) return ['not a JSON object'];
  const errs = [];
  if (!CATEGORIES.some((c) => c.dir === dj.dir)) errs.push(`unknown "dir" ${JSON.stringify(dj.dir)}`);
  if (!Number.isInteger(dj.slide) || dj.slide < 0 || dj.slide > 999999) errs.push(`bad "slide" ${JSON.stringify(dj.slide)}`);
  if (!dj.specs || typeof dj.specs !== 'object' || Array.isArray(dj.specs)) errs.push('"specs" is not an object');
  if (!Array.isArray(dj.files)) {
    errs.push('"files" is not a list');
    return errs;
  }
  const originals = new Set();
  const backups = new Set();
  dj.files.forEach((f, i) => {
    if (!f || typeof f !== 'object') return errs.push(`files[${i}] is not an object`);
    if (!safeName(f.original)) errs.push(`files[${i}].original is not a plain file name`);
    if (!safeName(f.backup)) errs.push(`files[${i}].backup is not a plain file name`);
    if (!Number.isInteger(f.bytes) || f.bytes < 0) errs.push(`files[${i}].bytes is not a size`);
    if (originals.has(f.original)) errs.push(`"${f.original}" is listed twice`);
    if (backups.has(f.backup)) errs.push(`"${f.backup}" is listed twice`);
    originals.add(f.original);
    backups.add(f.backup);
  });
  return errs;
}

async function findDesignJsons(root) {
  const found = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) stack.push(path.join(dir, e.name));
      else if (e.isFile() && e.name === DESIGN_JSON) found.push(path.join(dir, e.name));
    }
  }
  return found.sort();
}

/** Loads every design.json under root. entries: "dir/slide_NNN" -> {dj, folderAbs, where}. */
async function loadBackup(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new CliError(`${root} is not a folder`);
  const files = await findDesignJsons(root);
  const entries = new Map();
  const problems = [];
  for (const file of files) {
    const where = path.relative(root, file).split(path.sep).join('/');
    let dj;
    try {
      dj = JSON.parse(stripBom(await fsp.readFile(file, 'utf8')));
    } catch (e) {
      problems.push(`${where}: not valid JSON (${e.message})`);
      continue;
    }
    const errs = validateDesign(dj);
    if (errs.length) {
      problems.push(`${where}: invalid design.json - ${errs.join('; ')}`);
      continue;
    }
    const key = keyOf(dj.dir, dj.slide);
    if (entries.has(key)) {
      problems.push(`${where}: second design.json for ${key} (first: ${entries.get(key).where}); this one is ignored`);
      continue;
    }
    entries.set(key, { key, dj, folderAbs: path.dirname(file), where });
  }
  return { count: files.length, entries, problems };
}

const catIndex = (dir) => CATEGORIES.findIndex((c) => c.dir === dir);
const byLibraryOrder = (a, b) => catIndex(a.dj.dir) - catIndex(b.dj.dir) || a.dj.slide - b.dj.slide;

function listProblems(title, lines, verbose) {
  if (!lines.length) return;
  console.log(`\n${title} (${fmtN(lines.length)}):`);
  for (const l of verbose ? lines : lines.slice(0, SHOW_LIMIT)) console.log(`  - ${l}`);
  if (!verbose && lines.length > SHOW_LIMIT) console.log(`  ... and ${fmtN(lines.length - SHOW_LIMIT)} more (add --verbose to list all)`);
}

// ---------------------------------------------------------------------------
// restore

async function classifyTarget(item) {
  let st;
  try {
    st = await fsp.lstat(item.target);
  } catch (e) {
    if (e.code === 'ENOENT') return { state: 'new' };
    throw e;
  }
  if (!st.isFile()) return { state: 'differs', why: 'exists but is not a regular file' };
  if (item.kind === 'specs') {
    try {
      const current = JSON.parse(stripBom(await fsp.readFile(item.target, 'utf8')));
      return deepEqual(current, item.specs) ? { state: 'same' } : { state: 'differs', why: 'specs differ' };
    } catch {
      return { state: 'differs', why: 'not valid JSON' };
    }
  }
  if (st.size !== item.bytes) return { state: 'differs', why: `${fmtN(st.size)} bytes here, ${fmtN(item.bytes)} in the backup` };
  const [a, b] = await Promise.all([fsp.readFile(item.src), fsp.readFile(item.target)]);
  return a.equals(b) ? { state: 'same' } : { state: 'differs', why: 'same size, different content' };
}

/** Writes via a temp file + rename so an interrupted run never leaves a half-written picture under its real name. */
async function writeTarget(item) {
  await fsp.mkdir(path.dirname(item.target), { recursive: true });
  const tmp = `${item.target}.tmp-${process.pid}`;
  try {
    if (item.kind === 'specs') {
      await fsp.writeFile(tmp, item.text);
    } else {
      await fsp.copyFile(item.src, tmp, fs.constants.COPYFILE_FICLONE);
      const size = (await fsp.stat(tmp)).size;
      if (size !== item.bytes) throw new Error(`copied ${size} bytes, expected ${item.bytes}`);
    }
    await fsp.rename(tmp, item.target);
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}

async function cmdRestore(opts) {
  if (!opts.from) throw new CliError('restore needs --from DIR', 2);
  const root = resolveRepoRoot(opts, { needsLibrary: false });
  const from = path.resolve(opts.from);
  const t0 = Date.now();
  const backup = await loadBackup(from);
  const problems = [...backup.problems];
  if (!backup.count) throw new CliError(`no design.json found under ${from} - is this an export or a download of the Drive folder?`);

  // 1. every picture a design.json lists must be there with the right size; a design with a bad file is skipped whole
  const good = [];
  for (const e of [...backup.entries.values()].sort(byLibraryOrder)) {
    const bad = [];
    for (const f of e.dj.files) {
      let st = null;
      try {
        st = await fsp.stat(path.join(e.folderAbs, f.backup));
      } catch {
        /* missing */
      }
      if (!st || !st.isFile()) bad.push(`${f.backup} is missing`);
      else if (st.size !== f.bytes) bad.push(`${f.backup} is ${fmtN(st.size)} bytes, design.json says ${fmtN(f.bytes)}`);
    }
    if (bad.length) problems.push(`${path.dirname(e.where)} (${e.key}) skipped: ${bad.join('; ')}`);
    else good.push(e);
  }

  // 2. plan: where each file goes, and what is already there
  const items = [];
  for (const e of good) {
    const { dir, slide, specs } = e.dj;
    for (const f of e.dj.files) {
      items.push({ kind: 'image', key: e.key, src: path.join(e.folderAbs, f.backup), bytes: f.bytes, target: path.join(root, 'public/images', dir, slideDir(slide), f.original) });
    }
    items.push({ kind: 'specs', key: e.key, specs, text: jsonText(specs), target: path.join(root, 'src/assets', dir, slideDir(slide), 'data.json') });
  }
  const tick = ticker('compare', items.length);
  await pool(items, CONCURRENCY, async (item) => {
    Object.assign(item, await classifyTarget(item));
    tick();
  });
  const count = (state) => items.filter((i) => i.state === state);
  const fresh = count('new');
  const same = count('same');
  const differs = count('differs');
  const rel = (i) => path.relative(root, i.target).split(path.sep).join('/');

  console.log(`restore ${opts.apply ? '' : '(dry run - nothing is written) '}from ${from}`);
  console.log(`  into repo : ${root}`);
  console.log(`  designs   : ${fmtN(good.length)} usable${backup.entries.size > good.length ? `, ${fmtN(backup.entries.size - good.length)} skipped` : ''} (${CATEGORIES.map((c) => [c.name, good.filter((e) => e.dj.dir === c.dir).length]).filter(([, n]) => n).map(([n, c]) => `${n} ${fmtN(c)}`).join(', ') || 'none'})`);
  const kinds = (list) => `${fmtN(list.filter((i) => i.kind === 'image').length)} picture file(s) + ${fmtN(list.filter((i) => i.kind === 'specs').length)} data.json`;
  console.log(`  to create : ${kinds(fresh)} (${fmtBytes(fresh.reduce((n, i) => n + (i.bytes ?? 0), 0))} of pictures)`);
  console.log(`  identical : ${kinds(same)} already match (left alone)`);
  console.log(`  different : ${kinds(differs)} exist with other content${differs.length ? (opts.force ? ' (will be overwritten: --force)' : ' (kept; --force overwrites)') : ''}`);
  console.log(`  problems  : ${fmtN(problems.length)}`);
  listProblems('Problems in the backup', problems, opts.verbose);
  listProblems('Existing files that differ from the backup', differs.map((i) => `${rel(i)} - ${i.why}`), opts.verbose);

  if (!opts.apply) {
    if (!fresh.length && !differs.length) console.log('\nNothing to restore: the repo already holds everything in this backup.');
    else console.log(`\nDry run only. Re-run with --apply to write ${fmtN(fresh.length)} new file(s)${differs.length ? ` (add --force to also overwrite the ${fmtN(differs.length)} different one(s))` : ''}.`);
    return problems.length ? 1 : 0;
  }

  // 3. apply
  const todo = [...fresh, ...(opts.force ? differs : [])];
  const failed = [];
  const tickW = ticker('write', todo.length);
  await pool(todo, CONCURRENCY, async (item) => {
    try {
      await writeTarget(item);
    } catch (e) {
      failed.push(`${rel(item)}: ${e.message}`);
    }
    tickW();
  });
  const kept = opts.force ? [] : differs;
  listProblems('Could not write', failed, opts.verbose);
  console.log(`\nrestored ${fmtN(todo.length - failed.length)} file(s) in ${fmtSecs(Date.now() - t0)}; ${fmtN(same.length)} already identical${kept.length ? `; ${fmtN(kept.length)} different file(s) kept (re-run with --force to overwrite)` : ''}${problems.length ? `; ${fmtN(problems.length)} problem(s) in the backup listed above` : ''}.`);
  if (todo.length) {
    const hasBuilder = fs.existsSync(path.join(root, 'scripts/build-card-images.mjs'));
    console.log(hasBuilder
      ? 'Next: run  node scripts/build-card-images.mjs  (needs the repo packages: bun install) to regenerate the card images (card.webp is not part of the backup).'
      : 'Next: copy public/ and src/ into a copy of the website repo, install its packages (bun install) and run  node scripts/build-card-images.mjs  to regenerate the card images (card.webp is not part of the backup).');
  }
  return problems.length || failed.length || kept.length ? 1 : 0;
}

// ---------------------------------------------------------------------------
// verify

async function cmdVerify(opts) {
  if (!opts.from) throw new CliError('verify needs --from DIR', 2);
  const root = resolveRepoRoot(opts);
  const from = path.resolve(opts.from);
  const t0 = Date.now();
  const wanted = resolveCategories(opts.category);
  const index = buildIndex(root);
  const repoKeys = new Set(index.designs.map((d) => keyOf(d.dir, d.slide)));
  index.designs = index.designs.filter((d) => wanted.has(d.cat)); // --category: check only part of the library (a partial export)
  index.count = index.designs.length;
  const backup = await loadBackup(from);
  if (!backup.count) throw new CliError(`no design.json found under ${from} - is this an export or a download of the Drive folder?`);

  const expectedFiles = index.designs.reduce((n, d) => n + d.files.length, 0);
  const missingDesigns = [];
  const missingFiles = [];
  const sizeDiff = [];
  const contentDiff = [];
  const jsonDiff = [];
  const layoutNotes = [];
  const extraFiles = [];
  const jobs = [];
  let designsPresent = 0;
  let filesPresent = 0;
  let sizesEqual = 0;
  let contentEqual = 0;

  for (const d of index.designs) {
    const cat = catOf(d);
    const label = `${cat.name}/${d.folder}`;
    const e = backup.entries.get(keyOf(d.dir, d.slide));
    if (!e) {
      missingDesigns.push(`${label} (${keyOf(d.dir, d.slide)}, ${d.files.length} files)`);
      continue;
    }
    designsPresent++;
    const dj = e.dj;
    const diffs = [];
    if (dj.folder !== d.folder) diffs.push(`folder "${dj.folder}" vs "${d.folder}" in the repo`);
    if (dj.style !== d.style) diffs.push(`style "${dj.style}" vs "${d.style}" in the repo`);
    if (!deepEqual(dj.specs, d.specs)) diffs.push('specs differ from the repo');
    const listed = new Map(dj.files.map((f) => [f.original, f]));
    for (const f of d.files) {
      const jf = listed.get(f.name);
      if (!jf) {
        missingFiles.push(`${label}: ${f.name} is not listed in design.json`);
        continue;
      }
      if (jf.bytes !== f.bytes) diffs.push(`${f.name}: design.json says ${fmtN(jf.bytes)} bytes, repo has ${fmtN(f.bytes)}`);
      if (jf.backup !== backupFileName(d, f.name)) diffs.push(`${f.name}: stored as "${jf.backup}", expected "${backupFileName(d, f.name)}"`);
      const file = path.join(e.folderAbs, jf.backup);
      let st = null;
      try {
        st = await fsp.stat(file);
      } catch {
        /* missing */
      }
      if (!st || !st.isFile()) {
        missingFiles.push(`${label}: ${jf.backup} is missing from the backup`);
        continue;
      }
      filesPresent++;
      if (st.size !== f.bytes) {
        sizeDiff.push(`${label}: ${jf.backup} is ${fmtN(st.size)} bytes, repo has ${fmtN(f.bytes)}`);
        continue;
      }
      sizesEqual++;
      if (opts.deep) jobs.push({ label, name: jf.backup, backupFile: file, repoFile: path.join(root, 'public/images', d.dir, slideDir(d.slide), f.name) });
    }
    for (const jf of dj.files) {
      if (!d.files.some((f) => f.name === jf.original)) extraFiles.push(`${label}: ${jf.original}`);
    }
    if (diffs.length) jsonDiff.push(`${label}: ${diffs.join('; ')}`);
    const segs = path.dirname(e.where).split('/');
    if (segs.slice(-2).join('/') !== label) layoutNotes.push(`${label}: found at ${path.dirname(e.where)} (expected .../${label})`);
  }

  if (opts.deep) {
    const tick = ticker('sha1', jobs.length);
    await pool(jobs, Math.min(CONCURRENCY, 8), async (j) => {
      const [a, b] = await Promise.all([sha1(j.backupFile), sha1(j.repoFile)]);
      if (a === b) contentEqual++;
      else contentDiff.push(`${j.label}: ${j.name} has other content than the repo (same size)`);
      tick();
    });
  }
  const inScope = (e) => wanted.has(CATEGORIES.find((c) => c.dir === e.dj.dir).id);
  const extraDesigns = [...backup.entries.values()].filter((e) => inScope(e) && !repoKeys.has(e.key)).sort(byLibraryOrder).map((e) => `${e.dj.categoryName ?? e.dj.dir}/${e.dj.folder ?? e.dj.style ?? e.key}`);

  const ratio = (a, b) => `${fmtN(a)} / ${fmtN(b)}`;
  console.log(`verify ${from}`);
  console.log(`  against repo : ${root} (${fmtN(index.count)} designs, ${fmtN(expectedFiles)} files, ${fmtBytes(index.designs.reduce((n, d) => n + d.files.reduce((m, f) => m + f.bytes, 0), 0))})`);
  console.log(`  designs found in the backup : ${ratio(designsPresent, index.count)}`);
  console.log(`  files present               : ${ratio(filesPresent, expectedFiles)}`);
  console.log(`  file sizes equal            : ${ratio(sizesEqual, expectedFiles)}`);
  console.log(`  content equal (sha1)        : ${opts.deep ? ratio(contentEqual, expectedFiles) : 'not checked - add --deep'}`);
  listProblems('Unreadable or invalid design.json', backup.problems, opts.verbose);
  listProblems('Designs missing from the backup', missingDesigns, opts.verbose);
  listProblems('Files missing', missingFiles, opts.verbose);
  listProblems('Files with a different size', sizeDiff, opts.verbose);
  listProblems('Files with different content', contentDiff, opts.verbose);
  listProblems('design.json does not match the repo', jsonDiff, opts.verbose);
  const total = missingDesigns.length + missingFiles.length + sizeDiff.length + contentDiff.length + jsonDiff.length + backup.problems.length;
  listProblems('Notes (not failures): layout differs from <Category>/<Style folder>', layoutNotes, opts.verbose);
  listProblems('Notes (not failures): designs only in the backup (removed from the repo since)', extraDesigns, opts.verbose);
  listProblems('Notes (not failures): files only in the backup (removed from the repo since)', extraFiles, opts.verbose);
  console.log(`\n${total ? `RESULT: PROBLEMS FOUND (${fmtN(total)})` : 'RESULT: OK - the backup has every design and file of the repo'} [${fmtSecs(Date.now() - t0)}]`);
  return total ? 1 : 0;
}

// ---------------------------------------------------------------------------
const RUN = { index: cmdIndex, export: cmdExport, restore: cmdRestore, verify: cmdVerify };

try {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mode === 'help') {
    console.log(USAGE);
    process.exitCode = process.argv.length > 2 ? 0 : 1;
  } else {
    process.exitCode = await RUN[opts.mode](opts);
  }
} catch (e) {
  // anything unexpected (a file vanished mid-run, a disk error) still ends as one readable line; CHD_DEBUG=1 adds the stack
  console.error(`error: ${e.message}`);
  if (process.env.CHD_DEBUG) console.error(e.stack);
  process.exitCode = e instanceof CliError ? e.code : 1;
}
