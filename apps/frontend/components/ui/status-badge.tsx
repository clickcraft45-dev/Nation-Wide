import type {
  TrackingStatusCode,
  OrderStatusCode,
  QuoteStatusCode,
  PickupStatusCode,
  PaymentStatusCode,
} from "@nationwide/shared-types";
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

const QUOTE_STATUS_VARIANT: Record<QuoteStatusCode, BadgeProps["variant"]> = {
  SUBMITTED: "neutral",
  NEEDS_MANUAL_REVIEW: "warning",
  QUOTED: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatusCode }) {
  return (
    <Badge variant={QUOTE_STATUS_VARIANT[status]}>{status.replace(/_/g, " ")}</Badge>
  );
}

const PICKUP_STATUS_VARIANT: Record<PickupStatusCode, BadgeProps["variant"]> = {
  SCHEDULED: "neutral",
  PENDING: "warning",
  ASSIGNED: "info",
  PICKUP_IN_PROGRESS: "info",
  PICKED_UP: "success",
  CANCELLED: "danger",
  PICKUP_FAILED: "danger",
  DROPPED_OFF: "success",
};

export function PickupStatusBadge({ status }: { status: PickupStatusCode }) {
  return (
    <Badge variant={PICKUP_STATUS_VARIANT[status]}>{status.replace(/_/g, " ")}</Badge>
  );
}

const PAYMENT_STATUS_VARIANT: Record<PaymentStatusCode, BadgeProps["variant"]> = {
  PENDING: "warning",
  PAID: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatusCode }) {
  return <Badge variant={PAYMENT_STATUS_VARIANT[status]}>{status}</Badge>;
}
