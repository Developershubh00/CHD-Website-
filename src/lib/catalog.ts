// The design library: one folder per design under src/assets/<dir>/slide_NNN/
// (its data.json) with the matching images in public/images/<dir>/slide_NNN/.
// The pipeline appends the next slide_NNN for each published design, so the
// slide number doubles as the order in which designs were added (higher =
// newer). Nothing here is hardcoded: the catalog grows when a slide folder
// with its data.json is added.
const dataModules = import.meta.glob('/src/assets/**/data.json', {
  eager: true,
});

/** Site category id (the :categoryId in /category/:categoryId) -> library folder. */
export const CATEGORY_DIRS: Record<string, string> = {
  rugs: 'rugs',
  placemats: 'placemat',
  runners: 'TableRunner',
  cushions: 'cushion',
  throws: 'throw',
  bedding: 'bedding',
  bathmats: 'bathmat',
  chairpads: 'totebag',
};

const slideCache = new Map<string, number[]>();

/** Slide numbers that exist for a library folder, ascending (oldest first). */
export function slideNumbers(dir: string): number[] {
  let slides = slideCache.get(dir);
  if (!slides) {
    const pattern = new RegExp(`^/src/assets/${dir}/slide_(\\d+)/data\\.json$`);
    slides = Object.keys(dataModules)
      .map((key) => pattern.exec(key))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => parseInt(match[1], 10))
      .sort((a, b) => a - b);
    slideCache.set(dir, slides);
  }
  return slides;
}

export function slideCount(dir: string): number {
  return slideNumbers(dir).length;
}

export const pad3 = (n: number) => String(n).padStart(3, '0');

/**
 * The small square copy of a design's lifestyle shot that the category cards
 * rotate through. The pipeline writes one for every published design; run
 * scripts/build-card-images.mjs to backfill.
 */
export function cardImageUrl(dir: string, slide: number): string {
  return `/images/${dir}/slide_${pad3(slide)}/card.webp`;
}

export const randomSeed = () => Math.floor(Math.random() * 0x7fffffff);

/** Deterministic PRNG (mulberry32) so a shuffled order can be reproduced from its seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
