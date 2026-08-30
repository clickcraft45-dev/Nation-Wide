import type { TrackingResultDto } from "@nationwide/shared-types";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { Timeline } from "@/components/ui/timeline";
import { TrackingSummaryCard, type TrackingDetail } from "./TrackingSummaryCard";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TrackingTimeline({ result }: { result: TrackingResultDto }) {
  // Events arrive oldest-first from the API; the newest is what the header talks about and the
  // oldest is when the parcel entered the network.
  const newest = result.events[result.events.length - 1];
  const oldest = result.events[0];
  const isDelivered = result.currentStatus === "DELIVERED";

  const details: TrackingDetail[] = [
    // NOTE: no carrier row here, unlike the admin card. Which of DHL/FedEx/UPS actually moves the
    // parcel is NationWide's arrangement, not the sender's — the public tracking DTO deliberately
    // does not carry providerCode. Add it to TrackingResultDto first if that ever changes.
    { label: "Status", value: result.currentStatusLabel },
    { label: "Last location", value: newest?.location ?? "—" },
    {
      label: isDelivered ? "Delivered" : "Latest update",
      value: newest ? formatDateTime(newest.eventTime) : "—",
    },
    { label: "First scanned", value: oldest ? formatDateTime(oldest.eventTime) : "—" },
    {
      label: "Checkpoints",
      value: `${result.events.length} recorded`,
    },
    {
      label: "Synced with carrier",
      value: result.lastUpdated ? formatDateTime(result.lastUpdated) : "Not synced yet",
    },
  ];

  return (
    <div className="w-full max-w-xl space-y-4">
      <TrackingSummaryCard
        trackingNumber={result.internalTrackingNumber}
        status={<TrackingStatusBadge status={result.currentStatus} />}
        details={details}
      />
      {/* Keyed on the tracking number so looking up a different parcel replays the timeline's
          entrance instead of silently swapping the text under a static list. */}
      <Timeline
        key={result.internalTrackingNumber}
        events={[...result.events].reverse().map((event) => ({
          label: event.displayLabel,
          timestamp: formatDateTime(event.eventTime),
          location: event.location,
        }))}
      />
    </div>
  );
}
