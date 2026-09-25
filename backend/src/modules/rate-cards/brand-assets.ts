import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The NationWide artwork bundled for PDFs — the default when no company logo has been uploaded.
 * Lives in backend/assets/brand, which the Dockerfile copies into the image alongside the fonts.
 */
export type BrandAsset = 'mark-black.png' | 'wordmark-white.png';

const cache = new Map<BrandAsset, Buffer>();

/** Read once per process. Undefined if the file is missing, so templates keep their text fallback. */
export function brandAsset(name: BrandAsset): Buffer | undefined {
  if (!cache.has(name)) {
    try {
      cache.set(
        name,
        readFileSync(join(process.cwd(), 'assets', 'brand', name)),
      );
    } catch {
      return undefined;
    }
  }
  return cache.get(name);
}

/**
 * A logo sitting faintly behind the page, centred on A4.
 *
 * The numbers are A4's own: 595x842pt, so a 300pt square centres at left 148, top 271. Declared
 * once here because both the rate card and the tax invoice draw it, and two copies of a magic
 * number drift the moment one page's padding changes.
 *
 * Opacity is the one number to tune here. 0.05 was invisible on screen and on paper — a 5% grey
 * is within the noise of most displays. 0.09 over a 360pt mark reads as a watermark at a glance
 * while still leaving every figure on top of it legible, which is the whole constraint: these are
 * documents someone reads rates and tax amounts off.
 */
export const WATERMARK_SIZE = 360;

export const WATERMARK_STYLE = {
  position: 'absolute',
  // Centred on A4 (595x842pt), derived rather than hardcoded so the size can change alone.
  top: (842 - WATERMARK_SIZE) / 2,
  left: (595 - WATERMARK_SIZE) / 2,
  width: WATERMARK_SIZE,
  height: WATERMARK_SIZE,
  opacity: 0.09,
  objectFit: 'contain',
} as const;

/**
 * The artwork to use behind a page: the company's own uploaded logo when there is one, otherwise
 * the bundled NationWide mark. Undefined when neither exists, which templates render as nothing.
 */
export function watermarkImage(logoBuffer?: Buffer): Buffer | undefined {
  return logoBuffer ?? brandAsset('mark-black.png');
}
