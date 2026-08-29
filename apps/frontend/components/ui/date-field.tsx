"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Calendar, formatIsoLong, type CalendarProps } from "@/components/ui/calendar";

export interface DateFieldProps
  extends Pick<CalendarProps, "markers" | "markerLabel" | "markerTone" | "min" | "max"> {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  title?: string;
  subtitle?: string;
  error?: boolean;
  disabled?: boolean;
  className?: string;
  /** Align the popover to the right edge when the field sits at the end of a row. */
  align?: "start" | "end";
}

/**
 * The app's date input: a trigger button that opens the shared {@link Calendar}.
 * Drop-in for `<Input type="date">` — same yyyy-mm-dd value, same min/max.
 */
export function DateField({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  title = "Select date",
  subtitle,
  error,
  disabled,
  className,
  align = "start",
  ...calendarProps
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "glass-field flex h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          error ? "!border-danger" : "",
        )}
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {value ? formatIsoLong(value) : placeholder}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={title}
          className={cn(
            "absolute z-50 mt-2 w-76",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <Calendar
            {...calendarProps}
            title={title}
            subtitle={subtitle ?? (value ? formatIsoLong(value) : placeholder)}
            selected={value || null}
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
            className="max-w-none shadow-lg"
          />
        </div>
      )}
    </div>
  );
}
