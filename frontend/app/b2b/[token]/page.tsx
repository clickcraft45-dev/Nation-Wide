"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock, Package, Plus, Trash2 } from "lucide-react";
import {
  chargeableWeightKg,
  type B2bCreateOrdersDto,
  type B2bOrderResultDto,
  type B2bRequestSummaryDto,
  type B2bSessionDto,
  type CountryDto,
  type PickupTimeSlot,
  type QuotePreviewResultDto,
  type SavedItemDto,
  type ShipmentTypeCode,
} from "@nationwide/shared-types";
import { errorMessage } from "@/lib/api-client";
import { b2bClient, type B2bClient } from "@/lib/b2b-client";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
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
  RecipientFields,
  emptyRecipient,
  recipientFrom,
  toRecipientPayload,
  validateRecipient,
  type RecipientErrors,
  type RecipientForm,
} from "@/components/quote/recipient-fields";
import {
  PackagesEditor,
  packagesFrom,
  toPackagesPayload,
  validatePackages,
  type PackageForm,
} from "@/components/shipment/packages-editor";
import {
  ItemsEditor,
  itemsFrom,
  toItemsPayload,
  validateItems,
  type ItemForm,
} from "@/components/shipment/items-editor";
import { SavedRecipients } from "@/components/shipment/saved-recipients";

const TIME_SLOTS: { value: PickupTimeSlot; label: string }[] = [
  { value: "09:00-12:00", label: "9:00 AM – 12:00 PM" },
  { value: "12:00-15:00", label: "12:00 PM – 3:00 PM" },
  { value: "15:00-18:00", label: "3:00 PM – 6:00 PM" },
];

