import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { ShipmentAdminDetailDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ShipmentsService } from '../shipments/shipments.service';
import { toShipmentAdminDetailDto } from '../shipments/shipment-admin-detail.mapper';
import { MapExternalTrackingNumberDto } from './dto/map-external-tracking-number.dto';
import { OverrideTrackingStatusDto } from './dto/override-tracking-status.dto';

@Controller('admin/shipments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get(':internalTrackingNumber')
  async findOne(
    @Param('internalTrackingNumber') internalTrackingNumber: string,
  ): Promise<ShipmentAdminDetailDto> {
    const shipment = await this.shipmentsService.findByInternalTrackingNumber(
      internalTrackingNumber,
    );
    return toShipmentAdminDetailDto(shipment);
  }

  @Post(':internalTrackingNumber/external-tracking-number')
  async mapExternalTrackingNumber(
    @Param('internalTrackingNumber') internalTrackingNumber: string,
    @Body() dto: MapExternalTrackingNumberDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ShipmentAdminDetailDto> {
    const shipment = await this.shipmentsService.mapExternalTrackingNumber(
      internalTrackingNumber,
      dto.providerId,
      dto.externalTrackingNumber,
      user.sub,
    );
    return toShipmentAdminDetailDto(shipment);
  }

  @Post(':internalTrackingNumber/override')
  async overrideStatus(
    @Param('internalTrackingNumber') internalTrackingNumber: string,
    @Body() dto: OverrideTrackingStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ShipmentAdminDetailDto> {
    const shipment = await this.shipmentsService.overrideTrackingStatus(
      internalTrackingNumber,
      dto,
      user.sub,
    );
    return toShipmentAdminDetailDto(shipment);
  }
}
