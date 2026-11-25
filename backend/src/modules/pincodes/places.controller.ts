import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  PlaceAddressDto,
  PlaceSuggestionDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlacesService } from './places.service';

// Any signed-in role: the customer address forms, the admin pickup map and the partner app all
// search places. Throttled like the PIN lookup, since every pause in typing is a call out.
@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('suggest')
  suggest(
    @Query('q') q = '',
    @Query('region') region?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ): Promise<PlaceSuggestionDto[]> {
    const la = Number(lat);
    const ln = Number(lng);
    const near =
      lat &&
      lng &&
      Number.isFinite(la) &&
      Number.isFinite(ln) &&
      Math.abs(la) <= 90 &&
      Math.abs(ln) <= 180
        ? { lat: la, lng: ln }
        : null;
    return this.places.suggest(String(q), region, near);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':placeId')
  details(@Param('placeId') placeId: string): Promise<PlaceAddressDto> {
    return this.places.details(placeId);
  }
}
