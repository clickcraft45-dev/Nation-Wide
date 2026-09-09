import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ProgressMilestone {
  label: string;
  /** When it happened. Null renders the pending treatment instead of a time. */
  timestamp: string | null;
}

/**
 * A shipment's journey as a fixed list of milestones, each either reached (filled tick, its
 * timestamp) or not yet (hollow ring, "Pending").
 *
 * Distinct from `Timeline`, and both are shown together on purpose: `Timeline` lists every raw
 * carrier scan, which is what you read when something looks wrong, while this answers the only
 * question most people open the page for — how far along is it. A carrier that emits fifteen
 * "In transit" scans makes the event list longer without making that any clearer.
 *
 * The connector between two reached milestones is drawn in the accent colour, so the filled part
 * of the line is itself the progress bar.
 */
export function ProgressTimeline({
  milestones,
  className,
}: {
  milestones: ProgressMilestone[];
  className?: string;
}) {
  return (
    <ol className={cn("relative", className)}>
      {milestones.map((milestone, i) => {
        const isReached = milestone.timestamp !== null;
        const isLast = i === milestones.length - 1;
        // The connector belongs to the segment below this node, so it is only "complete" when
        // the next milestone has also been reached.
        const isConnectorComplete = isReached && milestones[i + 1]?.timestamp != null;

        return (
          <li key={milestone.label} className="relative flex gap-4 pb-8 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px",
                  isConnectorComplete ? "bg-primary" : "bg-border",
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                isReached
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card",
              )}
              aria-hidden
            >
              {isReached && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isReached ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {milestone.label}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {milestone.timestamp ?? "Pending"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
