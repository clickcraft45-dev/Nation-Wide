import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { PickupRequestDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PickupRequestsService } from '../pickup-requests/pickup-requests.service';
import { toPickupRequestDto } from '../pickup-requests/pickup-requests.mapper';
import { QueryPickupRequestsDto } from '../pickup-requests/dto/query-pickup-requests.dto';
import { AssignPartnerDto } from '../pickup-requests/dto/assign-partner.dto';

// Admin oversight of the pre-order pickup-request pipeline — assign/reassign a Pickup Partner,
// monitor progress, review verification/payment history. Admin never edits the verification,
// payment, or acceptance fields themselves — that's exclusively the assigned partner's job (see
// PartnerPickupRequestsController); this controller is read + assignment only.
@Controller('admin/pickup-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminPickupRequestsController {
  constructor(private readonly pickupRequestsService: PickupRequestsService) {}

  @Get()
  async findAll(
    @Query() query: QueryPickupRequestsDto,
  ): Promise<PickupRequestDto[]> {
    const pickupRequests =
      await this.pickupRequestsService.findAllForAdmin(query);
    return pickupRequests.map(toPickupRequestDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.findOne(id);
    return toPickupRequestDto(pickupRequest);
  }

  @Patch(':id/assign')
  async assignPartner(
    @Param('id') id: string,
    @Body() dto: AssignPartnerDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    const pickupRequest = await this.pickupRequestsService.assignPartner(
      id,
      dto.partnerId,
      user.sub,
    );
    return toPickupRequestDto(pickupRequest);
  }
}
