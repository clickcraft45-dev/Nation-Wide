"use client";

import { useState } from "react";
import {
  chargeableWeightKg,
  type CountryDto,
  type ParcelPackageDto,
  type ShipmentTypeCode,
} from "@nationwide/shared-types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  PackagesEditor,
  packagesFrom,
  toPackagesPayload,
  validatePackages,
  type PackageForm,
} from "@/components/shipment/packages-editor";

const SHIPMENT_TYPES: { value: ShipmentTypeCode; label: string }[] = [
  { value: "DOCUMENT", label: "Document" },
  { value: "PARCEL", label: "Parcel" },
  { value: "PACKAGE", label: "Package" },
  { value: "OTHER", label: "Other" },
];

export function WeightStep({
  destination,
  initialPackages = null,
  initialShipmentType = null,
  onChangeDestination,
  onSubmit,
}: {
  destination: CountryDto;
  /** Kept when the customer comes Back to this step. */
  initialPackages?: ParcelPackageDto[] | null;
  initialShipmentType?: ShipmentTypeCode | null;
  onChangeDestination: () => void;
  /** chargeableWeightKg is what gets priced; the boxes go on the quote. */
  onSubmit: (chargeableWeightKg: number, shipmentType: ShipmentTypeCode, packages: ParcelPackageDto[]) => void;
}) {
  const [shipmentType, setShipmentType] = useState<ShipmentTypeCode>(
    initialShipmentType ?? "PACKAGE",
  );
  const [boxes, setBoxes] = useState<PackageForm[]>(() => packagesFrom(initialPackages));
  const [error, setError] = useState<string | null>(null);
  // A document envelope can be booked on weight alone; anything else needs its size.
  const requireDimensions = shipmentType !== "DOCUMENT";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validatePackages(boxes, requireDimensions);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const packages = toPackagesPayload(boxes);
    onSubmit(chargeableWeightKg(packages), shipmentType, packages);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Parcel details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What are you shipping, how heavy is it, and how big is the box?
        </p>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3 text-left text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Destination</p>
          <p className="font-medium text-foreground">{destination.name}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChangeDestination}>
          Change
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-left">
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

        <PackagesEditor
          value={boxes}
          onChange={(next) => {
            setBoxes(next);
            setError(null);
          }}
          requireDimensions={requireDimensions}
          error={error}
        />
        <p className="text-xs text-muted-foreground">
          Your final shipping price may be confirmed after the partner weighs and measures it at pickup.
        </p>

        <Button type="submit" size="lg" className="w-full">
          Get Quotes
        </Button>
      </form>
    </div>
  );
}
