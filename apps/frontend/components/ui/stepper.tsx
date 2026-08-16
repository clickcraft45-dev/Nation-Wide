import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface StepperStep {
  label: string;
  description?: string;
}

/**
 * Progress tracker for multi-step flows: customer quote wizard, pickup-partner's
 * Arrived → Weight/Payment → Complete workflow, and the PDF rate-card generator.
 * `currentIndex` is 0-based; steps before it render complete, the step at it renders current.
 */
export function Stepper({
  steps,
  currentIndex,
  orientation = "horizontal",
  className,
}: {
  steps: StepperStep[];
  currentIndex: number;
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <ol
      className={cn(
        orientation === "horizontal" ? "flex items-start" : "flex flex-col gap-1",
        className,
      )}
    >
      {steps.map((step, i) => {
        const status = i < currentIndex ? "complete" : i === currentIndex ? "current" : "upcoming";
        const isLast = i === steps.length - 1;

        return (
          <li
            key={step.label}
            className={cn(
              "flex",
              orientation === "horizontal" ? "flex-1 flex-col items-center text-center" : "gap-3",
            )}
          >
            <div
              className={cn(
                "flex items-center",
                orientation === "horizontal" ? "w-full" : "flex-col",
              )}
            >
              {orientation === "vertical" && !isLast && (
                <span
                  className={cn(
                    "absolute mt-8 h-[calc(100%-2rem)] w-px",
                    status === "complete" ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              {orientation === "horizontal" && i > 0 && (
                <span
                  className={cn(
                    "-mr-1 h-px flex-1",
                    i <= currentIndex ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              <span
                aria-current={status === "current" ? "step" : undefined}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                  status === "complete" && "border-primary bg-primary text-primary-foreground",
                  status === "current" && "border-primary bg-card text-primary",
                  status === "upcoming" && "border-border bg-card text-muted-foreground",
                )}
              >
                {status === "complete" ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              {orientation === "horizontal" && !isLast && (
                <span
                  className={cn(
                    "-ml-1 h-px flex-1",
                    i < currentIndex ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
            </div>
            <div className={orientation === "horizontal" ? "mt-2" : "pb-6"}>
              <p
                className={cn(
                  "text-sm font-medium",
                  status === "upcoming" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {step.label}
              </p>
              {step.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
