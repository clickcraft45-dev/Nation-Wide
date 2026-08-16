"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { QuoteDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";

const TIME_SLOTS = [
  { value: "09:00-12:00", label: "9:00 AM – 12:00 PM" },
  { value: "12:00-15:00", label: "12:00 PM – 3:00 PM" },
  { value: "15:00-18:00", label: "3:00 PM – 6:00 PM" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function maxPickupDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

interface FormErrors {
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupAddressLine1?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupPostalCode?: string;
  pickupDate?: string;
  pickupTimeSlot?: string;
}

export default function PickupRequestPage() {
  const params = useParams<{ quoteId: string }>();
  const router = useRouter();

  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dropAtWarehouse, setDropAtWarehouse] = useState(false);
  const [pickupContactName, setPickupContactName] = useState("");
  const [pickupContactPhone, setPickupContactPhone] = useState("");
  const [pickupAddressLine1, setPickupAddressLine1] = useState("");
  const [pickupAddressLine2, setPickupAddressLine2] = useState("");
  const [pickupCity, setPickupCity] = useState("");
  const [pickupState, setPickupState] = useState("");
  const [pickupPostalCode, setPickupPostalCode] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTimeSlot, setPickupTimeSlot] = useState(TIME_SLOTS[0].value);
  const [pickupInstructions, setPickupInstructions] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    apiClient
      .get<QuoteDto[]>("/quotes/me")
      .then((quotes) => {
        if (cancelled) return;
        const found = quotes.find((q) => q.id === params.quoteId);
        if (!found) {
          setLoadError("Quote not found.");
          return;
        }
        if (found.status !== "PENDING_PICKUP_REQUEST" && found.status !== "PICKUP_REQUESTED") {
          setLoadError("This quote isn't ready for a pickup request.");
          return;
        }
        setQuote(found);
        if (found.status === "PICKUP_REQUESTED") setSubmitted(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? "Failed to load your quote." : "Something went wrong.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.quoteId]);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!pickupContactName.trim()) next.pickupContactName = "Enter a contact name.";
    if (!pickupContactPhone.trim()) next.pickupContactPhone = "Enter a contact number.";
    if (!dropAtWarehouse) {
      if (!pickupAddressLine1.trim()) next.pickupAddressLine1 = "Enter your pickup address.";
      if (!pickupCity.trim()) next.pickupCity = "Enter a city.";
      if (!pickupState.trim()) next.pickupState = "Enter a state.";
      if (!pickupPostalCode.trim()) next.pickupPostalCode = "Enter a postal code.";
      if (!pickupDate) {
        next.pickupDate = "Choose a pickup date.";
      } else if (pickupDate < todayIso() || pickupDate > maxPickupDateIso()) {
        next.pickupDate = "Pickup must be scheduled within the next 7 days.";
      }
      if (!pickupTimeSlot) next.pickupTimeSlot = "Choose a time slot.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote) return;
    setSubmitError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await apiClient.post("/pickup-requests", {
        quoteId: quote.id,
        dropAtWarehouse,
        pickupContactName: pickupContactName.trim(),
        pickupContactPhone: pickupContactPhone.trim(),
        pickupAddressLine1: pickupAddressLine1.trim(),
        pickupAddressLine2: pickupAddressLine2.trim() || undefined,
        pickupCity: pickupCity.trim(),
        pickupState: pickupState.trim(),
        pickupPostalCode: pickupPostalCode.trim(),
        pickupDate: dropAtWarehouse ? undefined : pickupDate,
        pickupTimeSlot: dropAtWarehouse ? undefined : pickupTimeSlot,
        pickupInstructions: pickupInstructions.trim() || undefined,
      });
      setSubmitted(true);
    } catch {
      setSubmitError("We couldn't submit your pickup request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError || !quote) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <ErrorState message={loadError ?? "Something went wrong."} />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-foreground">
          Your pickup request has been received successfully.
        </h1>
        <p className="text-sm text-muted-foreground">
          Our pickup partner will contact you shortly to collect your parcel.
        </p>
        <Button size="lg" onClick={() => router.push(`/quotes/${quote.id}`)}>
          Track this request
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-8">
      <Link
        href={`/quotes/${quote.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-foreground">Schedule your pickup</h1>
        <p className="text-sm text-muted-foreground">
          Shipping to {quote.destination.city}, {quote.destination.country}. We already have your
          destination — just tell us where to collect your parcel.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Pickup Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Contact Name</Label>
              <Input
                id="contact-name"
                value={pickupContactName}
                onChange={(e) => setPickupContactName(e.target.value)}
                error={Boolean(errors.pickupContactName)}
              />
              {errors.pickupContactName && <FieldError>{errors.pickupContactName}</FieldError>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Contact Number</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={pickupContactPhone}
                onChange={(e) => setPickupContactPhone(e.target.value)}
                error={Boolean(errors.pickupContactPhone)}
              />
              {errors.pickupContactPhone && <FieldError>{errors.pickupContactPhone}</FieldError>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-5">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={dropAtWarehouse}
                onChange={(e) => setDropAtWarehouse(e.target.checked)}
              />
              I&apos;ll drop the parcel at the warehouse instead
            </label>

            {!dropAtWarehouse && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="address-1">Pickup Address</Label>
                  <Input
                    id="address-1"
                    placeholder="House / flat / street"
                    value={pickupAddressLine1}
                    onChange={(e) => setPickupAddressLine1(e.target.value)}
                    error={Boolean(errors.pickupAddressLine1)}
                  />
                  {errors.pickupAddressLine1 && <FieldError>{errors.pickupAddressLine1}</FieldError>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address-2">Landmark (optional)</Label>
                  <Input
                    id="address-2"
                    value={pickupAddressLine2}
                    onChange={(e) => setPickupAddressLine2(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={pickupCity}
                      onChange={(e) => setPickupCity(e.target.value)}
                      error={Boolean(errors.pickupCity)}
                    />
                    {errors.pickupCity && <FieldError>{errors.pickupCity}</FieldError>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={pickupState}
                      onChange={(e) => setPickupState(e.target.value)}
                      error={Boolean(errors.pickupState)}
                    />
                    {errors.pickupState && <FieldError>{errors.pickupState}</FieldError>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postal-code">Postal Code</Label>
                  <Input
                    id="postal-code"
                    value={pickupPostalCode}
                    onChange={(e) => setPickupPostalCode(e.target.value)}
                    error={Boolean(errors.pickupPostalCode)}
                  />
                  {errors.pickupPostalCode && <FieldError>{errors.pickupPostalCode}</FieldError>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pickup-date">Pickup Date</Label>
                    <Input
                      id="pickup-date"
                      type="date"
                      min={todayIso()}
                      max={maxPickupDateIso()}
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      error={Boolean(errors.pickupDate)}
                    />
                    {errors.pickupDate && <FieldError>{errors.pickupDate}</FieldError>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pickup-slot">Time Slot</Label>
                    <NativeSelect
                      id="pickup-slot"
                      value={pickupTimeSlot}
                      onChange={(e) => setPickupTimeSlot(e.target.value)}
                    >
                      {TIME_SLOTS.map((slot) => (
                        <option key={slot.value} value={slot.value}>
                          {slot.label}
                        </option>
                      ))}
                    </NativeSelect>
                    {errors.pickupTimeSlot && <FieldError>{errors.pickupTimeSlot}</FieldError>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="instructions">Pickup Instructions (optional)</Label>
                  <Input
                    id="instructions"
                    placeholder="e.g. Ring the bell / Call before arriving"
                    value={pickupInstructions}
                    onChange={(e) => setPickupInstructions(e.target.value)}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {submitError && <FieldError>{submitError}</FieldError>}

        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
          Submit Pickup Request
        </Button>
      </form>
    </div>
  );
}
