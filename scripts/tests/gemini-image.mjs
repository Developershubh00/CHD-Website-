#!/usr/bin/env node
// Tests for scripts/lib/gemini-image.mjs: which Gemini image model the design pipeline uses, which part of a
// response is the finished picture, and which API errors count as "credits depleted". Pure logic: no network,
// no spend, no repo changes.
//
//   node scripts/tests/gemini-image.mjs
//
// Run it after changing scripts/lib/gemini-image.mjs or the model-selection / retry code in scripts/design-pipeline.mjs.
// Prints PASS / FAIL per check and exits 1 on any FAIL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chooseImageModel,
  isBillingError,
  normalizeModelId,
  pickFinalImagePart,
  rankImageModels,
  retryDelaySeconds,
} from '../lib/gemini-image.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ------------------------------------------------------------------ tiny framework
const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  const t = {
    ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); },
    eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); },
  };
  try {
    await fn(t);
    results.push({ name, ok: true });
    console.log(`PASS  ${name}  (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}\n      ${(e && e.message) || e}`);
  }
}

// The image models the project's API key listed on 2026-10-22, plus a few text models.
const LIVE = [
  'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-3-pro-image',
  'nano-banana-pro-preview', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image',
  'gemini-nano-banana-2.1', 'imagen-4.0-generate-001',
];
const without = (...drop) => LIVE.filter((n) => !drop.includes(n));
const PRO = 'gemini-3-pro-image';

// ------------------------------------------------------------------ model choice
await check('the live model list picks the Pro image model', async (t) => {
  const c = await chooseImageModel(LIVE, {});
  t.eq(c.model, PRO);
  t.eq(c.tier, 'pro');
  t.eq(c.fellBack, false);
});

await check('without the GA Pro id it uses the Pro preview (still Pro, not a fallback)', async (t) => {
  const c = await chooseImageModel(without(PRO), {});
  t.eq(c.model, 'gemini-3-pro-image-preview');
  t.eq(c.fellBack, false);
});

await check('with no Pro model at all it falls back to Flash and says so', async (t) => {
  const c = await chooseImageModel(without(PRO, 'gemini-3-pro-image-preview'), {});
  t.eq(c.model, 'gemini-3.1-flash-image');
  t.eq(c.fellBack, true);
});

await check('Flash preview is the next step down, then any other plain image model', async (t) => {
  t.eq((await chooseImageModel(['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'], {})).model, 'gemini-2.5-flash-image');
  t.eq((await chooseImageModel(['gemini-3.1-flash-image-preview'], {})).model, 'gemini-3.1-flash-image-preview');
  const loose = await chooseImageModel(['gemini-4-experimental-image-x'], {});
  t.eq(loose.tier, 'loose');
  t.eq(loose.fellBack, true);
});

await check('never auto-picks a lite model, an Imagen model or a nano-banana alias', async (t) => {
  const ranked = rankImageModels(LIVE).map((r) => r.model);
  for (const bad of ['gemini-3.1-flash-lite-image', 'nano-banana-pro-preview', 'gemini-nano-banana-2.1', 'imagen-4.0-generate-001']) {
    t.ok(!ranked.includes(bad), `${bad} must not be a candidate`);
  }
  let threw = false;
  try { await chooseImageModel(['gemini-3.1-flash-lite-image', 'nano-banana-pro-preview'], {}); } catch { threw = true; }
  t.ok(threw, 'a list with only lite/alias image models has no usable model');
});

await check('versions compare as numbers (3.10 beats 3.9, 4 beats 3.9)', async (t) => {
  t.eq((await chooseImageModel(['gemini-3.9-pro-image', 'gemini-3.10-pro-image'], {})).model, 'gemini-3.10-pro-image');
  t.eq((await chooseImageModel(['gemini-3.9-pro-image', 'gemini-4-pro-image'], {})).model, 'gemini-4-pro-image');
});

