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
import type { QuoteAdminDetailDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { QuotesService } from '../quotes/quotes.service';
import { toQuoteAdminDetailDto } from '../quotes/quote.mapper';
import { QueryQuotesDto } from '../quotes/dto/query-quotes.dto';
import { ManualQuoteDto } from '../quotes/dto/manual-quote.dto';
import { RejectQuoteDto } from '../quotes/dto/reject-quote.dto';
import { CreateAdminQuoteDto } from '../quotes/dto/create-admin-quote.dto';
import { SelectOptionDto } from '../quotes/dto/select-option.dto';

@Controller('admin/quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminQuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  // Response body is always a plain array. Passing page/pageSize opts into skip/take and adds
  // an X-Total-Count header the admin quotes list page reads to render pagination controls.
  @Get()
  async findAll(
    @Query() query: QueryQuotesDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<QuoteAdminDetailDto[]> {
    const { data, total } = await this.quotesService.findAllAdmin(query);
    if (total !== null) res.setHeader('X-Total-Count', String(total));
    return data.map(toQuoteAdminDetailDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<QuoteAdminDetailDto> {
    const quote = await this.quotesService.findOneAdmin(id);
    return toQuoteAdminDetailDto(quote);
  }

  // Admin "Get a Quote" — staff running the same wizard/pricing engine as the customer portal on
  // a customer's behalf (e.g. a phone-in request), per the explicit requirement that this must
  // not duplicate pricing logic. customerId is supplied directly since there's no customer JWT
  // subject to derive it from here.
  @Post()
  async create(@Body() dto: CreateAdminQuoteDto): Promise<QuoteAdminDetailDto> {
    const { customerId, ...createDto } = dto;
    const quote = await this.quotesService.create(createDto, customerId);
    return toQuoteAdminDetailDto(quote);
  }

  // Confirms a provider option on the target customer's behalf, immediately after admin-side
  // creation — mirrors POST /quotes/:id/select-option, but looks up the quote's owning customer
  // first since staff don't have that customer's JWT to supply it.
  @Post(':id/select-option')
  async selectOption(
    @Param('id') id: string,
    @Body() dto: SelectOptionDto,
  ): Promise<QuoteAdminDetailDto> {
    const existing = await this.quotesService.findOneAdmin(id);
    const quote = await this.quotesService.selectOption(
      id,
      dto.optionId,
      existing.customerId,
    );
    return toQuoteAdminDetailDto(quote);
  }

  @Post(':id/manual-quote')
  async manualQuote(
    @Param('id') id: string,
    @Body() dto: ManualQuoteDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<QuoteAdminDetailDto> {
    const quote = await this.quotesService.setManualQuote(id, dto, user.sub);
    return toQuoteAdminDetailDto(quote);
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectQuoteDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<QuoteAdminDetailDto> {
    const quote = await this.quotesService.reject(id, dto, user.sub);
    return toQuoteAdminDetailDto(quote);
  }
}
