import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RateCardTemplateKey } from '@nationwide/shared-types';
import type { RateCardData } from './rate-card-data.service';
import { FlagService } from './flag.service';
import { renderClassicTemplate } from './templates/classic-template';

// Extension point for future templates (Modern/Corporate/Minimal) — the pricing/data layer above
// this never changes to add one, only this registry does.
const RATE_CARD_TEMPLATES: Record<
  RateCardTemplateKey,
  (
    data: RateCardData,
    logoBuffer?: Buffer,
    flagBuffers?: Map<string, Buffer>,
  ) => Promise<unknown>
> = {
  CLASSIC: renderClassicTemplate,
};

@Injectable()
export class RateCardPdfService {
  constructor(private readonly flagService: FlagService) {}

  async render(
    data: RateCardData,
    templateKey: RateCardTemplateKey,
  ): Promise<Buffer> {
    const template = RATE_CARD_TEMPLATES[templateKey];
    if (!template) {
      throw new BadRequestException(
        `Unknown rate card template: ${templateKey}`,
      );
    }

    const logoBuffer = data.logoPath
      ? await readFile(join(process.cwd(), 'storage', data.logoPath)).catch(
          () => undefined,
        )
      : undefined;

    const flagEntries = await Promise.all(
      data.countries.map(async (country) => {
        const buffer = await this.flagService.getFlagPng(country.code);
        return [country.id, buffer] as const;
      }),
    );
    const flagBuffers = new Map(
      flagEntries.filter((entry): entry is [string, Buffer] =>
        Boolean(entry[1]),
      ),
    );

    // Dynamic import — @react-pdf/renderer is ESM-only, see the doc comment atop
    // classic-template.ts for why this can't be a static top-level import.
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const document = await template(data, logoBuffer, flagBuffers);
    return renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
  }
}
