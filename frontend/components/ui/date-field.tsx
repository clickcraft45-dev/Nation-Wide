"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const GAP = 8;
const MARGIN = 8;

/**
 * Where the calendar goes, in viewport pixels: below the trigger if it fits, above if it doesn't,
 * and pinned inside the screen when neither fits (a short phone, or landscape). Always clamped
 * horizontally, so it never runs off the edge of a narrow screen.
 */
export function placePopover(
  trigger: { top: number; bottom: number; left: number; right: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  align: "start" | "end",
): { top: number; left: number } {
  const rawLeft = align === "end" ? trigger.right - size.width : trigger.left;
  const left = Math.min(
    Math.max(MARGIN, rawLeft),
    Math.max(MARGIN, viewport.width - size.width - MARGIN),
  );

  const below = trigger.bottom + GAP;
  if (below + size.height <= viewport.height - MARGIN) return { top: below, left };
  const above = trigger.top - GAP - size.height;
  if (above >= MARGIN) return { top: above, left };
  return { top: Math.max(MARGIN, viewport.height - size.height - MARGIN), left };
}

/**
 * The app's date input: a trigger button that opens the shared {@link Calendar}.
 * Drop-in for `<Input type="date">` — same yyyy-mm-dd value, same min/max.
 *
 * The calendar is PORTALLED to <body> and positioned `fixed`. It used to be `absolute` inside the
 * field, and every glass card creates its own stacking context (backdrop-filter does that), so the
 * next card down the page painted over the open calendar no matter its z-index — on the pickup
 * form the Recipient card covered it. Rendering at the top of the document is the only placement
 * no card can cover.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      // The popover lives in a portal, outside rootRef — without the second check every click
      // inside the calendar would count as "outside" and close it before the day registered.
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
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

  // Written straight to the element's style rather than kept in state: it reruns on every scroll
  // frame, and a React render per frame for two numbers is pure waste. Capture-phase scroll so a
  // scrolling container (the mobile shell's <main>) moves it too, not just the window.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const { top, left } = placePopover(
        trigger.getBoundingClientRect(),
        { width: popover.offsetWidth, height: popover.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        align,
      );
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.style.visibility = "visible";
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
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

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="dialog"
            aria-label={title}
            className="fixed z-50 w-76 max-w-[calc(100vw-1rem)]"
            // Hidden until measured and placed, so it never flashes at the top-left corner.
            style={{ top: 0, left: 0, visibility: "hidden" }}
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
          </div>,
          document.body,
        )}
    </div>
  );
}
