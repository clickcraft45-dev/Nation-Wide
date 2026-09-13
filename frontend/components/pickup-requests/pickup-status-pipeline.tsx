import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  IndianRupee,
  MapPin,
  PackageCheck,
  Phone,
  Search,
  Truck,
  UserCheck,
  Warehouse,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { ProgressTimeline, type ProgressMilestone } from "@/components/ui/progress-timeline";
import { cn } from "@/lib/utils/cn";

function when(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function money(amount: number, currency: string): string {
  return `${currency === "INR" ? "₹" : `${currency} `}${Math.round(amount).toLocaleString("en-IN")}`;
}

function slot(pickup: PickupRequestDto): string {
  if (pickup.dropAtWarehouse) return "Warehouse drop-off";
  if (!pickup.pickupDate) return "Not scheduled";
  const day = new Date(`${pickup.pickupDate}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return pickup.pickupTimeSlot ? `${day} · ${pickup.pickupTimeSlot}` : day;
}

/** Where the pickup stands right now, in the customer's words. Checked latest-first. */
export function pickupStage(pickup: PickupRequestDto): { icon: LucideIcon; title: string; body: string } {
  const amount = money(pickup.verifiedPrice ?? pickup.estimatedPrice, pickup.currency);
  if (pickup.orderId || pickup.status === "COMPLETED") {
    return {
      icon: PackageCheck,
      title: "Your shipment is booked",
      body: "Your order has been created. Track it any time from My Orders.",
    };
  }
  if (pickup.paymentCollectedAt) {
    return { icon: IndianRupee, title: "Payment received", body: "We're creating your order now." };
  }
  if (pickup.verifiedAt) {
    return {
      icon: CheckCircle2,
      title: "Parcel weighed and priced",
      body: `Verified at ${pickup.verifiedWeightKg ?? pickup.estimatedWeightKg}kg — ${amount} to pay.`,
    };
  }
  if (pickup.arrivedAt) {
    return pickup.dropAtWarehouse
      ? { icon: Warehouse, title: "Parcel received at the warehouse", body: "Our team is weighing it now." }
      : { icon: Truck, title: "Your pickup partner has arrived", body: "They'll weigh your parcel and confirm the price." };
  }
  if (pickup.dropAtWarehouse) {
    return {
      icon: Warehouse,
      title: "Bring your parcel to our warehouse",
      body: "Our team will weigh it, take payment and ship it.",
    };
  }
  if (pickup.assignedAt) {
    return {
      icon: UserCheck,
      title: `${pickup.assignedPartnerName ?? "A pickup partner"} will collect your parcel`,
      body: `Scheduled for ${slot(pickup)}. They'll call before arriving.`,
    };
  }
  return {
    icon: Search,
    title: "Finding a pickup partner",
    body: "You'll get a notification as soon as a partner accepts your pickup.",
  };
}

export function pickupMilestones(pickup: PickupRequestDto): ProgressMilestone[] {
  const verified = pickup.verifiedAt
    ? `${when(pickup.verifiedAt)} · ${pickup.verifiedWeightKg ?? pickup.estimatedWeightKg}kg`
    : null;
  return [
    { label: "Request received", timestamp: when(pickup.createdAt) },
    ...(pickup.dropAtWarehouse
      ? [{ label: "Parcel received at warehouse", timestamp: when(pickup.arrivedAt) }]
      : [
          { label: "Partner assigned", timestamp: when(pickup.assignedAt) },
          { label: "Partner arrived", timestamp: when(pickup.arrivedAt) },
        ]),
    { label: "Weight & price confirmed", timestamp: verified },
    { label: "Payment received", timestamp: when(pickup.paymentCollectedAt) },
    // No dedicated timestamp for order creation: completion is the last write to the request.
    { label: "Order created", timestamp: pickup.orderId ? when(pickup.updatedAt) : null },
  ];
}

