import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ShippingProvidersService,
  type ShippingProviderSummary,
} from './shipping-providers.service';

@Controller('shipping-providers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class ShippingProvidersController {
  constructor(
    private readonly shippingProvidersService: ShippingProvidersService,
  ) {}

  @Get()
  findAll(): Promise<ShippingProviderSummary[]> {
    return this.shippingProvidersService.findAll();
  }
}
