"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Check, ChevronDown, UserRound } from "lucide-react";
import type { CustomerDto } from "@nationwide/shared-types";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils/cn";

/**
 * Pick a customer by typing their name, phone or email.
 *
 * A native <select> was fine with a handful of accounts and is unusable with hundreds: the list
 * is unsearchable, and an option reads "Sandeep Reddy · google:102054546467701321467" because the
 * label has to carry enough to tell two people apart. Here the search does that work and each row
 * gets two lines instead.
 *
 * Deliberately NOT a portalled popover: this sits inside a card, not a dense table, so an inline
 * panel avoids every measuring and clipping problem a floating one brings.
 */
export function CustomerPicker({
  customers,
  value,
  onChange,
  placeholder = "Select a customer…",
  id,
}: {
  customers: CustomerDto[];
  /** The selected customer's id, or "" for none. */
  value: string;
  onChange: (customerId: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = customers.find((c) => c.id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [customers, query]);

  // Clicking anywhere else closes it — the panel pushes the form down while open, so leaving it
  // hanging after the user has moved on is worse than a popover doing the same.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className="glass-field flex h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? `${selected.name} · ${selected.phone}` : placeholder}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="glass absolute z-30 mt-1 w-full space-y-2 rounded-xl border border-border p-2 shadow-lg">
          <SearchInput
            autoFocus
            placeholder="Search by name, phone or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search customers"
          />
          <div className="max-h-64 space-y-0.5 overflow-y-auto" role="listbox">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                No customer matches “{query.trim()}”.
              </p>
            ) : (
              matches.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  role="option"
                  aria-selected={customer.id === value}
                  onClick={() => {
                    onChange(customer.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                >
                  <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{customer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {customer.phone}
                      {customer.email ? ` · ${customer.email}` : ""}
                    </span>
                  </span>
                  {customer.id === value && (
                    <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
