import type { TrackingStatusCode, OrderStatusCode } from "@nationwide/shared-types";
import { Badge, type BadgeProps } from "./badge";

const TRACKING_STATUS_VARIANT: Record<TrackingStatusCode, BadgeProps["variant"]> = {
  PICKED_UP: "info",
  IN_TRANSIT: "info",
  OUT_FOR_DELIVERY: "warning",
  DELIVERED: "success",
  EXCEPTION: "danger",
};

const TRACKING_STATUS_LABEL: Record<TrackingStatusCode, string> = {
  PICKED_UP: "Picked Up",
  IN_TRANSIT: "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  EXCEPTION: "Exception",
};

const ORDER_STATUS_VARIANT: Record<OrderStatusCode, BadgeProps["variant"]> = {
  PENDING: "neutral",
  CONFIRMED: "info",
  CANCELLED: "danger",
  COMPLETED: "success",
};

export function TrackingStatusBadge({
  status,
}: {
  status: TrackingStatusCode | string | null | undefined;
}) {
  if (!status || !(status in TRACKING_STATUS_VARIANT)) {
    return <Badge variant="neutral">No update yet</Badge>;
  }
  const code = status as TrackingStatusCode;
  return (
    <Badge variant={TRACKING_STATUS_VARIANT[code]}>
      {TRACKING_STATUS_LABEL[code]}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatusCode }) {
  return (
    <Badge variant={ORDER_STATUS_VARIANT[status]}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}
