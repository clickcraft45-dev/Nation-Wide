import { BadRequestException } from '@nestjs/common';
import { RateCardPdfService } from './rate-card-pdf.service';
import type { FlagService } from './flag.service';

// render()'s success path always ends in a dynamic `import('@react-pdf/renderer')` (ESM-only
// package, see the doc comment on classic-template.ts), which this project's CommonJS-targeted
// ts-jest config cannot intercept without --experimental-vm-modules — see flag.service.spec.ts
// for the same constraint. The one branch reachable without hitting that import is the unknown-
// template guard, tested below; full rendering is covered by the rate-card generation e2e flow.
describe('RateCardPdfService', () => {
  it('rejects an unknown template key before touching the logo or flags', async () => {
    const flagService = { getFlagPng: jest.fn() };
    // Storage is never reached: the guard rejects before any logo fetch, which is the point.
    const storage = { get: jest.fn() };
    const service = new RateCardPdfService(
      flagService as unknown as FlagService,
      storage as never,
    );

    await expect(
      service.render(
        { countries: [] } as never,
        'NOT_A_REAL_TEMPLATE' as never,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(flagService.getFlagPng).not.toHaveBeenCalled();
  });
});
