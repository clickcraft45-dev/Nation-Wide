import { ExternalLink } from "lucide-react";
import type { TrackingResultDto } from "@nationwide/shared-types";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { Timeline } from "@/components/ui/timeline";
import { ProgressTimeline } from "@/components/ui/progress-timeline";
import { deriveMilestones } from "@/lib/tracking-milestones";
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
    { label: "Status", value: result.currentStatusLabel },
    { label: "Sender", value: result.customerName },
    {
      label: "Consignee",
      // Null only for a booking made before a destination was ever recorded — everything else
      // (self-service, staff manual quote, partner taking it down at the door) fills this in.
      value: result.consigneeName ? (
        <>
          {result.consigneeName}
          {result.consigneePhone && (
            <span className="text-muted-foreground"> · {result.consigneePhone}</span>
          )}
        </>
      ) : (
        "—"
      ),
    },
    {
      label: "Carrier",
      // Straight through to the carrier's own tracking page when they have one — their page has
      // scans we have not synced yet. Plain text for a reseller with no public page.
      value: result.carrier ? (
        result.carrier.trackingUrl ? (
          <a
            href={result.carrier.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {result.carrier.name}
            <ExternalLink className="h-3 w-3" aria-hidden />
            <span className="sr-only">(opens the carrier&rsquo;s tracking page)</span>
          </a>
        ) : (
          result.carrier.name
        )
      ) : (
        "Not assigned yet"
      ),
    },
    {
      label: "Carrier tracking number",
      value: result.carrier ? (
        <span className="font-mono text-xs">{result.carrier.trackingNumber}</span>
      ) : (
        "—"
      ),
    },
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
      {result.items.length > 0 && (
        <div className="glass rounded-2xl p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground">What&rsquo;s inside</h2>
          <ul className="divide-y divide-border text-sm">
            {result.items.map((item, index) => (
              <li
                key={`${item.description}-${index}`}
                className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 text-foreground">
                  {item.description}
                  {item.category && (
                    <span className="text-muted-foreground"> · {item.category}</span>
                  )}
                </span>
                <span className="shrink-0 text-muted-foreground">&times;{item.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* How far along, before the scan-by-scan detail below. */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <h2 className="mb-5 text-sm font-semibold text-foreground">Progress</h2>
        <ProgressTimeline
          milestones={deriveMilestones(result.events).map((milestone) => ({
            label: milestone.label,
            timestamp: milestone.reachedAt ? formatDateTime(milestone.reachedAt) : null,
          }))}
        />
      </div>

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
