#!/usr/bin/env node
// Runs the REAL `bun scripts/design-pipeline.mjs intake` end to end against a stub: a fake `curl` answers every
// Google Sheets/Drive bridge call and every Gemini call from a scripted scenario, so nothing touches the network,
// nothing is spent and no sheet or Drive file is written. It checks the wiring that scripts/tests/gemini-image.mjs
// (pure helpers only) cannot: which model intake picks and logs, the fall-back path and its e-mail note, the
// billing STOP (log, alert e-mail, exit code), a mistyped GEMINI_IMAGE_MODEL, key redaction in logs, the busy
// back-off, keeping an earlier attempt when a later one fails, and the stop after three overloaded designs.
//
//   node scripts/tests/intake-stub.mjs               all scenarios (about half a minute)
//   node scripts/tests/intake-stub.mjs --only=<text>  only scenarios whose name contains <text>
//   node scripts/tests/intake-stub.mjs --keep         keep the temp folder (path printed) for inspection
//
// Run it after changing the intake / model-selection / retry code in scripts/design-pipeline.mjs.
// Needs: node 22 and bun on PATH, and the repo's node_modules (sharp). SKIPs when bun is missing.
// Prints PASS / FAIL per scenario and exits 1 on any FAIL. `intake` never writes into the repo, so this is safe to run anywhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARGS = process.argv.slice(2);
const KEEP = ARGS.includes('--keep');
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7);

const which = spawnSync('sh', ['-c', 'command -v bun'], { encoding: 'utf8' });
const BUN = which.status === 0 ? which.stdout.trim() : '';
if (!BUN) {
  console.log('SKIP  bun is not on PATH - nothing to run');
  process.exit(0);
}

