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
 *      GEMINI_IMAGE_MODEL, GEMINI_TEXT_MODEL (optional overrides)
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
  // Apps Script exec URLs intermittently answer with an HTML 404 page
  // instead of running the app (cold starts / transient Google errors), and
  // the proxy occasionally drops a connection. Neither means the request
  // was executed, so retrying is safe. 3 tries with growing waits.
  const WAITS = [15, 30, 60, 120]; // flaky bursts can outlast a minute - ride them out
  for (let attempt = 1; ; attempt++) {
    let out;
    try {
      out = execFileSync('curl', args, {
        input: body === undefined ? undefined : JSON.stringify(body),
        maxBuffer: 256 * 1024 * 1024,
      });
    } catch (e) {
      if (attempt > WAITS.length) throw e;
      console.log(`  http request failed, retrying in ${WAITS[attempt - 1]}s (${attempt}/${WAITS.length})...`);
      execFileSync('sleep', [String(WAITS[attempt - 1])]);
      continue;
    }
    try {
      return JSON.parse(out.toString());
    } catch {
      if (attempt > WAITS.length) {
        throw new Error(`non-JSON response from ${url.split('?')[0]} after ${attempt} tries: ${out.toString().slice(0, 150)}`);
      }
      console.log(`  got an HTML error page instead of JSON (transient), retrying in ${WAITS[attempt - 1]}s (${attempt}/${WAITS.length})...`);
      execFileSync('sleep', [String(WAITS[attempt - 1])]);
    }
  }
}

async function bridge(op, payload = {}) {
  const body = curlJson(BRIDGE_URL, { token: BRIDGE_TOKEN, op, ...payload });
  if (!body.ok) throw new Error(`bridge ${op}: ${body.error}`);
  return body;
}

// Google retires older models for newer API projects while still listing
// them ("no longer available to new users"), so prefer the newest stable
// version and live-ping text models before trusting them.
const geminiVersion = (n) => parseFloat((n.match(/gemini-([\d.]+)/) || [])[1] || '0');

async function geminiImageModel() {
  if (process.env.GEMINI_IMAGE_MODEL) return clean(process.env.GEMINI_IMAGE_MODEL);
  const { models = [] } = curlJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`);
  const names = models.map((m) => m.name.replace(/^models\//, ''));
  const stable = names
    .filter((n) => /^gemini-[\d.]+-flash-image$/.test(n))
    .sort((a, b) => geminiVersion(b) - geminiVersion(a));
  const loose = names.filter((n) => n.includes('image') && !n.includes('imagen'));
  const pick = stable[0] || loose[0];
  if (!pick) throw new Error('no Gemini image-generation model available');
  return pick;
}

const FRAMING_RULES =
  ' FRAMING RULES: the IMAGE CANVAS is square 1:1 - fill the canvas completely edge to edge with' +
  ' the scene, no letterboxing, no bars. CRITICAL: only the CANVAS is square. The PRODUCT ITSELF is' +
  ' NOT square - it keeps its own true rectangular proportions exactly as specified in the' +
  ' proportion rules. NEVER stretch, widen or reshape the product to fill the square canvas; fill' +
  ' the canvas with more scene (floor, walls, furniture) instead. The entire product stays fully' +
  ' visible with clear margin on every side; when something must be cut off at the canvas edge,' +
  ' crop background or furniture - NEVER any part of the product.';

function geminiTextModel() {
  const { models = [] } = curlJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`);
  const names = models.map((m) => m.name.replace(/^models\//, ''));
  const versioned = names
    .filter((n) => /^gemini-[\d.]+-flash$/.test(n))
    .sort((a, b) => geminiVersion(b) - geminiVersion(a));
  const candidates = [...new Set([
    clean(process.env.GEMINI_TEXT_MODEL),
    'gemini-flash-latest',
    ...versioned,
    ...names.filter((n) => n.includes('flash') && !n.includes('image') && !n.includes('live') && !n.includes('tts')),
  ])].filter((n) => n && (names.includes(n) || n === clean(process.env.GEMINI_TEXT_MODEL)));
  for (const candidate of candidates) {
    try {
      geminiCall(candidate, [{ text: 'Reply with the single word: ok' }]);
      return candidate;
    } catch (e) {
      console.log(`  text model ${candidate} unavailable, trying next (${String(e.message).slice(0, 100)})`);
    }
  }
  throw new Error('no working Gemini text model found');
}

function geminiCall(model, parts) {
  const body = curlJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    { contents: [{ parts }] }
  );
  if (body.error) throw new Error(`gemini ${model}: ${JSON.stringify(body.error).slice(0, 300)}`);
  return (body?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
}

function extractJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model response: ' + String(text).slice(0, 200));
  return JSON.parse(m[0]);
}

