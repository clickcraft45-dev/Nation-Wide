import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Coupon } from '@prisma/client';
import type {
  CouponCheckDto,
  CouponDetailDto,
  CouponDto,
  CouponUsageDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';

function toCouponDto(coupon: Coupon): CouponDto {
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
 * A code nobody has used is deleted outright. One that discounted a booking is hidden instead
 * (deletedAt): those bookings point at it and have to keep saying which code they used.
 */
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CouponDto[]> {
    const coupons = await this.prisma.coupon.findMany({
      where: { deletedAt: null },
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
        const existing = await this.prisma.coupon.findUnique({
          where: { code },
          select: { deletedAt: true },
        });
        throw new ConflictException(
          existing?.deletedAt
            ? `Coupon ${code} was deleted after it had been used, so the code cannot be reused. Choose another code.`
            : `Coupon ${code} already exists`,
        );
      }
      throw error;
    }
  }

  private async findLive(id: string): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon || coupon.deletedAt) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  async setActive(id: string, isActive: boolean): Promise<CouponDto> {
    await this.findLive(id);
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: { isActive },
    });
    return toCouponDto(updated);
  }

  /**
   * Who used a code: every booking it was applied to, newest first. A pickup that became an order
   * is listed once, as the pickup (with its order), not again as the order.
   */
  async detail(id: string): Promise<CouponDetailDto> {
    const coupon = await this.findLive(id);
    const [pickups, orders] = await Promise.all([
      this.prisma.pickupRequest.findMany({
        where: { couponId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true, phone: true } },
          order: {
            select: {
              id: true,
              shipments: {
                select: { internalTrackingNumber: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.order.findMany({
        where: { couponId: id, pickupRequest: { is: null } },
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true, phone: true } },
          shipments: {
            select: { internalTrackingNumber: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      }),
    ]);

    const usages: CouponUsageDto[] = [
      ...pickups.map((p) => ({
        id: p.id,
        kind: 'PICKUP' as const,
        customerId: p.customerId,
        customerName: p.customer.name,
        customerPhone: p.customer.phone,
        discountAmount: p.discountAmount ?? 0,
        // Redeemed when the parcel is accepted and becomes an order (acceptParcel), not at booking.
        redeemed: Boolean(p.orderId),
        status: p.status,
        orderId: p.order?.id ?? null,
        trackingNumber: p.order?.shipments[0]?.internalTrackingNumber ?? null,
        usedAt: p.createdAt.toISOString(),
      })),
      ...orders.map((o) => ({
        id: o.id,
        kind: 'ORDER' as const,
        customerId: o.customerId,
        customerName: o.customer.name,
        customerPhone: o.customer.phone,
        discountAmount: o.discountAmount ?? 0,
        redeemed: true,
        status: o.status,
        orderId: o.id,
        trackingNumber: o.shipments[0]?.internalTrackingNumber ?? null,
        usedAt: (o.paidAt ?? o.createdAt).toISOString(),
      })),
    ].sort((a, b) => b.usedAt.localeCompare(a.usedAt));

    return { coupon: toCouponDto(coupon), usages };
  }

  /**
   * Delete a code. Never used: gone, and the code is free again. Used: hidden from the list and
   * refused from now on, but kept, because the bookings it discounted still name it.
   */
  async remove(id: string): Promise<{ hidden: boolean }> {
    await this.findLive(id);
    const [pickups, orders] = await Promise.all([
      this.prisma.pickupRequest.count({ where: { couponId: id } }),
      this.prisma.order.count({ where: { couponId: id } }),
    ]);
    if (pickups + orders === 0) {
      await this.prisma.coupon.delete({ where: { id } });
      return { hidden: false };
    }
    await this.prisma.coupon.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { hidden: true };
  }

  /** What a code takes off a price, for the customer to see before booking. Claims nothing. */
  async check(code: string, amount: number): Promise<CouponCheckDto> {
    const coupon = await this.validate(code);
    return {
      code: coupon.code,
      // 0 means "priced at pickup": the whole amount comes off once there is a price.
      discountAmount:
        amount > 0
          ? Math.min(coupon.discountAmount, amount)
          : coupon.discountAmount,
    };
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
    if (!coupon || coupon.deletedAt) {
      throw new NotFoundException(`Unknown coupon code: ${code}`);
    }
    if (!coupon.isActive) {
      throw new BadRequestException(
        `Coupon ${coupon.code} is no longer active`,
      );
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
          ? { id: coupon.id, isActive: true, deletedAt: null }
          : {
              id: coupon.id,
              isActive: true,
              deletedAt: null,
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
