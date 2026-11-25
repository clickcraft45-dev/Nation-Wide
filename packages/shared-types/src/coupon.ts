/** A flat-rupee discount code an admin hands out. */
export interface CouponDto {
  id: string;
  code: string;
  /** Flat rupees off the amount being paid. */
  discountAmount: number;
  isActive: boolean;
  expiresAt: string | null; // ISO 8601, null = never expires
  /** Total redemptions allowed across all customers; null = unlimited. */
  maxRedemptions: number | null;
  timesUsed: number;
  createdAt: string; // ISO 8601
}

export interface CreateCouponDto {
  code: string;
  discountAmount: number;
  expiresAt?: string;
  maxRedemptions?: number;
}

/** Whether a coupon can be applied right now, without asking the server to try it. */
export function isCouponUsable(coupon: CouponDto, now: Date = new Date()): boolean {
  if (!coupon.isActive) return false;
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now.getTime()) return false;
  if (coupon.maxRedemptions !== null && coupon.timesUsed >= coupon.maxRedemptions) return false;
  return true;
}

/** One booking or order a coupon was applied to: who used it, when, and how far it got. */
export interface CouponUsageDto {
  /** Pickup request or order id. */
  id: string;
  kind: "PICKUP" | "ORDER";
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  discountAmount: number;
  /** Applied at booking but the money is not taken yet: the redemption is not counted until then. */
  redeemed: boolean;
  /** The pickup or order status, as stored. */
  status: string;
  /** The order it became, once the parcel was accepted, and its tracking number. */
  orderId: string | null;
  trackingNumber: string | null;
  usedAt: string; // ISO 8601
}

export interface CouponDetailDto {
  coupon: CouponDto;
  usages: CouponUsageDto[];
}

/** GET /coupons/check: what a code takes off a price, checked before booking. */
export interface CouponCheckDto {
  code: string;
  /** Rupees off, never more than the amount it was checked against. */
  discountAmount: number;
}
