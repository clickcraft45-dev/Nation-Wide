"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/* ISO helpers are LOCAL-time on purpose. Date#toISOString() is UTC and rolls the day
   backwards for anyone east of Greenwich — IST included, i.e. every user of this app —
   so a pickup booked for the 25th would be posted as the 24th. */
export function toIso(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function formatIsoLong(iso: string): string {
  return fromIso(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatIsoShort(iso: string): string {
  return fromIso(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TONE_DOT = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
} as const;

export interface CalendarProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  selected?: string | null;
  onSelect?: (iso: string) => void;
  /** iso date -> how many things happen that day. Renders up to three volume dots. */
  markers?: Record<string, number>;
  /** Noun for the marker counts, used in tooltips and screen-reader labels. */
  markerLabel?: string;
  markerTone?: keyof typeof TONE_DOT;
  min?: string;
  max?: string;
  /** Hide the "Today" shortcut where the calendar is a read-only overview. */
  showToday?: boolean;
  footer?: ReactNode;
  className?: string;
}

export function Calendar({
  title = "Appointment",
  subtitle = "Find a date",
  selected,
  onSelect,
  markers,
  markerLabel = "items",
  markerTone = "default",
  min,
  max,
  showToday = true,
  footer,
  className,
}: CalendarProps) {
  const today = todayIso();
  const [cursor, setCursor] = useState(() => (selected ?? today).slice(0, 7));
  const [focusIso, setFocusIso] = useState(selected ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  // Follow the value when it is driven from outside (a form reset, a linked From/To field).
  // Adjusted during render rather than in an effect — React re-runs this pass before painting,
  // so the grid never flashes the old month.
  const [lastSelected, setLastSelected] = useState(selected);
  if (selected && selected !== lastSelected) {
    setLastSelected(selected);
    setCursor(selected.slice(0, 7));
    setFocusIso(selected);
  }

  // Roving focus: only move the caret when focus is already inside the grid, so a parent
  // re-render never yanks focus out of whatever the user was typing in.
  useEffect(() => {
    if (gridRef.current?.contains(document.activeElement)) {
      cellRefs.current.get(focusIso)?.focus();
    }
  }, [focusIso, cursor]);

  const days = useMemo(() => {
    const first = fromIso(`${cursor}-01`);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { iso: toIso(d), day: d.getDate(), inMonth: d.getMonth() === first.getMonth() };
    });
  }, [cursor]);

  const monthLabel = fromIso(`${cursor}-01`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const isDisabled = (iso: string) => Boolean((min && iso < min) || (max && iso > max));

  function shiftMonth(delta: number) {
    const d = fromIso(`${cursor}-01`);
    d.setMonth(d.getMonth() + delta);
    setCursor(toIso(d).slice(0, 7));
  }

  function moveFocus(iso: string) {
    setFocusIso(iso);
    if (iso.slice(0, 7) !== cursor) setCursor(iso.slice(0, 7));
  }

  function onGridKeyDown(e: KeyboardEvent) {
    const jumps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    };
    const jump = jumps[e.key];
    if (jump !== undefined) {
      e.preventDefault();
      moveFocus(addDaysIso(focusIso, jump));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const weekday = fromIso(focusIso).getDay();
      moveFocus(addDaysIso(focusIso, e.key === "Home" ? -weekday : 6 - weekday));
    }
  }

  return (
    <div
      className={cn(
        "glass-raised w-full max-w-sm rounded-2xl p-5 text-card-foreground",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {showToday && (
          <button
            type="button"
            onClick={() => {
              setCursor(today.slice(0, 7));
              moveFocus(today);
              if (!isDisabled(today)) onSelect?.(today);
            }}
            className="shrink-0 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Today
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <NavButton label="Previous month" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </NavButton>
        <div aria-live="polite" className="text-sm font-semibold text-foreground">
          {monthLabel}
        </div>
        <NavButton label="Next month" onClick={() => shiftMonth(1)}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </NavButton>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label={monthLabel}
        onKeyDown={onGridKeyDown}
        className="grid grid-cols-7 gap-y-0.5"
      >
        {days.map(({ iso, day, inMonth }) => {
          const count = markers?.[iso] ?? 0;
          const isSelected = iso === selected;
          const disabled = isDisabled(iso);
          return (
            <button
              key={iso}
              ref={(el) => {
                if (el) cellRefs.current.set(iso, el);
                else cellRefs.current.delete(iso);
              }}
              type="button"
              role="gridcell"
              tabIndex={iso === focusIso ? 0 : -1}
              disabled={disabled}
              aria-selected={isSelected}
              aria-current={iso === today ? "date" : undefined}
              aria-label={`${formatIsoLong(iso)}${count ? `, ${count} ${markerLabel}` : ""}`}
              title={count ? `${count} ${markerLabel}` : undefined}
              onClick={() => {
                moveFocus(iso);
                onSelect?.(iso);
              }}
              className={cn(
                "mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                inMonth ? "text-foreground" : "text-muted-foreground/50",
                isSelected
                  ? "bg-primary font-semibold text-primary-foreground"
                  : iso === today
                    ? "font-semibold ring-1 ring-border hover:bg-muted"
                    : "hover:bg-muted",
                disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
              )}
            >
              <span className="leading-none">{day}</span>
              <span className="mt-1 flex h-1 items-center gap-0.5">
                {Array.from({ length: Math.min(3, count) }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 w-1 rounded-full",
                      isSelected ? "bg-primary-foreground" : TONE_DOT[markerTone],
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {footer && <div className="mt-4 border-t border-border pt-4">{footer}</div>}
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
