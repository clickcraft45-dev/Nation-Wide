import type { FulfillmentMethodCode, PickupTimeSlot } from "./quote";

// Shared by both fulfillment methods — a Pickup row represents "how the parcel physically
// reaches us" whether that's a scheduled pickup or a warehouse drop-off. Only the terminal
// state differs (PICKED_UP vs DROPPED_OFF).
export const PICKUP_STATUSES = [
  "SCHEDULED",
  "PENDING",
  "ASSIGNED",
  "PICKUP_IN_PROGRESS",
  "PICKED_UP",
  "CANCELLED",
  "PICKUP_FAILED",
  "DROPPED_OFF",
] as const;
export type PickupStatusCode = (typeof PICKUP_STATUSES)[number];

export interface PickupDto {
  id: string;
  quoteId: string;
  orderId: string | null;
  method: FulfillmentMethodCode;
  status: PickupStatusCode;
  scheduledDate: string | null; // ISO 8601 date-only
  scheduledTimeSlot: PickupTimeSlot | null;
  assignedStaffEmail: string | null;
  confirmedByAdminEmail: string | null;
  confirmedAt: string | null; // ISO 8601
  weightVerifiedKg: number | null;
  notes: string | null;
  customerName: string;
  customerPhone: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface UpdatePickupStatusDto {
  status: PickupStatusCode;
  weightVerifiedKg?: number;
  notes?: string;
}
