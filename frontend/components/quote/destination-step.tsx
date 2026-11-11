"use client";

import { useMemo, useState } from "react";
import { Globe } from "lucide-react";
import type { CountryDto } from "@nationwide/shared-types";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { FieldError } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { normalizeQuery, searchCountries } from "@/lib/country-search";

export function DestinationStep({
  countries,
  isLoading,
  initialSelected = null,
  onContinue,
}: {
  countries: CountryDto[];
  isLoading: boolean;
  /** Kept when the customer comes Back to this step, so the choice isn't lost. */
  initialSelected?: CountryDto | null;
  onContinue: (country: CountryDto) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CountryDto | null>(initialSelected);
  const [error, setError] = useState<string | null>(null);

  // Ranked: "USA", "Dubai" and "germny" all find their country, best match first.
  const filtered = useMemo(() => searchCountries(countries, search), [countries, search]);

  function handleContinue() {
    // Typing "United States" and pressing Continue is a complete answer when the search leaves
    // no doubt: one match, or the name or code typed in full. "united" still asks for a pick.
    const q = normalizeQuery(search);
    const typed =
      q && (filtered.length === 1 || (filtered[0] && [filtered[0].code, filtered[0].name].some((v) => normalizeQuery(v) === q)))
        ? filtered[0]
        : null;
    const country = typed ?? selected;
    if (!country) {
      setError("Please select a destination country to continue.");
      return;
    }
    onContinue(country);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Get your shipping quote</h1>
        <p className="mt-1 text-sm text-muted-foreground">Where are you shipping to?</p>
      </div>

      <div className="space-y-3 text-left">
        <SearchInput
          // The chosen country shows in the box, so the selection is visible without scrolling.
          placeholder={selected ? `${selected.name} (${selected.code}): search to change` : "Search country…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          // Enter takes the best match, so "usa ⏎" is a complete answer.
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim() && filtered[0]) {
              e.preventDefault();
              setSelected(filtered[0]);
              setError(null);
            }
          }}
          maxLength={64}
          aria-label="Search destination country"
        />

        {isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading countries…</p>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {countries.length === 0
              ? "No destinations are open for online booking right now. Call or email us for a price."
              : <>No countries match &quot;{search}&quot;.</>}
          </p>
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
