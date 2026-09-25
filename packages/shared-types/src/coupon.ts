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
