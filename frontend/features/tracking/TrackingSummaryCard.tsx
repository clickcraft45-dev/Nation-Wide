import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export interface TrackingDetail {
  label: string;
  value: ReactNode;
  /** Span the full width — for long values like an address or a sync timestamp. */
  wide?: boolean;
}

/**
 * The "what am I looking at" card that sits above every tracking timeline: the number, the live
 * status, and a labelled grid of everything else worth knowing (carrier, dates, locations).
 *
 * Shared by the admin lookup and the customer-facing page so the two cannot drift apart — they
 * read different DTOs, so the caller decides which rows exist, but the shape is decided here.
 */
export function TrackingSummaryCard({
  trackingNumber,
  status,
  details,
  footer,
}: {
  trackingNumber: string;
  status: ReactNode;
  details: TrackingDetail[];
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Tracking number</p>
            <p className="truncate font-mono text-lg text-foreground">{trackingNumber}</p>
          </div>
          {status}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
          {details.map((detail) => (
            <div key={detail.label} className={detail.wide ? "col-span-2" : undefined}>
              <dt className="text-xs text-muted-foreground">{detail.label}</dt>
              <dd className="mt-0.5 text-foreground">{detail.value}</dd>
            </div>
          ))}
        </dl>

        {footer}
      </CardContent>
    </Card>
  );
}
