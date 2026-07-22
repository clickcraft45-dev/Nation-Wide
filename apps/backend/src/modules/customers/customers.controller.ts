import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CustomersService, type PublicCustomer } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Registered ahead of the :id routes below so "me" is never swallowed as an :id param.
  // Ownership always comes from the verified JWT subject — never a client-supplied id.
  @Get('me')
  @Roles('CUSTOMER')
  findMe(@CurrentUser() user: JwtPayload): Promise<PublicCustomer> {
    return this.customersService.findOne(user.sub);
  }

  @Patch('me')
  @Roles('CUSTOMER')
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCustomerDto,
  ): Promise<PublicCustomer> {
    return this.customersService.update(user.sub, dto);
  }

  @Post()
  @Roles('STAFF', 'ADMIN')
  create(@Body() dto: CreateCustomerDto): Promise<PublicCustomer> {
    return this.customersService.create(dto);
  }

  @Get()
  @Roles('STAFF', 'ADMIN')
  findAll(): Promise<PublicCustomer[]> {
    return this.customersService.findAll();
  }

  @Get(':id')
  @Roles('STAFF', 'ADMIN')
  findOne(@Param('id') id: string): Promise<PublicCustomer> {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  @Roles('STAFF', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<PublicCustomer> {
    return this.customersService.update(id, dto);
  }
}
