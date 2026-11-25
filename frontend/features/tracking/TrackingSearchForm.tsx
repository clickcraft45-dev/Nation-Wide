"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { MAX_TRACKING_BATCH, parseTrackingNumbers } from "@nationwide/shared-types";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { cn } from "@/lib/utils/cn";

interface TrackingSearchFormProps {
  /** The numbers to track, in the order given, without duplicates: one to MAX_TRACKING_BATCH. */
  onSubmit: (trackingNumbers: string[]) => void;
  /** Called when the box is emptied, so a stale "not found" goes with the text that caused it. */
  onClear?: () => void;
  isLoading?: boolean;
  initialValue?: string;
  /** Override for the submit button — needed when the form sits on a colored surface (e.g. the
   * customer dashboard's blue hero card) where the default primary-on-primary would vanish. */
  submitButtonClassName?: string;
}

/** Tallest the box grows before it scrolls: about eight lines. */
const MAX_HEIGHT_PX = 208;

// Stacked full-width input + full-width button below sm — a one-handed mobile tracking form is
// the public site's single most important control, so it gets the 44px+ touch targets and
// unambiguous tap zones that a compact inline row can't. From sm up there's enough width for the
// two controls to sit on one line without cramping the input.
//
// One number or a list: the box is a textarea that starts one line tall (a pill, like every other
// search field) and grows as lines are added or a column is pasted. Enter tracks; Shift+Enter
// starts a new line.
export function TrackingSearchForm({
  onSubmit,
  onClear,
  isLoading,
  initialValue,
  submitButtonClassName,
}: TrackingSearchFormProps) {
  const [value, setValue] = useState(() => (initialValue ? parseTrackingNumbers(initialValue).join("\n") : ""));
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const numbers = parseTrackingNumbers(value);
  const tooMany = numbers.length > MAX_TRACKING_BATCH;
  const multiline = value.includes("\n");

  // Grow with the content: measure from one line each time so deleting lines shrinks it too.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function submit() {
    if (numbers.length === 0 || tooMany || isLoading) return;
    onSubmit(numbers);
  }

  return (
    <form
      className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:items-start sm:gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex-1 space-y-1.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <textarea
            ref={boxRef}
            rows={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (!e.target.value.trim()) onClear?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Order ID / Tracking ID"
            aria-label={`Order IDs or tracking IDs, one per line, up to ${MAX_TRACKING_BATCH}`}
            aria-describedby={hintId}
            aria-invalid={tooMany || undefined}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className={cn(
              "glass-field block min-h-11 w-full resize-none py-[11px] pl-10 pr-4 font-mono text-base leading-[22px] text-foreground placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              // A pill on one line, like every search field; a rounded box once it holds a list.
              multiline ? "rounded-2xl" : "rounded-[22px]",
              tooMany && "border-danger focus-visible:ring-danger",
            )}
          />
        </div>
        <p
          id={hintId}
          className={cn("px-1 text-xs", tooMany ? "text-danger" : "text-muted-foreground")}
          aria-live="polite"
        >
          {tooMany
            ? `${numbers.length} numbers: track up to ${MAX_TRACKING_BATCH} at a time.`
            : numbers.length > 1
              ? `${numbers.length} of ${MAX_TRACKING_BATCH} shipments`
              : `Track up to ${MAX_TRACKING_BATCH} at once: one per line (Shift+Enter for a new line, or paste a list).`}
        </p>
      </div>
      <LiquidButton
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isLoading}
        disabled={tooMany}
        className={cn("w-full sm:w-auto", submitButtonClassName)}
      >
        {isLoading ? "Searching…" : numbers.length > 1 ? `Track ${numbers.length}` : "Track Shipment"}
      </LiquidButton>
    </form>
  );
}
