import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface TimelineEvent {
  label: ReactNode;
  timestamp: ReactNode;
  location?: ReactNode;
}

/**
 * Event timeline for shipment tracking — shared by customer tracking, admin tracking, and
 * pickup lifecycle views. Newest-first or oldest-first ordering is the caller's choice; this
 * component just renders whatever order it's given, with the first item marked as most recent.
 */
export function Timeline({ events, className }: { events: TimelineEvent[]; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {events.map((event, i) => {
        const isFirst = i === 0;
        const isLast = i === events.length - 1;
        return (
          <li key={i} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                className="absolute left-[5px] top-3 h-[calc(100%-0.75rem)] w-px bg-border"
                aria-hidden
              />
            )}
            <span
              className={cn(
                "relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                isFirst ? "bg-primary ring-4 ring-info-bg" : "bg-border",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm",
                  isFirst ? "font-semibold text-foreground" : "font-medium text-foreground",
                )}
              >
                {event.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {event.timestamp}
                {event.location ? ` — ${event.location}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
