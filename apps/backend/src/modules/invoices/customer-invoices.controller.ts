import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { InvoiceDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { InvoicesService } from './invoices.service';
import { toInvoiceDto } from './invoice.mapper';

/**
 * A customer's own bills.
 *
 * Separate from AdminInvoicesController rather than a role-widened version of it: everything
 * here is scoped to the caller's own customerId and nothing here can issue, cancel or send.
 * Widening the admin controller's roles would have put "generate for any customer" one decorator
 * edit away from a customer session.
 */
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class CustomerInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  // Registered ahead of any :id route so "me" is never swallowed as a param, matching the
  // convention in orders.controller.ts and quotes.controller.ts.
  @Get('me')
  async findMine(@CurrentUser() user: JwtPayload): Promise<InvoiceDto[]> {
    const invoices = await this.invoices.listForCustomer(user.sub);
    return invoices.map(toInvoiceDto);
  }

  @Get('me/:id/pdf')
  async pdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    // Ownership is proved in the service, which 404s rather than 403s on someone else's invoice.
    const { buffer, filename } = await this.invoices.readPdfForCustomer(
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
