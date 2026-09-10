import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { ReceiptDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ReceiptsService } from './receipts.service';
import { toReceiptDto } from './receipt.mapper';

/**
 * A customer's own proofs of payment.
 *
 * Separate from AdminReceiptsController for the same reason the invoice controllers are split:
 * everything here is scoped to the caller's own customerId and nothing here can issue or send.
 * Role-widening the admin controller would put "issue a receipt for any account" one decorator
 * edit away from a customer session.
 */
@Controller('receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class CustomerReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  // Ahead of any :id route so "me" is never swallowed as a param — the convention across
  // orders.controller.ts, quotes.controller.ts and the invoice controllers.
  @Get('me')
  async findMine(@CurrentUser() user: JwtPayload): Promise<ReceiptDto[]> {
    const receipts = await this.receipts.listForCustomer(user.sub);
    return receipts.map(toReceiptDto);
  }

  @Get('me/:id/pdf')
  async pdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    // Ownership is proved in the service, which 404s rather than 403s on someone else's receipt.
    const { buffer, filename } = await this.receipts.readPdfForCustomer(
      id,
      user.sub,
    );
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      })
      .end(buffer);
  }
}
