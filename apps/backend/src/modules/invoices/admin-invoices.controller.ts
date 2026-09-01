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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import type {
  InvoiceBatchResultDto,
  InvoiceDto,
  InvoiceListDto,
} from '@nationwide/shared-types';
import { InvoicesService } from './invoices.service';
import { toInvoiceDto } from './invoice.mapper';
import { GenerateInvoicesDto } from './dto/generate-invoices.dto';
import { SendInvoicesDto } from './dto/send-invoices.dto';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { CreateCustomInvoiceDto } from './dto/create-custom-invoice.dto';

// ADMIN only. Issuing a tax invoice is a financial act with a permanent, numbered record — the
// same bar as pricing, not the wider STAFF access the operational screens get.
@Controller('admin/invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  async list(@Query() query: QueryInvoicesDto): Promise<InvoiceListDto> {
    const { items, total } = await this.invoices.list(query);
    return { items: items.map(toInvoiceDto), total };
  }

  @Post('generate')
  generate(@Body() dto: GenerateInvoicesDto, @CurrentUser() user: JwtPayload) {
    return this.invoices.generateForRange(
      dto.customerIds,
      dto.from,
      dto.to,
      user.sub,
    );
  }

  // Registered ahead of nothing in particular, but kept next to generate: both issue numbers in
  // the same statutory series and the two are read together.
  @Post('custom')
  async createCustom(
    @Body() dto: CreateCustomInvoiceDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InvoiceDto> {
    return toInvoiceDto(await this.invoices.issueCustom(dto, user.sub));
  }

  @Post('generate-for-order/:orderId')
  async generateForOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<InvoiceDto> {
    return toInvoiceDto(
      await this.invoices.generateForOrder(orderId, user.sub),
    );
  }

  @Post('send')
  send(@Body() dto: SendInvoicesDto): Promise<InvoiceBatchResultDto> {
    return this.invoices.sendMany(dto.invoiceIds);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelInvoiceDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InvoiceDto> {
    return toInvoiceDto(await this.invoices.cancel(id, dto.reason, user.sub));
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.invoices.readPdf(id);
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
