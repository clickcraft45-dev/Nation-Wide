"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  chargeableWeightKg,
  volumetricWeightKg,
  VOLUMETRIC_DIVISOR,
  type ParcelPackageDto,
} from "@nationwide/shared-types";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";

/** One box as typed — strings, so a half-typed "2." is not coerced away. */
export interface PackageForm {
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
}

export const emptyPackage: PackageForm = { weightKg: "", lengthCm: "", widthCm: "", heightCm: "" };

export function packagesFrom(saved: ParcelPackageDto[] | null | undefined, fallbackWeightKg?: number): PackageForm[] {
  if (saved?.length) {
    return saved.map((p) => ({
      weightKg: String(p.weightKg),
      lengthCm: p.lengthCm ? String(p.lengthCm) : "",
      widthCm: p.widthCm ? String(p.widthCm) : "",
      heightCm: p.heightCm ? String(p.heightCm) : "",
    }));
  }
  return [{ ...emptyPackage, weightKg: fallbackWeightKg ? String(fallbackWeightKg) : "" }];
}

export function toPackagesPayload(forms: PackageForm[]): ParcelPackageDto[] {
  return forms.map((f) => {
    const hasDims = f.lengthCm.trim() && f.widthCm.trim() && f.heightCm.trim();
    return {
      weightKg: Number(f.weightKg),
      ...(hasDims
        ? { lengthCm: Number(f.lengthCm), widthCm: Number(f.widthCm), heightCm: Number(f.heightCm) }
        : {}),
    };
  });
}

const positive = (v: string) => v.trim() !== "" && Number(v) > 0;

/** Mirrors ParcelPackageDto: weight always; dimensions all-or-nothing, and required unless a document. */
export function validatePackages(forms: PackageForm[], requireDimensions: boolean): string | null {
  for (const [i, f] of forms.entries()) {
    const box = forms.length > 1 ? `Box ${i + 1}: ` : "";
    if (!positive(f.weightKg)) return `${box}enter a weight greater than 0.`;
    if (Number(f.weightKg) > 1000) return `${box}weight can't exceed 1000 kg.`;
    const dims = [f.lengthCm, f.widthCm, f.heightCm];
    const given = dims.filter((d) => d.trim() !== "");
    if ((requireDimensions || given.length > 0) && !dims.every(positive)) {
      return `${box}enter length, width and height in cm.`;
    }
    if (dims.some((d) => Number(d) > 500)) return `${box}a side can't exceed 500 cm.`;
  }
  return null;
}

/** Both chargeable and a breakdown for display; null while anything is unparseable. */
export function packagesSummary(forms: PackageForm[]) {
  const payload = toPackagesPayload(forms);
  if (payload.some((p) => !(p.weightKg > 0))) return null;
  return {
    actualKg: payload.reduce((sum, p) => sum + p.weightKg, 0),
    volumetricKg: payload.reduce((sum, p) => sum + volumetricWeightKg(p), 0),
    chargeableKg: chargeableWeightKg(payload),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The boxes in a shipment, with dimensions. One box is a normal order; several is a bulk order,
 * each box weighed and measured on its own. Carriers charge every box at the greater of its actual
 * and volumetric weight, so that is what is shown — and what the server prices.
 */
export function PackagesEditor({
  value,
  onChange,
  requireDimensions,
  error,
  idPrefix = "box",
}: {
  value: PackageForm[];
  onChange: (next: PackageForm[]) => void;
  requireDimensions: boolean;
  error?: string | null;
  idPrefix?: string;
}) {
  const bulk = value.length > 1;
  const summary = packagesSummary(value);

  function setBox(index: number, key: keyof PackageForm, v: string) {
    onChange(value.map((box, i) => (i === index ? { ...box, [key]: v } : box)));
  }

  return (
    <div className="space-y-3">
      <SegmentedControl
        ariaLabel="Order type"
        options={[
          { value: "normal", label: "Normal (1 box)" },
          { value: "bulk", label: "Bulk (multiple boxes)" },
        ]}
        value={bulk ? "bulk" : "normal"}
        onChange={(mode) =>
          onChange(mode === "bulk" ? (bulk ? value : [...value, { ...emptyPackage }]) : value.slice(0, 1))
        }
      />

      {value.map((box, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-3">
          {bulk && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Box {i + 1}</p>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Remove box ${i + 1}`}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["weightKg", "Weight (kg)", "0.01"],
                ["lengthCm", "Length (cm)", "0.1"],
                ["widthCm", "Width (cm)", "0.1"],
                ["heightCm", "Height (cm)", "0.1"],
              ] as const
            ).map(([key, label, step]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`${idPrefix}-${i}-${key}`}>
                  {label}
                  {key !== "weightKg" && !requireDimensions ? " (opt.)" : ""}
                </Label>
                <Input
                  id={`${idPrefix}-${i}-${key}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={step}
                  value={box[key]}
                  onChange={(e) => setBox(i, key, e.target.value)}
                  error={Boolean(error)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {bulk && (
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...value, { ...emptyPackage }])}>
          <Plus className="h-4 w-4" aria-hidden /> Add box
        </Button>
      )}

      {error && <FieldError>{error}</FieldError>}

      {summary && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <p>
            Actual {round2(summary.actualKg)} kg · Volumetric {round2(summary.volumetricKg)} kg ·{" "}
            <span className="font-semibold text-foreground">Chargeable {summary.chargeableKg} kg</span>
          </p>
          <p className="mt-0.5">
            Each box is charged at the higher of its actual weight and L × W × H ÷ {VOLUMETRIC_DIVISOR}.
          </p>
        </div>
      )}
    </div>
  );
}