export function PickupStatusPipeline({ pickup }: { pickup: PickupRequestDto }) {
  if (pickup.status === "REJECTED" || pickup.status === "CANCELLED") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-danger-border bg-danger-bg p-4 text-sm text-danger">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">
            {pickup.status === "REJECTED" ? "Your parcel was not accepted" : "This pickup was cancelled"}
          </p>
          {pickup.status === "REJECTED" && <p className="mt-0.5">{pickup.rejectionReason ?? "No reason given."}</p>}
        </div>
      </div>
    );
  }

  const current = pickupStage(pickup);
  const Icon = current.icon;
  const done = Boolean(pickup.orderId);
  const amount = pickup.verifiedPrice ?? pickup.estimatedPrice;

  return (
    <div className="space-y-5">
      {/* Where it stands now — the one thing most people open this page for. */}
      <div className={cn("flex items-start gap-4 rounded-2xl p-5", done ? "bg-success-bg" : "glass-dark text-white")}>
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            done ? "bg-success text-white" : "bg-white/15 text-white",
          )}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-base font-semibold", done ? "text-success" : "text-white")}>{current.title}</p>
          <p className={cn("mt-1 text-sm", done ? "text-foreground" : "text-white/75")}>{current.body}</p>
          {done && (
            <Link
              href="/orders"
              className="mt-3 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Track in My Orders
            </Link>
          )}
        </div>
      </div>

      {pickup.assignedPartnerName && !pickup.orderId && <PartnerContact pickup={pickup} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Detail icon={CalendarClock} label="Pickup" value={slot(pickup)} />
        <Detail
          icon={MapPin}
          label={pickup.dropAtWarehouse ? "Drop-off" : "Address"}
          value={
            pickup.dropAtWarehouse
              ? "NationWide warehouse"
              : [pickup.pickupAddressLine1, pickup.pickupCity].filter(Boolean).join(", ")
          }
        />
        {!pickup.dropAtWarehouse && !pickup.assignedPartnerName && (
          <Detail icon={UserCheck} label="Pickup partner" value="Being assigned" />
        )}
        <Detail
          icon={IndianRupee}
          label={pickup.verifiedPrice != null ? "Final price" : "Quoted price"}
          value={amount > 0 ? money(amount, pickup.currency) : "Priced at pickup"}
        />
      </div>

      <div className="glass rounded-2xl p-5">
        <ProgressTimeline milestones={pickupMilestones(pickup)} />
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="glass flex items-start gap-3 rounded-xl p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

/** Who is coming, with a one-tap call — shown from the moment a partner accepts. */
export function PartnerContact({ pickup, compact = false }: { pickup: PickupRequestDto; compact?: boolean }) {
  if (!pickup.assignedPartnerName) return null;
  const initials = pickup.assignedPartnerName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={cn("glass flex items-center gap-3 rounded-xl", compact ? "p-2.5" : "p-4")}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
          compact ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm",
        )}
        aria-hidden
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">Your pickup partner</p>
        <p className="truncate text-sm font-semibold text-foreground">{pickup.assignedPartnerName}</p>
        {pickup.assignedPartnerPhone && (
          <p className="truncate text-xs text-muted-foreground">{pickup.assignedPartnerPhone}</p>
        )}
      </div>
      {pickup.assignedPartnerPhone && (
        <a
          href={`tel:${pickup.assignedPartnerPhone}`}
          aria-label={`Call ${pickup.assignedPartnerName}`}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-success px-4 text-sm font-medium text-white"
        >
          <Phone className="h-4 w-4" aria-hidden />
          Call
        </a>
      )}
    </div>
  );
}

/**
 * The same journey as the timeline, squeezed into one row for a list card: a segmented bar filled
 * up to the latest reached step, with the current stage named underneath.
 */
export function PickupProgressBar({ pickup }: { pickup: PickupRequestDto }) {
  if (pickup.status === "REJECTED" || pickup.status === "CANCELLED") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-danger-border bg-danger-bg px-2.5 py-2 text-xs text-danger">
        <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {pickup.status === "REJECTED" ? "Parcel not accepted" : "Pickup cancelled"}
      </p>
    );
  }
  const steps = pickupMilestones(pickup);
  const reached = steps.reduce((last, step, i) => (step.timestamp ? i : last), 0);
  const current = pickupStage(pickup);
  const CurrentIcon = current.icon;
  return (
    <div className="space-y-2">
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={reached + 1}
        aria-valuetext={`${steps[reached].label}, step ${reached + 1} of ${steps.length}`}
      >
        {steps.map((step, i) => (
          <span
            key={step.label}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= reached
                ? pickup.orderId
                  ? "bg-success"
                  : "bg-primary"
                : // The step being worked on right now pulses, so the bar reads as live.
                  i === reached + 1
                  ? "animate-pulse bg-primary/30"
                  : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <CurrentIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{current.title}</span>
        </span>
        <span className="shrink-0 text-muted-foreground">
          {reached + 1}/{steps.length}
        </span>
      </div>
    </div>
  );
}