await check('a model that fails the existence probe is skipped and the next tier is used', async (t) => {
  const probed = [];
  const c = await chooseImageModel(LIVE, { probe: async (m) => { probed.push(m); return m !== PRO; } });
  t.eq(c.model, 'gemini-3-pro-image-preview');
  t.eq(c.skipped, [PRO]);
  t.eq(probed, [PRO, 'gemini-3-pro-image-preview']);
});

await check('if every Pro model fails the probe it falls back to Flash and reports it', async (t) => {
  const c = await chooseImageModel(LIVE, { probe: async (m) => !m.includes('-pro-') });
  t.eq(c.model, 'gemini-3.1-flash-image');
  t.eq(c.fellBack, true);
  t.eq(c.skipped, [PRO, 'gemini-3-pro-image-preview']);
});

await check('no candidate passes the probe -> a clear error', async (t) => {
  let msg = '';
  try { await chooseImageModel(LIVE, { probe: async () => false }); } catch (e) { msg = e.message; }
  t.ok(/no Gemini image-generation model/.test(msg), `got: ${msg}`);
});

await check('GEMINI_IMAGE_MODEL override wins, is normalised, and is never probed', async (t) => {
  let probed = 0;
  const c = await chooseImageModel(LIVE, { override: ' "models/gemini-3.1-flash-image" ', probe: async () => { probed++; return false; } });
  t.eq(c.model, 'gemini-3.1-flash-image');
  t.eq(c.tier, 'override');
  t.eq(c.fellBack, false);
  t.eq(probed, 0);
  t.eq(normalizeModelId("'models/gemini-3-pro-image'"), PRO);
});

await check('an override that is not in the model list stops the run instead of failing every design', async (t) => {
  let msg = '';
  try { await chooseImageModel(LIVE, { override: 'gemini-3-pro-imagee' }); } catch (e) { msg = e.message; }
  t.ok(/GEMINI_IMAGE_MODEL "gemini-3-pro-imagee" is not in this API key's model list/.test(msg), `got: ${msg}`);
});

await check('an empty / whitespace override is ignored', async (t) => {
  t.eq((await chooseImageModel(LIVE, { override: '  ' })).model, PRO);
});

// ------------------------------------------------------------------ final image part
const img = (data, extra = {}) => ({ inlineData: { mimeType: 'image/jpeg', data }, ...extra });
const reply = (parts, extra = {}) => ({ candidates: [{ content: { parts }, finishReason: 'STOP' }], ...extra });

await check('a single image reply (what both models returned in the live test) is the final image', async (t) => {
  const p = pickFinalImagePart(reply([img('FINAL', { thoughtSignature: 'sig' })]));
  t.eq(p.base64, 'FINAL');
  t.eq(p.mimeType, 'image/jpeg');
});

await check('interim thought drafts are skipped; the last real image wins', async (t) => {
  const p = pickFinalImagePart(reply([
    { text: 'planning the composition', thought: true },
    img('DRAFT1', { thought: true }),
    img('DRAFT2', { thought: true }),
    img('FINAL', { thoughtSignature: 'sig' }),
  ]));
  t.eq(p.base64, 'FINAL');
  t.eq(p.summary.parts, ['text(thought)', 'image(thought)', 'image(thought)', 'image']);
});

await check('with several real images the last one is used; text-and-image replies work', async (t) => {
  t.eq(pickFinalImagePart(reply([img('A'), img('B')])).base64, 'B');
  t.eq(pickFinalImagePart(reply([{ text: 'Here is your image' }, img('A')])).base64, 'A');
});

await check('only thought images -> no final image (a draft is never shipped), with a loggable summary', async (t) => {
  const p = pickFinalImagePart({ candidates: [{ content: { parts: [img('DRAFT', { thought: true })] }, finishReason: 'IMAGE_SAFETY' }] });
  t.eq(p.base64, null);
  t.eq(p.summary.finishReason, 'IMAGE_SAFETY');
  t.ok(!JSON.stringify(p.summary).includes('DRAFT'), 'the summary must not contain image data');
});

await check('blocked prompts, empty replies and snake_case parts are handled', async (t) => {
  const blocked = pickFinalImagePart({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } });
  t.eq(blocked.base64, null);
  t.eq(blocked.summary.blockReason, 'PROHIBITED_CONTENT');
  t.eq(pickFinalImagePart({}).base64, null);
  t.eq(pickFinalImagePart(reply([{ inline_data: { mime_type: 'image/png', data: 'SNAKE' } }])).base64, 'SNAKE');
});

