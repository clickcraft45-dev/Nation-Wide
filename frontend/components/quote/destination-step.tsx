"use client";

import { useMemo, useState } from "react";
import { Globe } from "lucide-react";
import type { CountryDto } from "@nationwide/shared-types";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FieldError } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

export function DestinationStep({
  countries,
  isLoading,
  onContinue,
}: {
  countries: CountryDto[];
  isLoading: boolean;
  onContinue: (country: CountryDto) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CountryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [countries, search]);

  function handleContinue() {
    if (!selected) {
      setError("Please select a destination country to continue.");
      return;
    }
    onContinue(selected);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Get your shipping quote</h1>
        <p className="mt-1 text-sm text-muted-foreground">Where are you shipping to?</p>
      </div>

      <div className="space-y-3 text-left">
        <SearchInput
          placeholder="Search country…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search destination country"
        />

        {isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading countries…</p>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No countries match &quot;{search}&quot;.</p>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
            {filtered.map((country) => (
              <button
                key={country.id}
                type="button"
                onClick={() => {
                  setSelected(country);
                  setError(null);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                  selected?.id === country.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium">{country.name}</span>
                <span className="text-xs text-muted-foreground">{country.code}</span>
              </button>
            ))}
          </div>
        )}

        {error && <FieldError>{error}</FieldError>}
      </div>

      <Button size="lg" className="w-full" onClick={handleContinue} disabled={isLoading}>
        Continue
      </Button>
    </div>
  );
}
