"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  chargeableWeightKg,
  type CountryDto,
  type ParcelPackageDto,
  type QuotePreviewResultDto,
  type SavedItemDto,
  type SavedRecipientDto,
  type ShipmentTypeCode,
} from "@nationwide/shared-types";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  RecipientFields,
  emptyRecipient,
  recipientFrom,
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
  type ItemForm,
} from "@/components/shipment/items-editor";
import { SavedRecipients } from "@/components/shipment/saved-recipients";

const SHIPMENT_TYPES: { value: ShipmentTypeCode; label: string }[] = [
  { value: "PACKAGE", label: "Package" },
  { value: "PARCEL", label: "Parcel" },
  { value: "DOCUMENT", label: "Document" },
  { value: "OTHER", label: "Other" },
];

/** One delivery address and everything going to it. */
export interface ShipmentDraft {
  key: string;
  recipient: RecipientForm;
  destinationCountry: string;
  shipmentType: ShipmentTypeCode;
  boxes: PackageForm[];
  items: ItemForm[];
  rateProviderId: string | null;
  /** Staff only: what to charge when no rate card covers the route. */
  manualPrice: string;
  /** Price of the picked carrier, for a running total. Display only; the server prices the booking. */
  estimate?: number | null;
}

export function newShipment(): ShipmentDraft {
  return {
    key: crypto.randomUUID(),
    recipient: emptyRecipient,
    destinationCountry: "",
    shipmentType: "PACKAGE",
    boxes: packagesFrom(null),
    items: itemsFrom(null),
    rateProviderId: null,
    manualPrice: "",
  };
}

export function shipmentPackages(draft: ShipmentDraft): ParcelPackageDto[] {
  return toPackagesPayload(draft.boxes);
}

/**
 * One shipment in a booking: who it goes to, what is in it, and what it costs.
 *
 * Used by both booking screens — staff on the Create Order page and a business in its own portal.
 * They differ only in how prices are fetched (a session or a link token) and in whether staff may
 * name a price the rate cards cannot, so both arrive as props rather than being branched on here.
 */
