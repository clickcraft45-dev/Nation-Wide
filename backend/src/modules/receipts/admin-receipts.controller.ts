import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ReceiptDto, ReceiptListDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ReceiptsService } from './receipts.service';
import { toReceiptDto } from './receipt.mapper';
import { QueryReceiptsDto } from './dto/query-receipts.dto';

/**
 * ADMIN only, matching AdminInvoicesController: a receipt is a numbered financial record and
 * issuing one by hand is a financial act, not an operational one.
 */
@Controller('admin/receipts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  async list(@Query() query: QueryReceiptsDto): Promise<ReceiptListDto> {
    const { items, total } = await this.receipts.list(query);
    return { items: items.map(toReceiptDto), total };
  }

  /**
   * The retry path. Payments issue their receipt automatically and swallow failures (a PDF that
   * would not render, S3 briefly unavailable), so there has to be one place to ask again —
   * otherwise a customer whose receipt failed silently has no way to get it.
   *
   * Idempotent: an order that already has a receipt for the same amount returns that one.
   */
  @Post('for-order/:orderId')
  async issueForOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ReceiptDto | null> {
    const receipt = await this.receipts.issueForOrderPayment(orderId, user.sub);
    return receipt ? toReceiptDto(receipt) : null;
  }

  @Post(':id/send')
  async send(@Param('id') id: string): Promise<ReceiptDto> {
    return toReceiptDto(await this.receipts.sendToWhatsApp(id));
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.receipts.readPdf(id);
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
