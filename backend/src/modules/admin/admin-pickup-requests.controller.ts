import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  PickupRequestDto,
  RecalculatePreviewDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PickupRequestsService } from '../pickup-requests/pickup-requests.service';
import { toPickupRequestDto } from '../pickup-requests/pickup-requests.mapper';
import { QueryPickupRequestsDto } from '../pickup-requests/dto/query-pickup-requests.dto';
import { AssignPartnerDto } from '../pickup-requests/dto/assign-partner.dto';
import { RecalculateWeightDto } from '../pickup-requests/dto/recalculate-weight.dto';
import { VerifyPickupRequestDto } from '../pickup-requests/dto/verify-pickup-request.dto';
import { CollectPaymentDto } from '../pickup-requests/dto/collect-payment.dto';
import { AcceptParcelDto } from '../pickup-requests/dto/accept-parcel.dto';
import { RejectParcelDto } from '../pickup-requests/dto/reject-parcel.dto';

// Admin oversight of the pre-order pickup-request pipeline — assign/reassign a Pickup Partner,
// monitor progress, review verification/payment history. The verification/payment/acceptance
// actions below exist ONLY for warehouse drop-offs, which admin handles at the warehouse instead
// of a partner; the service refuses them on any other pickup (findOneForPartner's asAdmin).
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

  // Warehouse drop-off workflow: received -> verify -> payment -> accept/reject.
  @Patch(':id/arrive')
  async arrive(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.markArrived(id, user.sub, true),
    );
  }

  @Post(':id/recalculate')
  recalculate(
    @Param('id') id: string,
    @Body() dto: RecalculateWeightDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecalculatePreviewDto> {
    return this.pickupRequestsService.recalculate(id, dto, user.sub, true);
  }

  @Patch(':id/verify')
  async verify(
    @Param('id') id: string,
    @Body() dto: VerifyPickupRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.verify(id, dto, user.sub, true),
    );
  }

  @Patch(':id/collect-payment')
  async collectPayment(
    @Param('id') id: string,
    @Body() dto: CollectPaymentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.collectPayment(id, dto, user.sub, true),
    );
  }

  @Patch(':id/accept')
  async acceptParcel(
    @Param('id') id: string,
    @Body() dto: AcceptParcelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.acceptParcel(id, dto, user.sub, true),
    );
  }

  @Patch(':id/reject')
  async rejectParcel(
    @Param('id') id: string,
    @Body() dto: RejectParcelDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupRequestDto> {
    return toPickupRequestDto(
      await this.pickupRequestsService.rejectParcel(id, dto, user.sub, true),
    );
  }
}
