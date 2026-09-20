"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Link2, Plus, UserRound } from "lucide-react";
import type {
  AddressBookDto,
  B2bOrderResultDto,
  CountryDto,
  CustomerDto,
  PickupTimeSlot,
  QuotePreviewResultDto,
  ResolvedMapsUrlDto,
  SavedItemDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { googleMapsEnabled, type PickedAddress } from "@/lib/google-maps";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PhoneInput } from "@/components/ui/phone-input";
import { PincodeInput } from "@/components/ui/pincode-input";
import { DateField } from "@/components/ui/date-field";
import { MapPinField } from "@/components/ui/map-pin-picker";
import {
  toRecipientPayload,
  validateRecipient,
  type RecipientErrors,
} from "@/components/quote/recipient-fields";
import { validatePackages } from "@/components/shipment/packages-editor";
import { toItemsPayload, validateItems } from "@/components/shipment/items-editor";
import { PartnerPicker } from "@/components/shipment/partner-picker";
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
  mapsUrl: string;
}

const emptyPickup: PickupForm = {
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
  mapsUrl: "",
};

/**
 * Staff booking for a customer — a phone call or a walk-in — handed to a partner they choose.
 *
 * One collection, as many delivery addresses as the customer has, each with its own boxes and its
 * own contents: a business sending sarees to one address and dupattas to another books it once.
 * Their last pickup address, past recipients and the goods last sent to each are filled in and can
 * be overwritten; whatever is booked becomes next time's default. Each order is still created when
 * the partner completes the pickup, exactly as for a customer's own booking.
 */