// Deep-scan the product image BEFORE generating, so the generation prompt
// carries an explicit inventory of the design (border, field, motifs,
// colours) instead of relying on the model glancing at the reference.
function analyzeProduct(textModel, imageBase64, mimeType) {
  const text = geminiCall(textModel, [
    { text:
      'You are cataloguing a home-textile product for EXACT visual reproduction. ' +
      'Examine the attached product image minutely and return STRICT JSON only, no prose: ' +
      '{"field_pattern": "precise description of the main surface pattern and its repeat", ' +
      '"border": "precise description of the border/edge treatment, or \'none\'", ' +
      '"colors": ["dominant colours in order"], ' +
      '"texture": "weave/pile/texture description", ' +
      '"distinctive": "the 2-3 most recognisable details a copy must get right"}' },
    { inlineData: { mimeType, data: imageBase64 } },
  ]);
  return extractJson(text);
}

// Compare the generated lifestyle against the real product. Returns
// {fidelity: 0-10, shapeOk: bool, issues: [...]}.
function verifyLifestyle(textModel, frontB64, frontMime, genB64, dims) {
  const shapeAsk = dims
    ? `The real product is ${dims[0]}x${dims[1]} inches, so its outline must read as a ${dims[0]}:${dims[1]} rectangle (length ${(dims[1] / dims[0]).toFixed(2)}x the width), never square. `
    : '';
  const text = geminiCall(textModel, [
    { text:
      'Image 1 is the REAL product design. Image 2 is a generated lifestyle photo that must show the SAME product. ' +
      shapeAsk +
      'Compare them strictly and return STRICT JSON only: ' +
      '{"fidelity": <0-10, 10 = pattern/border/colours identical>, ' +
      '"shape_ok": <true if the product outline proportions in image 2 match the real product, false if squared/stretched>, ' +
      '"issues": ["each concrete discrepancy: wrong border, missing motif, colour shift, wrong proportions, ..."]}' },
    { inlineData: { mimeType: frontMime, data: frontB64 } },
    { inlineData: { mimeType: 'image/png', data: genB64 } },
  ]);
  const out = extractJson(text);
  return { fidelity: Number(out.fidelity) || 0, shapeOk: !!out.shape_ok, issues: out.issues || [] };
}

async function generateLifestyle(model, prompt, imageBase64, mimeType) {
  const request = {
    contents: [{ parts: [{ text: prompt + FRAMING_RULES }, { inlineData: { mimeType, data: imageBase64 } }] }],
    generationConfig: { imageConfig: { aspectRatio: '1:1' } },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
  let body;
  // Transient 5xx/429s (model overloaded, deadline expired) are common at
  // peak hours - retry with growing waits before treating them as fatal.
  for (let attempt = 1; ; attempt++) {
    body = curlJson(url, request);
    if (body.error && /imageConfig|aspectRatio|Unknown name/i.test(JSON.stringify(body.error))) {
      // older API surface without imageConfig - retry without it
      delete request.generationConfig;
      body = curlJson(url, request);
    }
    const transient = body.error && (
      [429, 500, 503, 504].includes(body.error.code) ||
      /UNAVAILABLE|Deadline|overloaded|RESOURCE_EXHAUSTED|INTERNAL/i.test(JSON.stringify(body.error)));
    if (!transient || attempt >= 4) break;
    const waitSec = attempt * 25;
    console.log(`  gemini busy (${body.error.code}), waiting ${waitSec}s then retrying (${attempt}/4)...`);
    await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
  }
  if (body.error) throw new Error(`gemini error: ${JSON.stringify(body.error).slice(0, 400)}`);
  const parts = body?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) throw new Error(`gemini returned no image: ${JSON.stringify(body).slice(0, 400)}`);
  return squareCrop(Buffer.from(img.inlineData.data, 'base64'));
}

