import { CheckCircle2, Circle } from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";

const STEPS = [
  "Pickup Requested",
  "Pickup Scheduled",
  "Pickup Partner Assigned",
  "Pickup In Progress",
  "Weight Verified",
  "Payment Received",
  "Shipment Accepted",
  "Order Generated",
  "Tracking Active",
] as const;

// Derives which of the 9 milestones are complete purely from PickupRequestDto's own fields —
// no separate "current step" enum to keep in sync (Section: Customer experience).
function completedSteps(pickup: PickupRequestDto): boolean[] {
  const requested = true;
  const scheduled = pickup.dropAtWarehouse || Boolean(pickup.pickupDate);
  const partnerAssigned = Boolean(pickup.assignedPartnerId);
  const inProgress =
    pickup.status === "OUT_FOR_PICKUP" ||
    pickup.status === "VERIFICATION_PENDING" ||
    pickup.status === "COMPLETED" ||
    Boolean(pickup.verifiedAt);
  const weightVerified = Boolean(pickup.verifiedAt);
  const paymentReceived = Boolean(pickup.paymentCollectedAt);
  const accepted = pickup.status === "COMPLETED";
  const orderGenerated = Boolean(pickup.orderId);
  const trackingActive = Boolean(pickup.orderId);
  return [
    requested,
    scheduled,
    partnerAssigned,
    inProgress,
    weightVerified,
    paymentReceived,
    accepted,
    orderGenerated,
    trackingActive,
  ];
}

export function PickupStatusPipeline({ pickup }: { pickup: PickupRequestDto }) {
  if (pickup.status === "REJECTED" || pickup.status === "CANCELLED") {
    return (
      <div className="rounded-md border border-danger-border bg-danger-bg p-4 text-sm text-danger">
        {pickup.status === "REJECTED"
          ? `Your parcel was rejected: ${pickup.rejectionReason ?? "no reason given"}.`
          : "This pickup request was cancelled."}
      </div>
    );
  }

  const done = completedSteps(pickup);
  return (
    <ol className="space-y-3">
      {STEPS.map((step, i) => (
        <li key={step} className="flex items-center gap-3">
          {done[i] ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
          ) : (
            <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className={done[i] ? "text-sm text-foreground" : "text-sm text-muted-foreground"}>
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}
