"use client";

import { useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ProviderMarginBandDto, RateProviderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

// Rows are edited as strings: a half-typed "1." or a briefly empty box is normal while someone
// is retyping a number, and coercing on every keystroke fights the person doing it.
interface BandRow {
  fromKg: string;
  toKg: string;
  flatAmount: string;
  perKgAmount: string;
}

function toRows(bands: ProviderMarginBandDto[]): BandRow[] {
  return bands.map((b) => ({
    fromKg: String(b.fromKg),
    toKg: b.toKg == null ? "" : String(b.toKg),
    flatAmount: String(b.flatAmount),
    perKgAmount: String(b.perKgAmount),
  }));
}

/** What this row charges, in the words an admin would use to describe the deal. */
function describe(row: BandRow): string {
  const flat = Number(row.flatAmount) || 0;
  const perKg = Number(row.perKgAmount) || 0;
  if (!perKg) return `₹${flat.toLocaleString("en-IN")} flat`;
  return `₹${flat.toLocaleString("en-IN")} + ₹${perKg.toLocaleString("en-IN")}/kg above ${
    row.fromKg || 0
  } kg`;
}

/**
 * The carrier's margin ladder, edited as the table it is.
 *
 * Bands are saved as a set rather than row by row: they have to line up end to end, and an admin
 * moving a boundary is editing two rows at once. Every number is editable — the weights a band
 * covers as much as the money it charges.
 */
export function MarginBandsDialog({
  trigger,
  provider,
  onSaved,
}: {
  trigger: ReactNode;
  provider: RateProviderDto;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BandRow[]>(toRows(provider.marginBands));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  function patch(index: number, field: keyof BandRow, value: string) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function addRow() {
    // A new band starts where the last one ended, which is the only place it can legally go.
    const last = rows[rows.length - 1];
    const from = last ? last.toKg || last.fromKg : "0";
    setRows((current) => [
      ...current,
      { fromKg: from, toKg: "", flatAmount: "0", perKgAmount: "0" },
    ]);
  }

  async function save() {
    setError(null);
    setIsSaving(true);
    try {
      await apiClient.put(`/admin/rate-providers/${provider.id}/margin-bands`, {
        bands: rows.map((row) => ({
          fromKg: Number(row.fromKg) || 0,
          toKg: row.toKg.trim() === "" ? null : Number(row.toKg),
          flatAmount: Number(row.flatAmount) || 0,
          perKgAmount: Number(row.perKgAmount) || 0,
        })),
      });
      showToast({ variant: "success", title: "Margin bands saved" });
      onSaved();
      setOpen(false);
    } catch (err) {
      // The server is the one that knows about overlaps and holes; its wording is more useful
      // here than a generic failure.
      setError(errorMessage(err, "Couldn't save the margin bands."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setRows(toRows(provider.marginBands));
          setError(null);
        }
      }}
    >
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title={`Margin bands — ${provider.name}`}
          description="A flat amount plus a per-kg rate on the weight above the band's own floor. Leave the last band's To blank for everything above it."
        >
          <div className="space-y-4">
            <div className="space-y-3">
              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No bands yet, so this carrier charges whatever margin each rate carries itself.
                </p>
              )}
              {rows.map((row, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`band-from-${index}`}>From (kg)</Label>
                      <Input
                        id={`band-from-${index}`}
                        type="number"
                        min="0"
                        step="0.1"
                        value={row.fromKg}
                        onChange={(e) => patch(index, "fromKg", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`band-to-${index}`}>To (kg)</Label>
                      <Input
                        id={`band-to-${index}`}
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="and above"
                        value={row.toKg}
                        onChange={(e) => patch(index, "toKg", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`band-flat-${index}`}>Flat (₹)</Label>
                      <Input
                        id={`band-flat-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.flatAmount}
                        onChange={(e) => patch(index, "flatAmount", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`band-perkg-${index}`}>Per kg (₹)</Label>
                      <Input
                        id={`band-perkg-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.perKgAmount}
                        onChange={(e) => patch(index, "perKgAmount", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{describe(row)}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
                      aria-label={`Remove band ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="secondary" size="sm" onClick={addRow}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Add band
            </Button>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button size="sm" isLoading={isSaving} onClick={save}>
                Save bands
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
