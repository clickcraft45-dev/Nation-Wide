import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CustomersService, type PublicCustomer } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { IsBoolean } from 'class-validator';

class SetCustomerActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

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

  // Response body is always a plain array (never break the several callers that need every
  // row — dashboard/reports/payments aggregation, the admin quote wizard's customer search).
  // Passing page/pageSize opts into skip/take and adds an X-Total-Count response header the
  // admin customers list page reads to render pagination controls.
  @Get()
  @Roles('STAFF', 'ADMIN')
  async findAll(
    @Query() query: QueryCustomersDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicCustomer[]> {
    const { data, total } = await this.customersService.findAll(query);
    if (total !== null) res.setHeader('X-Total-Count', String(total));
    return data;
  }

  @Get(':id')
  @Roles('STAFF', 'ADMIN')
  findOne(@Param('id') id: string): Promise<PublicCustomer> {
    return this.customersService.findOne(id);
  }

  // Blocking or restoring access. Separate from update() because it is not an edit of their
  // details — it ends their sessions, and it is what staff reach for instead of deleting.
  @Patch(':id/active')
  @Roles('STAFF', 'ADMIN')
  setActive(
    @Param('id') id: string,
    @Body() dto: SetCustomerActiveDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PublicCustomer> {
    return this.customersService.setActive(id, dto.isActive, user.sub);
  }

  // ADMIN only, and refused outright once the customer has any history — see the service.
  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.customersService.remove(id, user.sub);
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
