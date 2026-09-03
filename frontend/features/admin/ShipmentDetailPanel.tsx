import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ShipmentAdminDetailDto } from "@nationwide/shared-types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/page-state";
import { Timeline } from "@/components/ui/timeline";
import { TrackingSummaryCard, type TrackingDetail } from "@/features/tracking/TrackingSummaryCard";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ShipmentDetailPanel({ shipment }: { shipment: ShipmentAdminDetailDto }) {
  // Events arrive oldest-first from the API.
  const newest = shipment.events[shipment.events.length - 1];
  const oldest = shipment.events[0];

  const details: TrackingDetail[] = [
    {
      label: "Carrier",
      value: (
        <span className="flex items-center gap-1.5">
          {shipment.providerCode}
          <Link
            href="/admin/integrations"
            aria-label="View provider details"
            className="text-muted-foreground hover:text-primary"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </span>
      ),
    },
    {
      label: "Order",
      value: (
        <Link
          href={`/admin/orders/${shipment.orderId}`}
          className="font-medium text-primary hover:underline"
        >
          {shipment.orderId.slice(0, 8)}
        </Link>
      ),
    },
    { label: "Current location", value: newest?.location ?? "—" },
    { label: "Checkpoints", value: `${shipment.events.length} recorded` },
    {
      label: "First scanned",
      value: oldest ? formatDateTime(oldest.eventTime) : "—",
    },
    {
      label: "Latest event",
      value: newest ? formatDateTime(newest.eventTime) : "—",
    },
    {
      label: "Last synced with carrier",
      value: shipment.lastSyncedAt ? formatDateTime(shipment.lastSyncedAt) : "Never",
      wide: true,
    },
    {
      label: "Carrier tracking numbers",
      wide: true,
      value:
        shipment.externalTrackingNumbers.length === 0 ? (
          <span className="text-muted-foreground">No carrier tracking number mapped yet.</span>
        ) : (
          <ul className="space-y-0.5">
            {shipment.externalTrackingNumbers.map((etn) => (
              <li key={etn.id} className="font-mono text-sm">
                {etn.externalTrackingNumber}
              </li>
            ))}
          </ul>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <TrackingSummaryCard
        trackingNumber={shipment.internalTrackingNumber}
        status={<TrackingStatusBadge status={shipment.currentStatus} />}
        details={details}
      />

      <Card>
        <CardHeader>
          <CardTitle>Tracking timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {shipment.events.length === 0 ? (
            <EmptyState title="No tracking events yet" />
          ) : (
            /* The shared Timeline, not a second hand-rolled <ol> — it carries the staggered
               entrance and the reduced-motion fallback, and `detail` is what the raw carrier
               status hangs off. Keyed so a new lookup replays the animation. */
            <Timeline
              key={shipment.internalTrackingNumber}
              events={[...shipment.events].reverse().map((event) => ({
                label: event.canonicalStatusLabel,
                timestamp: formatDateTime(event.eventTime),
                location: event.location,
                detail: `raw: ${event.rawStatus}`,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
