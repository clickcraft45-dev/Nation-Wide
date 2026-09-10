import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ReceiptsService } from './receipts.service';

/**
 * Unauthenticated by necessity, exactly as PublicInvoicesController is: WhatsApp delivers a
 * document by handing Meta a URL that Meta's own servers fetch, carrying no session, and the
 * customer then re-opens that same link from their chat months later.
 *
 * The path is the credential — an HMAC of the receipt id under the app's signing secret, so a
 * link can be neither forged nor walked by incrementing an id. Failure is a flat 404: a
 * distinguishable "exists but wrong token" would confirm which receipt ids are real.
 */
@Controller('public/receipts')
export class PublicReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  // Tighter than the global limit: this is reachable without credentials and guessing is the
  // only way to attack it, so make guessing slow.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':id/:token')
  async download(
    @Param('id') id: string,
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.receipts.verifySignature(id, token)) {
      throw new NotFoundException();
    }

    // Signature checked BEFORE touching the database, so an unsigned request cannot probe which
    // ids exist by timing or by error shape.
    const { buffer, filename } = await this.receipts.readPdf(id).catch(() => {
      throw new NotFoundException();
    });

    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        // inline: WhatsApp and phone browsers preview it rather than dumping a download the
        // recipient then has to hunt for in a file manager.
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        // Immutable once issued, so it caches indefinitely — privately, so no shared edge cache
        // ever holds another customer's receipt.
        'Cache-Control': 'private, max-age=31536000, immutable',
      })
      .end(buffer);
  }
}
