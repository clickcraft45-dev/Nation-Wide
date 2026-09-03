"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import type {
  CountryDto,
  CustomerDto,
  QuoteAdminDetailDto,
  QuotePreviewOptionDto,
  QuotePreviewResultDto,
  RateQuoteOptionDto,
  ShipmentTypeCode,
} from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
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

// Admin "Get a Quote" — staff running the exact same wizard and pricing engine the customer
// portal uses (components/quote/*), with one extra step at the front to pick which customer
// this quote is for, since there's no customer JWT subject to imply it here. Everything after
// that step is identical to app/(customer)/quote/page.tsx, just posted to the /admin/quotes
// endpoints instead (which require an explicit customerId) and landing on the admin quote detail
// page instead of the customer's.
type WizardStep =
  | "customer"
  | "destination"
  | "weight"
  | "loading"
  | "compare"
  | "manual-review"
  | "details"
  | "reselect";

export default function AdminNewQuotePage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState<CustomerDto | null>(null);

  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);

  const [step, setStep] = useState<WizardStep>("customer");
  const [destination, setDestination] = useState<CountryDto | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [shipmentType, setShipmentType] = useState<ShipmentTypeCode | null>(null);
  const [preview, setPreview] = useState<QuotePreviewResultDto | null>(null);
  const [selectedOption, setSelectedOption] = useState<QuotePreviewOptionDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null);
  const [reselectOptions, setReselectOptions] = useState<RateQuoteOptionDto[]>([]);
  const [selectingProviderId, setSelectingProviderId] = useState<string | null>(null);

  const [isSubmittingDetails, setIsSubmittingDetails] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    apiClient
      .get<CustomerDto[]>("/customers")
      .then(setCustomers)
      .finally(() => setCustomersLoading(false));
    apiClient
      .get<CountryDto[]>("/countries")
      .then(setCountries)
      .finally(() => setCountriesLoading(false));
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [customers, customerSearch]);

  function handleSelectCustomer(selected: CustomerDto) {
    setCustomer(selected);
    setStep("destination");
  }

  function handleChangeCustomer() {
    setCustomer(null);
    setDestination(null);
    setWeightKg(null);
    setShipmentType(null);
    setPreview(null);
    setSelectedOption(null);
    setStep("customer");
  }

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
      setLoadError("We're unable to calculate shipping quotes right now. Please try again in a moment.");
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
    if (!weightKg || !customer) return;
    setSubmitError(null);
    setIsSubmittingDetails(true);
    try {
      const quote = await apiClient.post<QuoteAdminDetailDto>("/admin/quotes", {
        customerId: customer.id,
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
          title: "Request created",
          description: "This request needs manual pricing — you can quote it now from Quote Requests.",
        });
        router.push(`/admin/quotes/${quote.id}`);
        return;
      }

      // RATED — reconcile against whatever was compared/selected earlier, same as the customer
      // wizard: match on both provider AND price, never silently commit to a different number.
      const match = selectedOption
        ? quote.rateQuoteOptions.find(
            (o) =>
              o.rateProviderId === selectedOption.rateProviderId &&
              o.finalPrice === selectedOption.finalPrice,
          )
        : undefined;

      if (match) {
        try {
          await apiClient.post(`/admin/quotes/${quote.id}/select-option`, { optionId: match.id });
          showToast({ variant: "success", title: "Quote confirmed and shipment request created" });
        } catch {
          showToast({
            variant: "error",
            title: "Couldn't confirm the selection automatically — please select again.",
          });
        }
        router.push(`/admin/quotes/${quote.id}`);
        return;
      }

      setCreatedQuoteId(quote.id);
      setReselectOptions(quote.rateQuoteOptions);
      setStep("reselect");
    } catch {
      setSubmitError("Couldn't process this request right now. Please try again.");
    } finally {
      setIsSubmittingDetails(false);
    }
  }

  async function handleReselect(option: RateQuoteOptionDto) {
    if (!createdQuoteId) return;
    setSelectingProviderId(option.rateProviderId);
    try {
      await apiClient.post(`/admin/quotes/${createdQuoteId}/select-option`, { optionId: option.id });
      showToast({ variant: "success", title: "Quote confirmed and shipment request created" });
      router.push(`/admin/quotes/${createdQuoteId}`);
    } catch {
      showToast({
        variant: "error",
        title: "Couldn't process this request right now. Please try again.",
      });
    } finally {
      setSelectingProviderId(null);
    }
  }

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New Quote</h1>
        <p className="text-sm text-muted-foreground">
          Generate a quote for a customer using the same pricing engine as the customer portal.
        </p>
      </div>

      {step === "customer" && (
        <div className="mx-auto max-w-lg space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <SearchInput
                placeholder="Search customer by name, phone, or email…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                aria-label="Search customers"
              />
            </div>
            <CreateCustomerDialog
              trigger={<Button variant="secondary" size="sm">+ New Customer</Button>}
              onCreated={handleSelectCustomer}
            />
          </div>

          {customersLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading customers…</p>
          )}
          {!customersLoading && filteredCustomers.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No customers match &quot;{customerSearch}&quot;. Create a new one instead.
            </p>
          )}
          {!customersLoading && filteredCustomers.length > 0 && (
            <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectCustomer(c)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
                >
                  <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1">
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step !== "customer" && step !== "details" && (
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

      {step === "details" && destination && shipmentType && customer && (
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

      {step !== "customer" && customer && (
        <div className="mx-auto max-w-3xl text-center">
          <button
            type="button"
            onClick={handleChangeCustomer}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Quoting for {customer.name} — change customer
          </button>
        </div>
      )}
    </div>
  );
}
