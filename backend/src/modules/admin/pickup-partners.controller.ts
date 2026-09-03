import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { PickupPartnerDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PickupPartnersService } from './pickup-partners.service';
import { toPickupPartnerDto } from './pickup-partners.mapper';
import { CreatePickupPartnerDto } from './dto/create-pickup-partner.dto';
import { UpdatePickupPartnerDto } from './dto/update-pickup-partner.dto';

@Controller('admin/pickup-partners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class PickupPartnersController {
  constructor(private readonly pickupPartnersService: PickupPartnersService) {}

  @Get()
  async findAll(): Promise<PickupPartnerDto[]> {
    const partners = await this.pickupPartnersService.findAll();
    return partners.map(toPickupPartnerDto);
  }

  @Post()
  async create(@Body() dto: CreatePickupPartnerDto): Promise<PickupPartnerDto> {
    const partner = await this.pickupPartnersService.create(dto);
    return toPickupPartnerDto(partner);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePickupPartnerDto,
  ): Promise<PickupPartnerDto> {
    const partner = await this.pickupPartnersService.update(id, dto);
    return toPickupPartnerDto(partner);
  }
}
