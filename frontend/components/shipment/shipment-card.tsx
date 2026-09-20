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
  }, [debounced]);

  const forCountry = recipients.filter(
    (r) => !draft.destinationCountry || r.country === draft.destinationCountry,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Delivery address {index + 1}</CardTitle>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove delivery address ${index + 1}`}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-4" aria-invalid={Boolean(error)} tabIndex={-1}>
        <SavedRecipients
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

        <div className="space-y-1.5">
          <Label htmlFor={`type-${draft.key}`}>Shipment type</Label>
          <NativeSelect
            id={`type-${draft.key}`}
            value={draft.shipmentType}
            onChange={(e) => onChange({ shipmentType: e.target.value as ShipmentTypeCode })}
          >
            {SHIPMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <PackagesEditor
          value={draft.boxes}
          onChange={(boxes) => onChange({ boxes })}
          requireDimensions={draft.shipmentType !== "DOCUMENT"}
          idPrefix={`box-${draft.key}`}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">What is going to this address</p>
          <ItemsEditor
            value={draft.items}
            onChange={(items) => onChange({ items })}
            savedItems={savedItems}
            onSavedItemsChange={onSavedItemsChange}
            libraryBase={savedItemsBase}
            client={savedItemsClient}
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {isPricing && <p className="text-muted-foreground">Checking prices…</p>}
          {!isPricing && !preview && (
            <p className="text-muted-foreground">
              Choose a country and enter the boxes to see prices.
            </p>
          )}
          {!isPricing && preview && preview.options.length === 0 && !allowManualPrice && (
            <p className="text-muted-foreground">
              No published rate covers this route — submit it anyway and our team will price it.
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
                      name={`carrier-${draft.key}`}
                      checked={draft.rateProviderId === o.rateProviderId}
                      onChange={() => onChange({ rateProviderId: o.rateProviderId, manualPrice: "" })}
                    />
                    <span className="flex-1 font-medium text-foreground">{o.rateProviderName}</span>
                    <span className="font-semibold text-foreground">
                      {o.currency} {Math.round(o.finalPrice).toLocaleString("en-IN")}
                    </span>
                  </label>
                ))}
            </div>
          )}
          {allowManualPrice && preview && (
            <label className="mt-2 flex cursor-pointer items-center gap-3 border-t border-border pt-2">
              <input
                type="radio"
                name={`carrier-${draft.key}`}
                checked={draft.rateProviderId === null}
                onChange={() => onChange({ rateProviderId: null })}
              />
              <span className="flex-1 font-medium text-foreground">Enter a price manually</span>
              {draft.rateProviderId === null && (
                <Input
                  aria-label={`Price in INR for delivery address ${index + 1}`}
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
        </div>

        {error && <FieldError>{error}</FieldError>}
      </CardContent>
    </Card>
  );
}
