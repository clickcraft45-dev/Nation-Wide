import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const STEPS = ["Destination", "Weight", "Compare Quotes"] as const;

// The address/pickup step that follows selection is deliberately not part of this indicator —
// it's a distinct follow-on stage, not one of the three "get me a price" steps being tracked.
export function QuoteStepper({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-4">
      {STEPS.map((label, index) => {
        const isComplete = index < current;
        const isCurrent = index === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  isComplete && "bg-primary text-primary-foreground",
                  isCurrent && "border-2 border-primary text-primary",
                  !isComplete && !isCurrent && "border border-border text-muted-foreground",
                )}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-sm sm:inline",
                  isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span className="h-px w-6 bg-border sm:w-10" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
