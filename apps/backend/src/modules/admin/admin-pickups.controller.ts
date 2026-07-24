import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { PickupDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { PickupsService } from '../pickups/pickups.service';
import { toPickupDto } from '../pickups/pickup.mapper';
import { QueryPickupsDto } from '../pickups/dto/query-pickups.dto';
import { UpdatePickupStatusDto } from '../pickups/dto/update-pickup-status.dto';

@Controller('admin/pickups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminPickupsController {
  constructor(private readonly pickupsService: PickupsService) {}

  // Registered ahead of :id so "drop-offs" is never swallowed as an :id param.
  @Get('drop-offs')
  async findDropOffs(@Query() query: QueryPickupsDto): Promise<PickupDto[]> {
    const pickups = await this.pickupsService.findDropOffs(query);
    return pickups.map(toPickupDto);
  }

  @Get()
  async findAll(@Query() query: QueryPickupsDto): Promise<PickupDto[]> {
    const pickups = await this.pickupsService.findAll(query);
    return pickups.map(toPickupDto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PickupDto> {
    const pickup = await this.pickupsService.findOne(id);
    return toPickupDto(pickup);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePickupStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PickupDto> {
    const pickup = await this.pickupsService.updateStatus(id, dto, user.sub);
    return toPickupDto(pickup);
  }
}
