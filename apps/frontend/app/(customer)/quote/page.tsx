"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CustomerDto, QuoteDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

// Configurable — fill in the real warehouse address/hours when available (same placeholder
// pattern used for the marketing footer's contact info).
const WAREHOUSE_ADDRESS = "NationWide Warehouse, Plot 12, Industrial Area, Hyderabad, 500032";
const WAREHOUSE_HOURS = "Mon–Sat, 9:00 AM – 6:00 PM";

const SHIPMENT_TYPES = [
  { value: "DOCUMENT", label: "Document" },
  { value: "PARCEL", label: "Parcel" },
  { value: "PACKAGE", label: "Package" },
  { value: "OTHER", label: "Other" },
];

const TIME_SLOTS = [
  { value: "09:00-12:00", label: "9:00 AM – 12:00 PM" },
  { value: "12:00-15:00", label: "12:00 PM – 3:00 PM" },
  { value: "15:00-18:00", label: "3:00 PM – 6:00 PM" },
];

interface AddressForm {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const emptyAddress: AddressForm = {
  name: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function maxPickupDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export default function GetQuotePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [customer, setCustomer] = useState<CustomerDto | null>(null);

  const [shipmentType, setShipmentType] = useState("PARCEL");
  const [weightKg, setWeightKg] = useState("");
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState<AddressForm & { instructions: string }>({
    ...emptyAddress,
    instructions: "",
  });
  const [destination, setDestination] = useState<AddressForm>(emptyAddress);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"PICKUP" | "WAREHOUSE_DROP_OFF">(
    "PICKUP",
  );
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTimeSlot, setPickupTimeSlot] = useState(TIME_SLOTS[0].value);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    apiClient.get<CustomerDto>("/customers/me").then(setCustomer).catch(() => {});
  }, []);

  function useSavedAddress() {
    if (!customer) return;
    setOrigin((prev) => ({
      ...prev,
      name: customer.name,
      phone: customer.phone,
      addressLine1: customer.address ?? prev.addressLine1,
    }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const weight = Number(weightKg);
    if (!weightKg || Number.isNaN(weight) || weight <= 0) {
      next.weightKg = "Enter a valid weight greater than 0.";
    }

    const requiredOriginFields: (keyof AddressForm)[] = [
      "name", "phone", "addressLine1", "city", "state", "postalCode", "country",
    ];
    for (const field of requiredOriginFields) {
      if (!origin[field].trim()) next[`origin.${field}`] = "Required.";
      if (!destination[field].trim()) next[`destination.${field}`] = "Required.";
    }

    if (fulfillmentMethod === "PICKUP") {
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const quote = await apiClient.post<QuoteDto>("/quotes", {
        shipmentType,
        weightKg: Number(weightKg),
        description: description.trim() || undefined,
        origin: {
          name: origin.name.trim(),
          phone: origin.phone.trim(),
          addressLine1: origin.addressLine1.trim(),
          addressLine2: origin.addressLine2.trim() || undefined,
          city: origin.city.trim(),
          state: origin.state.trim(),
          postalCode: origin.postalCode.trim(),
          country: origin.country.trim(),
          instructions: origin.instructions.trim() || undefined,
        },
        destination: {
          name: destination.name.trim(),
          phone: destination.phone.trim(),
          addressLine1: destination.addressLine1.trim(),
          addressLine2: destination.addressLine2.trim() || undefined,
          city: destination.city.trim(),
          state: destination.state.trim(),
          postalCode: destination.postalCode.trim(),
          country: destination.country.trim(),
        },
        fulfillmentMethod,
        pickupDate: fulfillmentMethod === "PICKUP" ? pickupDate : undefined,
        pickupTimeSlot: fulfillmentMethod === "PICKUP" ? pickupTimeSlot : undefined,
        submissionKey,
      });

      if (quote.status === "NEEDS_MANUAL_REVIEW") {
        showToast({
          variant: "success",
          title: "Request submitted",
          description: "Our team will review your shipment details and contact you shortly with a customized quotation.",
        });
      } else {
        showToast({ variant: "success", title: "Quote request submitted" });
      }
      router.push("/quotes");
    } catch (err) {
      setApiError(
        err instanceof ApiError
          ? "We couldn't process your request right now. Please try again."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Get a Quote</h1>
        <p className="text-sm text-muted-foreground">
          Tell us about your shipment and we&apos;ll get you a price.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Shipment details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shipment-type">Shipment type</Label>
                <NativeSelect
                  id="shipment-type"
                  value={shipmentType}
                  onChange={(e) => setShipmentType(e.target.value)}
                >
                  {SHIPMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  error={Boolean(errors.weightKg)}
                  placeholder="2.5"
                />
                {errors.weightKg && <FieldError>{errors.weightKg}</FieldError>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Contents (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Clothes, documents, electronics…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pickup / origin</CardTitle>
              {customer && (
                <Button type="button" variant="secondary" size="sm" onClick={useSavedAddress}>
                  Use my saved address
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="origin-name">Name</Label>
                <Input
                  id="origin-name"
                  value={origin.name}
                  onChange={(e) => setOrigin({ ...origin, name: e.target.value })}
                  error={Boolean(errors["origin.name"])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin-phone">Phone</Label>
                <Input
                  id="origin-phone"
                  value={origin.phone}
                  onChange={(e) => setOrigin({ ...origin, phone: e.target.value })}
                  error={Boolean(errors["origin.phone"])}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="origin-line1">Address line 1</Label>
              <Input
                id="origin-line1"
                value={origin.addressLine1}
                onChange={(e) => setOrigin({ ...origin, addressLine1: e.target.value })}
                error={Boolean(errors["origin.addressLine1"])}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="origin-line2">Address line 2 (optional)</Label>
              <Input
                id="origin-line2"
                value={origin.addressLine2}
                onChange={(e) => setOrigin({ ...origin, addressLine2: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="origin-city">City</Label>
                <Input
                  id="origin-city"
                  value={origin.city}
                  onChange={(e) => setOrigin({ ...origin, city: e.target.value })}
                  error={Boolean(errors["origin.city"])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin-state">State</Label>
                <Input
                  id="origin-state"
                  value={origin.state}
                  onChange={(e) => setOrigin({ ...origin, state: e.target.value })}
                  error={Boolean(errors["origin.state"])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin-postal">Postal code</Label>
                <Input
                  id="origin-postal"
                  value={origin.postalCode}
                  onChange={(e) => setOrigin({ ...origin, postalCode: e.target.value })}
                  error={Boolean(errors["origin.postalCode"])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin-country">Country</Label>
                <Input
                  id="origin-country"
                  value={origin.country}
                  onChange={(e) => setOrigin({ ...origin, country: e.target.value })}
                  error={Boolean(errors["origin.country"])}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="origin-instructions">Pickup instructions (optional)</Label>
              <Input
                id="origin-instructions"
                value={origin.instructions}
                onChange={(e) => setOrigin({ ...origin, instructions: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Destination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dest-name">Recipient name</Label>
                <Input
                  id="dest-name"
                  value={destination.name}
                  onChange={(e) => setDestination({ ...destination, name: e.target.value })}
                  error={Boolean(errors["destination.name"])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest-phone">Recipient phone</Label>
                <Input
                  id="dest-phone"
                  value={destination.phone}
                  onChange={(e) => setDestination({ ...destination, phone: e.target.value })}
                  error={Boolean(errors["destination.phone"])}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dest-line1">Address line 1</Label>
              <Input
                id="dest-line1"
                value={destination.addressLine1}
                onChange={(e) => setDestination({ ...destination, addressLine1: e.target.value })}
                error={Boolean(errors["destination.addressLine1"])}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dest-line2">Address line 2 (optional)</Label>
              <Input
                id="dest-line2"
                value={destination.addressLine2}
                onChange={(e) => setDestination({ ...destination, addressLine2: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="dest-city">City</Label>
                <Input
                  id="dest-city"
                  value={destination.city}
                  onChange={(e) => setDestination({ ...destination, city: e.target.value })}
                  error={Boolean(errors["destination.city"])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest-state">State</Label>
                <Input
                  id="dest-state"
                  value={destination.state}
                  onChange={(e) => setDestination({ ...destination, state: e.target.value })}
                  error={Boolean(errors["destination.state"])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest-postal">Postal code</Label>
                <Input
                  id="dest-postal"
                  value={destination.postalCode}
                  onChange={(e) => setDestination({ ...destination, postalCode: e.target.value })}
                  error={Boolean(errors["destination.postalCode"])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest-country">Country</Label>
                <Input
                  id="dest-country"
                  value={destination.country}
                  onChange={(e) => setDestination({ ...destination, country: e.target.value })}
                  error={Boolean(errors["destination.country"])}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How would you like to send your parcel?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="fulfillment"
                  className="mt-1"
                  checked={fulfillmentMethod === "PICKUP"}
                  onChange={() => setFulfillmentMethod("PICKUP")}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    Pickup from my address
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    We&apos;ll collect the parcel from your pickup address.
                  </span>
                </span>
              </label>
              <label className="flex flex-1 cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input
                  type="radio"
                  name="fulfillment"
                  className="mt-1"
                  checked={fulfillmentMethod === "WAREHOUSE_DROP_OFF"}
                  onChange={() => setFulfillmentMethod("WAREHOUSE_DROP_OFF")}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    I&apos;ll drop off the parcel at the warehouse
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Bring it to us during business hours.
                  </span>
                </span>
              </label>
            </div>

            {fulfillmentMethod === "PICKUP" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pickup-date">Pickup date</Label>
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
                  <Label htmlFor="pickup-slot">Time slot</Label>
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
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
                <p className="font-medium text-foreground">
                  Please bring your parcel to our warehouse during business hours.
                </p>
                <p className="mt-2 text-muted-foreground">
                  <span className="font-medium text-foreground">Warehouse address: </span>
                  {WAREHOUSE_ADDRESS}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Hours: </span>
                  {WAREHOUSE_HOURS}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {apiError && (
          <div role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
            {apiError}
          </div>
        )}

        <Button type="submit" size="lg" isLoading={isSubmitting} disabled={isSubmitting}>
          {isSubmitting ? "Submitting…" : "Submit request"}
        </Button>
      </form>
    </div>
  );
}
