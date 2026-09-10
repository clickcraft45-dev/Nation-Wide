import { Injectable } from '@nestjs/common';
import type { Receipt } from '@prisma/client';
import { StorageService } from '../../database/storage.service';
import {
  renderReceipt,
  type ReceiptBranding,
  type ReceiptExtras,
} from './templates/receipt-template';

@Injectable()
export class ReceiptPdfService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Renders one receipt to a PDF buffer.
   *
   * Mirrors InvoicePdfService exactly, dynamic ESM import included: @react-pdf/renderer is
   * ESM-only and a static top-level import breaks Jest's CJS runtime for every spec that pulls
   * in app.module.ts.
   */
  async render(
    receipt: Receipt,
    extras: ReceiptExtras,
    branding: ReceiptBranding,
  ): Promise<Buffer> {
    // A missing logo must never fail the render — the customer's proof of payment is not worth
    // withholding over branding.
    const logoBuffer = branding.logoPath
      ? await this.storage.get(branding.logoPath).catch(() => undefined)
      : undefined;

    const { renderToBuffer } = await import('@react-pdf/renderer');
    const document = await renderReceipt(receipt, extras, logoBuffer, branding);
    return renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
  }
}
