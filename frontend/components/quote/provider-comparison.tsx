"use client";

import { useMemo } from "react";
import type { QuotePreviewOptionDto } from "@nationwide/shared-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// The business ships from a single origin country — there's no per-customer origin selection
// yet at this point in the flow (that's collected later, in the shipment-details step).
const ORIGIN_COUNTRY_LABEL = "India";

// Generic over T so this same component can render either the stateless preview's options
// (QuotePreviewOptionDto — no id yet, nothing persisted) or a real Quote's already-persisted
// rateQuoteOptions (CustomerRateQuoteOptionDto — has an id, needed to call select-option) during
// the "prices may have updated, please reselect" fallback.
export function ProviderComparison<T extends QuotePreviewOptionDto>({
  destinationName,
  weightKg,
  options,
  onSelect,
  selectingProviderId,
  staleNotice,
}: {
  destinationName: string;
  weightKg: number;
  options: T[];
  onSelect: (option: T) => void;
  selectingProviderId?: string | null;
  staleNotice?: boolean;
}) {
  const sorted = useMemo(() => [...options].sort((a, b) => a.finalPrice - b.finalPrice), [options]);
  const cheapestPrice = sorted[0]?.finalPrice;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground">Your Shipping Quotes</h1>
        <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            <span className="text-foreground">From:</span> {ORIGIN_COUNTRY_LABEL}
          </span>
          <span>
            <span className="text-foreground">To:</span> {destinationName}
          </span>
          <span>
            <span className="text-foreground">Weight:</span> {weightKg} KG
          </span>
        </div>
      </div>

      {staleNotice && (
        <div
          role="alert"
          className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-center text-sm text-warning"
        >
          Prices may have updated since you last compared — please confirm your choice.
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Available Shipping Options</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((option) => (
            <Card key={option.rateProviderId} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col items-center gap-3 pt-5 text-center">
                {option.finalPrice === cheapestPrice && sorted.length > 1 && (
                  <Badge variant="success">BEST PRICE</Badge>
                )}
                <p className="text-base font-medium text-foreground">{option.rateProviderName}</p>
                <p className="text-2xl font-semibold text-foreground">
                  {option.currency} {option.finalPrice.toLocaleString("en-IN")}
                </p>
                <Button
                  className="mt-auto w-full"
                  isLoading={selectingProviderId === option.rateProviderId}
                  disabled={selectingProviderId != null}
                  onClick={() => onSelect(option)}
                >
                  Select {option.rateProviderName}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
