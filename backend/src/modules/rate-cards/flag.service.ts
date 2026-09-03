import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const FLAG_PNG_SIZE = 64;

// Flags are static, small, and reused across every generation — cached in-memory for the life of
// the process rather than re-rasterized on every request. A failed/missing flag caches `null` too
// (not just successes) so a bad country code doesn't get re-attempted on every single call.
const flagCache = new Map<string, Buffer | null>();

@Injectable()
export class FlagService {
  private readonly logger = new Logger(FlagService.name);
  private flagsDir: string | null = null;

  // country-flag-icons ships SVGs named by ISO 3166-1 alpha-2 code — exactly Country.code's
  // format — under its own package directory; resolved once via require.resolve rather than a
  // guessed relative path, so it keeps working regardless of npm workspace hoisting.
  private getFlagsDir(): string {
    if (!this.flagsDir) {
      const pkgJsonPath = require.resolve('country-flag-icons/package.json');
      this.flagsDir = join(dirname(pkgJsonPath), '3x2');
    }
    return this.flagsDir;
  }

  async getFlagPng(countryCode: string): Promise<Buffer | undefined> {
    const key = countryCode.toUpperCase();
    if (flagCache.has(key)) {
      return flagCache.get(key) ?? undefined;
    }

    try {
      const svgPath = join(this.getFlagsDir(), `${key}.svg`);
      const svg = await readFile(svgPath);
      // Dynamic import — sharp is a native-binding package; importing it lazily keeps it out of
      // any code path that doesn't actually render a flag (e.g. tests that never touch this).
      const sharp = (await import('sharp')).default;
      const png = await sharp(svg)
        .resize(FLAG_PNG_SIZE, FLAG_PNG_SIZE, {
          fit: 'cover',
          position: 'centre',
        })
        .png()
        .toBuffer();
      flagCache.set(key, png);
      return png;
    } catch (error) {
      this.logger.warn(
        `No flag available for country code "${key}": ${error instanceof Error ? error.message : String(error)}`,
      );
      flagCache.set(key, null);
      return undefined;
    }
  }
}