export default function AdminNewOrderPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // --- Customer ---
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "" });
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // --- Booking ---
  const [countries, setCountries] = useState<CountryDto[]>([]);
  const [pickup, setPickup] = useState<PickupForm>(emptyPickup);
  const [pickupLocation, setPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [savedRecipients, setSavedRecipients] = useState<AddressBookDto["recipients"]>([]);
  const [savedItems, setSavedItems] = useState<SavedItemDto[]>([]);
  const [shipments, setShipments] = useState<ShipmentDraft[]>([newShipment()]);
  const [shipmentErrors, setShipmentErrors] = useState<Record<string, string>>({});
  const [recipientErrors, setRecipientErrors] = useState<Record<string, RecipientErrors>>({});
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [results, setResults] = useState<B2bOrderResultDto[] | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    apiClient
      .get<CustomerDto[]>("/customers")
      .then(setCustomers)
      .finally(() => setCustomersLoading(false));
    apiClient.get<CountryDto[]>("/countries").then((all) => setCountries(all.filter((c) => c.isActive)));
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [customers, search]);

  async function selectCustomer(selected: CustomerDto) {
    setCustomer(selected);
    setPickup({ ...emptyPickup, contactName: selected.name, contactPhone: selected.phone });
    setPickupLocation(null);
    const book = await apiClient
      .get<AddressBookDto>(`/customers/${selected.id}/address-book`)
      .catch(() => null);
    if (!book) return;
    setSavedRecipients(book.recipients);
    setSavedItems(book.savedItems);
    const last = book.lastPickup;
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
      if (last.latitude != null && last.longitude != null) {
        setPickupLocation({ lat: last.latitude, lng: last.longitude });
      }
    }
  }

  async function createCustomer() {
    if (!newCustomer.name.trim()) return setNewCustomerError("Enter the customer's name.");
    if (!/^\+[1-9]\d{7,14}$/.test(newCustomer.phone)) {
      return setNewCustomerError("Enter a valid phone number.");
    }
    setNewCustomerError(null);
    setIsCreatingCustomer(true);
    try {
      const created = await apiClient.post<CustomerDto>("/customers", {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone,
        email: newCustomer.email.trim() || undefined,
        consentSource: "staff_entry",
      });
      setCustomers((all) => [created, ...all]);
      await selectCustomer(created);
    } catch (err) {
      setNewCustomerError(errorMessage(err, "Couldn't create the customer."));
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  const setPickupField = (key: keyof PickupForm) => (v: string) => setPickup((p) => ({ ...p, [key]: v }));

  function applyPicked(picked: PickedAddress) {
    setPickup((p) => ({
      ...p,
      addressLine1: p.addressLine1 || picked.addressLine1,
      city: picked.city || p.city,
      state: picked.state || p.state,
      postalCode: /^\d{6}$/.test(picked.postalCode) ? picked.postalCode : p.postalCode,
    }));
    if (picked.latitude != null && picked.longitude != null) {
      setPickupLocation({ lat: picked.latitude, lng: picked.longitude });
    }
  }

  async function resolveLink() {
    if (!pickup.mapsUrl.trim()) return;
    setIsResolvingLink(true);
    setLinkNote(null);
    try {
      const res = await apiClient.post<ResolvedMapsUrlDto>("/admin/pickup-requests/resolve-maps-url", {
        url: pickup.mapsUrl.trim(),
      });
      if (res.latitude != null && res.longitude != null) {
        setPickupLocation({ lat: res.latitude, lng: res.longitude });
        setLinkNote(`Pin set from the link: ${res.latitude.toFixed(6)}, ${res.longitude.toFixed(6)}`);
      } else {
        setLinkNote("No coordinates in this link — the partner will open the link itself to navigate.");
      }
    } catch {
      setLinkNote("Couldn't read that link right now. It will still be saved for the partner.");
    } finally {
      setIsResolvingLink(false);
    }
  }

  function updateShipment(key: string, patch: Partial<ShipmentDraft>) {
    setShipments((all) => all.map((sh) => (sh.key === key ? { ...sh, ...patch } : sh)));
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
    if (pickup.mapsUrl.trim() && !/^https:\/\//.test(pickup.mapsUrl.trim())) {
      next.mapsUrl = "Paste the full https:// Google Maps link.";
    }
    if (!partnerId) next.partner = "Choose who collects this pickup.";

    const perShipment: Record<string, string> = {};
    const perRecipient: Record<string, RecipientErrors> = {};
    for (const [i, shipment] of shipments.entries()) {
      const label = `Delivery address ${i + 1}: `;
      const recipientProblems = validateRecipient(shipment.recipient);
      if (Object.keys(recipientProblems).length > 0) {
        perRecipient[shipment.key] = recipientProblems;
      }
      if (!shipment.destinationCountry) {
        perShipment[shipment.key] = `${label}choose the destination country.`;
        continue;
      }
      const boxProblem = validatePackages(
        shipment.boxes,
        shipment.shipmentType !== "DOCUMENT",
      );
      if (boxProblem) {
        perShipment[shipment.key] = label + boxProblem;
        continue;
      }
      const itemProblem = validateItems(shipment.items);
      if (itemProblem) {
        perShipment[shipment.key] = label + itemProblem;
        continue;
      }
      // A price is needed either way round: a carrier from the rate cards, or one staff typed.
      if (!shipment.rateProviderId && !(Number(shipment.manualPrice) > 0)) {
        perShipment[shipment.key] =
          `${label}choose a carrier, or enter the price to charge.`;
      }
    }

    setErrors(next);
    setShipmentErrors(perShipment);
    setRecipientErrors(perRecipient);
    const ok =
      Object.keys(next).length === 0 &&
      Object.keys(perShipment).length === 0 &&
      Object.keys(perRecipient).length === 0;
    if (!ok) {
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
        first?.focus({ preventScroll: true });
      });
    }
    return ok;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer || !validate() || !partnerId) return;
    setSubmitError(null);
    setIsSubmitting(true);
    const body = {
      customerId: customer.id,
      submissionKey,
      partnerId,
      pickup: {
        pickupContactName: pickup.contactName.trim(),
        pickupContactPhone: pickup.contactPhone.trim(),
        pickupAddressLine1: pickup.addressLine1.trim(),
        pickupAddressLine2: pickup.addressLine2.trim() || undefined,
        pickupCity: pickup.city.trim(),
        pickupState: pickup.state.trim(),
        pickupPostalCode: pickup.postalCode.trim(),
        ...(pickupLocation
          ? { pickupLatitude: pickupLocation.lat, pickupLongitude: pickupLocation.lng }
          : {}),
        pickupMapsUrl: pickup.mapsUrl.trim() || undefined,
        pickupDate: pickup.date,
        pickupTimeSlot: pickup.timeSlot,
        pickupInstructions: pickup.instructions.trim() || undefined,
      },
      orders: shipments.map((shipment) => ({
        recipient: toRecipientPayload(shipment.recipient),
        destinationCountry: shipment.destinationCountry,
        shipmentType: shipment.shipmentType,
        packages: shipmentPackages(shipment),
        items: toItemsPayload(shipment.items),
        ...(shipment.rateProviderId
          ? { rateProviderId: shipment.rateProviderId }
          : { manualPrice: Number(shipment.manualPrice) }),
      })),
    };
    try {
      const created = await apiClient.post<B2bOrderResultDto[]>(
        "/admin/pickup-requests",
        body,
      );
      setResults(created);
      const booked = created.filter((r) => r.status === "BOOKED").length;
      showToast({
        variant: "success",
        title: `${booked} shipment${booked === 1 ? "" : "s"} booked`,
        description: "Each order is created when the partner completes the pickup.",
      });
    } catch (err) {
      setSubmitError(errorMessage(err, "Couldn't book this order. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const field = (key: keyof PickupForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`pickup-${key}`}>{label}</Label>
      <Input
        id={`pickup-${key}`}
        value={pickup[key]}
        onChange={(e) => setPickupField(key)(e.target.value)}
        error={Boolean(errors[key])}
        {...props}
      />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6 pb-10">
      <Link
        href="/admin/orders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to orders
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-foreground">New Order</h1>
        <p className="text-sm text-muted-foreground">
          Book a pickup for a customer and assign it to a pickup partner.
        </p>
      </div>

      {!customer && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <SegmentedControl
              ariaLabel="Customer type"
              options={[
                { value: "existing", label: "Existing customer" },
                { value: "new", label: "New customer" },
              ]}
              value={tab}
              onChange={setTab}
            />

            {tab === "existing" ? (
              <div className="space-y-3">
                <SearchInput
                  placeholder="Search by name, phone, or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search customers"
                />
                {customersLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Loading customers…</p>
                ) : filteredCustomers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No customers match. Use the New customer tab instead.
                  </p>
                ) : (
                  <div className="max-h-96 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectCustomer(c)}
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
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-name">Name</Label>
                    <Input
                      id="new-name"
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-phone">Phone</Label>
                    <PhoneInput
                      id="new-phone"
                      value={newCustomer.phone}
                      onChange={(phone) => setNewCustomer((c) => ({ ...c, phone }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-email">Email (optional)</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))}
                  />
                </div>
                {newCustomerError && <FieldError>{newCustomerError}</FieldError>}
                <Button type="button" onClick={createCustomer} isLoading={isCreatingCustomer}>
                  Create customer &amp; continue
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {customer && results && (
        <Card>
          <CardHeader>
            <CardTitle>Booked</CardTitle>
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
                      ? `${r.carrier ?? "Manually priced"} · ${r.currency} ${Math.round(
                          r.price ?? 0,
                        ).toLocaleString("en-IN")} — assigned to the partner.`
                      : "No rate covers this route and no price was given — price it from Quote Requests."}
                  </p>
                </div>
                {r.pickupRequestId && (
                  <Link
                    href={`/admin/pickup-requests/${r.pickupRequestId}`}
                    className="shrink-0 text-xs font-medium text-primary hover:underline"
                  >
                    Open
                  </Link>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="button" onClick={() => router.push("/admin/pickup-requests")}>
                Go to pickup requests
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.refresh()}
              >
                Book another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {customer && !results && (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium text-foreground">
                {customer.name} · {customer.phone}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCustomer(null)}>
              Change
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pickup from</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {field("contactName", "Contact name")}
                <div className="space-y-1.5">
                  <Label htmlFor="pickup-contactPhone">Contact phone</Label>
                  <Input
                    id="pickup-contactPhone"
                    type="tel"
                    value={pickup.contactPhone}
                    onChange={(e) => setPickupField("contactPhone")(e.target.value)}
                    error={Boolean(errors.contactPhone)}
                  />
                  {errors.contactPhone && <FieldError>{errors.contactPhone}</FieldError>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pickup-mapsUrl">Google Maps link</Label>
                <div className="flex gap-2">
                  <Input
                    id="pickup-mapsUrl"
                    type="url"
                    placeholder="https://maps.app.goo.gl/…"
                    value={pickup.mapsUrl}
                    onChange={(e) => setPickupField("mapsUrl")(e.target.value)}
                    error={Boolean(errors.mapsUrl)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={resolveLink}
                    isLoading={isResolvingLink}
                    disabled={!pickup.mapsUrl.trim()}
                  >
                    <Link2 className="h-4 w-4" aria-hidden /> Use link
                  </Button>
                </div>
                {errors.mapsUrl && <FieldError>{errors.mapsUrl}</FieldError>}
                {linkNote && <p className="text-xs text-muted-foreground">{linkNote}</p>}
              </div>

              {googleMapsEnabled() && <MapPinField value={pickupLocation} onChange={applyPicked} />}

              {field("addressLine1", "Address line 1 (house / flat, street)")}
              {field("addressLine2", "Address line 2 / landmark (optional)")}
              <div className="grid gap-4 sm:grid-cols-3">
                {field("city", "City")}
                {field("state", "State")}
                <div className="space-y-1.5">
                  <Label htmlFor="pickup-postalCode">PIN code</Label>
                  <PincodeInput
                    id="pickup-postalCode"
                    value={pickup.postalCode}
                    onChange={setPickupField("postalCode")}
                    onResolved={({ city, district, state }) =>
                      setPickup((p) => ({ ...p, city: city || district || p.city, state: state || p.state }))
                    }
                    error={Boolean(errors.postalCode)}
                  />
                  {errors.postalCode && <FieldError>{errors.postalCode}</FieldError>}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pickup-date">Pickup date</Label>
                  <DateField
                    id="pickup-date"
                    title="Pickup date"
                    min={todayIso()}
                    value={pickup.date}
                    onChange={setPickupField("date")}
                    error={Boolean(errors.date)}
                  />
                  {errors.date && <FieldError>{errors.date}</FieldError>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pickup-slot">Time slot</Label>
                  <NativeSelect
                    id="pickup-slot"
                    value={pickup.timeSlot}
                    onChange={(e) => setPickupField("timeSlot")(e.target.value)}
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              {field("instructions", "Instructions for the partner (optional)")}
            </CardContent>
          </Card>

          {shipments.map((shipment, index) => (
            <ShipmentCard
              key={shipment.key}
              index={index}
              draft={shipment}
              countries={countries}
              recipients={savedRecipients}
              savedItems={savedItems}
              onSavedItemsChange={setSavedItems}
              savedItemsBase={`/customers/${customer.id}`}
              // Staff may charge a route the rate cards do not cover; the portal may not.
              allowManualPrice
              fetchPreview={(query) =>
                apiClient.get<QuotePreviewResultDto>(`/quotes/preview?${query}`)
              }
              recipientErrors={recipientErrors[shipment.key] ?? {}}
              error={shipmentErrors[shipment.key]}
              canRemove={shipments.length > 1}
              onRemove={() =>
                setShipments((all) => all.filter((sh) => sh.key !== shipment.key))
              }
              onChange={(patch) => updateShipment(shipment.key, patch)}
            />
          ))}

          <Button
            type="button"
            variant="secondary"
            onClick={() => setShipments((all) => [...all, newShipment()])}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add another delivery address
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>Assign pickup partner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2" aria-invalid={Boolean(errors.partner)} tabIndex={-1}>
              {!pickupLocation && (
                <p className="text-xs text-muted-foreground">
                  Set the pickup pin (map or Google Maps link) to sort partners by distance.
                </p>
              )}
              <PartnerPicker value={partnerId} onChange={setPartnerId} pickup={pickupLocation} />
              {errors.partner && <FieldError>{errors.partner}</FieldError>}
            </CardContent>
          </Card>

          {submitError && <FieldError>{submitError}</FieldError>}
          <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
            Book {shipments.length} shipment{shipments.length === 1 ? "" : "s"} &amp; assign partner
          </Button>
        </form>
      )}
    </div>
  );
}
