"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Package, Plus } from "lucide-react";
import type {
  B2bCreateOrdersDto,
  B2bOrderResultDto,
  B2bRequestSummaryDto,
  B2bSessionDto,
  CountryDto,
  PickupTimeSlot,
  QuotePreviewResultDto,
  SavedItemDto,
} from "@nationwide/shared-types";
import { errorMessage } from "@/lib/api-client";
import type { B2bClient } from "@/lib/b2b-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { PincodeInput } from "@/components/ui/pincode-input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { Logo } from "@/components/brand/logo";
import {
  toRecipientPayload,
  validateRecipient,
  type RecipientErrors,
} from "@/components/quote/recipient-fields";
import { validatePackages } from "@/components/shipment/packages-editor";
import { toItemsPayload, validateItems } from "@/components/shipment/items-editor";
import {
  ShipmentCard,
  newShipment,
  shipmentPackages,
  type ShipmentDraft,
} from "@/components/shipment/shipment-card";

const TIME_SLOTS: { value: PickupTimeSlot; label: string }[] = [
  { value: "09:00-12:00", label: "9:00 AM – 12:00 PM" },
  { value: "12:00-15:00", label: "12:00 PM – 3:00 PM" },
  { value: "15:00-18:00", label: "3:00 PM – 6:00 PM" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

interface PickupForm {
  contactName: string;
  contactPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  date: string;
  timeSlot: PickupTimeSlot;
  instructions: string;
}

/**
 * The B2B order portal: a business books its own shipments. One pickup, many recipients — every
 * address and item they have shipped before is offered for reuse, and anything new is remembered.
 *
 * Reached two ways, which is why the client is injected rather than built here: a signed-in
 * business account (ordinary session, see app/b2b/page.tsx) or a standing link handed to a
 * despatch desk (the token is the credential, see app/b2b/[token]/page.tsx). Either way the server
 * resolves which business this is — nothing here names a customer.
 */
export function B2bPortal({ client }: { client: B2bClient }) {

  const [session, setSession] = useState<B2bSessionDto | null>(null);
  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pickup, setPickup] = useState<PickupForm>({
    contactName: "",
    contactPhone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    date: todayIso(),
    timeSlot: TIME_SLOTS[0].value,
    instructions: "",
  });
  const [orders, setOrders] = useState<ShipmentDraft[]>([newShipment()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [orderErrors, setOrderErrors] = useState<Record<string, string>>({});
  const [recipientErrors, setRecipientErrors] = useState<Record<string, RecipientErrors>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<B2bOrderResultDto[] | null>(null);
  const [history, setHistory] = useState<B2bRequestSummaryDto[]>([]);
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    Promise.all([
      client.get<B2bSessionDto>("/session"),
      client.get<CountryDto[]>("/countries"),
      client.get<B2bRequestSummaryDto[]>("/orders").catch(() => []),
    ])
      .then(([sessionRes, countriesRes, historyRes]) => {
        setSession(sessionRes);
        setCountries(countriesRes);
        setSavedItems(sessionRes.addressBook.savedItems);
        setHistory(historyRes);
        const last = sessionRes.addressBook.lastPickup;
        // Where they shipped from last time; overwriting it here makes the new one their default.
        if (last) {
          setPickup((p) => ({
            ...p,
            contactName: last.contactName,
            contactPhone: last.contactPhone,
            addressLine1: last.addressLine1,
            addressLine2: last.addressLine2 ?? "",
            city: last.city,
            state: last.state,
            postalCode: last.postalCode,
          }));
        }
      })
      .catch((err) =>
        setLoadError(
          errorMessage(
            err,
            "This link is no longer valid. Ask your NationWide contact for a new one.",
          ),
        ),
      )
      .finally(() => setIsLoading(false));
  }, [client]);

  function updateOrder(key: string, patch: Partial<ShipmentDraft>) {
    setOrders((all) => all.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const required: [keyof PickupForm, string][] = [
      ["contactName", "Enter the pickup contact's name."],
      ["contactPhone", "Enter the pickup contact's phone."],
      ["addressLine1", "Enter the pickup address."],
      ["city", "Enter the city."],
      ["state", "Enter the state."],
      ["postalCode", "Enter the PIN code."],
      ["date", "Choose a pickup date."],
    ];
    for (const [key, message] of required) if (!pickup[key].trim()) next[key] = message;
    if (pickup.postalCode.trim() && !/^\d{6}$/.test(pickup.postalCode.trim())) {
      next.postalCode = "An Indian PIN code is 6 digits.";
    }

    const perOrder: Record<string, string> = {};
    const perRecipient: Record<string, RecipientErrors> = {};
    for (const [i, order] of orders.entries()) {
      const label = `Shipment ${i + 1}: `;
      const recipientProblems = validateRecipient(order.recipient);
      if (Object.keys(recipientProblems).length > 0) perRecipient[order.key] = recipientProblems;
      if (!order.destinationCountry) {
        perOrder[order.key] = `${label}choose the destination country.`;
        continue;
      }
      const boxProblem = validatePackages(order.boxes, order.shipmentType !== "DOCUMENT");
      if (boxProblem) {
        perOrder[order.key] = label + boxProblem;
        continue;
      }
      const itemProblem = validateItems(order.items);
      if (itemProblem) perOrder[order.key] = label + itemProblem;
    }

    setErrors(next);
    setOrderErrors(perOrder);
    setRecipientErrors(perRecipient);
    return (
      Object.keys(next).length === 0 &&
      Object.keys(perOrder).length === 0 &&
      Object.keys(perRecipient).length === 0
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) {
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
        first?.focus({ preventScroll: true });
      });
      return;
    }
    setIsSubmitting(true);
    const body: B2bCreateOrdersDto = {
      submissionKey,
      pickup: {
        pickupContactName: pickup.contactName.trim(),
        pickupContactPhone: pickup.contactPhone.trim(),
        pickupAddressLine1: pickup.addressLine1.trim(),
        pickupAddressLine2: pickup.addressLine2.trim() || undefined,
        pickupCity: pickup.city.trim(),
        pickupState: pickup.state.trim(),
        pickupPostalCode: pickup.postalCode.trim(),
        pickupDate: pickup.date,
        pickupTimeSlot: pickup.timeSlot,
        pickupInstructions: pickup.instructions.trim() || undefined,
      },
      orders: orders.map((o) => ({
        recipient: toRecipientPayload(o.recipient),
        destinationCountry: o.destinationCountry,
        shipmentType: o.shipmentType,
        packages: shipmentPackages(o),
        items: toItemsPayload(o.items),
        ...(o.rateProviderId ? { rateProviderId: o.rateProviderId } : {}),
      })),
    };
    try {
      const created = await client.post<B2bOrderResultDto[]>("/orders", body);
      setResults(created);
      setHistory(await client.get<B2bRequestSummaryDto[]>("/orders").catch(() => history));
    } catch (err) {
      setSubmitError(errorMessage(err, "We couldn't submit these shipments. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function startAnother() {
    setResults(null);
    setOrders([newShipment()]);
    // A fresh key: the next batch is a new submission, not a retry of the one just booked.
    setSubmissionKey(crypto.randomUUID());
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (loadError || !session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorState message={loadError ?? "Something went wrong."} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 pb-16">
      <header className="flex items-center justify-between gap-3">
        <Logo className="h-7" />
        <div className="text-right">
          <p className="text-sm font-semibold text-foreground">{session.customerName}</p>
          <p className="text-xs text-muted-foreground">{session.linkLabel}</p>
        </div>
      </header>

      {results ? (
        <Card>
          <CardHeader>
            <CardTitle>Shipments submitted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((r) => (
              <div
                key={r.index}
                className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
              >
                {r.status === "BOOKED" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                )}
                <div className="flex-1">
                  <p className="font-medium text-foreground">
                    {r.recipientName} · {r.destinationCountry}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.status === "BOOKED"
                      ? `${r.carrier ?? "Carrier"} · ${r.currency} ${Math.round(r.price ?? 0).toLocaleString("en-IN")} — a pickup partner will collect it.`
                      : "No published rate covers this route — our team will price it and contact you."}
                  </p>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Final prices are confirmed when the partner weighs and measures each box at pickup.
            </p>
            <Button type="button" onClick={startAnother}>
              Book more shipments
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Request a pickup</h1>
            <p className="text-sm text-muted-foreground">
              One collection, as many shipments as you need. Your saved addresses and items are
              filled in below.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Collect from</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact name" error={errors.contactName} htmlFor="pickup-name">
                  <Input
                    id="pickup-name"
                    value={pickup.contactName}
                    onChange={(e) => setPickup((p) => ({ ...p, contactName: e.target.value }))}
                    error={Boolean(errors.contactName)}
                  />
                </Field>
                <Field label="Contact phone" error={errors.contactPhone} htmlFor="pickup-phone">
                  <Input
                    id="pickup-phone"
                    type="tel"
                    value={pickup.contactPhone}
                    onChange={(e) => setPickup((p) => ({ ...p, contactPhone: e.target.value }))}
                    error={Boolean(errors.contactPhone)}
                  />
                </Field>
              </div>
              <Field label="Address" error={errors.addressLine1} htmlFor="pickup-address">
                <Input
                  id="pickup-address"
                  value={pickup.addressLine1}
                  onChange={(e) => setPickup((p) => ({ ...p, addressLine1: e.target.value }))}
                  error={Boolean(errors.addressLine1)}
                />
              </Field>
              <Field label="Landmark / unit (optional)" htmlFor="pickup-address-2">
                <Input
                  id="pickup-address-2"
                  value={pickup.addressLine2}
                  onChange={(e) => setPickup((p) => ({ ...p, addressLine2: e.target.value }))}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="City" error={errors.city} htmlFor="pickup-city">
                  <Input
                    id="pickup-city"
                    value={pickup.city}
                    onChange={(e) => setPickup((p) => ({ ...p, city: e.target.value }))}
                    error={Boolean(errors.city)}
                  />
                </Field>
                <Field label="State" error={errors.state} htmlFor="pickup-state">
                  <Input
                    id="pickup-state"
                    value={pickup.state}
                    onChange={(e) => setPickup((p) => ({ ...p, state: e.target.value }))}
                    error={Boolean(errors.state)}
                  />
                </Field>
                <Field label="PIN code" error={errors.postalCode} htmlFor="pickup-pin">
                  <PincodeInput
                    id="pickup-pin"
                    value={pickup.postalCode}
                    onChange={(postalCode) => setPickup((p) => ({ ...p, postalCode }))}
                    onResolved={({ city, district, state }) =>
                      setPickup((p) => ({
                        ...p,
                        city: city || district || p.city,
                        state: state || p.state,
                      }))
                    }
                    error={Boolean(errors.postalCode)}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pickup date" error={errors.date} htmlFor="pickup-date">
                  <DateField
                    id="pickup-date"
                    title="Pickup date"
                    min={todayIso()}
                    value={pickup.date}
                    onChange={(date) => setPickup((p) => ({ ...p, date }))}
                    error={Boolean(errors.date)}
                  />
                </Field>
                <Field label="Time slot" htmlFor="pickup-slot">
                  <NativeSelect
                    id="pickup-slot"
                    value={pickup.timeSlot}
                    onChange={(e) =>
                      setPickup((p) => ({ ...p, timeSlot: e.target.value as PickupTimeSlot }))
                    }
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Instructions (optional)" htmlFor="pickup-instructions">
                <Input
                  id="pickup-instructions"
                  placeholder="e.g. Ask for the despatch desk at Gate 2"
                  value={pickup.instructions}
                  onChange={(e) => setPickup((p) => ({ ...p, instructions: e.target.value }))}
                />
              </Field>
            </CardContent>
          </Card>

          {orders.map((order, index) => (
            <ShipmentCard
              key={order.key}
              index={index}
              draft={order}
              countries={countries}
              recipients={session.addressBook.recipients}
              savedItems={savedItems}
              onSavedItemsChange={setSavedItems}
              // The portal's client is already scoped to /b2b and carries the link token.
              savedItemsBase=""
              savedItemsClient={client}
              fetchPreview={(query) => client.get<QuotePreviewResultDto>(`/preview?${query}`)}
              recipientErrors={recipientErrors[order.key] ?? {}}
              error={orderErrors[order.key]}
              canRemove={orders.length > 1}
              onRemove={() => setOrders((all) => all.filter((o) => o.key !== order.key))}
              onChange={(patch) => updateOrder(order.key, patch)}
            />
          ))}

          <Button
            type="button"
            variant="secondary"
            onClick={() => setOrders((all) => [...all, newShipment()])}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add another shipment
          </Button>

          {submitError && <FieldError>{submitError}</FieldError>}
          <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
            Submit {orders.length} shipment{orders.length === 1 ? "" : "s"}
          </Button>
        </form>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {history.slice(0, 15).map((row) => (
              <div key={row.id} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
                <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {row.recipientName ?? "Recipient at pickup"} · {row.destinationCountry}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.pickupDate ?? new Date(row.createdAt).toLocaleDateString()} ·{" "}
                    {row.status.replaceAll("_", " ").toLowerCase()}
                    {row.carrier ? ` · ${row.carrier}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-medium text-foreground">
                  {row.currency} {Math.round(row.price).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
