"use client";

import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="glass w-full overflow-x-auto rounded-2xl">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead
      className={cn(
        "border-b border-[color:var(--glass-edge)] bg-white/55 backdrop-saturate-150",
        className,
      )}
      {...props}
    />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody
      className={cn("divide-y divide-[color:var(--glass-edge)]", className)}
      {...props}
    />;
}

/**
 * `href` turns the row itself into the way in: double-click (or Enter, when focused) opens it.
 * That replaces the per-row "View" link that used to occupy an Actions column on every table —
 * one prop here instead of an extra column, an extra cell and an extra link on eight pages.
 *
 * Double-click rather than single, deliberately: rows carry their own interactive controls
 * (checkboxes, real mutating buttons like Deactivate), and a single-click row would fire every
 * time someone reached for one of those. Keyboard users get Enter, which is why the row is
 * focusable — a dblclick-only affordance is unreachable without a pointer.
 */
export function TableRow({
  className,
  href,
  onKeyDown,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { href?: string }) {
  const router = useRouter();

  if (!href) {
    return <tr className={cn("transition-colors hover:bg-white/55", className)} {...props} />;
  }

  return (
    <tr
      tabIndex={0}
      title="Double-click to open"
      onDoubleClick={(event) => {
        // Rows that navigate can still contain their own controls (Mark Paid, Manage, Review).
        // Without this, double-clicking one of those would fire the dialog AND leave the page.
        if ((event.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
        router.push(href);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        // Space is left alone — it scrolls the page, and stealing that from a focusable row is
        // worse than the shortcut is worth.
        if (event.key === "Enter" && event.target === event.currentTarget) {
          event.preventDefault();
          router.push(href);
        }
      }}
      className={cn(
        "cursor-pointer transition-colors hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-foreground", className)} {...props} />;
}
