import type { TrackingStatusCode } from '@nationwide/shared-types';

/**
 * Matches the pre-approved WhatsApp template names from Section 18. Real Meta templates must be
 * submitted and approved before Phase 8 can go live against a real WABA — these names are what
 * that submission should use so the stub and the real adapter stay interchangeable.
 */
export const NOTIFICATION_TEMPLATES = {
  ORDER_CONFIRMATION: 'order_confirmation',
  TRACKING_NUMBER_ASSIGNED: 'tracking_number_assigned',
  PICKED_UP: 'pickup_confirmation',
  IN_TRANSIT: 'in_transit_update',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  EXCEPTION: 'delivery_exception',
  QUOTE_READY: 'quote_ready',
  QUOTE_REJECTED: 'quote_rejected',
  // Distinct from PICKED_UP's 'pickup_confirmation' (that one's a tracking-status update);
  // this fires once for either a pickup or a warehouse drop-off being confirmed by staff.
  PICKUP_CONFIRMED: 'pickup_or_dropoff_confirmed',
  // Pickup Partner workflow (customer self-service path — see PickupRequest).
  PICKUP_REQUEST_NEEDED: 'pickup_request_needed',
  PICKUP_REQUEST_RECEIVED: 'pickup_request_received',
  PICKUP_PARTNER_ASSIGNED: 'pickup_partner_assigned',
  PICKUP_VERIFICATION_COMPLETE: 'pickup_verification_complete',
  PAYMENT_COLLECTED: 'payment_collected',
  ORDER_CREATED_FROM_PICKUP: 'order_created_from_pickup',
  PICKUP_REJECTED: 'pickup_rejected',
} as const;

const STATUS_TEMPLATE_MAP: Record<TrackingStatusCode, string> = {
  PICKED_UP: NOTIFICATION_TEMPLATES.PICKED_UP,
  IN_TRANSIT: NOTIFICATION_TEMPLATES.IN_TRANSIT,
  OUT_FOR_DELIVERY: NOTIFICATION_TEMPLATES.OUT_FOR_DELIVERY,
  DELIVERED: NOTIFICATION_TEMPLATES.DELIVERED,
  EXCEPTION: NOTIFICATION_TEMPLATES.EXCEPTION,
};

export function templateForTrackingStatus(status: TrackingStatusCode): string {
  return STATUS_TEMPLATE_MAP[status];
}