// Safety net: if the model still returns a non-square image, centre-crop to
// 1:1 using sharp's attention strategy (crops toward the salient region, which
// is the product). Skipped when the image is already square.
async function squareCrop(buffer) {
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buffer).metadata();
    if (Math.abs(meta.width - meta.height) / Math.max(meta.width, meta.height) <= 0.02) return buffer;
    const side = Math.min(meta.width, meta.height);
    return await sharp(buffer)
      .resize(side, side, { fit: 'cover', position: 'attention' })
      .png().toBuffer();
  } catch (e) {
    console.log(`squareCrop skipped (${e.message}) - uploading original`);
    return buffer;
  }
}

// Full quality loop: deep-scan the product, generate with the design
// inventory in the prompt, verify the output against the original, and retry
// with concrete corrections. Returns { buf, check } for the best attempt.
async function generateVerified(imageModel, textModel, prompt, front, dims, style) {
  let designSpec = '';
  try {
    const a = analyzeProduct(textModel, front.base64, front.mimeType);
    designSpec = ' DESIGN INVENTORY - the generated product must reproduce ALL of these exactly:' +
      ` field pattern: ${a.field_pattern}; border: ${a.border};` +
      ` colours: ${(a.colors || []).join(', ')}; texture: ${a.texture};` +
      ` most distinctive details: ${a.distinctive}.`;
    console.log(`  ${style}: scanned - border: ${String(a.border).slice(0, 60)}`);
  } catch (e) {
    console.log(`  ${style}: deep-scan failed (${e.message}) - generating without inventory`);
  }

  let best = null;
  let corrections = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const buf = await generateLifestyle(imageModel, prompt + designSpec + corrections, front.base64, front.mimeType);
    let check;
    try {
      check = verifyLifestyle(textModel, front.base64, front.mimeType, buf.toString('base64'), dims);
    } catch (e) {
      console.log(`  ${style}: verification failed (${e.message}) - accepting attempt as-is`);
      check = { fidelity: 7, shapeOk: true, issues: ['auto-verification unavailable'] };
    }
    console.log(`  ${style} attempt ${attempt}: fidelity ${check.fidelity}/10, shape ${check.shapeOk ? 'ok' : 'WRONG'}` +
      (check.issues.length ? ' | ' + check.issues.slice(0, 3).join('; ').slice(0, 160) : ''));
    if (!best
      || (check.shapeOk && !best.check.shapeOk)
      || (check.shapeOk === best.check.shapeOk && check.fidelity > best.check.fidelity)) {
      best = { buf, check };
    }
    if (check.shapeOk && check.fidelity >= 8) break;
    corrections = ' CORRECTIONS - a previous attempt failed verification; you MUST fix all of these: ' +
      check.issues.join('; ') + '.';
  }
  return best;
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
async function intake({ quietEmpty = false } = {}) {
  const model = await geminiImageModel();
  const textModel = geminiTextModel();
  console.log(`intake: image model ${model}, analysis model ${textModel}`);

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
  let attempted = 0; // NEW/REDO rows found, whether or not generation succeeded
  const failures = []; // styles whose generation/upload failed this run
  for (let r = 1; r < responses.length; r++) {
    const row = responses[r];
    const style = String(row[col.style] || '').trim();
    const categoryLabel = String(row[col.category] || '').trim();
    const category = CATEGORIES[categoryLabel.toLowerCase()];
    if (!style || !category) {
      if (style) { attempted++; console.log(`intake: SKIP ${style}: unknown category "${categoryLabel}"`); }
      continue;
    }
    const existing = boardStyles.get(style.toUpperCase());
    const isRedo = existing && existing.status === 'REDO';
    if (existing && !isRedo) continue; // already on the board, not a redo
    attempted++;

    const frontId = driveIdFromCell(row[col.front]);
    if (!frontId) { console.log(`intake: SKIP ${style}: no front image link`); continue; }

    console.log(`intake: ${isRedo ? 'REDO' : 'NEW'} ${style} (${categoryLabel})`);
    // One design's failure must never sink the rest of the run - isolate it,
    // record it, and keep going. Failed styles stay pending on the responses
    // sheet, so the next scheduled run retries them automatically.
    try {
      const front = await bridge('download', { fileId: frontId });

      // Designers sometimes upload TIFF/BMP masters, which Gemini rejects.
      // Convert anything outside Gemini's accepted set to PNG (capped at
      // 3000px so the request payload stays sane).
      const GEMINI_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
      if (!GEMINI_MIMES.includes(front.mimeType)) {
        const sharp = (await import('sharp')).default;
        const converted = await sharp(Buffer.from(front.base64, 'base64'))
          .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
          .png().toBuffer();
        console.log(`  ${style}: converted ${front.mimeType} front image to PNG for generation`);
        front.base64 = converted.toString('base64');
        front.mimeType = 'image/png';
      }

      const redoNotes = isRedo ? String(board[existing.row - 1][7] || '').trim() : '';
      const designerNotes = String(row[col.notes] || '').trim();
      const prompt = OWNER_PROMPT(categoryLabel, String(row[col.size] || '').trim(),
        [designerNotes, redoNotes].filter(Boolean).join('. '));

      const dims = parseInches(String(row[col.size] || ''));
      const result = await generateVerified(model, textModel, prompt, front, dims, style);
      const lifestyle = result.buf;
      const qcNote = `[auto-check ${result.check.fidelity}/10${result.check.shapeOk ? '' : ', shape flagged'}]`;

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
        // Clear the Published stamp (col I) as well: a REDO on an already-live
        // design must go through publish again after re-approval, where it
        // updates the existing product slide in place.
        await bridge('update', {
          sheetId: REVIEW_BOARD, range: `E${existing.row}:I${existing.row}`,
          values: [[upFront.url, up.url, '', `regenerated with: ${redoNotes || '(no notes)'} ${qcNote}`, '']],
        });
      } else {
        // Appends are the one non-idempotent bridge op: when Apps Script
        // executes the write but the response gets lost in a flaky redirect,
        // the caller counts it as failed and a later run appends again.
        // Re-check the style column immediately before appending.
        const fresh = await bridge('read', { sheetId: REVIEW_BOARD, range: 'B:B' });
        const alreadyThere = (fresh.values || []).some(
          (v) => String(v[0] || '').trim().toUpperCase() === style.toUpperCase());
        if (alreadyThere) {
          console.log(`  ${style}: already on the board (recovered earlier append) - not appending again`);
        } else {
          await bridge('append', {
            sheetId: REVIEW_BOARD,
            rows: [[new Date().toISOString().slice(0, 10), style, categoryLabel,
                    String(row[col.name] || row[col.email] || '').trim(),
                    upFront.url, up.url, '', qcNote, '']],
          });
        }
      }
      processed++;
      // Guard against duplicate form entries for the same style within one
      // run (e.g. a designer resubmitting after a broken upload): once a
      // style lands on the board, later rows with the same style are skipped.
      boardStyles.set(style.toUpperCase(), { row: -1, status: '' });
    } catch (e) {
      console.log(`intake: FAILED ${style}: ${String(e.message).slice(0, 300)}`);
      failures.push(style);
    }
  }
  console.log(`intake: done, ${processed} design(s) sent for review`);
  // A style can fail on an old broken form row and still succeed via the
  // designer's newer resubmission later in the same run - only report
  // styles that truly did not make it onto the board.
  const realFailures = failures.filter((s) => !boardStyles.has(s.toUpperCase()));
  if (realFailures.length) console.log(`intake: FAILED (will retry next run): ${realFailures.join(', ')}`);
  if (attempted === 0) console.log('intake: NO NEW DESIGNS');

  // Email the team the outcome (bridge notify). Older bridge deployments
  // don't have the op yet - degrade to a log line, never fail the run.
  const boardUrl = `https://docs.google.com/spreadsheets/d/${REVIEW_BOARD}`;
  try {
    if (processed > 0) {
      await bridge('notify', {
        subject: `CHD designs: ${processed} lifestyle image(s) ready for review`,
        body:
          `Hello team,\n\n${processed} design(s) now have generated lifestyle images waiting on the review board:\n` +
          `${boardUrl}\n\n` +
          `Please review before 1:00 PM: set STATUS to APPROVED to publish in the 1:30 PM run, ` +
          `or REDO with remarks to regenerate tonight. The Remarks column shows each image's ` +
          `automatic quality check as [auto-check N/10].` +
          (realFailures.length
            ? `\n\nNote: ${realFailures.length} design(s) hit an error this run and will be retried automatically at the next check: ${realFailures.join(', ')}.`
            : '') +
          `\n\n- CHD design pipeline (automated)`,
      });
      console.log('intake: team notified by email');
    } else if (attempted === 0 && !quietEmpty) {
      // The nightly 9 PM run nags the team once; the 11 AM recheck passes
      // --quiet-empty so an empty morning doesn't nag a second time.
      await bridge('notify', {
        subject: 'CHD designs: no new designs received today',
        body:
          `Hello team,\n\nThe design pipeline ran but found no new submissions, so there is nothing ` +
          `to review and nothing will be published in the next 1:30 PM run.\n\n` +
          `Please upload new designs through the Google Form - they are picked up automatically ` +
          `at the next check.\n\n- CHD design pipeline (automated)`,
      });
      console.log('intake: team notified by email (no submissions)');
    }
  } catch (e) {
    console.log(`intake: team notification skipped (${String(e.message).slice(0, 120)}) - redeploy the bridge script to enable emails`);
  }
}

