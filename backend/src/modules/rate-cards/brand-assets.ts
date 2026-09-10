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
