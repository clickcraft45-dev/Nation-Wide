import { Controller, Get, Header, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  CountryDto,
  QuotePreviewResultDto,
} from '@nationwide/shared-types';
import { CountriesService } from '../pricing/countries.service';
import { toCountryDto } from '../pricing/country.mapper';
import { QuotesService } from './quotes.service';
import { QuotePreviewQueryDto } from './dto/quote-preview.dto';

// The homepage "Explore prices" page: a visitor sees the same per-carrier final prices the
// signed-in quote wizard shows, without an account. Deliberately public and unauthenticated —
// it runs the same stateless QuotesService.preview (no rows written, only finalPrice per carrier,
// never cost or margin), so it reveals nothing the wizard doesn't already show any customer.
// Throttled tighter than the 300/min global default so it can't be scraped into a rate sheet.
const PUBLIC_PRICE_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

@Controller('public')
export class PublicPricesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly countriesService: CountriesService,
  ) {}

  @Header('Cache-Control', 'public, max-age=600')
  @Get('countries')
  async countries(): Promise<CountryDto[]> {
    const countries = await this.countriesService.findAllActive();
    return countries.map(toCountryDto);
  }

  @Throttle(PUBLIC_PRICE_THROTTLE)
  @Get('prices')
  prices(@Query() query: QuotePreviewQueryDto): Promise<QuotePreviewResultDto> {
    return this.quotesService.preview(query);
  }
}
