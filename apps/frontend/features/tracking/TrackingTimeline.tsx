import type { TrackingResultDto } from "@nationwide/shared-types";

export function TrackingTimeline({ result }: { result: TrackingResultDto }) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Tracking number</p>
        <p className="font-mono text-lg">{result.internalTrackingNumber}</p>
        <p className="mt-2 text-sm font-medium">{result.currentStatusLabel}</p>
        {result.lastUpdated && (
          <p className="text-xs text-zinc-500">
            Last updated {new Date(result.lastUpdated).toLocaleString()}
          </p>
        )}
      </div>
      <ol className="space-y-3">
        {result.events.map((event, i) => (
          <li key={i} className="border-l-2 border-zinc-300 pl-4 dark:border-zinc-700">
            <p className="text-sm font-medium">{event.displayLabel}</p>
            <p className="text-xs text-zinc-500">
              {new Date(event.eventTime).toLocaleString()}
              {event.location ? ` — ${event.location}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
