"use client";

import { useEffect, useState } from "react";
import type {
  CountryDto,
  ParcelPackageDto,
  QuotePreviewResultDto,
  ShipmentTypeCode,
} from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { Button } from "@/components/ui/button";
import { DestinationStep } from "@/components/quote/destination-step";
import { WeightStep } from "@/components/quote/weight-step";
import { QuoteLoading } from "@/components/quote/quote-loading";
import { ProviderComparison } from "@/components/quote/provider-comparison";
import { ManualReviewNotice } from "@/components/quote/manual-review-notice";
import { PricedAtPickupNotice } from "@/components/quote/priced-at-pickup-notice";

type Step = "destination" | "weight" | "loading" | "result";

// The signed-out half of the quote wizard: same destination and weight steps, same comparison
// cards, priced by the public /public/prices endpoint (the same stateless preview). Picking a
// carrier is the point where an account is needed, so it goes through the auth gate into /quote.
export function PriceExplorer() {
  const gate = useAuthGate();
  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState(false);
  const [step, setStep] = useState<Step>("destination");
  const [destination, setDestination] = useState<CountryDto | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [shipmentType, setShipmentType] = useState<ShipmentTypeCode | null>(null);
  const [packages, setPackages] = useState<ParcelPackageDto[] | null>(null);
  const [result, setResult] = useState<QuotePreviewResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<CountryDto[]>("/public/countries")
      .then(setCountries)
      .catch(() => setCountriesError(true))
      .finally(() => setCountriesLoading(false));
  }, []);

  async function handleWeightSubmit(value: number, type: ShipmentTypeCode, boxes: ParcelPackageDto[]) {
    if (!destination) return;
    setWeightKg(value);
    setShipmentType(type);
    setPackages(boxes);
    setError(null);
    setStep("loading");
    try {
      setResult(
        await apiClient.get<QuotePreviewResultDto>(
          `/public/prices?destinationCountry=${encodeURIComponent(destination.name)}&weightKg=${value}&shipmentType=${type}`,
        ),
      );
      setStep("result");
    } catch {
      setError("We could not load prices right now. Please try again in a moment.");
      setStep("weight");
    }
  }

  if (countriesError) {
    return (
      <p role="alert" className="text-center text-sm text-danger">
        We could not load the country list. Refresh the page to try again.
      </p>
    );
  }

  return (
    <div className="w-full space-y-6">
      {step === "destination" && (
        <DestinationStep
          countries={countries}
          isLoading={countriesLoading}
          initialSelected={destination}
          onContinue={(country) => {
            setDestination(country);
            setStep("weight");
          }}
        />
      )}

      {step === "weight" && destination && (
        <div className="space-y-4">
          <WeightStep
            destination={destination}
            initialPackages={packages}
            initialShipmentType={shipmentType}
            onChangeDestination={() => setStep("destination")}
            onSubmit={handleWeightSubmit}
          />
          {error && (
            <p role="alert" className="text-center text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}

      {step === "loading" && <QuoteLoading />}

      {step === "result" && destination && weightKg && result && (
        <div className="space-y-6">
          {result.status === "RATED" ? (
            <ProviderComparison
              destinationName={destination.name}
              weightKg={weightKg}
              options={result.options}
              onSelect={() => gate("/quote")}
            />
          ) : result.status === "PENDING_PICKUP_REQUEST" ? (
            // Same two notices the signed-in wizard shows, so a visitor is promised exactly what
            // happens after they book: priced at the door, or a callback from the team.
            <PricedAtPickupNotice onContinue={() => gate("/quote")} />
          ) : (
            <ManualReviewNotice onRequestQuote={() => gate("/quote")} />
          )}
          <div className="mx-auto flex max-w-lg flex-col gap-3 sm:flex-row sm:justify-center">
            <Button variant="secondary" onClick={() => setStep("weight")}>
              Change weight
            </Button>
            <Button variant="secondary" onClick={() => setStep("destination")}>
              Change destination
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Prices include fuel surcharge and GST. Duties and taxes at the destination are paid by
            the recipient. The final price is confirmed when your parcel is weighed at pickup. See
            our{" "}
            <a href="/terms#quotes" className="underline underline-offset-4 hover:text-foreground">
              terms
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
