import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { QuoteDto, QuotePreviewResultDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { QuotesService } from './quotes.service';
import { toQuoteDto } from './quote.mapper';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { SelectOptionDto } from './dto/select-option.dto';
import { QuotePreviewQueryDto } from './dto/quote-preview.dto';

@Controller('quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @Roles('CUSTOMER')
  async create(
    @Body() dto: CreateQuoteDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<QuoteDto> {
    const quote = await this.quotesService.create(dto, user.sub);
    return toQuoteDto(quote);
  }

  // Stateless compare-providers lookup — no Quote is created. Powers the quote wizard's compare
  // step, before the customer has provided any address details. Also used by the admin-initiated
  // quote wizard (AdminQuotesController) — same stateless lookup, same pricing engine, no separate
  // calculation for staff.
  @Get('preview')
  @Roles('CUSTOMER', 'STAFF', 'ADMIN')
  async preview(
    @Query() query: QuotePreviewQueryDto,
  ): Promise<QuotePreviewResultDto> {
    return this.quotesService.preview(query);
  }

  // Registered ahead of :id so "me" is never swallowed as an :id param, matching
  // orders.controller.ts's convention.
  @Get('me')
  @Roles('CUSTOMER')
  async findMine(@CurrentUser() user: JwtPayload): Promise<QuoteDto[]> {
    const quotes = await this.quotesService.findAllForCustomer(user.sub);
    return quotes.map(toQuoteDto);
  }

  @Post(':id/accept')
  @Roles('CUSTOMER')
  async accept(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<QuoteDto> {
    const quote = await this.quotesService.acceptQuote(id, user.sub);
    return toQuoteDto(quote);
  }

  @Post(':id/select-option')
  @Roles('CUSTOMER')
  async selectOption(
    @Param('id') id: string,
    @Body() dto: SelectOptionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<QuoteDto> {
    const quote = await this.quotesService.selectOption(
      id,
      dto.optionId,
      user.sub,
    );
    return toQuoteDto(quote);
  }
}
