import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { PostalLookupDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PostalCodesService } from './postal-codes.service';

class PostalLookupQuery {
  @IsString()
  @MaxLength(16)
  code!: string;

  /** A country name as in GET /countries, or its ISO code. Omit to search every country. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

// Same audience and limits as /pincodes: every signed-in form that takes an address.
@Controller('postal-codes')
@UseGuards(JwtAuthGuard)
export class PostalCodesController {
  constructor(private readonly postalCodes: PostalCodesService) {}

  // Each lookup may proxy a third-party API with a quota we share across every user.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'private, max-age=86400')
  @Get()
  lookup(@Query() query: PostalLookupQuery): Promise<PostalLookupDto> {
    return this.postalCodes.lookup(query.code, query.country);
  }
}