const SHIPMENT_TYPES: { value: ShipmentTypeCode; label: string }[] = [
  { value: "PACKAGE", label: "Package" },
  { value: "PARCEL", label: "Parcel" },
  { value: "DOCUMENT", label: "Document" },
  { value: "OTHER", label: "Other" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

interface OrderDraft {
  key: string;
  recipient: RecipientForm;
  destinationCountry: string;
  shipmentType: ShipmentTypeCode;
  boxes: PackageForm[];
  items: ItemForm[];
  rateProviderId: string | null;
}

function newOrder(): OrderDraft {
  return {
    key: crypto.randomUUID(),
    recipient: emptyRecipient,
    destinationCountry: "",
    shipmentType: "PACKAGE",
    boxes: packagesFrom(null),
    items: itemsFrom(null),
    rateProviderId: null,
  };
}

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
 * The B2B order portal: a business customer's despatch team books shipments from a standing link,
 * with no login. One pickup, many recipients — every address and item they have shipped before is
 * offered for reuse, and anything new is remembered for next time.
 *
 * The token in the URL is the credential (see b2bClient); it authenticates every call and scopes
 * everything to that one business.
 */
export default function B2bPortalPage() {
  const { token } = useParams<{ token: string }>();
  const client = useMemo(() => b2bClient(token), [token]);

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
  const [orders, setOrders] = useState<OrderDraft[]>([newOrder()]);
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

  function updateOrder(key: string, patch: Partial<OrderDraft>) {
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
        packages: toPackagesPayload(o.boxes),
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
    setOrders([newOrder()]);
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

  const recipientsForCountry = (country: string) =>
    session.addressBook.recipients.filter((r) => !country || r.country === country);

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
            <OrderCard
              key={order.key}
              index={index}
              order={order}
              countries={countries}
              client={client}
              savedRecipients={recipientsForCountry(order.destinationCountry)}
              allRecipients={session.addressBook.recipients}
              savedItems={savedItems}
              onSavedItemsChange={setSavedItems}
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
            onClick={() => setOrders((all) => [...all, newOrder()])}
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

function OrderCard({
  index,
  order,
  countries,
  client,
  savedRecipients,
  allRecipients,
  savedItems,
  onSavedItemsChange,
  recipientErrors,
  error,
  canRemove,
  onRemove,
  onChange,
}: {
  index: number;
  order: OrderDraft;
  countries: CountryDto[];
  client: B2bClient;
  savedRecipients: B2bSessionDto["addressBook"]["recipients"];
  allRecipients: B2bSessionDto["addressBook"]["recipients"];
  savedItems: SavedItemDto[];
  onSavedItemsChange: (next: SavedItemDto[]) => void;
  recipientErrors: RecipientErrors;
  error?: string;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<OrderDraft>) => void;
}) {
  const [preview, setPreview] = useState<QuotePreviewResultDto | null>(null);
  const [isPricing, setIsPricing] = useState(false);

  const boxProblem = validatePackages(order.boxes, order.shipmentType !== "DOCUMENT");
  const chargeable = boxProblem ? 0 : chargeableWeightKg(toPackagesPayload(order.boxes));
  const debounced = useDebouncedValue(
    `${order.destinationCountry}|${order.shipmentType}|${chargeable}`,
    600,
  );

  // Prices refresh themselves as the shipment is filled in — the same stateless preview the
  // customer wizard uses. Nothing is booked until the whole batch is submitted.
  useEffect(() => {
    const [country, shipmentType, weight] = debounced.split("|");
    if (!country || Number(weight) <= 0) {
      // Dropping a now-stale price when the shipment stops being priceable — one render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }
    let cancelled = false;
    setIsPricing(true);
    client
      .get<QuotePreviewResultDto>(
        `/preview?destinationCountry=${encodeURIComponent(country)}&weightKg=${weight}&shipmentType=${shipmentType}`,
      )
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        // Default to the cheapest; the server does the same when nothing is chosen.
        const cheapest = [...result.options].sort((a, b) => a.finalPrice - b.finalPrice)[0];
        onChange({ rateProviderId: cheapest?.rateProviderId ?? null });
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setIsPricing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, client]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Shipment {index + 1}</CardTitle>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove shipment ${index + 1}`}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-4" aria-invalid={Boolean(error)} tabIndex={-1}>
        <SavedRecipients
          recipients={savedRecipients.length > 0 ? savedRecipients : allRecipients}
          onPick={(r) =>
            onChange({ recipient: recipientFrom(r), destinationCountry: r.country })
          }
        />
        <Field label="Destination country" htmlFor={`country-${order.key}`}>
          <NativeSelect
            id={`country-${order.key}`}
            value={order.destinationCountry}
            onChange={(e) => onChange({ destinationCountry: e.target.value })}
          >
            <option value="">Select a country…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <RecipientFields
          value={order.recipient}
          onChange={(update) =>
            onChange({
              recipient:
                typeof update === "function" ? update(order.recipient) : update,
            })
          }
          errors={recipientErrors}
          isIndia={order.destinationCountry === "India"}
          country={order.destinationCountry}
          idPrefix={`recipient-${order.key}`}
        />

        <Field label="Shipment type" htmlFor={`type-${order.key}`}>
          <NativeSelect
            id={`type-${order.key}`}
            value={order.shipmentType}
            onChange={(e) => onChange({ shipmentType: e.target.value as ShipmentTypeCode })}
          >
            {SHIPMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <PackagesEditor
          value={order.boxes}
          onChange={(boxes) => onChange({ boxes })}
          requireDimensions={order.shipmentType !== "DOCUMENT"}
          idPrefix={`box-${order.key}`}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Contents</p>
          <ItemsEditor
            value={order.items}
            onChange={(items) => onChange({ items })}
            savedItems={savedItems}
            onSavedItemsChange={onSavedItemsChange}
            libraryBase=""
            client={client}
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {isPricing && <p className="text-muted-foreground">Checking prices…</p>}
          {!isPricing && !preview && (
            <p className="text-muted-foreground">
              Choose a country and enter the boxes to see prices.
            </p>
          )}
          {!isPricing && preview && preview.options.length === 0 && (
            <p className="text-muted-foreground">
              No published rate covers this route — submit it anyway and our team will price it and
              come back to you.
            </p>
          )}
          {!isPricing && preview && preview.options.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Carrier · {chargeable} kg chargeable</p>
              {[...preview.options]
                .sort((a, b) => a.finalPrice - b.finalPrice)
                .map((o) => (
                  <label key={o.rateProviderId} className="flex cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name={`carrier-${order.key}`}
                      checked={order.rateProviderId === o.rateProviderId}
                      onChange={() => onChange({ rateProviderId: o.rateProviderId })}
                    />
                    <span className="flex-1 font-medium text-foreground">{o.rateProviderName}</span>
                    <span className="font-semibold text-foreground">
                      {o.currency} {Math.round(o.finalPrice).toLocaleString("en-IN")}
                    </span>
                  </label>
                ))}
            </div>
          )}
        </div>

        {error && <FieldError>{error}</FieldError>}
      </CardContent>
    </Card>
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
