import Link from "next/link";
import { CheckCircle2, PackageCheck, PackageSearch, Truck, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TrackingStatusCode } from "@nationwide/shared-types";
import { cn } from "@/lib/utils/cn";

/**
 * Where the parcel is, said in a sentence — the card at the top of the tracking rail.
 *
 * Follows the reference order-status layout: icon, headline, one plain-English line, one action.
 * The point of it is that the timeline underneath answers "what happened when", and a person
 * opening the page mostly wants "is it fine". A status badge alone does not answer that; "Your
 * order has been dispatched and is now with the courier" does.
 *
 * ILLUSTRATIONS. The reference art (the delivery truck, the confetti receipt) is not in this
 * repo and is not ours to hotlink from the reference bundle, so each state uses the matching
 * lucide icon already installed, sized up and sitting in a tinted well. Drop real artwork into
 * public/assets/images/ and swap the <Icon> here if the illustrations get licensed.
 *
 * The tint is the status colour at low alpha in both themes, so the card retones with the app
 * rather than carrying a fixed dark panel that would glare in light mode.
 */

type StatusKey = TrackingStatusCode | "AWAITING";

const STATES: Record<
  StatusKey,
  { icon: LucideIcon; title: string; description: string; tone: string }
> = {
  AWAITING: {
    icon: PackageSearch,
    title: "Awaiting pickup",
    description: "The shipment is booked. Nothing has been scanned by the courier yet.",
    tone: "text-muted-foreground",
  },
  PICKED_UP: {
    icon: PackageCheck,
    title: "Picked up",
    description: "The courier has collected the parcel and it is entering the network.",
    tone: "text-info",
  },
  IN_TRANSIT: {
    icon: Truck,
    title: "On its way",
    description: "Your order has been dispatched and is now with the courier.",
    tone: "text-info",
  },
  OUT_FOR_DELIVERY: {
    icon: Truck,
    title: "Out for delivery",
    description: "It is on the last van of its journey and should arrive today.",
    tone: "text-warning",
  },
  DELIVERED: {
    icon: CheckCircle2,
    title: "Delivered",
    description: "The parcel reached its destination. Thank you for shipping with us.",
    tone: "text-success",
  },
  // Not a stage of the journey, which is why it is absent from MILESTONE_SEQUENCE — but it is the
  // one state where the headline has to say something is wrong rather than reassure.
  EXCEPTION: {
    icon: XCircle,
    title: "Needs attention",
    description: "The courier reported a problem with this shipment. Check the scans below.",
    tone: "text-danger",
  },
};

export function OrderStatusCard({
  status,
  trackingNumber,
  className,
}: {
  status: TrackingStatusCode | null;
  /** Internal tracking number — links through to the public tracking page. */
  trackingNumber?: string | null;
  className?: string;
}) {
  const state = STATES[status ?? "AWAITING"];
  const Icon = state.icon;

  return (
    <div className={cn("glass rounded-2xl p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl bg-muted",
              state.tone,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>

          <h3 className="mt-4 text-lg font-semibold text-foreground">{state.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{state.description}</p>

          {trackingNumber && (
            <Link
              href={`/tracking?tracking=${encodeURIComponent(trackingNumber)}`}
              // Copy the AWB on the way out so it can be pasted into the carrier's own site too.
              onClick={() => navigator.clipboard?.writeText(trackingNumber).catch(() => {})}
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Track package
            </Link>
          )}
        </div>

        {/* The oversized ghost of the same icon, in place of the reference's illustration — it
            fills the corner the artwork occupied without pretending to be artwork. */}
        <Icon
          className={cn("h-24 w-24 shrink-0 opacity-10", state.tone)}
          strokeWidth={1}
          aria-hidden
        />
      </div>
    </div>
  );
}
