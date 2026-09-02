import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Invoice } from '@prisma/client';
import {
  renderTaxInvoice,
  type InvoiceBranding,
  type InvoiceExtras,
} from './templates/tax-invoice-template';

@Injectable()
export class InvoicePdfService {
  /**
   * Renders one tax invoice to a PDF buffer.
   *
   * Mirrors RateCardPdfService, including the dynamic import: @react-pdf/renderer is ESM-only, so
   * a static top-level import would break Jest's CJS runtime for every spec that merely pulls in
   * app.module.ts. See classic-template.ts for the full explanation.
   */
  async render(
    invoice: Invoice,
    extras: InvoiceExtras,
    branding: InvoiceBranding,
  ): Promise<Buffer> {
    const logoBuffer = branding.logoPath
      ? await readFile(join(process.cwd(), 'storage', branding.logoPath)).catch(
          () => undefined,
        )
      : undefined;

    const { renderToBuffer } = await import('@react-pdf/renderer');
    const document = await renderTaxInvoice(
      invoice,
      extras,
      logoBuffer,
      branding,
    );
    return renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
  }
}