// A valid 1x1 PNG: used for the front card and for every "generated" picture (the pipeline upscales it with sharp).
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const KEY = 'FAKEGEMINIKEY123456';
const TOKEN = 'FAKEBRIDGETOKEN7890';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'chd-intake-stub-'));
const BIN = path.join(TMP, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'package.json'), '{"type":"commonjs"}\n');
fs.writeFileSync(path.join(BIN, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(path.join(TMP, 'preload.mjs'), `import fs from 'node:fs';
const orig = globalThis.setTimeout;
// waits of a second or more are recorded and skipped, so back-off scenarios run instantly
globalThis.setTimeout = (fn, ms, ...a) => { if (ms >= 1000) fs.appendFileSync(process.env.STUB_DIR + '/waits.log', ms / 1000 + '\\n'); return orig(fn, 0, ...a); };
`);
fs.writeFileSync(path.join(BIN, 'curl'), `#!${process.execPath}
// Stub curl: answers from the scenario file, never touches the network.
const fs = require('fs');
const args = process.argv.slice(2);
const url = args[args.length - 1];
const sc = JSON.parse(fs.readFileSync(process.env.STUB_SCENARIO, 'utf8'));
const H = process.env.STUB_DIR;
const state = (() => { try { return JSON.parse(fs.readFileSync(H + '/state.json', 'utf8')); } catch { return {}; } })();
const log = (o) => fs.appendFileSync(H + '/requests.log', JSON.stringify(o) + '\\n');
const out = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };
let body = '';
if (args.includes('--data-binary')) body = fs.readFileSync(0, 'utf8');
const next = (key) => { // a list of canned replies; the last one repeats
  const seq = sc[key]; if (!seq) return null;
  state[key] = (state[key] || 0) + 1; fs.writeFileSync(H + '/state.json', JSON.stringify(state));
  return seq[Math.min(state[key], seq.length) - 1];
};
if (sc.curlFailMatch && url.includes(sc.curlFailMatch)) { process.stderr.write('curl: (35) simulated failure\\n'); process.exit(35); }

if (url.startsWith('https://bridge.example.invalid')) {
  const req = JSON.parse(body);
  log({ bridge: req.op, tokenOk: req.token === '${TOKEN}' });
  switch (req.op) {
    case 'read':
      if (req.range === 'B:B') return out({ ok: true, values: [['style'], ...(sc.boardStyles || []).map((s) => [s])] });
      return out({ ok: true, values: req.sheetId.startsWith('13C3') ? sc.responses : sc.board });
    case 'download': return out({ ok: true, name: 'front.png', mimeType: 'image/png', base64: '${PIXEL}' });
    case 'upload': return out({ ok: true, id: 'ID', url: 'https://drive.example/' + req.name, size: 1 });
    case 'append': case 'update': fs.appendFileSync(H + '/sheet-writes.log', JSON.stringify(req) + '\\n'); return out({ ok: true });
    case 'notify': fs.appendFileSync(H + '/notify.log', JSON.stringify({ subject: req.subject, body: req.body }) + '\\n'); return out({ ok: true, sent: [] });
  }
  return out({ ok: false, error: 'unknown op' });
}

const m = new URL(url).pathname.match(/^\\/v1beta\\/models(?:\\/([^:]+):(\\w+))?$/);
if (!m) return out({ error: { code: 404, message: 'stub: unknown url' } });
if (!m[1]) { log({ gemini: 'list' }); return sc.listError ? out({ error: sc.listError }) : out({ models: sc.models.map((n) => ({ name: 'models/' + n })) }); }
const model = m[1], method = m[2];
log({ gemini: method, model });
if (method === 'countTokens') return out((sc.count || {})[model] || { totalTokens: 1 });
if (method === 'generateContent') {
  const text = (JSON.parse(body).contents[0].parts[0] || {}).text || '';
  if (!/image|nano-banana/.test(model)) {
    if (sc.textError) return out({ error: sc.textError });
    if (/single word: ok/.test(text)) return out({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    if (/cataloguing/.test(text)) return out({ candidates: [{ content: { parts: [{ text: '{"field_pattern":"x","border":"none","colors":["red"],"texture":"flat","distinctive":"d"}' }] } }] });
    if (/Compare them strictly/.test(text)) return out({ candidates: [{ content: { parts: [{ text: JSON.stringify(sc.verify || { fidelity: 8, shape_ok: true, issues: [] }) }] } }] });
  }
  const r = next('gen:' + model) || next('gen');
  return out(r || { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: '${PIXEL}' } }] }, finishReason: 'STOP' }] });
}
out({ error: { code: 404, message: 'stub: method' } });
`, { mode: 0o755 });

const LIVE = [
  'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview',
  'gemini-3-pro-image', 'nano-banana-pro-preview', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image', 'gemini-nano-banana-2.1', 'imagen-4.0-generate-001',
];
const HDR = ['Timestamp', 'Email address', 'Category', 'Style number', 'Description', 'Technique', 'Content', 'Size', 'Season', 'Notes', 'Front image', 'Back image', 'Close-up image', 'Your name'];
const row = (style) => ['2026-10-22', 'a@b.c', 'Cushions', style, 'CUSHION cover', 'Woven', '100% cotton', '18X18', 'SS26', '', 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz', '', '', 'Designer'];
const BOARD_HDR = ['Date', 'Style', 'Category', 'Submitter', 'Front', 'Lifestyle', 'Status', 'Remarks', 'Published'];
const designs = (n) => [HDR, ...Array.from({ length: n }, (_, i) => row(`CHD-CH-240${i + 1}`))];
const base = (n = 1) => ({ models: LIVE, responses: designs(n), board: [BOARD_HDR] });
const okImage = { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: PIXEL } }] }, finishReason: 'STOP' }] };
const busy = { error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } };
const CREDITS = { code: 429, message: 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.', status: 'RESOURCE_EXHAUSTED' };
const QUOTA = { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.', status: 'RESOURCE_EXHAUSTED' } };
const nf = (m) => ({ error: { code: 404, message: `models/${m} is not found for API version v1beta` } });

let n = 0;
function run(scenario, { env = {}, args = [] } = {}) {
  const dir = path.join(TMP, `run${++n}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify(scenario));
  const r = spawnSync(BUN, ['--preload', path.join(TMP, 'preload.mjs'), 'scripts/design-pipeline.mjs', 'intake', ...args], {
    cwd: REAL,
    encoding: 'utf8',
    timeout: 120000,
    env: {
      HOME: os.homedir(),
      PATH: `${BIN}:${path.dirname(BUN)}:/usr/bin:/bin`,
      STUB_SCENARIO: path.join(dir, 'scenario.json'),
      STUB_DIR: dir,
      GEMINI_API_KEY: KEY,
      CHD_BRIDGE_TOKEN: TOKEN,
      CHD_BRIDGE_URL: 'https://bridge.example.invalid/exec',
      ...env,
    },
  });
  const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '');
  const lines = (f) => read(f).split('\n').filter(Boolean);
  return {
    out: `${r.stdout || ''}${r.stderr || ''}`,
    code: r.status,
    requests: lines('requests.log').map((l) => JSON.parse(l)),
    notify: lines('notify.log').map((l) => JSON.parse(l)),
    writes: lines('sheet-writes.log').map((l) => JSON.parse(l)),
    waits: lines('waits.log').map(Number),
  };
}
const imageCalls = (r) => r.requests.filter((q) => q.gemini === 'generateContent' && /image/.test(q.model));
const remark = (r) => (r.writes.find((w) => w.rows)?.rows?.[0]?.[7]) || '';

const results = [];
async function scenario(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  const t = {
    ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); },
    has(text, needle, msg) { if (!String(text).includes(needle)) throw new Error(`${msg || 'missing'}: ${needle}\n--- output ---\n${String(text).slice(-1500)}`); },
    hasNot(text, needle, msg) { if (String(text).includes(needle)) throw new Error(`${msg || 'must not contain'}: ${needle}\n--- output ---\n${String(text).slice(-1500)}`); },
    eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); },
  };
  try {
    fn(t);
    results.push({ name, ok: true });
    console.log(`PASS  ${name}  (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}\n      ${String((e && e.message) || e).replace(/\n/g, '\n      ')}`);
  }
}

try {
  await scenario('normal day: Pro is picked, logged, used for every image call, and named in the board remark and e-mail', (t) => {
    const r = run(base());
    t.eq(r.code, 0);
    t.has(r.out, 'intake: image model gemini-3-pro-image (pro)');
    t.hasNot(r.out, 'WARNING');
    t.has(r.out, 'intake: done, 1 design(s) sent for review');
    t.ok(imageCalls(r).length >= 1 && imageCalls(r).every((q) => q.model === 'gemini-3-pro-image'), 'every image generation call uses gemini-3-pro-image');
    t.has(remark(r), '[auto-check 8/10 | model gemini-3-pro-image]');
    t.has(r.notify[0]?.subject || '', '1 lifestyle image(s) ready for review');
    t.hasNot(r.notify[0]?.body || '', 'was not available');
  });

  await scenario('Pro id answers 404 -> the Pro preview is used (still Pro, no warning)', (t) => {
    const r = run({ ...base(), count: { 'gemini-3-pro-image': nf('gemini-3-pro-image') } });
    t.has(r.out, 'intake: image model gemini-3-pro-image-preview (pro-preview)');
    t.hasNot(r.out, 'WARNING');
    t.has(r.out, 'image model gemini-3-pro-image not usable on this key (HTTP 404');
  });

  await scenario('no usable Pro model -> falls back to Flash, says so in the log, the remark and the team e-mail', (t) => {
    const r = run({ ...base(), count: { 'gemini-3-pro-image': nf('a'), 'gemini-3-pro-image-preview': nf('b') } });
    t.eq(r.code, 0);
    t.has(r.out, 'intake: image model gemini-3.1-flash-image (flash)');
    t.has(r.out, 'intake: WARNING no usable Pro image model - FELL BACK to gemini-3.1-flash-image (not usable: gemini-3-pro-image, gemini-3-pro-image-preview)');
    t.has(remark(r), '| model gemini-3.1-flash-image]');
    t.has(r.notify[0]?.body || '', 'the Pro image model was not available on this run, so these images were made with gemini-3.1-flash-image');
  });

  await scenario('a busy blip while checking Pro does NOT demote it to Flash', (t) => {
    const r = run({ ...base(), count: { 'gemini-3-pro-image': busy } });
    t.has(r.out, 'intake: image model gemini-3-pro-image (pro)');
    t.hasNot(r.out, 'WARNING');
  });

  await scenario('credits depleted while checking the model -> STOPPED, billing alert e-mail, exit 2', (t) => {
    const r = run({ ...base(), count: { 'gemini-3-pro-image': { error: CREDITS } } });
    t.eq(r.code, 2);
    t.has(r.out, 'intake: STOPPED - GEMINI_BILLING');
    t.has(r.out, 'intake: billing alert emailed');
    t.has(r.notify[0]?.subject || '', 'ACTION NEEDED: CHD image generation stopped');
    t.eq(imageCalls(r).length, 0, 'no image was generated');
  });

  await scenario('the 11 AM --quiet-empty recheck stops on billing too, but sends no alert', (t) => {
    const r = run({ ...base(), count: { 'gemini-3-pro-image': { error: CREDITS } } }, { args: ['--quiet-empty'] });
    t.eq(r.code, 2);
    t.has(r.out, 'intake: STOPPED - GEMINI_BILLING');
    t.eq(r.notify.length, 0);
  });

  await scenario('a plain quota 429 ("check your plan and billing details") backs off and succeeds - it is NOT treated as depleted credits', (t) => {
    const r = run({ ...base(), 'gen:gemini-3-pro-image': [QUOTA, okImage] });
    t.eq(r.code, 0);
    t.hasNot(r.out, 'GEMINI_BILLING');
    t.has(r.out, 'busy (429), waiting 30s then retrying (1/4)');
    t.eq(r.waits, [30]);
    t.has(r.out, 'intake: done, 1 design(s) sent for review');
  });

  await scenario('a mistyped GEMINI_IMAGE_MODEL stops cleanly (no stack trace, exit 3, no image generated)', (t) => {
    const r = run(base(), { env: { GEMINI_IMAGE_MODEL: 'gemini-3-pro-imagee' } });
    t.eq(r.code, 3);
    t.has(r.out, 'intake: STOPPED - GEMINI_IMAGE_MODEL "gemini-3-pro-imagee" is not in this API key\'s model list');
    t.hasNot(r.out, 'at ', 'no stack trace');
    t.eq(imageCalls(r).length, 0);
  });

  await scenario('a valid GEMINI_IMAGE_MODEL pins the model (the rollback to Flash)', (t) => {
    const r = run(base(), { env: { GEMINI_IMAGE_MODEL: ' models/gemini-3.1-flash-image ' } });
    t.has(r.out, 'intake: image model gemini-3.1-flash-image (override)');
    t.ok(imageCalls(r).every((q) => q.model === 'gemini-3.1-flash-image'));
    t.hasNot(r.out, 'WARNING');
  });

  await scenario('a failing model-list call is reported as that, even with an override set', (t) => {
    const r = run({ ...base(), listError: { code: 503, message: 'The service is currently unavailable.', status: 'UNAVAILABLE' } }, { env: { GEMINI_IMAGE_MODEL: 'gemini-3.1-flash-image' } });
    t.has(r.out, 'could not list Gemini models');
    t.hasNot(r.out, 'is not in this API key');
  });

  await scenario('the Gemini key and the bridge token never appear in the output (permanent curl failure, 403 text that echoes the key)', (t) => {
    const a = run({ ...base(), curlFailMatch: 'gemini-3-pro-image:generateContent' });
    t.has(a.out, 'intake: FAILED CHD-CH-2401');
    t.hasNot(a.out, KEY, 'the Gemini key leaked');
    t.hasNot(a.out, TOKEN, 'the bridge token leaked');
    const b = run({ ...base(), count: { 'gemini-3-pro-image': { error: { code: 403, message: `Permission denied: Consumer 'api_key:${KEY}' has been suspended.`, status: 'PERMISSION_DENIED' } } } });
    t.has(b.out, 'not usable on this key (HTTP 403');
    t.hasNot(b.out, KEY, 'the Gemini key leaked through a 403 message');
    const c = run({ ...base(), curlFailMatch: 'countTokens' });
    t.hasNot(c.out, KEY, 'the Gemini key leaked from the probe');
  });

  await scenario('the key is only ever sent to Google, the bridge token only to the bridge', (t) => {
    const r = run(base());
    t.ok(r.requests.filter((q) => q.bridge).every((q) => q.tokenOk), 'every bridge call carries the token');
  });

  await scenario('busy Pro: waits 30/60/120/180 s then gives up on that design after 5 calls (FAILED, retried next run)', (t) => {
    const r = run({ ...base(), 'gen:gemini-3-pro-image': [busy] });
    t.eq(r.waits, [30, 60, 120, 180]);
    t.eq(imageCalls(r).length, 5);
    t.has(r.out, 'intake: FAILED CHD-CH-2401: gemini gemini-3-pro-image error');
    t.has(r.out, 'intake: done, 0 design(s) sent for review');
  });

  await scenario('keeps the earlier attempt when a later one fails: the design is still sent, with its real score', (t) => {
    const r = run({ ...base(), verify: { fidelity: 5, shape_ok: true, issues: ['stripes too thin'] }, 'gen:gemini-3-pro-image': [okImage, busy] });
    t.has(r.out, 'attempt 2: generation failed');
    t.has(r.out, 'keeping the best earlier attempt');
    t.has(r.out, 'intake: done, 1 design(s) sent for review');
    t.has(remark(r), '[auto-check 5/10 | model gemini-3-pro-image]');
  });

  await scenario('a reply without an image is retried (5 s) and then succeeds', (t) => {
    const empty = { candidates: [{ content: { parts: [{ text: 'sorry' }] }, finishReason: 'STOP' }] };
    const r = run({ ...base(), 'gen:gemini-3-pro-image': [empty, empty, okImage] });
    t.eq(r.waits, [5, 5]);
    t.has(r.out, 'intake: done, 1 design(s) sent for review');
  });

  await scenario('a safety-blocked reply is not retried', (t) => {
    const blocked = { candidates: [{ content: { parts: [] }, finishReason: 'IMAGE_SAFETY' }] };
    const r = run({ ...base(), 'gen:gemini-3-pro-image': [blocked] });
    t.eq(imageCalls(r).length, 1);
    t.eq(r.waits, []);
    t.has(r.out, 'intake: FAILED CHD-CH-2401');
  });

  await scenario('Gemini overloaded for 3 designs in a row -> the run stops and leaves the 4th and 5th for next time', (t) => {
    const r = run({ ...base(5), 'gen:gemini-3-pro-image': [busy] });
    t.eq(r.code, 0);
    t.has(r.out, 'intake: STOPPED - Gemini stayed overloaded for 3 designs in a row');
    t.eq(imageCalls(r).length, 15, '3 designs x 5 calls');
    t.hasNot(r.out, 'NEW CHD-CH-2404');
    t.has(r.out, 'intake: FAILED (will retry next run): CHD-CH-2401, CHD-CH-2402, CHD-CH-2403');
  });

  await scenario('one failure in between resets the overload count (fail, fail, succeed, fail, fail -> keeps going)', (t) => {
    // designs 1-2 fail on a permanent error (not "overloaded"), so the stop must not trigger
    const r = run({ ...base(4), 'gen:gemini-3-pro-image': [{ error: { code: 400, message: 'Invalid argument' } }, { error: { code: 400, message: 'Invalid argument' } }, okImage] });
    t.hasNot(r.out, 'stayed overloaded');
    t.has(r.out, 'NEW CHD-CH-2404');
  });
} finally {
  if (KEEP) console.log(`\nkept: ${TMP}`);
  else fs.rmSync(TMP, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join('; '));
  process.exit(1);
}
