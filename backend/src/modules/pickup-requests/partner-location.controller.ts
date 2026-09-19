import { Body, Controller, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { IsLatitude, IsLongitude } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PickupRequestsService } from './pickup-requests.service';

class PartnerLocationDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}

// The partner app reports its position once per session — not live tracking — so staff assigning
// a pickup by hand can see who is nearby.
@Controller('partner/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PICKUP_PARTNER')
export class PartnerLocationController {
  constructor(private readonly pickupRequestsService: PickupRequestsService) {}

  @Patch('location')
  @HttpCode(204)
  updateLocation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PartnerLocationDto,
  ): Promise<void> {
    return this.pickupRequestsService.updatePartnerLocation(
      user.sub,
      dto.latitude,
      dto.longitude,
    );
  }
}
