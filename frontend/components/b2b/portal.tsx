"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock, MapPin, Plus } from "lucide-react";
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
import { ApiError, errorMessage } from "@/lib/api-client";
import type { B2bClient } from "@/lib/b2b-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { PincodeInput } from "@/components/ui/pincode-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/page-state";
import { Logo } from "@/components/brand/logo";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  InvoicesPanel,
  OrdersPanel,
  ProfilePanel,
  TrackingPanel,
} from "@/components/b2b/panels";
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
  { value: "09:00-12:00", label: "9 AM - 12 PM" },
  { value: "12:00-15:00", label: "12-3 PM" },
  { value: "15:00-18:00", label: "3-6 PM" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

type Tab = "book" | "orders" | "invoices" | "tracking" | "profile";

const TABS: { value: Tab; label: string }[] = [
  { value: "book", label: "Book" },
  { value: "orders", label: "Orders" },
  { value: "invoices", label: "Invoices" },
  { value: "tracking", label: "Tracking" },
  { value: "profile", label: "Profile" },
];

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
  const [tab, setTab] = useState<Tab>("book");
  // Set when an order's tracking number is clicked, so the tracking tab opens on that parcel.
  const [trackTarget, setTrackTarget] = useState<string | undefined>(undefined);
  const [usedSavedPickup, setUsedSavedPickup] = useState(false);

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
          setUsedSavedPickup(true);
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
          // A revoked or unknown link is the flat 404 B2bAccessGuard throws, and only that is
          // worth sending someone back to their NationWide contact for. Anything else is our
          // fault, and telling a despatch desk their working link is dead has them chasing a
          // replacement that would fail exactly the same way — the reference id errorMessage
          // appends to a 5xx is what actually gets it fixed.
          err instanceof ApiError && err.status === 404
            ? "This link is no longer valid. Ask your NationWide contact for a new one."
            : errorMessage(err, "We couldn't open the portal. Please try again shortly."),
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
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-11 w-full max-w-xl rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-96 w-full rounded-2xl" />
          <Skeleton className="hidden h-64 w-full rounded-2xl lg:block" />
        </div>
      </div>
    );
  }
  if (loadError || !session) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <ErrorState message={loadError ?? "Something went wrong."} />
      </div>
    );
  }

  const pickupSlot = TIME_SLOTS.find((t) => t.value === pickup.timeSlot)?.label;
  const priced = orders.filter((o) => typeof o.estimate === "number");
  const estimatedTotal = priced.reduce((sum, o) => sum + (o.estimate ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 pb-20 sm:px-6 lg:py-8">
      <header className="flex items-center justify-between gap-4">
        <Logo className="h-7 min-w-0" />
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-foreground">{session.customerName}</p>
            <p className="text-xs text-muted-foreground">{session.linkLabel}</p>
          </div>
          <span
            title={session.customerName}
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background"
          >
            {session.customerName.trim().charAt(0).toUpperCase()}
          </span>
        </div>
      </header>

      <nav className="max-w-xl">
        <SegmentedControl
          options={TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Portal section"
        />
      </nav>

      {tab === "orders" && (
        <OrdersPanel
          client={client}
          orders={history}
          onBook={() => setTab("book")}
          onTrack={(trackingNumber) => {
            setTrackTarget(trackingNumber);
            setTab("tracking");
          }}
        />
      )}
      {tab === "invoices" && <InvoicesPanel client={client} />}
      {tab === "tracking" && <TrackingPanel orders={history} initialTracking={trackTarget} />}
      {tab === "profile" && <ProfilePanel client={client} />}

      {tab === "book" && (results ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">Shipments submitted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((r) => (
              <div
                key={r.index}
                className="flex items-start gap-3 rounded-xl border border-border bg-white/50 p-4 text-sm"
              >
                {r.status === "BOOKED" ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
                ) : (
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {r.recipientName} · {r.destinationCountry}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.status === "BOOKED"
                      ? `${r.carrier ?? "Carrier"} · ${formatMoney(r.price ?? 0, r.currency ?? "INR")}. A pickup partner will collect it.`
                      : "No published rate covers this route. Our team will price it and contact you."}
                  </p>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Final prices are confirmed when the partner weighs and measures each box at pickup.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={startAnother}>
                Book more shipments
              </Button>
              <Button type="button" variant="secondary" onClick={() => setTab("orders")}>
                View orders
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start"
        >
          <div className="min-w-0 space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Request a pickup</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                One collection, as many shipments as you need. Your saved addresses and items are
                ready to pick from.
              </p>
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3 border-b border-[color:var(--glass-edge)] pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
                    <MapPin className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <CardTitle className="text-xs uppercase tracking-wider">Pickup</CardTitle>
                    <p className="font-semibold text-foreground">Collect from</p>
                  </div>
                </div>
                {usedSavedPickup && <Badge variant="neutral">Saved address</Badge>}
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Contact name" error={errors.contactName} htmlFor="pickup-name">
                    <Input
                      id="pickup-name"
                      autoComplete="name"
                      value={pickup.contactName}
                      onChange={(e) => setPickup((p) => ({ ...p, contactName: e.target.value }))}
                      error={Boolean(errors.contactName)}
                    />
                  </Field>
                  <Field label="Contact phone" error={errors.contactPhone} htmlFor="pickup-phone">
                    <Input
                      id="pickup-phone"
                      type="tel"
                      autoComplete="tel"
                      value={pickup.contactPhone}
                      onChange={(e) => setPickup((p) => ({ ...p, contactPhone: e.target.value }))}
                      error={Boolean(errors.contactPhone)}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Address" error={errors.addressLine1} htmlFor="pickup-address">
                    <Input
                      id="pickup-address"
                      autoComplete="address-line1"
                      value={pickup.addressLine1}
                      onChange={(e) => setPickup((p) => ({ ...p, addressLine1: e.target.value }))}
                      error={Boolean(errors.addressLine1)}
                    />
                  </Field>
                  <Field label="Landmark / unit (optional)" htmlFor="pickup-address-2">
                    <Input
                      id="pickup-address-2"
                      autoComplete="address-line2"
                      value={pickup.addressLine2}
                      onChange={(e) => setPickup((p) => ({ ...p, addressLine2: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
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
                  <Field label="City" error={errors.city} htmlFor="pickup-city">
                    <Input
                      id="pickup-city"
                      autoComplete="address-level2"
                      value={pickup.city}
                      onChange={(e) => setPickup((p) => ({ ...p, city: e.target.value }))}
                      error={Boolean(errors.city)}
                    />
                  </Field>
                  <Field label="State" error={errors.state} htmlFor="pickup-state">
                    <Input
                      id="pickup-state"
                      autoComplete="address-level1"
                      value={pickup.state}
                      onChange={(e) => setPickup((p) => ({ ...p, state: e.target.value }))}
                      error={Boolean(errors.state)}
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
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Time slot</p>
                    <SegmentedControl
                      options={TIME_SLOTS}
                      value={pickup.timeSlot}
                      onChange={(timeSlot) => setPickup((p) => ({ ...p, timeSlot }))}
                      ariaLabel="Pickup time slot"
                    />
                  </div>
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

            <button
              type="button"
              onClick={() => setOrders((all) => [...all, newShipment()])}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border py-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add another delivery
            </button>
          </div>

          {/* The summary rides alongside the form on desktop and closes it on a phone, so the
              submit button is always where the eye ends up. */}
          <aside className="lg:sticky lg:top-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-xs uppercase tracking-wider">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-3 text-sm">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {pickup.date ? formatDay(pickup.date) : "Pick a date"} · {pickupSlot}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[pickup.city, pickup.postalCode].filter(Boolean).join(" ") || "Pickup address not set"}
                    </p>
                  </div>
                </div>

                <ul className="divide-y divide-border text-sm">
                  {orders.map((o, i) => (
                    <li key={o.key} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate text-foreground">
                        <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                        {o.recipient.name.trim() || o.destinationCountry || "New delivery"}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-foreground">
                        {typeof o.estimate === "number" ? formatMoney(o.estimate, "INR") : "–"}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">Estimated total</span>
                  <span className="text-xl font-semibold tabular-nums text-foreground">
                    {formatMoney(estimatedTotal, "INR")}
                  </span>
                </div>
                {priced.length < orders.length && (
                  <p className="text-xs text-muted-foreground">
                    {orders.length - priced.length} of {orders.length} not priced yet. Fill in the
                    country and boxes to see a price.
                  </p>
                )}

                {submitError && <FieldError>{submitError}</FieldError>}
                <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
                  Submit {orders.length} shipment{orders.length === 1 ? "" : "s"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Final prices are confirmed when each box is weighed at pickup.
                </p>
              </CardContent>
            </Card>
          </aside>
        </form>
      ))}
    </div>
  );
}

const formatMoney = (value: number, currency: string) =>
  `${currency === "INR" ? "₹" : `${currency} `}${Math.round(value).toLocaleString("en-IN")}`;

// The date field holds yyyy-mm-dd; parsed as local noon so no timezone tips it a day either way.
const formatDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

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
