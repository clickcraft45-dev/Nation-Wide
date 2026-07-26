"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CountryDto,
  CustomerDto,
  CustomerRateQuoteOptionDto,
  QuoteDto,
  QuotePreviewOptionDto,
  QuotePreviewResultDto,
  ShipmentTypeCode,
} from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { QuoteStepper } from "@/components/quote/quote-stepper";
import { DestinationStep } from "@/components/quote/destination-step";
import { WeightStep } from "@/components/quote/weight-step";
import { QuoteLoading } from "@/components/quote/quote-loading";
import { ProviderComparison } from "@/components/quote/provider-comparison";
import { ManualReviewNotice } from "@/components/quote/manual-review-notice";
import {
  ShipmentDetailsForm,
  type ShipmentDetailsPayload,
} from "@/components/quote/shipment-details-form";

type WizardStep =
  | "destination"
  | "weight"
  | "loading"
  | "compare"
  | "manual-review"
  | "details"
  | "reselect";

export default function GetQuotePage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerDto | null>(null);

  const [step, setStep] = useState<WizardStep>("destination");
  const [destination, setDestination] = useState<CountryDto | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [shipmentType, setShipmentType] = useState<ShipmentTypeCode | null>(null);
  const [preview, setPreview] = useState<QuotePreviewResultDto | null>(null);
  const [selectedOption, setSelectedOption] = useState<QuotePreviewOptionDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null);
  const [reselectOptions, setReselectOptions] = useState<CustomerRateQuoteOptionDto[]>([]);
  const [selectingProviderId, setSelectingProviderId] = useState<string | null>(null);

  const [isSubmittingDetails, setIsSubmittingDetails] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    apiClient.get<CustomerDto>("/customers/me").then(setCustomer).catch(() => {});
    apiClient
      .get<CountryDto[]>("/countries")
      .then(setCountries)
      .finally(() => setCountriesLoading(false));
  }, []);

  function handleDestinationContinue(country: CountryDto) {
    setDestination(country);
    setWeightKg(null);
    setShipmentType(null);
    setPreview(null);
    setSelectedOption(null);
    setStep("weight");
  }

  function handleChangeDestination() {
    setDestination(null);
    setWeightKg(null);
    setShipmentType(null);
    setPreview(null);
    setSelectedOption(null);
    setStep("destination");
  }

  async function handleWeightSubmit(value: number, type: ShipmentTypeCode) {
    if (!destination) return;
    setWeightKg(value);
    setShipmentType(type);
    setSelectedOption(null);
    setStep("loading");
    setLoadError(null);
    try {
      const result = await apiClient.get<QuotePreviewResultDto>(
        `/quotes/preview?destinationCountry=${encodeURIComponent(destination.name)}&weightKg=${value}&shipmentType=${type}`,
      );
      setPreview(result);
      setStep(result.status === "RATED" ? "compare" : "manual-review");
    } catch {
      setLoadError("We're unable to calculate your shipping quotes right now. Please try again in a moment.");
      setStep("weight");
    }
  }

  function handleSelectProvider(option: QuotePreviewOptionDto) {
    setSelectedOption(option);
    setStep("details");
  }

  function handleRequestCustomQuote() {
    setSelectedOption(null);
    setStep("details");
  }

  async function handleDetailsSubmit(payload: ShipmentDetailsPayload) {
    if (!weightKg) return;
    setSubmitError(null);
    setIsSubmittingDetails(true);
    try {
      const quote = await apiClient.post<QuoteDto>("/quotes", {
        shipmentType: payload.shipmentType,
        weightKg,
        description: payload.description,
        origin: payload.origin,
        destination: payload.destination,
        fulfillmentMethod: payload.fulfillmentMethod,
        pickupDate: payload.pickupDate,
        pickupTimeSlot: payload.pickupTimeSlot,
        submissionKey,
      });

      if (quote.status === "NEEDS_MANUAL_REVIEW") {
        showToast({
          variant: "success",
          title: "Request submitted",
          description: "Our team will review your shipment details and contact you shortly with a customized quotation.",
        });
        router.push(`/quotes/${quote.id}`);
        return;
      }

      // RATED — reconcile against whatever the customer compared/selected earlier. Match on both
      // provider AND price: a same-provider-different-price match would silently commit the
      // customer to a number they never actually saw.
      const match = selectedOption
        ? quote.rateQuoteOptions.find(
            (o) =>
              o.rateProviderId === selectedOption.rateProviderId &&
              o.finalPrice === selectedOption.finalPrice,
          )
        : undefined;

      if (match) {
        try {
          await apiClient.post(`/quotes/${quote.id}/select-option`, { optionId: match.id });
          showToast({ variant: "success", title: "Quote confirmed — your shipment request has been submitted" });
        } catch {
          showToast({
            variant: "error",
            title: "We couldn't confirm your selection automatically — please select again.",
          });
        }
        router.push(`/quotes/${quote.id}`);
        return;
      }

      // No exact match — prices moved since the compare step (or nothing was preselected, e.g.
      // arriving via the manual-review path but a rate became available in the meantime). Never
      // silently commit to a different price; show the fresh comparison instead.
      setCreatedQuoteId(quote.id);
      setReselectOptions(quote.rateQuoteOptions);
      setStep("reselect");
    } catch {
      setSubmitError("We couldn't process your request right now. Please try again.");
    } finally {
      setIsSubmittingDetails(false);
    }
  }

  async function handleReselect(option: CustomerRateQuoteOptionDto) {
    if (!createdQuoteId) return;
    setSelectingProviderId(option.rateProviderId);
    try {
      await apiClient.post(`/quotes/${createdQuoteId}/select-option`, { optionId: option.id });
      showToast({ variant: "success", title: "Quote confirmed — your shipment request has been submitted" });
      router.push(`/quotes/${createdQuoteId}`);
    } catch {
      showToast({
        variant: "error",
        title: "We couldn't process your request right now. Please try again.",
      });
    } finally {
      setSelectingProviderId(null);
    }
  }

  return (
    <div className="space-y-8 pb-10">
      {step !== "details" && (
        <QuoteStepper
          current={step === "destination" ? 0 : step === "weight" ? 1 : 2}
        />
      )}

      {step === "destination" && (
        <DestinationStep
          countries={countries}
          isLoading={countriesLoading}
          onContinue={handleDestinationContinue}
        />
      )}

      {step === "weight" && destination && (
        <div className="space-y-4">
          <WeightStep
            destination={destination}
            onChangeDestination={handleChangeDestination}
            onSubmit={handleWeightSubmit}
          />
          {loadError && (
            <div className="mx-auto max-w-lg space-y-3 text-center">
              <p role="alert" className="text-sm text-danger">
                {loadError}
              </p>
            </div>
          )}
        </div>
      )}

      {step === "loading" && <QuoteLoading />}

      {step === "compare" && destination && weightKg && preview && (
        <ProviderComparison
          destinationName={destination.name}
          weightKg={weightKg}
          options={preview.options}
          onSelect={handleSelectProvider}
        />
      )}

      {step === "manual-review" && (
        <ManualReviewNotice onRequestQuote={handleRequestCustomQuote} />
      )}

      {step === "details" && destination && shipmentType && (
        <div className="space-y-4">
          <ShipmentDetailsForm
            destinationCountry={destination}
            shipmentType={shipmentType}
            customer={customer}
            onSubmit={handleDetailsSubmit}
            isSubmitting={isSubmittingDetails}
          />
          {submitError && (
            <div className="mx-auto max-w-3xl">
              <p role="alert" className="text-sm text-danger">
                {submitError}
              </p>
            </div>
          )}
        </div>
      )}

      {step === "reselect" && destination && weightKg && (
        <ProviderComparison
          destinationName={destination.name}
          weightKg={weightKg}
          options={reselectOptions}
          onSelect={handleReselect}
          selectingProviderId={selectingProviderId}
          staleNotice
        />
      )}
    </div>
  );
}
