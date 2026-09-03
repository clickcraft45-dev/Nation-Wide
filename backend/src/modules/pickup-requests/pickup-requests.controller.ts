import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PickupRequestDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PickupRequestsService } from './pickup-requests.service';
import { toPickupRequestDto } from './pickup-requests.mapper';
import { CreatePickupRequestDto } from './dto/create-pickup-request.dto';

// Tighter than the lenient 300/min global default — each submission writes a row and (per the
// pickup-request lifecycle) can trigger downstream notification/partner-assignment work.
const PICKUP_REQUEST_CREATE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

// Customer-facing surface — submitting and tracking a pickup request after selecting a carrier
// on a quote. No destination address here (already known from the Quote); see
// CreatePickupRequestDto's own doc comment.
@Controller('pickup-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class PickupRequestsController {
  constructor(private readonly pickupRequestsService: PickupRequestsService) {}

  @Throttle(PICKUP_REQUEST_CREATE_THROTTLE)
  @Post()
  async create(
    @Body() dto: CreatePickupRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.create(
      dto,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }

  // Registered ahead of :id so "me" is never swallowed as an :id param, matching
  // quotes.controller.ts's convention.
  @Get('me')
  async findMine(@CurrentUser() user: JwtPayload): Promise<PickupRequestDto[]> {
    const pickupRequests = await this.pickupRequestsService.findAllForCustomer(
      user.sub,
    );
    return pickupRequests.map(toPickupRequestDto);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.findOneForCustomer(
      id,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }
}
