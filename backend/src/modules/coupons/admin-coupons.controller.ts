import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { CouponDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CouponsService } from './coupons.service';

class CreateCouponDto {
  // Letters, digits, dash and underscore only: the code gets read out over the phone and typed
  // back in at a counter, and anything else invites a code nobody can dictate.
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may only contain letters, digits, - and _',
  })
  code!: string;

  /** Flat rupees off. */
  @IsPositive()
  @Max(1_000_000)
  discountAmount!: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxRedemptions?: number;
}

class SetCouponActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

// ADMIN-only, same bar as the rest of Finance: a coupon is money off an invoice.
@Controller('admin/coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(): Promise<CouponDto[]> {
    return this.coupons.list();
  }

  @Post()
  create(
    @Body() dto: CreateCouponDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CouponDto> {
    return this.coupons.create(dto, user.sub);
  }

  @Patch(':id/active')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCouponActiveDto,
  ): Promise<CouponDto> {
    return this.coupons.setActive(id, dto.isActive);
  }
}