// ------------------------------------------------------------------ billing vs ordinary quota
await check('the real "credits depleted" 402 is a billing error', async (t) => {
  const err = { code: 402, message: 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.' };
  t.ok(isBillingError(err));
  t.ok(isBillingError(new Error(`GEMINI_BILLING: ${JSON.stringify(err)}`)));
  t.ok(isBillingError({ code: 402, message: 'x' }), 'a bare 402 counts');
  t.ok(isBillingError(new Error('Billing account is disabled for this project')));
});

await check("Google's ordinary quota/rate-limit 429 is NOT a billing error (it must back off, not stop the run)", async (t) => {
  const quota = { code: 429, message: 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.', status: 'RESOURCE_EXHAUSTED' };
  t.ok(!isBillingError(quota));
  t.ok(!isBillingError(new Error(`gemini gemini-3-pro-image: ${JSON.stringify(quota)}`)));
  t.ok(!isBillingError({ code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' }));
  t.ok(!isBillingError(null));
});

await check('RetryInfo delays are read and capped', async (t) => {
  t.eq(retryDelaySeconds({ details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] }), 37);
  t.eq(retryDelaySeconds({ details: [{ retryDelay: '36.4s' }] }), 37);
  t.eq(retryDelaySeconds({ details: [{ retryDelay: '9999s' }] }), 300);
  t.eq(retryDelaySeconds({ details: [{ foo: 1 }] }), 0);
  t.eq(retryDelaySeconds(undefined), 0);
});

// ------------------------------------------------------------------ the pipeline actually uses these helpers
const pipeline = fs.readFileSync(path.join(REAL, 'scripts/design-pipeline.mjs'), 'utf8');
await check('design-pipeline.mjs uses the helpers and no longer hard-codes the old Flash-only picker', async (t) => {
  t.ok(/from '\.\/lib\/gemini-image\.mjs'/.test(pipeline), 'imports lib/gemini-image.mjs');
  t.ok(/chooseImageModel\(/.test(pipeline), 'calls chooseImageModel');
  t.ok(/pickFinalImagePart\(body\)/.test(pipeline), 'takes the final image part through pickFinalImagePart');
  t.ok(!/parts\.find\(\(p\) => p\.inlineData/.test(pipeline), 'the first-image-part shortcut is gone');
  t.ok(!/gemini-\[\\d\.\]\+-flash-image\$/.test(pipeline), 'the Flash-only regex is gone');
  t.ok(!/const isBillingError = /.test(pipeline), 'no second, looser isBillingError definition');
});

await check('the board remark keeps the model name inside the [auto-check ...] tag, which the REDO clean-up strips', async (t) => {
  t.ok(/\[auto-check UNAVAILABLE \| model \$\{model\}/.test(pipeline), 'unverified tag carries the model');
  t.ok(/\[auto-check \$\{result\.check\.fidelity\}\/10[^`]*\| model \$\{model\}\]/.test(pipeline), 'verified tag carries the model');
  // the same clean-up expression the pipeline applies to a REDO row's remarks:
  const cleanup = /\s*\[auto-check[^\]]*\]\s*/gi;
  t.ok(pipeline.includes(String.raw`.replace(/\s*\[auto-check[^\]]*\]\s*/gi, ' ')`), 'the REDO clean-up expression is unchanged');
  const remark = 'regenerated with: make it brighter [auto-check 8/10 | model gemini-3-pro-image] [category auto-corrected: x]';
  t.eq(remark.replace(cleanup, ' ').trim(), 'regenerated with: make it brighter [category auto-corrected: x]');
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join('; '));
  process.exit(1);
}
