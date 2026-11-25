import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import type { CouponCheckDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CouponsService } from './coupons.service';

class CheckCouponQueryDto {
  @IsString()
  @MaxLength(32)
  code!: string;

  /** The price the code would come off. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  amount!: number;
}

// Tight: a customer checks a code or two per booking, and this must not become a way to guess
// codes by brute force.
const CHECK_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

// The customer's "Apply" button: shows the discount and the new total before they book. Nothing
// is claimed here; the booking validates the code again and the redemption is taken with the money.
@Controller('coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Throttle(CHECK_THROTTLE)
  @Get('check')
  check(@Query() query: CheckCouponQueryDto): Promise<CouponCheckDto> {
    return this.coupons.check(query.code, query.amount);
  }
}
