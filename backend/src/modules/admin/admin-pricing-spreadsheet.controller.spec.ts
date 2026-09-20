import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AdminPricingSpreadsheetController } from './admin-pricing-spreadsheet.controller';

/**
 * These four routes hand Excel a file, and the one way to get that wrong is silent: returning a
 * Buffer from a Nest handler goes out as {"type":"Buffer","data":[...]} — a JSON document under an
 * .xlsx name, which Excel rejects as corrupt. The bytes are never inspected by any other test, so
 * the shape of the return value is what this pins down.
 */
describe('AdminPricingSpreadsheetController downloads', () => {
  const workbook = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]); // "PK.." — a real xlsx header
  let spreadsheet: {
    countriesTemplate: jest.Mock;
    rateCardsTemplate: jest.Mock;
    exportCountries: jest.Mock;
    exportRateCards: jest.Mock;
  };
  let res: { set: jest.Mock };
  let controller: AdminPricingSpreadsheetController;

  beforeEach(() => {
    spreadsheet = {
      countriesTemplate: jest.fn().mockReturnValue(workbook),
      rateCardsTemplate: jest.fn().mockReturnValue(workbook),
      exportCountries: jest.fn().mockResolvedValue(workbook),
      exportRateCards: jest.fn().mockResolvedValue(workbook),
    };
    res = { set: jest.fn() };
    controller = new AdminPricingSpreadsheetController(spreadsheet as never);
  });

  const response = () => res as unknown as Response;

  it.each([
    ['countries template', () => controller.countriesTemplate(response())],
    ['rate cards template', () => controller.rateCardsTemplate(response())],
    ['countries export', () => controller.exportCountries(response())],
    ['rate cards export', () => controller.exportRateCards(response())],
  ])(
    '%s streams the workbook rather than JSON-encoding it',
    async (_label, call) => {
      const result = await call();

      expect(result).toBeInstanceOf(StreamableFile);
      // The bytes that reach the browser are the workbook's own, untouched.
      expect(result.getStream().read()).toEqual(workbook);
    },
  );

  it('names the file and states its type and length', () => {
    controller.rateCardsTemplate(response());

    const headers = (res.set.mock.calls[0] as [Record<string, string>])[0];
    expect(headers['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(headers['Content-Disposition']).toMatch(
      /^attachment; filename="nationwide-rate-cards-template-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );
    expect(headers['Content-Length']).toBe(String(workbook.length));
  });
});