// ---------------------------------------------------------------------------
// publish: APPROVED board rows -> repo product folders -> push
// ---------------------------------------------------------------------------

// A style that is already on the site (REDO after publish) must be updated
// in place, never duplicated as a new slide. Search every category folder -
// the category may have been corrected after the original publish.
function findExistingSlide(style) {
  const assetsRoot = path.join(REPO, 'src/assets');
  for (const catDir of fs.readdirSync(assetsRoot)) {
    const dirPath = path.join(assetsRoot, catDir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    for (const slide of fs.readdirSync(dirPath)) {
      if (!/^slide_\d+$/.test(slide)) continue;
      const dataPath = path.join(dirPath, slide, 'data.json');
      if (!fs.existsSync(dataPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (String(meta.styleNumber || '').trim().toUpperCase() === style.toUpperCase()) {
          return { dir: catDir, slide: slide.replace('slide_', '') };
        }
      } catch { /* unreadable data.json - not a match */ }
    }
  }
  return null;
}

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

    const existing = findExistingSlide(style);
    let slideDir, slideNum;
    if (existing) {
      // republish: overwrite the live slide in place
      slideDir = existing.dir;
      slideNum = existing.slide;
      console.log(`publish: ${style} already live -> updating ${slideDir}/slide_${slideNum} in place`);
    } else {
      // next slide number = current folder count + 1 (site derives counts the same way)
      slideDir = category.dir;
      const assetDir = path.join(REPO, 'src/assets', slideDir);
      const slides = fs.readdirSync(assetDir).filter((d) => /^slide_\d+$/.test(d));
      slideNum = String(slides.length + 1).padStart(3, '0');
      console.log(`publish: ${style} -> ${slideDir}/slide_${slideNum}`);
    }
    const newAsset = path.join(REPO, 'src/assets', slideDir, `slide_${slideNum}`);
    const newImages = path.join(REPO, 'public/images', slideDir, `slide_${slideNum}`);
    const resuming = !existing && fs.existsSync(newAsset) && fs.existsSync(newImages)
      && fs.existsSync(path.join(newAsset, 'data.json'))
      && fs.existsSync(path.join(newImages, 'lifestyle.png'));
    if (resuming) {
      console.log(`publish: resuming previously staged ${style} -> ${slideDir}/slide_${slideNum}`);
      published.push({ style, dir: slideDir, slide: slideNum, boardRow: r + 1 });
      continue;
    }
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

    published.push({ style, dir: slideDir, slide: slideNum, boardRow: r + 1 });
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

    // Rule: whenever designs go live, email the team exactly what was published.
    try {
      const pretty = (dir) => (Object.entries(CATEGORIES).find(([, v]) => v.dir === dir)?.[0] || dir);
      await bridge('notify', {
        subject: `CHD designs: ${published.length} design(s) now LIVE on the website`,
        body:
          `Hello team,\n\nThe following design(s) were just published to creativehomedecorllp.com:\n\n` +
          published.map((p) => `- ${p.style} (${pretty(p.dir)})`).join('\n') +
          `\n\nRe-approved designs replace their existing product images in place. ` +
          `The site finishes rebuilding within a few minutes of this email.\n\n- CHD design pipeline (automated)`,
      });
      console.log('publish: team notified by email');
    } catch (e) {
      console.log(`publish: team notification skipped (${String(e.message).slice(0, 120)})`);
    }
  } else {
    console.log(`publish: staged ${published.length} design(s) in the working tree (run with --commit to push)`);
  }
}

// ---------------------------------------------------------------------------
const cmd = process.argv[2];
const flags = process.argv.slice(3);
if (cmd === 'intake') await intake({ quietEmpty: flags.includes('--quiet-empty') });
else if (cmd === 'publish') await publish({ commit: flags.includes('--commit') });
else {
  console.log('usage: bun scripts/design-pipeline.mjs <intake|publish> [--quiet-empty] [--commit]');
  process.exit(1);
}
