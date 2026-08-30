"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CircleAlert,
  FileText,
  HelpCircle,
  Package,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { QuoteDto, ShipmentTypeCode } from "@nationwide/shared-types";
import { Button, buttonVariants } from "@/components/ui/button";
import { QuoteStatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils/cn";

const TYPE_ICON: Record<ShipmentTypeCode, LucideIcon> = {
  DOCUMENT: FileText,
  PARCEL: Package,
  PACKAGE: Boxes,
  OTHER: HelpCircle,
};

type NoteTone = "info" | "warning" | "danger" | "success";

const NOTE_TONE: Record<NoteTone, string> = {
  info: "border-info-border bg-info-bg text-info",
  warning: "border-warning-border bg-warning-bg text-warning",
  danger: "border-danger-border bg-danger-bg text-danger",
  success: "border-success-border bg-success-bg text-success",
};

interface Note {
  tone: NoteTone;
  icon: LucideIcon;
  text: string;
}

/**
 * What this quote is waiting on, in the customer's words.
 *
 * Every status that leaves the customer wondering "so what happens now?" gets an answer here.
 * PENDING_PICKUP_REQUEST is the one that matters most: it looks like a stalled quote (no price
 * anywhere on the card) but it is the opposite — a partner is already coming, and the price is
 * set when they weigh the parcel. Saying nothing there reads as a system that forgot about you.
 */
function noteFor(quote: QuoteDto): Note | null {
  switch (quote.status) {
    case "NEEDS_MANUAL_REVIEW":
      return {
        tone: "warning",
        icon: CircleAlert,
        text: "Our team is reviewing this shipment and will contact you with a customised quotation.",
      };
    case "RATED":
      return {
        tone: "info",
        icon: Truck,
        text: `${quote.rateQuoteOptions.length} carrier${
          quote.rateQuoteOptions.length === 1 ? "" : "s"
        } available — compare and pick one to continue.`,
      };
    case "PENDING_PICKUP_REQUEST":
      return quote.quotedAmount != null
        ? {
            tone: "success",
            icon: Truck,
            text: "Your price is confirmed. Book a pickup slot to finish.",
          }
        : {
            tone: "info",
            icon: Truck,
            text: "This route isn't on our instant rate card, so we'll price it at pickup — book a slot and our partner will weigh it at your door.",
          };
    case "PICKUP_REQUESTED":
      return {
        tone: "success",
        icon: Truck,
        text: "Pickup booked. A partner has been assigned and will collect your parcel.",
      };
    case "REJECTED":
      return quote.rejectionReason
        ? { tone: "danger", icon: CircleAlert, text: `Declined: ${quote.rejectionReason}` }
        : { tone: "danger", icon: CircleAlert, text: "This request was declined." };
    default:
      return null;
  }
}

export function QuoteSummaryCard({
  quote,
  isAccepting,
  onAccept,
}: {
  quote: QuoteDto;
  isAccepting: boolean;
  onAccept: () => void;
}) {
  const Icon = TYPE_ICON[quote.shipmentType];
  const note = noteFor(quote);
  const detailHref = `/quotes/${quote.id}`;

  return (
    <div className="glass glass-interactive rounded-2xl p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <span
          className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground sm:flex"
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              {/* The route is the headline — it is how a customer recognises their own shipment
                  in a list, not the status or the id. */}
              <p className="truncate text-base font-semibold text-foreground">
                {quote.origin ? (
                  <>
                    {quote.origin.city}
                    <span className="mx-1.5 text-muted-foreground">→</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">To </span>
                )}
                {quote.destination.city}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {quote.destination.country}
              </p>
            </div>
            <QuoteStatusBadge status={quote.status} />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {[
              quote.shipmentType.charAt(0) + quote.shipmentType.slice(1).toLowerCase(),
              `${quote.weightKg} kg`,
              new Date(quote.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            ].map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {chip}
              </span>
            ))}
          </div>

          {note && (
            <p
              className={cn(
                "mt-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs",
                NOTE_TONE[note.tone],
              )}
            >
              <note.icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              {note.text}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {quote.quotedAmount != null ? (
              <p className="text-sm text-muted-foreground">
                Quoted{" "}
                <span className="text-base font-semibold text-foreground">
                  {quote.quotedCurrency ?? "INR"} {quote.quotedAmount.toLocaleString("en-IN")}
                </span>
              </p>
            ) : (
              <span />
            )}

            {/* One real button per card, always in the same place. The old layout mixed a solid
                button on some rows with a bare "View" link on others, so the eye had to hunt for
                the action. */}
            {quote.status === "RATED" ? (
              <Link href={detailHref} className={buttonVariants({ size: "sm" })}>
                Compare carriers
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : quote.status === "QUOTED" ? (
              <Button size="sm" isLoading={isAccepting} disabled={isAccepting} onClick={onAccept}>
                Accept quote
              </Button>
            ) : quote.status === "PENDING_PICKUP_REQUEST" ? (
              <Link
                href={`/pickup-request/${quote.id}`}
                className={buttonVariants({ size: "sm" })}
              >
                Book a pickup
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : (
              <Link
                href={detailHref}
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                View details
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
