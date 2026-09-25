import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Coupon } from '@prisma/client';
import type { CouponDto } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';

export function toCouponDto(coupon: Coupon): CouponDto {
  return {
    id: coupon.id,
    code: coupon.code,
    discountAmount: coupon.discountAmount,
    isActive: coupon.isActive,
    expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
    maxRedemptions: coupon.maxRedemptions,
    timesUsed: coupon.timesUsed,
    createdAt: coupon.createdAt.toISOString(),
  };
}

/**
 * Discount codes: flat rupees off, created by an admin, applied when a payment is recorded.
 *
 * Nothing is ever deleted — an order that was discounted points at the coupon that discounted it,
 * so a retired code is deactivated instead and stops validating from that moment on.
 */
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CouponDto[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return coupons.map(toCouponDto);
  }

  async create(
    input: {
      code: string;
      discountAmount: number;
      expiresAt?: string;
      maxRedemptions?: number;
    },
    adminId: string,
  ): Promise<CouponDto> {
    const code = normalizeCode(input.code);
    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code,
          discountAmount: input.discountAmount,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          maxRedemptions: input.maxRedemptions ?? null,
          createdByAdminId: adminId,
        },
      });
      return toCouponDto(coupon);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Coupon ${code} already exists`);
      }
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<CouponDto> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: { isActive },
    });
    return toCouponDto(updated);
  }

  /**
   * Resolve a code to the coupon it names, rejecting anything that cannot be used right now.
   *
   * This is the trust boundary: the admin screen previews a discount from the list it already
   * holds, but what actually comes off an order is decided here, against the database, at the
   * moment the payment is recorded.
   */
  async validate(code: string): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalizeCode(code) },
    });
    if (!coupon) throw new NotFoundException(`Unknown coupon code: ${code}`);
    if (!coupon.isActive) {
      throw new BadRequestException(`Coupon ${coupon.code} is no longer active`);
    }
    if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(`Coupon ${coupon.code} has expired`);
    }
    if (
      coupon.maxRedemptions !== null &&
      coupon.timesUsed >= coupon.maxRedemptions
    ) {
      throw new BadRequestException(
        `Coupon ${coupon.code} has been fully redeemed`,
      );
    }
    return coupon;
  }

  /**
   * Claim one redemption, atomically. The `timesUsed < maxRedemptions` guard lives in the WHERE
   * clause rather than in a read-then-write, so two payments recorded at the same moment cannot
   * both take the last redemption of a limited code.
   */
  async redeem(code: string): Promise<Coupon> {
    const coupon = await this.validate(code);
    const claim = await this.prisma.coupon.updateMany({
      where:
        coupon.maxRedemptions === null
          ? { id: coupon.id, isActive: true }
          : {
              id: coupon.id,
              isActive: true,
              timesUsed: { lt: coupon.maxRedemptions },
            },
      data: { timesUsed: { increment: 1 } },
    });
    if (claim.count === 0) {
      throw new BadRequestException(
        `Coupon ${coupon.code} has been fully redeemed`,
      );
    }
    return coupon;
  }
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
