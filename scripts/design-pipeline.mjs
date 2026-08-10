#!/usr/bin/env node

/**
 * CHD Design Pipeline
 * ===================
 * Turns Google-Form design submissions into published website products,
 * with a human approval gate (Mode B) in the middle.
 *
 * Data flow:
 *   designers fill the form  ->  "CHD Design Intake - Responses" sheet
 *   `intake`  : for each new submission, download the front card +
 *               close-up, generate a lifestyle image (Gemini), upload
 *               everything to the "CHD Lifestyle Review" folder, and add
 *               a row to the "CHD Lifestyle Review Board" sheet.
 *               Rows marked REDO are regenerated using the notes column.
 *   the team  : types APPROVED or REDO in the board's STATUS column
 *   `publish` : for each APPROVED row not yet published, create
 *               src/assets/<cat>/slide_NNN/data.json and
 *               public/images/<cat>/slide_NNN/{lifestyle,image_01,image_02}.png
 *               (compressed), then commit + push to main -> Vercel deploys.
 *
 * All Drive/Sheets access goes through the Apps Script bridge
 * (scripts/chd-pipeline-bridge.gs) so no Google credentials live here.
 *
 * Env: CHD_BRIDGE_URL, CHD_BRIDGE_TOKEN, GEMINI_API_KEY
 *      GEMINI_IMAGE_MODEL (optional override)
 *
 * Usage (from the repo root):
 *   bun scripts/design-pipeline.mjs intake
 *   bun scripts/design-pipeline.mjs publish        # stages files + prints summary
 *   bun scripts/design-pipeline.mjs publish --commit  # also commits and pushes main
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RESPONSES_SHEET = '13C3pdkyFbPAauTS03IRIt-yQ44oLzQ_ViuPf2z6khWw';
const REVIEW_BOARD = '1xfut34jDvryqJd8Rpp7rV71WFUVY7X7pqRu0LfAr3Is';
const REVIEW_FOLDER = '14ggFuEp3DR39HBhT9Qim9oIe9KYnwFbm';

// form category label -> {assets folder, style prefix, id prefix used in the site}
const CATEGORIES = {
  'rugs':          { dir: 'rugs',        scene: 'a bright modern living room, rug flat on a wooden floor beside a sofa or armchair' },
  'placemats':     { dir: 'placemat',    scene: 'a set dining table, placemat under a plate with cutlery' },
  'table runners': { dir: 'TableRunner', scene: 'a dining table with the runner laid down the centre, simple tableware' },
  'cushions':      { dir: 'cushion',     scene: 'a sofa or armchair in a styled living room, cushion placed upright' },
  'throws':        { dir: 'throw',       scene: 'a sofa or bed with the throw casually draped' },
  'bedding':       { dir: 'bedding',     scene: 'a neatly made bed in a calm bedroom' },
  'bath mats':     { dir: 'bathmat',     scene: 'a clean modern bathroom, mat flat on the floor beside a bathtub or shower' },
  'tote bags':     { dir: 'totebag',     scene: 'a lifestyle setting such as a bench, table or outdoor scene with the tote upright' },
};

// ---------------------------------------------------------------------------
// Scale guidance. Image models cannot reason from raw measurements, but they
// reliably follow RELATIONAL constraints against familiar reference objects
// (sofa ~84in, bathtub ~60in, dinner plate ~11in, dining table ~72in). Parse
// the submitted size, classify it, and emit hard relational rules.
// ---------------------------------------------------------------------------
function parseInches(sizeStr) {
  const m = String(sizeStr).toUpperCase().match(/(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1]), b = parseFloat(m[2]);
  return a <= b ? [a, b] : [b, a]; // [short edge, long edge]
}

// Shape (aspect ratio) is the top priority after design accuracy: the same
// spec must always render as the same outline. Absolute room scale is
// allowed to drift (view purposes) but the proportions are not.
function shapeGuidance(sizeStr) {
  const dims = parseInches(sizeStr);
  if (!dims) return '';
  const [w, l] = dims;
  const ratio = (l / w).toFixed(2);
  const shape = l / w < 1.05 ? 'a SQUARE'
    : l / w < 1.35 ? 'a slightly elongated rectangle'
    : l / w < 1.8 ? 'a clearly elongated rectangle'
    : 'a long, narrow rectangle';
  return ` PROPORTION RULES (these outrank everything except design accuracy): ` +
    `the product is ${shape} of ${w} by ${l} inches - its length is exactly ${ratio} times its width. ` +
    `Reproduce the product's outline with EXACTLY these proportions, matching the shape shown in the attached image. ` +
    `Perspective may foreshorten it, but the outline must still clearly read as a ${w}:${l} rectangle - ` +
    `never more square and never more elongated than that.`;
}

function sizeGuidance(categoryLabel, sizeStr) {
  const cat = categoryLabel.toLowerCase();
  const dims = parseInches(sizeStr);
  const named = String(sizeStr).trim().toUpperCase();
  const base = (w, l, what) =>
    `SCALE GUIDANCE (secondary - approximate scale is acceptable, wrong proportions are not): ` +
    `this ${what} measures ${w} by ${l} inches ` +
    `(${(w / 12).toFixed(1)} by ${(l / 12).toFixed(1)} feet). `;
  const tail = ' Render the product at EXACTLY this scale relative to every reference object in the scene; do not enlarge it to fill the space, and preserve its true width-to-length proportions. Never render any text, numbers, labels or measurements anywhere in the image.';

  switch (cat) {
    case 'rugs': {
      if (!dims) return '';
      const [w, l] = dims, lf = l / 12;
      let rules;
      if (lf <= 4.2) rules =
        'This is a SMALL ACCENT RUG. The scene must contain NO sofa - compose a cozy corner with ONE armchair (about 30 inches wide) and nothing larger. The rug lies flat on the floor in front of the armchair, and its long edge is only about 1.5 times the width of that armchair. Most of the floor stays bare wood. NO furniture stands on the rug.';
      else if (lf <= 6.5) rules =
        'This is a SMALL-TO-MEDIUM rug. The scene may contain one armchair and a small coffee table, NO sofa. The rug is about twice as long as the armchair is wide; at most the coffee table touches it. Plenty of bare floor remains visible around the rug.';
      else if (lf <= 9) rules =
        'This is a MEDIUM area rug. The front legs of a sofa may rest on it; it covers the seating area but stays well clear of the walls.';
      else rules =
        'This is a LARGE area rug. Most of the seating arrangement sits on it.';
      return base(w, l, 'rug') + rules + tail;
    }
    case 'bath mats': {
      if (!dims) return '';
      const [w, l] = dims;
      return base(w, l, 'bath mat') +
        `A standard bathtub is 60 inches long, so this mat's long edge is about ${Math.round((l / 60) * 100)}% of the tub's length. It occupies a small area of bathroom floor directly beside the tub or shower.` + tail;
    }
    case 'placemats': {
      if (!dims) return '';
      const [w, l] = dims;
      return base(w, l, 'placemat') +
        'A dinner plate is 11 inches across and covers most of the placemat, leaving only a border visible. One placemat serves ONE seat; it is far smaller than the table.' + tail;
    }
    case 'table runners': {
      if (!dims) return '';
      const [w, l] = dims;
      return base(w, l, 'table runner') +
        `It is a narrow strip about ${w} inches wide running down the centre of the table, covering roughly the middle third of the table's width, with table surface visible on both sides.` + tail;
    }
    case 'cushions': {
      if (!dims) return '';
      const [w, l] = dims;
      return base(w, l, 'cushion') +
        `A sofa seat cushion is about 24 inches wide, so this cushion is ${l <= 14 ? 'a small accent cushion, clearly smaller than the seat cushion behind it' : l <= 20 ? 'a standard throw cushion, a bit smaller than the seat cushion behind it' : 'a large floor-style cushion, about as wide as a seat cushion'}.` + tail;
    }
    case 'throws': {
      if (!dims) return '';
      const [w, l] = dims;
      return base(w, l, 'throw') +
        `A 3-seat sofa is about 84 inches long, so draped along the seat this throw covers roughly ${Math.min(100, Math.round((l / 84) * 100))}% of its length - it drapes over PART of the sofa or bed, never covering it entirely.` + tail;
    }
    case 'bedding':
      return ` CRITICAL SCALE RULES: this is ${named} size bedding - show it on a correctly proportioned ${/KING|QUEEN|FULL|TWIN/.test(named) ? named.match(/KING|QUEEN|FULL|TWIN/)[0] : ''} bed, fitting the mattress exactly with a natural drape at the sides.` + tail;
    case 'tote bags': {
      if (!dims) return '';
      const [w, l] = dims;
      return base(w, l, 'tote bag') +
        'Compared to a person, its top edge would reach about hip height when carried by the handles at arm\'s length. Show it at that human scale against the furniture around it.' + tail;
    }
    default:
      return '';
  }
}

const OWNER_PROMPT = (category, size, notes) =>
  'turn this product image to lifestyle image of the product and keep the design accuracy to 100% ' +
  'and the product should be the highlight of the created image. keep the theme of image based on the ' +
  'product and the product colour palette. also when generating make sure to follow on size of the ' +
  'product the image needs to take into account the size of the product and fit in proportion to the ' +
  `size of the product in the lifestyle image. Product: ${category}, actual size ${size}. ` +
  (sizeGuidance(category, size).includes('scene m') ? '' :
    'Suggested setting: ' + CATEGORIES[category.toLowerCase()].scene + '. ') +
  shapeGuidance(size) +
  sizeGuidance(category, size) +
  (notes ? ' Additional instructions from the designer: ' + notes : '');

// ---------------------------------------------------------------------------
// bridge + gemini clients
// ---------------------------------------------------------------------------
const clean = (v) => String(v || '').replace(/[<>'" \t]/g, '');
const BRIDGE_URL = clean(process.env.CHD_BRIDGE_URL);
const BRIDGE_TOKEN = clean(process.env.CHD_BRIDGE_TOKEN);
const GEMINI_KEY = clean(process.env.GEMINI_API_KEY);

// All HTTP goes through curl: bun's native fetch gets connection resets
// behind the sandbox egress proxy, curl is reliable there.
import { execFileSync } from 'child_process';
function curlJson(url, body) {
  const args = ['-sL', '--max-time', '600', '-H', 'Content-Type: application/json'];
  if (body !== undefined) args.push('--data-binary', '@-');
  args.push(url);
  const out = execFileSync('curl', args, {
    input: body === undefined ? undefined : JSON.stringify(body),
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(out.toString());
}

async function bridge(op, payload = {}) {
  const body = curlJson(BRIDGE_URL, { token: BRIDGE_TOKEN, op, ...payload });
  if (!body.ok) throw new Error(`bridge ${op}: ${body.error}`);
  return body;
}

async function geminiImageModel() {
  if (process.env.GEMINI_IMAGE_MODEL) return clean(process.env.GEMINI_IMAGE_MODEL);
  const { models = [] } = curlJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`);
  const candidates = models
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => n.includes('image') && !n.includes('imagen'));
  if (!candidates.length) throw new Error('no Gemini image-generation model available');
  return candidates[0];
}

async function generateLifestyle(model, prompt, imageBase64, mimeType) {
  const body = curlJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    { contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }] }
  );
  if (body.error) throw new Error(`gemini error: ${JSON.stringify(body.error).slice(0, 400)}`);
  const parts = body?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new Error(`gemini returned no image: ${JSON.stringify(body).slice(0, 400)}`);
  return Buffer.from(img.inlineData.data, 'base64');
}

// ---------------------------------------------------------------------------
// sheet helpers
// ---------------------------------------------------------------------------
function indexHeaders(headerRow) {
  const find = (patterns) => {
    const i = headerRow.findIndex((h) => patterns.some((p) => p.test(String(h).trim())));
    return i;
  };
  return {
    timestamp: find([/^timestamp$/i]),
    email: find([/^email/i]),
    category: find([/category/i]),
    style: find([/style/i]),
    description: find([/^description/i]),
    technique: find([/technique/i]),
    content: find([/^content/i]),
    size: find([/^size/i]),
    season: find([/season/i]),
    notes: find([/notes/i]),
    front: find([/front/i]),
    closeup: find([/close/i]),
    name: find([/your\s*n.?a.?me/i]),
  };
}

const driveIdFromCell = (cell) => {
  const m = String(cell || '').match(/[-\w]{25,}/);
  return m ? m[0] : null;
};

// ---------------------------------------------------------------------------
// image compression (same approach as scripts/optimize-images.mjs)
// ---------------------------------------------------------------------------
async function compressPng(sharp, buffer) {
  const palette = await sharp(buffer).png({ palette: true, quality: 90, effort: 7, compressionLevel: 9 }).toBuffer();
  const a = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(palette).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let acceptable = a.info.width === b.info.width && a.info.height === b.info.height;
  if (acceptable) {
    let sum = 0;
    const pixels = a.info.width * a.info.height;
    for (let p = 0; p < pixels; p++) {
      const i = p * 4;
      const w = a.data[i + 3] / 255;
      sum += ((Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) * w) / 3
           + Math.abs(a.data[i + 3] - b.data[i + 3]);
    }
    acceptable = sum / pixels <= 3.0;
  }
  if (acceptable && palette.length < buffer.length) return palette;
  const lossless = await sharp(buffer).png({ palette: false, compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  return lossless.length < buffer.length ? lossless : buffer;
}

// ---------------------------------------------------------------------------
// intake: new submissions -> generated lifestyle -> review board
// ---------------------------------------------------------------------------
async function intake() {
  const sharp = (await import('sharp')).default;
  const model = await geminiImageModel();
  console.log(`intake: using image model ${model}`);

  const { values: responses } = await bridge('read', { sheetId: RESPONSES_SHEET });
  if (responses.length < 2) { console.log('intake: no submissions in the sheet'); return; }
  const col = indexHeaders(responses[0]);

  const { values: board } = await bridge('read', { sheetId: REVIEW_BOARD });
  const boardStyles = new Map(); // style -> {rowIndex (1-based), status}
  for (let r = 1; r < board.length; r++) {
    const style = String(board[r][1] || '').trim();
    if (style) boardStyles.set(style.toUpperCase(), { row: r + 1, status: String(board[r][6] || '').trim().toUpperCase() });
  }

  let processed = 0;
  for (let r = 1; r < responses.length; r++) {
    const row = responses[r];
    const style = String(row[col.style] || '').trim();
    const categoryLabel = String(row[col.category] || '').trim();
    const category = CATEGORIES[categoryLabel.toLowerCase()];
    if (!style || !category) {
      if (style) console.log(`intake: SKIP ${style}: unknown category "${categoryLabel}"`);
      continue;
    }
    const existing = boardStyles.get(style.toUpperCase());
    const isRedo = existing && existing.status === 'REDO';
    if (existing && !isRedo) continue; // already on the board, not a redo

    const frontId = driveIdFromCell(row[col.front]);
    if (!frontId) { console.log(`intake: SKIP ${style}: no front image link`); continue; }

    console.log(`intake: ${isRedo ? 'REDO' : 'NEW'} ${style} (${categoryLabel})`);
    const front = await bridge('download', { fileId: frontId });

    const redoNotes = isRedo ? String(board[existing.row - 1][7] || '').trim() : '';
    const designerNotes = String(row[col.notes] || '').trim();
    const prompt = OWNER_PROMPT(categoryLabel, String(row[col.size] || '').trim(),
      [designerNotes, redoNotes].filter(Boolean).join('. '));

    const lifestyle = await generateLifestyle(model, prompt, front.base64, front.mimeType);

    const suffix = isRedo ? `-v${Date.now() % 1000}` : '';
    const up = await bridge('upload', {
      folderId: REVIEW_FOLDER, name: `${style}-lifestyle${suffix}.png`,
      mimeType: 'image/png', base64: lifestyle.toString('base64'),
    });
    const upFront = await bridge('upload', {
      folderId: REVIEW_FOLDER, name: `${style}-front${suffix}.png`,
      mimeType: front.mimeType, base64: front.base64,
    });

    if (isRedo) {
      // refresh the category too - the submitter may have corrected it in the
      // responses sheet, and publish reads the category from the board row
      await bridge('update', {
        sheetId: REVIEW_BOARD, range: `C${existing.row}`,
        values: [[categoryLabel]],
      });
      await bridge('update', {
        sheetId: REVIEW_BOARD, range: `E${existing.row}:H${existing.row}`,
        values: [[upFront.url, up.url, '', `regenerated with: ${redoNotes || '(no notes)'}`]],
      });
    } else {
      await bridge('append', {
        sheetId: REVIEW_BOARD,
        rows: [[new Date().toISOString().slice(0, 10), style, categoryLabel,
                String(row[col.name] || row[col.email] || '').trim(),
                upFront.url, up.url, '', '', '']],
      });
    }
    processed++;
  }
  console.log(`intake: done, ${processed} design(s) sent for review`);
}

// ---------------------------------------------------------------------------
// publish: APPROVED board rows -> repo product folders -> push
// ---------------------------------------------------------------------------
async function publish({ commit }) {
  const sharp = (await import('sharp')).default;
  const { values: board } = await bridge('read', { sheetId: REVIEW_BOARD });
  const { values: responses } = await bridge('read', { sheetId: RESPONSES_SHEET });
  const col = indexHeaders(responses[0] || []);

  const published = [];
  for (let r = 1; r < board.length; r++) {
    const [, styleRaw, categoryLabel, , , lifestyleUrl, status, , publishedAt] = board[r];
    const style = String(styleRaw || '').trim();
    if (!style || String(status).trim().toUpperCase() !== 'APPROVED' || String(publishedAt || '').trim()) continue;

    const category = CATEGORIES[String(categoryLabel).trim().toLowerCase()];
    if (!category) { console.log(`publish: SKIP ${style}: unknown category`); continue; }

    const submission = responses.slice(1).find((row) =>
      String(row[col.style] || '').trim().toUpperCase() === style.toUpperCase());
    if (!submission) { console.log(`publish: SKIP ${style}: no matching form submission`); continue; }

    // next slide number = current folder count + 1 (site derives counts the same way)
    const assetDir = path.join(REPO, 'src/assets', category.dir);
    const slides = fs.readdirSync(assetDir).filter((d) => /^slide_\d+$/.test(d));
    const slideNum = String(slides.length + 1).padStart(3, '0');
    const newAsset = path.join(assetDir, `slide_${slideNum}`);
    const newImages = path.join(REPO, 'public/images', category.dir, `slide_${slideNum}`);
    const resuming = fs.existsSync(newAsset) && fs.existsSync(newImages)
      && fs.existsSync(path.join(newAsset, 'data.json'))
      && fs.existsSync(path.join(newImages, 'lifestyle.png'));
    if (resuming) {
      console.log(`publish: resuming previously staged ${style} -> ${category.dir}/slide_${slideNum}`);
      published.push({ style, dir: category.dir, slide: slideNum, boardRow: r + 1 });
      continue;
    }

    console.log(`publish: ${style} -> ${category.dir}/slide_${slideNum}`);
    const lifestyle = await bridge('download', { fileId: driveIdFromCell(lifestyleUrl) });
    const front = await bridge('download', { fileId: driveIdFromCell(submission[col.front]) });
    const closeId = driveIdFromCell(submission[col.closeup]);
    const close = closeId ? await bridge('download', { fileId: closeId }) : null;

    fs.mkdirSync(newAsset, { recursive: true });
    fs.mkdirSync(newImages, { recursive: true });
    fs.writeFileSync(path.join(newAsset, 'data.json'), JSON.stringify({
      styleNumber: style,
      description: String(submission[col.description] || '').trim(),
      technique: String(submission[col.technique] || '').trim(),
      content: String(submission[col.content] || '').trim(),
      size: String(submission[col.size] || '').trim(),
      season: String(submission[col.season] || '').trim(),
    }, null, 2) + '\n');

    // Designer uploads are often print-resolution masters (10k+ px, tens of
    // MB). Cap at 2400px on the long edge - plenty for the product-page zoom -
    // before compressing.
    const toPng = async (b64) => compressPng(sharp, await sharp(Buffer.from(b64, 'base64'))
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .png().toBuffer());
    fs.writeFileSync(path.join(newImages, 'lifestyle.png'), await toPng(lifestyle.base64));
    fs.writeFileSync(path.join(newImages, 'image_01.png'), await toPng(front.base64));
    if (close) fs.writeFileSync(path.join(newImages, 'image_02.png'), await toPng(close.base64));

    published.push({ style, dir: category.dir, slide: slideNum, boardRow: r + 1 });
  }

  if (!published.length) { console.log('publish: nothing approved and unpublished'); return; }

  if (commit) {
    console.log('publish: verifying (tsc + build) before push...');
    execSync('bunx tsc --noEmit -p tsconfig.app.json', { cwd: REPO, stdio: 'inherit' });
    execSync('bun run build', { cwd: REPO, stdio: 'inherit' });
    const names = published.map((p) => p.style).join(', ');
    execSync('git add src/assets public/images', { cwd: REPO, stdio: 'inherit' });
    execSync(`git -c user.name=Claude -c user.email=noreply@anthropic.com commit -m "Add ${published.length} approved design(s): ${names}"`,
      { cwd: REPO, stdio: 'inherit' });
    execSync('git push origin HEAD:main', { cwd: REPO, stdio: 'inherit' });
    for (const p of published) {
      await bridge('update', {
        sheetId: REVIEW_BOARD, range: `I${p.boardRow}`,
        values: [[new Date().toISOString().slice(0, 10)]],
      });
    }
    console.log(`publish: pushed ${published.length} design(s) to main`);
  } else {
    console.log(`publish: staged ${published.length} design(s) in the working tree (run with --commit to push)`);
  }
}

// ---------------------------------------------------------------------------
const cmd = process.argv[2];
const flags = process.argv.slice(3);
if (cmd === 'intake') await intake();
else if (cmd === 'publish') await publish({ commit: flags.includes('--commit') });
else {
  console.log('usage: bun scripts/design-pipeline.mjs <intake|publish> [--commit]');
  process.exit(1);
}
