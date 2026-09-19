"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Link2, UserRound } from "lucide-react";
import {
  chargeableWeightKg,
  type AddressBookDto,
  type AdminCreatePickupOrderDto,
  type CountryDto,
  type CustomerDto,
  type PickupRequestDto,
  type PickupTimeSlot,
  type QuotePreviewResultDto,
  type ResolvedMapsUrlDto,
  type SavedItemDto,
  type ShipmentTypeCode,
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
import { PartnerPicker } from "@/components/shipment/partner-picker";

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
 * Staff booking a pickup for a customer — a phone call or a walk-in — and handing it to a partner
 * they choose. For an existing customer, the last pickup address and their past recipients and
 * contents are filled in and can be overwritten; whatever is booked becomes next time's default.
 * The order itself is still created when the partner completes the pickup, exactly as for a
 * customer's own booking.
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
  const [destinationCountry, setDestinationCountry] = useState("");
  const [recipient, setRecipient] = useState<RecipientForm>(emptyRecipient);
  const [recipientErrors, setRecipientErrors] = useState<RecipientErrors>({});
  const [shipmentType, setShipmentType] = useState<ShipmentTypeCode>("PACKAGE");
  const [boxes, setBoxes] = useState<PackageForm[]>(() => packagesFrom(null));
  const [items, setItems] = useState<ItemForm[]>(() => itemsFrom(null));
  const [savedItems, setSavedItems] = useState<SavedItemDto[]>([]);

  // --- Price & partner ---
  const [preview, setPreview] = useState<QuotePreviewResultDto | null>(null);
  const [pricedFor, setPricedFor] = useState<string | null>(null);
  const [isPricing, setIsPricing] = useState(false);
  const [rateProviderId, setRateProviderId] = useState<string | "manual" | null>(null);
  const [manualPrice, setManualPrice] = useState("");
  const [partnerId, setPartnerId] = useState<string | null>(null);

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

  // The price is only valid for the exact destination, type and weight it was fetched for.
  const packagesProblem = validatePackages(boxes, shipmentType !== "DOCUMENT");
  const chargeable = packagesProblem ? null : chargeableWeightKg(toPackagesPayload(boxes));
  const priceKey = JSON.stringify([destinationCountry, shipmentType, chargeable]);
  const priceIsCurrent = preview !== null && pricedFor === priceKey;

  async function getPrices() {
    const next: Record<string, string> = {};
    if (!destinationCountry) next.destinationCountry = "Choose the destination country.";
    if (packagesProblem) next.packages = packagesProblem;
    setErrors((e) => ({ ...e, ...next, price: "" }));
    if (Object.keys(next).length > 0 || chargeable === null) return;

    setIsPricing(true);
    try {
      const result = await apiClient.get<QuotePreviewResultDto>(
        `/quotes/preview?destinationCountry=${encodeURIComponent(destinationCountry)}&weightKg=${chargeable}&shipmentType=${shipmentType}`,
      );
      setPreview(result);
      setPricedFor(priceKey);
      setRateProviderId(result.options[0]?.rateProviderId ?? "manual");
    } catch (err) {
      setErrors((e) => ({ ...e, price: errorMessage(err, "Couldn't fetch prices.") }));
    } finally {
      setIsPricing(false);
    }
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
    if (!destinationCountry) next.destinationCountry = "Choose the destination country.";
    if (packagesProblem) next.packages = packagesProblem;
    const itemsProblem = validateItems(items);
    if (itemsProblem) next.items = itemsProblem;
    if (!priceIsCurrent) next.price = "Get prices for the current parcel details first.";
    else if (rateProviderId === "manual" && !(Number(manualPrice) > 0)) next.price = "Enter the price to charge.";
    if (!partnerId) next.partner = "Choose who collects this pickup.";

    const nextRecipientErrors = validateRecipient(recipient);
    setErrors(next);
    setRecipientErrors(nextRecipientErrors);
    const ok = Object.keys(next).length === 0 && Object.keys(nextRecipientErrors).length === 0;
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
    const body: AdminCreatePickupOrderDto = {
      customerId: customer.id,
      submissionKey,
      shipmentType,
      packages: toPackagesPayload(boxes),
      items: toItemsPayload(items),
      destinationCountry,
      recipient: toRecipientPayload(recipient),
      pickupContactName: pickup.contactName.trim(),
      pickupContactPhone: pickup.contactPhone.trim(),
      pickupAddressLine1: pickup.addressLine1.trim(),
      pickupAddressLine2: pickup.addressLine2.trim() || undefined,
      pickupCity: pickup.city.trim(),
      pickupState: pickup.state.trim(),
      pickupPostalCode: pickup.postalCode.trim(),
      ...(pickupLocation ? { pickupLatitude: pickupLocation.lat, pickupLongitude: pickupLocation.lng } : {}),
      pickupMapsUrl: pickup.mapsUrl.trim() || undefined,
      pickupDate: pickup.date,
      pickupTimeSlot: pickup.timeSlot,
      pickupInstructions: pickup.instructions.trim() || undefined,
      ...(rateProviderId === "manual" ? { manualPrice: Number(manualPrice) } : { rateProviderId: rateProviderId! }),
      partnerId,
    };
    try {
      const created = await apiClient.post<PickupRequestDto>("/admin/pickup-requests", body);
      showToast({
        variant: "success",
        title: "Order booked",
        description: `Assigned to ${created.assignedPartnerName ?? "the partner"}. The order is created when they complete the pickup.`,
      });
      router.push(`/admin/pickup-requests/${created.id}`);
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

      {customer && (
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

          <Card>
            <CardHeader>
              <CardTitle>Deliver to</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SavedRecipients
                recipients={savedRecipients}
                onPick={(r) => {
                  setRecipient(recipientFrom(r));
                  setDestinationCountry(r.country);
                }}
              />
              <div className="space-y-1.5">
                <Label htmlFor="destination-country">Destination country</Label>
                <NativeSelect
                  id="destination-country"
                  value={destinationCountry}
                  onChange={(e) => setDestinationCountry(e.target.value)}
                  aria-invalid={Boolean(errors.destinationCountry)}
                >
                  <option value="">Select a country…</option>
                  {countries.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                {errors.destinationCountry && <FieldError>{errors.destinationCountry}</FieldError>}
              </div>
              <RecipientFields
                value={recipient}
                onChange={setRecipient}
                errors={recipientErrors}
                isIndia={destinationCountry === "India"}
                country={destinationCountry}
                idPrefix="recipient"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parcel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="shipment-type">Shipment type</Label>
                <NativeSelect
                  id="shipment-type"
                  value={shipmentType}
                  onChange={(e) => setShipmentType(e.target.value as ShipmentTypeCode)}
                >
                  {SHIPMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div aria-invalid={Boolean(errors.packages)} tabIndex={-1}>
                <PackagesEditor
                  value={boxes}
                  onChange={setBoxes}
                  requireDimensions={shipmentType !== "DOCUMENT"}
                  error={errors.packages}
                />
              </div>
              <div className="space-y-2" aria-invalid={Boolean(errors.items)} tabIndex={-1}>
                <p className="text-sm font-medium text-foreground">Contents</p>
                <ItemsEditor
                  value={items}
                  onChange={setItems}
                  savedItems={savedItems}
                  onSavedItemsChange={setSavedItems}
                  libraryBase={`/customers/${customer.id}`}
                  error={errors.items}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Price</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3" aria-invalid={Boolean(errors.price)} tabIndex={-1}>
              <Button type="button" variant="secondary" onClick={getPrices} isLoading={isPricing}>
                {preview ? "Refresh prices" : "Get prices"}
              </Button>
              {preview && !priceIsCurrent && (
                <p className="text-xs text-warning">The parcel details changed — refresh prices.</p>
              )}
              {preview && priceIsCurrent && (
                <div role="radiogroup" aria-label="Carrier" className="space-y-1.5">
                  {preview.options.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No carrier rate covers this shipment — enter the price to charge.
                    </p>
                  )}
                  {[...preview.options]
                    .sort((a, b) => a.finalPrice - b.finalPrice)
                    .map((o) => (
                      <label
                        key={o.rateProviderId}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted"
                      >
                        <input
                          type="radio"
                          name="carrier"
                          checked={rateProviderId === o.rateProviderId}
                          onChange={() => setRateProviderId(o.rateProviderId)}
                        />
                        <span className="flex-1 font-medium text-foreground">{o.rateProviderName}</span>
                        <span className="font-semibold text-foreground">
                          {o.currency} {Math.round(o.finalPrice).toLocaleString("en-IN")}
                        </span>
                      </label>
                    ))}
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted">
                    <input
                      type="radio"
                      name="carrier"
                      checked={rateProviderId === "manual"}
                      onChange={() => setRateProviderId("manual")}
                    />
                    <span className="flex-1 font-medium text-foreground">Enter a price manually</span>
                    {rateProviderId === "manual" && (
                      <Input
                        aria-label="Price in INR"
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-32"
                        placeholder="₹"
                        value={manualPrice}
                        onChange={(e) => setManualPrice(e.target.value)}
                      />
                    )}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Priced on {chargeable} kg chargeable. The partner re-weighs and re-measures at pickup.
                  </p>
                </div>
              )}
              {errors.price && <FieldError>{errors.price}</FieldError>}
            </CardContent>
          </Card>

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
            Book order &amp; assign partner
          </Button>
        </form>
      )}
    </div>
  );
}
