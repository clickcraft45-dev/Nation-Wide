"use client";

import { useState, type FormEvent } from "react";
import type { CountryDto, CustomerDto, ShipmentTypeCode } from "@nationwide/shared-types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

// Configurable — fill in the real warehouse address/hours when available (same placeholder
// pattern used for the marketing footer's contact info).
const WAREHOUSE_ADDRESS = "NationWide Warehouse, Plot 12, Industrial Area, Hyderabad, 500032";
const WAREHOUSE_HOURS = "Mon–Sat, 9:00 AM – 6:00 PM";

const SHIPMENT_TYPE_LABELS: Record<ShipmentTypeCode, string> = {
  DOCUMENT: "Document",
  PARCEL: "Parcel",
  PACKAGE: "Package",
  OTHER: "Other",
};

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
}

const emptyAddress: AddressForm = {
  name: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function maxPickupDateIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export interface ShipmentDetailsPayload {
  shipmentType: ShipmentTypeCode;
  description?: string;
  origin?: Omit<AddressForm, "addressLine2"> & {
    addressLine2?: string;
    instructions?: string;
    country: string;
  };
  destination: Omit<AddressForm, "addressLine2"> & { addressLine2?: string; country: string };
  fulfillmentMethod?: "PICKUP" | "WAREHOUSE_DROP_OFF";
  pickupDate?: string;
  pickupTimeSlot?: string;
}

// The address/pickup collection step, shared by both the happy path (a provider was already
// selected in the compare step) and the manual-review path (no provider to compare) —
// destination country AND shipment type are both locked from earlier wizard steps in both
// cases, not re-collected here. Locking shipmentType matters for correctness, not just UX: the
// price the customer already compared against was computed for a specific shipment type, so
// letting this form silently change it after the fact would reintroduce a price/shipment-type
// mismatch.
//
// collectOriginAndFulfillment controls the Pickup/origin + fulfillment-method cards: the admin
// manual-quote wizard (app/admin/.../quotes/new) still needs them, since it creates an order
// immediately (legacy path). The customer self-service wizard passes false — pickup logistics
// are collected later, on the PickupRequest page, only once a Pickup Partner is ready to be
// assigned (Section: Updated customer flow).
export function ShipmentDetailsForm({
  destinationCountry,
  shipmentType,
  customer,
  onSubmit,
  isSubmitting,
  collectOriginAndFulfillment = true,
}: {
  destinationCountry: CountryDto;
  shipmentType: ShipmentTypeCode;
  customer: CustomerDto | null;
  onSubmit: (payload: ShipmentDetailsPayload) => void;
  isSubmitting: boolean;
  collectOriginAndFulfillment?: boolean;
}) {
  const [description, setDescription] = useState("");
  const [origin, setOrigin] = useState<AddressForm & { instructions: string; country: string }>({
    ...emptyAddress,
    instructions: "",
    country: "India",
  });
  const [destination, setDestination] = useState<AddressForm>(emptyAddress);
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"PICKUP" | "WAREHOUSE_DROP_OFF">(
    "PICKUP",
  );
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTimeSlot, setPickupTimeSlot] = useState(TIME_SLOTS[0].value);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    const requiredFields: (keyof AddressForm)[] = [
      "name", "phone", "addressLine1", "city", "state", "postalCode",
    ];
    for (const field of requiredFields) {
      if (collectOriginAndFulfillment && !origin[field].trim()) next[`origin.${field}`] = "Required.";
      if (!destination[field].trim()) next[`destination.${field}`] = "Required.";
    }

    if (collectOriginAndFulfillment && fulfillmentMethod === "PICKUP") {
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    onSubmit({
      shipmentType,
      description: description.trim() || undefined,
      origin: collectOriginAndFulfillment
        ? {
            name: origin.name.trim(),
            phone: origin.phone.trim(),
            addressLine1: origin.addressLine1.trim(),
            addressLine2: origin.addressLine2.trim() || undefined,
            city: origin.city.trim(),
            state: origin.state.trim(),
            postalCode: origin.postalCode.trim(),
            country: origin.country.trim(),
            instructions: origin.instructions.trim() || undefined,
          }
        : undefined,
      destination: {
        name: destination.name.trim(),
        phone: destination.phone.trim(),
        addressLine1: destination.addressLine1.trim(),
        addressLine2: destination.addressLine2.trim() || undefined,
        city: destination.city.trim(),
        state: destination.state.trim(),
        postalCode: destination.postalCode.trim(),
        country: destinationCountry.name,
      },
      fulfillmentMethod: collectOriginAndFulfillment ? fulfillmentMethod : undefined,
      pickupDate: collectOriginAndFulfillment && fulfillmentMethod === "PICKUP" ? pickupDate : undefined,
      pickupTimeSlot:
        collectOriginAndFulfillment && fulfillmentMethod === "PICKUP" ? pickupTimeSlot : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Shipment details</h1>
        <p className="text-sm text-muted-foreground">
          A few more details so we can get your parcel moving.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shipment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Shipment type</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                {SHIPMENT_TYPE_LABELS[shipmentType]}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Destination</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                {destinationCountry.name}
              </div>
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

      {collectOriginAndFulfillment && (
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
          <div className="grid gap-4 sm:grid-cols-3">
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
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recipient</CardTitle>
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
          <div className="grid gap-4 sm:grid-cols-3">
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
          </div>
        </CardContent>
      </Card>

      {collectOriginAndFulfillment && (
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
      )}

      <Button type="submit" size="lg" isLoading={isSubmitting} disabled={isSubmitting}>
        {isSubmitting ? "Submitting…" : "Continue"}
      </Button>
    </form>
  );
}
