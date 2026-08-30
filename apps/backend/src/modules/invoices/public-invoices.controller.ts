import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';

/**
 * Unauthenticated by necessity, not by oversight.
 *
 * WhatsApp document delivery works by handing Meta a URL that META's servers fetch — they carry
 * no session and cannot be given one, so this route cannot sit behind JwtAuthGuard. The customer
 * then re-fetches the same link from their chat, on whatever device, possibly months later.
 *
 * What protects it instead is the path itself: the token is an HMAC of the invoice id under the
 * app's signing secret (InvoicesService.signatureFor), so a link can be neither forged nor walked
 * by incrementing an id. Failure is a flat 404 rather than a 401/403 — a distinguishable
 * "exists but wrong token" would confirm which invoice ids are real.
 */
@Controller('public/invoices')
export class PublicInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  // Tighter than the global 300/min: this is the one route reachable without credentials, and
  // guessing is the only way to attack it, so make guessing slow.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':id/:token')
  async download(
    @Param('id') id: string,
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.invoices.verifySignature(id, token)) {
      throw new NotFoundException();
    }

    // Signature checked BEFORE touching the database, so an unsigned request cannot be used to
    // probe which ids exist by timing or by error shape.
    const { buffer, filename } = await this.invoices.readPdf(id).catch(() => {
      throw new NotFoundException();
    });

    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        // inline: WhatsApp and phone browsers preview it rather than dumping a download the
        // recipient then has to find in a file manager.
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        // The document is immutable once issued, so it caches indefinitely — but privately, so
        // Cloudflare never holds another customer's invoice in a shared edge cache.
        'Cache-Control': 'private, max-age=31536000, immutable',
      })
      .end(buffer);
  }
}
