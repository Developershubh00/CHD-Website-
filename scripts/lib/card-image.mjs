// Card images: the small square copy of a design's lifestyle shot that the
// category cards on the home and products pages rotate through. 600px covers
// a ~300px card on a 2x screen at a fraction of the product-page image size.
import fs from 'node:fs';
import path from 'node:path';

export const CARD_SIZE = 600;
export const CARD_FILE = 'card.webp';

/** The best source for a slide's card: the lifestyle shot, else the front product shot. */
export function cardSourceFor(slideImagesDir) {
  for (const name of ['lifestyle.png', 'lifestyle.jpg', 'image_01.png', 'image_01.jpg']) {
    const candidate = path.join(slideImagesDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Writes destPath from sourcePath; returns the byte size written. */
export async function writeCardImage(sharp, sourcePath, destPath) {
  const buffer = await sharp(sourcePath)
    .resize({ width: CARD_SIZE, height: CARD_SIZE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 5 })
    .toBuffer();
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}
