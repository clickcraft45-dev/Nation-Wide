import type { TrackingResultDto } from "@nationwide/shared-types";
import { Card, CardContent } from "@/components/ui/card";
import { TrackingStatusBadge } from "@/components/ui/status-badge";

export function TrackingTimeline({ result }: { result: TrackingResultDto }) {
  return (
    <div className="w-full max-w-md">
      <Card className="mb-4">
        <CardContent className="space-y-2 pt-5">
          <p className="text-xs text-muted-foreground">Tracking number</p>
          <p className="font-mono text-lg text-foreground">
            {result.internalTrackingNumber}
          </p>
          <TrackingStatusBadge status={result.currentStatus} />
          {result.lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Last updated {new Date(result.lastUpdated).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
      <ol className="space-y-3">
        {result.events.map((event, i) => (
          <li key={i} className="border-l-2 border-border pl-4">
            <p className="text-sm font-medium text-foreground">{event.displayLabel}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(event.eventTime).toLocaleString()}
              {event.location ? ` — ${event.location}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
