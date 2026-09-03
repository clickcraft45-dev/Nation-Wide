import { Injectable } from '@nestjs/common';
import { StorageService } from '../../database/storage.service';
import type { Invoice } from '@prisma/client';
import {
  renderTaxInvoice,
  type InvoiceBranding,
  type InvoiceExtras,
} from './templates/tax-invoice-template';

@Injectable()
export class InvoicePdfService {
  constructor(private readonly storage: StorageService) {}

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
    // A missing/unreadable logo must never fail a document render — the template already
    // handles an absent logo, and an invoice is a statutory record that has to issue.
    const logoBuffer = branding.logoPath
      ? await this.storage.get(branding.logoPath).catch(() => undefined)
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
