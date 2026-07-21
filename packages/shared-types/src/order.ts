export const ORDER_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"] as const;

export type OrderStatusCode = (typeof ORDER_STATUSES)[number];

export interface ShipmentSummaryDto {
  id: string;
  internalTrackingNumber: string;
  providerId: string;
  currentStatus: string | null;
  createdAt: string; // ISO 8601
}

export interface OrderDto {
  id: string;
  customerId: string;
  status: OrderStatusCode;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  shipments: ShipmentSummaryDto[];
}