export function ShipmentCard({
  index,
  draft,
  countries,
  recipients,
  savedItems,
  onSavedItemsChange,
  fetchPreview,
  savedItemsBase,
  savedItemsClient,
  allowManualPrice = false,
  recipientErrors,
  error,
  canRemove,
  onRemove,
  onChange,
}: {
  index: number;
  draft: ShipmentDraft;
  countries: CountryDto[];
  recipients: SavedRecipientDto[];
  savedItems: SavedItemDto[];
  onSavedItemsChange: (next: SavedItemDto[]) => void;
  fetchPreview: (query: string) => Promise<QuotePreviewResultDto>;
  savedItemsBase?: string;
  savedItemsClient?: React.ComponentProps<typeof ItemsEditor>["client"];
  allowManualPrice?: boolean;
  recipientErrors: RecipientErrors;
  error?: string;
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<ShipmentDraft>) => void;
}) {
  const [preview, setPreview] = useState<QuotePreviewResultDto | null>(null);
  const [isPricing, setIsPricing] = useState(false);

  const boxProblem = validatePackages(draft.boxes, draft.shipmentType !== "DOCUMENT");
  const chargeable = boxProblem ? 0 : chargeableWeightKg(shipmentPackages(draft));
  const debounced = useDebouncedValue(
    `${draft.destinationCountry}|${draft.shipmentType}|${chargeable}`,
    600,
  );

  // Prices refresh themselves as the shipment is filled in — the same stateless preview the
  // customer wizard uses. Nothing is booked until the whole form is submitted.
  useEffect(() => {
    const [country, shipmentType, weight] = debounced.split("|");
    if (!country || Number(weight) <= 0) {
      // Dropping a now-stale price when the shipment stops being priceable — one render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      onChange({ estimate: null });
      return;
    }
    let cancelled = false;
    setIsPricing(true);
    fetchPreview(
      `destinationCountry=${encodeURIComponent(country)}&weightKg=${weight}&shipmentType=${shipmentType}`,
    )
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        const cheapest = [...result.options].sort((a, b) => a.finalPrice - b.finalPrice)[0];
        onChange({
          rateProviderId: cheapest?.rateProviderId ?? null,
          estimate: cheapest?.finalPrice ?? null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
        onChange({ estimate: null });
      })
      .finally(() => {
        if (!cancelled) setIsPricing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const forCountry = recipients.filter(
    (r) => !draft.destinationCountry || r.country === draft.destinationCountry,
  );

  const title = draft.recipient.name.trim()
    ? [draft.recipient.name.trim(), draft.destinationCountry].filter(Boolean).join(" · ")
    : draft.destinationCountry || "New delivery";
  const options = preview ? [...preview.options].sort((a, b) => a.finalPrice - b.finalPrice) : [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-[color:var(--glass-edge)] pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold tabular-nums text-background">
            {index + 1}
          </span>
          <div className="min-w-0">
            <CardTitle className="text-xs uppercase tracking-wider">Delivery {index + 1}</CardTitle>
            <p className="truncate font-semibold text-foreground">{title}</p>
          </div>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove delivery ${index + 1}`}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-bg hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-7 pt-5" aria-invalid={Boolean(error)} tabIndex={-1}>
        <Section title="Recipient">
          <div className="grid gap-4 sm:grid-cols-2">
            <SavedRecipients
              id={`saved-recipient-${draft.key}`}
              recipients={forCountry.length > 0 ? forCountry : recipients}
              onPick={(r) =>
                onChange({
                  recipient: recipientFrom(r),
                  destinationCountry: r.country,
                  // Their usual goods come back with the address; still editable.
                  ...(r.lastItems?.length ? { items: itemsFrom(r.lastItems) } : {}),
                })
              }
            />
            <div className="space-y-1.5">
              <Label htmlFor={`country-${draft.key}`}>Destination country</Label>
              <NativeSelect
                id={`country-${draft.key}`}
                searchable
                searchPlaceholder="Search countries"
                value={draft.destinationCountry}
                onChange={(e) => onChange({ destinationCountry: e.target.value })}
              >
                <option value="">Select a country…</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <RecipientFields
            value={draft.recipient}
            onChange={(update) =>
              onChange({
                recipient: typeof update === "function" ? update(draft.recipient) : update,
              })
            }
            errors={recipientErrors}
            isIndia={draft.destinationCountry === "India"}
            country={draft.destinationCountry}
            idPrefix={`recipient-${draft.key}`}
          />
        </Section>

        <Section title="Parcel">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Shipment type</p>
            <SegmentedControl
              ariaLabel="Shipment type"
              options={SHIPMENT_TYPES}
              value={draft.shipmentType}
              onChange={(shipmentType) => onChange({ shipmentType })}
            />
          </div>
          <PackagesEditor
            value={draft.boxes}
            onChange={(boxes) => onChange({ boxes })}
            requireDimensions={draft.shipmentType !== "DOCUMENT"}
            idPrefix={`box-${draft.key}`}
          />
        </Section>

        <Section title="Contents">
          <ItemsEditor
            value={draft.items}
            onChange={(items) => onChange({ items })}
            savedItems={savedItems}
            onSavedItemsChange={onSavedItemsChange}
            libraryBase={savedItemsBase}
            client={savedItemsClient}
          />
        </Section>

        <Section title="Carrier">
          {isPricing && (
            <div className="grid gap-2 sm:grid-cols-2" aria-busy="true" aria-label="Checking prices">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          )}
          {!isPricing && !preview && (
            <Hint>Choose a country and enter the boxes to see prices.</Hint>
          )}
          {!isPricing && preview && options.length === 0 && !allowManualPrice && (
            <Hint>No published rate covers this route. Submit it anyway and our team will price it.</Hint>
          )}
          {!isPricing && options.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs text-muted-foreground">
                Priced on {chargeable} kg chargeable weight
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((o, i) => (
                  <label key={o.rateProviderId} className={CHOICE}>
                    <input
                      type="radio"
                      className="h-4 w-4 shrink-0 accent-[var(--foreground)]"
                      name={`carrier-${draft.key}`}
                      checked={draft.rateProviderId === o.rateProviderId}
                      onChange={() =>
                        onChange({ rateProviderId: o.rateProviderId, manualPrice: "", estimate: o.finalPrice })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{o.rateProviderName}</span>
                      {i === 0 && options.length > 1 && (
                        <span className="text-xs text-success">Lowest price</span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {money(o.finalPrice, o.currency)}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {allowManualPrice && preview && (
            <label className={CHOICE}>
              <input
                type="radio"
                className="h-4 w-4 shrink-0 accent-[var(--foreground)]"
                name={`carrier-${draft.key}`}
                checked={draft.rateProviderId === null}
                onChange={() => onChange({ rateProviderId: null, estimate: null })}
              />
              <span className="flex-1 font-medium text-foreground">Enter a price manually</span>
              {draft.rateProviderId === null && (
                <Input
                  aria-label={`Price in INR for delivery ${index + 1}`}
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-32"
                  placeholder="₹"
                  value={draft.manualPrice}
                  onChange={(e) => onChange({ manualPrice: e.target.value })}
                />
              )}
            </label>
          )}
        </Section>

        {error && <FieldError>{error}</FieldError>}
      </CardContent>
    </Card>
  );
}

// A selectable card around a radio: the whole card is the hit area, the picked one is inked.
const CHOICE =
  "flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-white/50 px-4 py-3 text-sm transition-colors hover:border-foreground/30 has-[:checked]:border-foreground has-[:checked]:bg-white has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

const money = (value: number, currency: string) =>
  `${currency === "INR" ? "₹" : `${currency} `}${Math.round(value).toLocaleString("en-IN")}`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
