"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { ItemCatalogEntryDto, SavedItemDto, ShipmentItemDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

export interface ItemForm {
  /** The kind of goods ("Garments"). Not typed: it comes with an item picked from the list. */
  category: string;
  description: string;
  quantity: string;
  unitValue: string;
  hsCode: string;
  /** Which box it is in, "1" for Box 1. Empty means Box 1. */
  box: string;
}

const emptyItem: ItemForm = {
  category: "",
  description: "",
  quantity: "1",
  unitValue: "",
  hsCode: "",
  box: "",
};

export function itemsFrom(saved: ShipmentItemDto[] | null | undefined): ItemForm[] {
  if (!saved?.length) return [{ ...emptyItem }];
  return saved.map((i) => ({
    category: i.category ?? "",
    description: i.description,
    quantity: String(i.quantity),
    unitValue: String(i.unitValue),
    hsCode: i.hsCode ?? "",
    box: i.box ? String(i.box) : "",
  }));
}

/** The box a row is in: its own choice, or Box 1. */
const boxOf = (f: ItemForm) => Number(f.box) || 1;

/** `boxCount` above 1 records each item's box; with one box there is nothing to say. */
export function toItemsPayload(forms: ItemForm[], boxCount = 1): ShipmentItemDto[] {
  // Box by box on the invoice, whatever order they were typed in (sort is stable).
  const ordered = boxCount > 1 ? [...forms].sort((a, b) => boxOf(a) - boxOf(b)) : forms;
  return ordered.map((f) => ({
    ...(f.category.trim() ? { category: f.category.trim() } : {}),
    description: f.description.trim(),
    quantity: Number(f.quantity),
    unitValue: Number(f.unitValue),
    ...(f.hsCode.trim() ? { hsCode: f.hsCode.trim() } : {}),
    ...(boxCount > 1 ? { box: boxOf(f) } : {}),
  }));
}

/** "Box 2, item 3: " with several boxes, "Item 3: " with several items, "" for one. */
function rowName(forms: ItemForm[], index: number, boxCount: number): string {
  if (boxCount > 1) {
    const box = boxOf(forms[index]);
    const nth = forms.slice(0, index + 1).filter((f) => boxOf(f) === box).length;
    return `Box ${box}, item ${nth}: `;
  }
  return forms.length > 1 ? `Item ${index + 1}: ` : "";
}

const itemKey = (f: ItemForm) => `${boxOf(f)}|${f.description.trim().toLowerCase().replace(/\s+/g, " ")}`;

/**
 * For each row, the index of an earlier row with the same item in the same box, or -1. Repeats
 * are allowed (two sizes of "Saree" at different values), so this warns rather than blocks.
 */
export function duplicateOf(forms: ItemForm[]): number[] {
  const first = new Map<string, number>();
  return forms.map((f, i) => {
    if (!f.description.trim()) return -1;
    const key = itemKey(f);
    const earlier = first.get(key);
    if (earlier === undefined) {
      first.set(key, i);
      return -1;
    }
    return earlier;
  });
}

/** The first thing wrong with the contents, and the field it is in, so the form can go to it. */
export function itemProblem(
  forms: ItemForm[],
  boxCount = 1,
): { index: number; field: keyof ItemForm; message: string } | null {
  for (const [i, f] of forms.entries()) {
    const at = (field: keyof ItemForm, message: string) => ({
      index: i,
      field,
      message: rowName(forms, i, boxCount) + message,
    });
    // A box was removed after its items were assigned to it.
    if (boxCount > 1 && boxOf(f) > boxCount) return at("box", `Box ${boxOf(f)} no longer exists, choose its box.`);
    if (!f.description.trim()) return at("description", "describe what it is.");
    if (!Number.isInteger(Number(f.quantity)) || Number(f.quantity) < 1) return at("quantity", "quantity must be a whole number.");
    if (!(Number(f.unitValue) > 0)) return at("unitValue", "enter its value in ₹.");
    if (f.hsCode.trim().length > 20) return at("hsCode", "HS code is too long.");
  }
  return null;
}

/** Mirrors ShipmentItemDto — contents are mandatory, so an empty list is an error too. */
export function validateItems(forms: ItemForm[], boxCount = 1): string | null {
  if (forms.length === 0) return "Add at least one item.";
  return itemProblem(forms, boxCount)?.message ?? null;
}

// Fetched once per page load and shared by every editor on it; it changes rarely.
let catalogRequest: Promise<ItemCatalogEntryDto[]> | null = null;

