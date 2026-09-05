import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AdminUserDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AdminUsersService } from './admin-users.service';
import { toAdminUserDto } from './admin-users.mapper';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { ResetAdminUserPasswordDto } from './dto/reset-admin-user-password.dto';

// ADMIN only — not STAFF, unlike most of this module. Anything less means a STAFF account can
// promote itself to ADMIN, which makes the role boundary decorative.
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  async findAll(): Promise<AdminUserDto[]> {
    const users = await this.adminUsers.findAll();
    return users.map(toAdminUserDto);
  }

  @Post()
  async create(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminUserDto> {
    return toAdminUserDto(await this.adminUsers.create(dto, user.sub));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminUserDto> {
    return toAdminUserDto(await this.adminUsers.update(id, dto, user.sub));
  }

  // Separate from PATCH so a password can never be changed by the same request that changes a
  // role, and so the password never appears in an UpdateAdminUserDto audit snapshot.
  @Patch(':id/password')
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetAdminUserPasswordDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminUserDto> {
    return toAdminUserDto(
      await this.adminUsers.resetPassword(id, dto.password, user.sub),
    );
  }
}
