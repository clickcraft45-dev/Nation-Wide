"use client";

import { useState } from "react";
import type { CountryDto, ShipmentTypeCode } from "@nationwide/shared-types";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

const SHIPMENT_TYPES: { value: ShipmentTypeCode; label: string }[] = [
  { value: "DOCUMENT", label: "Document" },
  { value: "PARCEL", label: "Parcel" },
  { value: "PACKAGE", label: "Package" },
  { value: "OTHER", label: "Other" },
];

export function WeightStep({
  destination,
  onChangeDestination,
  onSubmit,
}: {
  destination: CountryDto;
  onChangeDestination: () => void;
  onSubmit: (weightKg: number, shipmentType: ShipmentTypeCode) => void;
}) {
  const [shipmentType, setShipmentType] = useState<ShipmentTypeCode>("PACKAGE");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(weight);
    if (!weight.trim() || Number.isNaN(value) || value <= 0) {
      setError("Enter a valid weight greater than 0.");
      return;
    }
    setError(null);
    onSubmit(value, shipmentType);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Parcel details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What are you shipping, and how much does it weigh?
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

        <div className="space-y-1.5">
          <Label htmlFor="parcel-weight">Weight</Label>
          <div className="flex items-center gap-2">
            <Input
              id="parcel-weight"
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="5.0"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                setError(null);
              }}
              error={Boolean(error)}
              aria-label="Parcel weight in kilograms"
              className="text-center text-lg"
            />
            <span className="shrink-0 rounded-md border border-border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
              KG
            </span>
          </div>
        </div>
        {error && <FieldError>{error}</FieldError>}
        <p className="text-xs text-muted-foreground">
          Your final shipping price may be confirmed after physical verification during pickup.
        </p>

        <Button type="submit" size="lg" className="w-full">
          Get Quotes
        </Button>
      </form>
    </div>
  );
}
