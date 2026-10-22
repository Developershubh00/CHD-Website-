// Pure helpers for the design pipeline's Gemini image step: which image model
// to use, which part of a response is the finished picture, and which API
// errors mean "the account is out of credits" (permanent) versus "busy, retry".
// No I/O here, so scripts/tests/gemini-image.mjs can exercise every decision
// without network access or spend.

/** Image model families in preference order: Pro first, Flash only as a logged fallback. */
export const IMAGE_TIERS = [
  { tier: 'pro', re: /^gemini-\d+(?:\.\d+)*-pro-image$/ },
  { tier: 'pro-preview', re: /^gemini-\d+(?:\.\d+)*-pro-image-preview$/ },
  { tier: 'flash', re: /^gemini-\d+(?:\.\d+)*-flash-image$/ },
  { tier: 'flash-preview', re: /^gemini-\d+(?:\.\d+)*-flash-image-preview$/ },
];

const versionOf = (name) => {
  const m = name.match(/^gemini-(\d+(?:\.\d+)*)-/);
  return m ? m[1].split('.').map(Number) : [0];
};

// Numeric tuple compare, newest first (3.10 sorts above 3.9, unlike parseFloat).
const newestFirst = (a, b) => {
  const x = versionOf(a);
  const y = versionOf(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (y[i] || 0) - (x[i] || 0);
    if (d) return d;
  }
  return 0;
};

/** Strips the quotes/spaces env vars pick up, and a leading "models/". */
export function normalizeModelId(value) {
  return String(value || '')
    .replace(/[<>'" \t]/g, '')
    .replace(/^models\//, '');
}

/**
 * Every usable image model in the list, best first: Pro, Pro preview, Flash,
 * Flash preview, then (last resort) any other image model. Lite models,
 * Imagen and aliases such as nano-banana-* are never auto-picked.
 */
export function rankImageModels(names) {
  const ranked = [];
  for (const { tier, re } of IMAGE_TIERS) {
    for (const model of names.filter((n) => re.test(n)).sort(newestFirst)) ranked.push({ model, tier });
  }
  const taken = new Set(ranked.map((r) => r.model));
  for (const model of names) {
    if (!taken.has(model) && /image/.test(model) && !/imagen|lite|nano-banana/.test(model)) ranked.push({ model, tier: 'loose' });
  }
  return ranked;
}

/**
 * Picks the image model. `override` (GEMINI_IMAGE_MODEL) wins but must exist
 * in the key's model list - a typo would otherwise 404 every design. Without
 * an override, candidates are tried best-first through `probe(model)` (a free
 * existence check; false = unusable) and the first that passes is used.
 * `fellBack` is true whenever the result is not a Pro model, so callers can
 * say so loudly.
 */
export async function chooseImageModel(names, { override, probe = async () => true } = {}) {
  const forced = normalizeModelId(override);
  if (forced) {
    if (!names.includes(forced)) throw new Error(`GEMINI_IMAGE_MODEL "${forced}" is not in this API key's model list`);
    return { model: forced, tier: 'override', fellBack: false, reason: 'GEMINI_IMAGE_MODEL override', skipped: [] };
  }
  const skipped = [];
  for (const { model, tier } of rankImageModels(names)) {
    if (await probe(model)) {
      const fellBack = !tier.startsWith('pro');
      return {
        model,
        tier,
        fellBack,
        reason: fellBack ? 'no usable Pro image model - FELL BACK to a lower tier' : `newest ${tier} image model`,
        skipped,
      };
    }
    skipped.push(model);
  }
  throw new Error('no Gemini image-generation model available');
}

/**
 * The finished picture in a generateContent response. A thinking model can
 * return interim "thought" drafts as extra image parts, so drafts are skipped
 * and the LAST remaining image part wins. thoughtSignature is deliberately NOT
 * a filter - the real final image can carry one. Returns base64 null when
 * there is no final image, with a summary (no image data) fit for logs.
 */
export function pickFinalImagePart(body) {
  const candidate = body?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const inline = (p) => p.inlineData || p.inline_data;
  const hasImage = (p) => !!inline(p)?.data;
  const finals = parts.filter((p) => hasImage(p) && p.thought !== true);
  const part = finals[finals.length - 1] || null;
  const kind = (p) => (hasImage(p) ? (p.thought ? 'image(thought)' : 'image') : p.thought ? 'text(thought)' : p.text !== undefined ? 'text' : 'other');
  return {
    base64: part ? inline(part).data : null,
    mimeType: part ? inline(part).mimeType || inline(part).mime_type || null : null,
    summary: {
      finishReason: candidate?.finishReason || null,
      blockReason: body?.promptFeedback?.blockReason || null,
      parts: parts.map(kind),
    },
  };
}

/** True only for a depleted/disabled account, never for an ordinary quota 429 ("check your plan and billing details"). */
export function isBillingError(e) {
  if (Number(e?.code) === 402) return true; // HTTP 402 Payment Required
  const text = String(e && e.message ? e.message : JSON.stringify(e || ''));
  return /prepayment credits|credits are depleted|enable billing|billing (account )?(is )?(not (enabled|active)|disabled|inactive|required)|"code":\s*402/i.test(text);
}

/** Seconds Google asks us to wait (google.rpc.RetryInfo "37s"), or 0. Capped so a bad value cannot stall a run. */
export function retryDelaySeconds(error) {
  for (const d of error?.details || []) {
    const m = String(d?.retryDelay || '').match(/^(\d+(?:\.\d+)?)s$/);
    if (m) return Math.min(300, Math.ceil(Number(m[1])));
  }
  return 0;
}
