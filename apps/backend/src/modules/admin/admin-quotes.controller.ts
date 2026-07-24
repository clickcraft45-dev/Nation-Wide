import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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

@Controller('admin/quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminQuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get()
  async findAll(@Query() query: QueryQuotesDto): Promise<QuoteAdminDetailDto[]> {
    const quotes = await this.quotesService.findAllAdmin(query);
    return quotes.map(toQuoteAdminDetailDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<QuoteAdminDetailDto> {
    const quote = await this.quotesService.findOneAdmin(id);
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
