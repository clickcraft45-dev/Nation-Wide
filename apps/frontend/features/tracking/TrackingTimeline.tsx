import type { TrackingResultDto } from "@nationwide/shared-types";
import { Card, CardContent } from "@/components/ui/card";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { Timeline } from "@/components/ui/timeline";

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
      <Timeline
        events={result.events.map((event) => ({
          label: event.displayLabel,
          timestamp: new Date(event.eventTime).toLocaleString(),
          location: event.location,
        }))}
      />
    </div>
  );
}