/** The admin's list of recurring items, offered as the item is typed. Empty if it fails. */
function useItemCatalog(): ItemCatalogEntryDto[] {
  const [catalog, setCatalog] = useState<ItemCatalogEntryDto[]>([]);
  useEffect(() => {
    let cancelled = false;
    catalogRequest ??= apiClient.get<ItemCatalogEntryDto[]>("/item-catalog").catch(() => {
      catalogRequest = null; // try again on the next editor that mounts
      return [];
    });
    catalogRequest.then((list) => {
      if (!cancelled) setCatalog(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return catalog;
}

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-danger";

/**
 * What is inside the shipment — the contents DHL, FedEx, UPS and DPD ask for on the commercial
 * invoice. With more than one box (`boxCount`), each item says which box it is in. Typing an item
 * offers the admin's list of recurring items, which fills in its kind of goods and HS code; an
 * item not on the list is accepted as typed. Picking a description the customer shipped before fills in its value and HS code;
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
  boxCount = 1,
}: {
  value: ItemForm[];
  onChange: (next: ItemForm[]) => void;
  savedItems?: SavedItemDto[];
  onSavedItemsChange?: (next: SavedItemDto[]) => void;
  libraryBase?: string;
  /** How to reach the saved-items API. The B2B portal passes its own token-authenticated client. */
  client?: Pick<typeof apiClient, "patch" | "delete">;
  error?: string | null;
  /** How many boxes the shipment has; above 1, each item is assigned to one. */
  boxCount?: number;
}) {
  const listId = useId();
  const saved = savedItems ?? [];
  const catalog = useItemCatalog();
  const multiBox = boxCount > 1;
  // The admin's list first, then this customer's own past items not already on it.
  const suggestions = [
    ...catalog.map((c) => ({ key: `c-${c.id}`, name: c.name })),
    ...saved
      .filter((s) => !catalog.some((c) => c.name.toLowerCase() === s.description.toLowerCase()))
      .map((s) => ({ key: `s-${s.id}`, name: s.description })),
  ];

  function setRow(index: number, key: keyof ItemForm, v: string) {
    onChange(
      value.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [key]: v };
        if (key !== "description") return next;
        // Picking what this customer declared before fills its value from last time; otherwise
        // the admin's list fills the kind of goods and HS code, and a usual value if none is typed.
        const mine = saved.find((s) => s.description === v);
        if (mine) {
          return {
            ...next,
            category: mine.category ?? next.category,
            unitValue: String(mine.unitValue),
            hsCode: mine.hsCode ?? next.hsCode,
          };
        }
        const listed = catalog.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
        if (listed) {
          return {
            ...next,
            category: listed.category ?? next.category,
            hsCode: next.hsCode || listed.hsCode || "",
            unitValue: next.unitValue || (listed.defaultUnitValue ? String(listed.defaultUnitValue) : ""),
          };
        }
        // A new item: a kind of goods carried over from a previous pick would be wrong.
        return row.description !== v && catalog.some((c) => c.name.toLowerCase() === row.description.trim().toLowerCase())
          ? { ...next, category: "" }
          : next;
      }),
    );
  }

  // A saved item lands in the first empty row, or a new one; the server remembers new ones itself.
  function addSaved(item: SavedItemDto) {
    const blank = value.findIndex((r) => !r.description.trim());
    const row: ItemForm = {
      category: item.category ?? "",
      description: item.description,
      quantity: "1",
      unitValue: String(item.unitValue),
      hsCode: item.hsCode ?? "",
      box: value[value.length - 1]?.box ?? "",
    };
    onChange(blank >= 0 ? value.map((r, i) => (i === blank ? { ...row, box: r.box } : r)) : [...value, row]);
  }

  const total = value.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unitValue) || 0), 0);

  const duplicates = duplicateOf(value);
  // With an error showing, mark the one field it is about; a server error marks the item names.
  const problem = error ? itemProblem(value, boxCount) : null;
  const invalid = (i: number, key: keyof ItemForm) =>
    problem ? problem.index === i && problem.field === key : Boolean(error) && key === "description";
  // The row just added gets the cursor, so the partner can type straight into it.
  const focusRef = useRef<number | null>(null);
  useEffect(() => {
    if (focusRef.current === null) return;
    document.getElementById(`item-${focusRef.current}-description`)?.focus();
    focusRef.current = null;
  });

  function addRow(box: string) {
    focusRef.current = value.length;
    onChange([...value, { ...emptyItem, box }]);
  }

  // Folds a repeated row into the first one: its quantity is added there and the row goes.
  function merge(into: number, from: number) {
    const qty = (Number(value[into].quantity) || 0) + (Number(value[from].quantity) || 0);
    onChange(
      value
        .map((row, i) => (i === into ? { ...row, quantity: String(qty || 1) } : row))
        .filter((_, i) => i !== from),
    );
  }

  function renderRow(row: ItemForm, i: number, showBox: boolean) {
    const dup = duplicates[i];
    const label = rowName(value, i, boxCount).replace(/: $/, "") || "item";
    return (
      <div key={i} className="space-y-2 rounded-lg border border-border p-3">
        <div className="grid grid-cols-6 items-end gap-2 sm:grid-cols-12">
          {showBox && (
            <div className="col-span-2 space-y-1 sm:col-span-2">
              <Label htmlFor={`item-${i}-box`}>Box</Label>
              <select
                id={`item-${i}-box`}
                value={String(boxOf(row))}
                onChange={(e) => setRow(i, "box", e.target.value)}
                aria-invalid={boxOf(row) > boxCount}
                className={SELECT_CLASS}
              >
                {Array.from({ length: Math.max(boxCount, boxOf(row)) }, (_, b) => (
                  <option key={b} value={String(b + 1)} disabled={b + 1 > boxCount}>
                    Box {b + 1}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={showBox ? "col-span-4 space-y-1 sm:col-span-4" : "col-span-6 space-y-1 sm:col-span-6"}>
            <Label htmlFor={`item-${i}-description`}>Item</Label>
            <Input
              id={`item-${i}-description`}
              list={listId}
              placeholder="Start typing, e.g. Saree"
              autoComplete="off"
              value={row.description}
              onChange={(e) => setRow(i, "description", e.target.value)}
              error={invalid(i, "description")}
              aria-describedby={dup >= 0 ? `item-${i}-dup` : undefined}
            />
            {row.category && <p className="truncate text-xs text-muted-foreground">{row.category}</p>}
          </div>
          <div className="col-span-2 space-y-1 sm:col-span-2">
            <Label htmlFor={`item-${i}-quantity`}>Qty</Label>
            <Input
              id={`item-${i}-quantity`}
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={row.quantity}
              onChange={(e) => setRow(i, "quantity", e.target.value)}
              error={invalid(i, "quantity")}
            />
          </div>
          <div className="col-span-2 space-y-1 sm:col-span-2">
            <Label htmlFor={`item-${i}-value`}>Value ₹ /unit</Label>
            <Input
              id={`item-${i}-value`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={row.unitValue}
              onChange={(e) => setRow(i, "unitValue", e.target.value)}
              error={invalid(i, "unitValue")}
            />
          </div>
          <div className="col-span-2 flex items-end gap-1 sm:col-span-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor={`item-${i}-hs`}>HS code</Label>
              <Input
                id={`item-${i}-hs`}
                placeholder="opt."
                value={row.hsCode}
                onChange={(e) => setRow(i, "hsCode", e.target.value)}
                error={invalid(i, "hsCode")}
              />
            </div>
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Remove ${label}`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
        {dup >= 0 && (
          <div
            id={`item-${i}-dup`}
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning"
          >
            <span>
              {row.description.trim()} is already in {multiBox ? `Box ${boxOf(row)}` : "the list"}. Same item? Add it to
              that quantity instead.
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={() => merge(dup, i)}>
              Combine
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s.key} value={s.name} />
        ))}
      </datalist>

      {multiBox ? (
        <>
          {Array.from({ length: boxCount }, (_, b) => b + 1).map((box) => {
            const rows = value.map((row, i) => ({ row, i })).filter(({ row }) => boxOf(row) === box);
            return (
              <section key={box} aria-labelledby={`${listId}-box-${box}`} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 id={`${listId}-box-${box}`} className="text-sm font-semibold text-foreground">
                    Box {box}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {rows.length === 1 ? "1 item" : `${rows.length} items`}
                    </span>
                  </h3>
                </div>
                {rows.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                    Nothing in Box {box} yet.
                  </p>
                )}
                {rows.map(({ row, i }) => renderRow(row, i, false))}
                <Button type="button" variant="secondary" size="sm" onClick={() => addRow(String(box))}>
                  <Plus className="h-4 w-4" aria-hidden /> Add item to Box {box}
                </Button>
              </section>
            );
          })}
          {/* Rows left in a box that was since removed: they say which box to move to. */}
          {value.some((row) => boxOf(row) > boxCount) && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-warning">Box removed: choose where these go</h3>
              {value.map((row, i) => (boxOf(row) > boxCount ? renderRow(row, i, true) : null))}
            </section>
          )}
        </>
      ) : (
        value.map((row, i) => renderRow(row, i, false))
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!multiBox && (
            <Button type="button" variant="secondary" size="sm" onClick={() => addRow("")}>
              <Plus className="h-4 w-4" aria-hidden /> Add item
            </Button>
          )}
          {saved.length > 0 && (
            <div className="w-64 max-w-full">
              <NativeSelect
                aria-label="Add a saved item"
                searchable
                searchPlaceholder="Search saved items"
                // An action, not a stored choice: it always returns to the placeholder.
                value=""
                onChange={(e) => {
                  const item = saved.find((s) => s.id === e.target.value);
                  if (item) addSaved(item);
                }}
              >
                <option value="">Add a saved item…</option>
                {saved.map((s) => (
                  <option key={s.id} value={s.id}>
                    <span className="font-medium">{s.description}</span>
                    <span className="text-muted-foreground">
                      {` · ₹${s.unitValue.toLocaleString("en-IN")}`}
                      {s.category ? ` · ${s.category}` : ""}
                    </span>
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>
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
          onUse={addSaved}
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
      <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50">
        Manage saved items <span className="font-normal text-muted-foreground">({items.length})</span>
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
                {item.category ? `${item.category} · ` : ""}
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
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
        danger ? "hover:text-danger" : "hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
