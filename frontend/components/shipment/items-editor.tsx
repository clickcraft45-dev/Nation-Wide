"use client";

import { useId, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SavedItemDto, ShipmentItemDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export interface ItemForm {
  description: string;
  quantity: string;
  unitValue: string;
  hsCode: string;
}

export const emptyItem: ItemForm = { description: "", quantity: "1", unitValue: "", hsCode: "" };

export function itemsFrom(saved: ShipmentItemDto[] | null | undefined): ItemForm[] {
  if (!saved?.length) return [{ ...emptyItem }];
  return saved.map((i) => ({
    description: i.description,
    quantity: String(i.quantity),
    unitValue: String(i.unitValue),
    hsCode: i.hsCode ?? "",
  }));
}

export function toItemsPayload(forms: ItemForm[]): ShipmentItemDto[] {
  return forms.map((f) => ({
    description: f.description.trim(),
    quantity: Number(f.quantity),
    unitValue: Number(f.unitValue),
    ...(f.hsCode.trim() ? { hsCode: f.hsCode.trim() } : {}),
  }));
}

/** Mirrors ShipmentItemDto — contents are mandatory, so an empty list is an error too. */
export function validateItems(forms: ItemForm[]): string | null {
  if (forms.length === 0) return "Add at least one item.";
  for (const [i, f] of forms.entries()) {
    const row = forms.length > 1 ? `Item ${i + 1}: ` : "";
    if (!f.description.trim()) return `${row}describe what it is.`;
    if (!Number.isInteger(Number(f.quantity)) || Number(f.quantity) < 1) return `${row}quantity must be a whole number.`;
    if (!(Number(f.unitValue) > 0)) return `${row}enter its value in ₹.`;
    if (f.hsCode.trim().length > 20) return `${row}HS code is too long.`;
  }
  return null;
}

/**
 * What is inside the shipment — the contents DHL, FedEx, UPS and DPD ask for on the commercial
 * invoice. Picking a description the customer shipped before fills in its value and HS code;
 * everything shipped is remembered for next time by the server, and the saved list can be edited
 * or pruned here. `libraryBase` is "/customers/me" for a customer, "/customers/:id" for staff;
 * omit it (the partner at the door) to edit contents without touching the library.
 */
export function ItemsEditor({
  value,
  onChange,
  savedItems,
  onSavedItemsChange,
  libraryBase,
  client = apiClient,
  error,
}: {
  value: ItemForm[];
  onChange: (next: ItemForm[]) => void;
  savedItems?: SavedItemDto[];
  onSavedItemsChange?: (next: SavedItemDto[]) => void;
  libraryBase?: string;
  /** How to reach the saved-items API. The B2B portal passes its own token-authenticated client. */
  client?: Pick<typeof apiClient, "patch" | "delete">;
  error?: string | null;
}) {
  const listId = useId();
  const saved = savedItems ?? [];

  function setRow(index: number, key: keyof ItemForm, v: string) {
    onChange(
      value.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [key]: v };
        // Picking a remembered description fills what was declared for it last time.
        const match = key === "description" ? saved.find((s) => s.description === v) : undefined;
        return match
          ? { ...next, unitValue: String(match.unitValue), hsCode: match.hsCode ?? next.hsCode }
          : next;
      }),
    );
  }

  const total = value.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unitValue) || 0), 0);

  return (
    <div className="space-y-3">
      <datalist id={listId}>
        {saved.map((s) => (
          <option key={s.id} value={s.description} />
        ))}
      </datalist>

      {value.map((row, i) => (
        <div key={i} className="grid grid-cols-6 items-end gap-2 rounded-lg border border-border p-3">
          <div className="col-span-6 space-y-1 sm:col-span-3">
            <Label htmlFor={`item-${i}-description`}>Item description</Label>
            <Input
              id={`item-${i}-description`}
              list={listId}
              placeholder="e.g. Cotton shirts"
              value={row.description}
              onChange={(e) => setRow(i, "description", e.target.value)}
              error={Boolean(error)}
            />
          </div>
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label htmlFor={`item-${i}-quantity`}>Qty</Label>
            <Input
              id={`item-${i}-quantity`}
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={row.quantity}
              onChange={(e) => setRow(i, "quantity", e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label htmlFor={`item-${i}-value`}>Value ₹ /unit</Label>
            <Input
              id={`item-${i}-value`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={row.unitValue}
              onChange={(e) => setRow(i, "unitValue", e.target.value)}
            />
          </div>
          <div className="col-span-2 flex items-end gap-1 sm:col-span-1">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`item-${i}-hs`}>HS code</Label>
              <Input
                id={`item-${i}-hs`}
                placeholder="opt."
                value={row.hsCode}
                onChange={(e) => setRow(i, "hsCode", e.target.value)}
              />
            </div>
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Remove item ${i + 1}`}
                className="mb-1.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...value, { ...emptyItem }])}>
          <Plus className="h-4 w-4" aria-hidden /> Add item
        </Button>
        <p className="text-xs text-muted-foreground">
          Declared value: <span className="font-semibold text-foreground">₹{total.toLocaleString("en-IN")}</span>
        </p>
      </div>
      {error && <FieldError>{error}</FieldError>}

      {/* "" is a valid base (the B2B portal's client is already scoped), so test for presence. */}
      {libraryBase !== undefined && onSavedItemsChange && saved.length > 0 && (
        <SavedItemsLibrary
          items={saved}
          libraryBase={libraryBase}
          client={client}
          onChange={onSavedItemsChange}
          onUse={(item) => {
            const blank = value.findIndex((r) => !r.description.trim());
            const row: ItemForm = {
              description: item.description,
              quantity: "1",
              unitValue: String(item.unitValue),
              hsCode: item.hsCode ?? "",
            };
            onChange(blank >= 0 ? value.map((r, i) => (i === blank ? row : r)) : [...value, row]);
          }}
        />
      )}
    </div>
  );
}

function SavedItemsLibrary({
  items,
  libraryBase,
  client,
  onChange,
  onUse,
}: {
  items: SavedItemDto[];
  libraryBase: string;
  client: Pick<typeof apiClient, "patch" | "delete">;
  onChange: (next: SavedItemDto[]) => void;
  onUse: (item: SavedItemDto) => void;
}) {
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ description: "", unitValue: "", hsCode: "" });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function save(id: string) {
    if (!draft.description.trim() || !(Number(draft.unitValue) > 0)) {
      showToast({ variant: "error", title: "Enter a description and a value above 0." });
      return;
    }
    setBusyId(id);
    try {
      const updated = await client.patch<SavedItemDto>(`${libraryBase}/saved-items/${id}`, {
        description: draft.description.trim(),
        unitValue: Number(draft.unitValue),
        hsCode: draft.hsCode.trim() || undefined,
      });
      onChange(items.map((i) => (i.id === id ? updated : i)));
      setEditingId(null);
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't update the saved item.") });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await client.delete(`${libraryBase}/saved-items/${id}`);
      onChange(items.filter((i) => i.id !== id));
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't delete the saved item.") });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">
        Saved items ({items.length})
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {items.map((item) =>
          editingId === item.id ? (
            <li key={item.id} className="grid grid-cols-6 gap-2 p-2">
              <Input
                aria-label="Description"
                className="col-span-6 sm:col-span-3"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
              <Input
                aria-label="Value per unit"
                type="number"
                min="0"
                step="0.01"
                className="col-span-2 sm:col-span-1"
                value={draft.unitValue}
                onChange={(e) => setDraft((d) => ({ ...d, unitValue: e.target.value }))}
              />
              <Input
                aria-label="HS code"
                placeholder="HS"
                className="col-span-2 sm:col-span-1"
                value={draft.hsCode}
                onChange={(e) => setDraft((d) => ({ ...d, hsCode: e.target.value }))}
              />
              <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
                <IconButton label="Save" onClick={() => save(item.id)} disabled={busyId === item.id}>
                  <Check className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label="Cancel" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
            </li>
          ) : (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <button
                type="button"
                onClick={() => onUse(item)}
                className="min-w-0 flex-1 truncate text-left text-foreground hover:text-primary"
                title="Add to this shipment"
              >
                {item.description}
                <span className="text-muted-foreground">
                  {" "}
                  · ₹{item.unitValue.toLocaleString("en-IN")}
                  {item.hsCode ? ` · HS ${item.hsCode}` : ""}
                </span>
              </button>
              <IconButton
                label={`Edit ${item.description}`}
                onClick={() => {
                  setEditingId(item.id);
                  setDraft({
                    description: item.description,
                    unitValue: String(item.unitValue),
                    hsCode: item.hsCode ?? "",
                  });
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton
                label={`Delete ${item.description}`}
                onClick={() => remove(item.id)}
                disabled={busyId === item.id}
                danger
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </IconButton>
            </li>
          ),
        )}
      </ul>
    </details>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-50 ${
        danger ? "hover:text-danger" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
