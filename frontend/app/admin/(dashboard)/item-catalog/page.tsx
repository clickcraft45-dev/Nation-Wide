"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import type {
  ItemCatalogEntryDto,
  SaveItemCatalogEntryDto,
  UnlistedItemDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Input, Label, FieldError } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

interface Draft {
  name: string;
  category: string;
  hsCode: string;
  defaultUnitValue: string;
}

const emptyDraft: Draft = { name: "", category: "", hsCode: "", defaultUnitValue: "" };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function toBody(d: Draft): SaveItemCatalogEntryDto {
  return {
    name: d.name.trim(),
    ...(d.category.trim() ? { category: d.category.trim() } : {}),
    ...(d.hsCode.trim() ? { hsCode: d.hsCode.trim() } : {}),
    ...(Number(d.defaultUnitValue) > 0 ? { defaultUnitValue: Number(d.defaultUnitValue) } : {}),
  };
}

function draftProblem(d: Draft): string | null {
  if (!d.name.trim()) return "Enter the item's name.";
  if (d.hsCode.trim().length > 20) return "An HS code is at most 20 characters.";
  if (d.defaultUnitValue.trim() && !(Number(d.defaultUnitValue) > 0)) return "The usual value must be above 0.";
  return null;
}

/**
 * The recurring items the office ships. Whoever enters a shipment's contents (customer, B2B
 * portal, staff or the partner at the door) is offered these as they type, with the kind of goods
 * and HS code filled in. An item that is not here is still accepted; the ones typed recently show
 * under "Typed but not in the list" so they can be added in one tap.
 */
export default function AdminItemCatalogPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<ItemCatalogEntryDto[]>([]);
  const [unlisted, setUnlisted] = useState<UnlistedItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    Promise.all([
      apiClient.get<ItemCatalogEntryDto[]>("/item-catalog"),
      apiClient.get<UnlistedItemDto[]>("/admin/item-catalog/unlisted"),
    ])
      .then(([list, typed]) => {
        setItems(list);
        setUnlisted(typed);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, "Failed to load the items list.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // isLoading starts true; load() only sets state once the fetch settles.
    load();
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category?.toLowerCase().includes(q) ||
        i.hsCode?.toLowerCase().includes(q),
    );
  }, [items, search]);

  async function create(d: Draft, fromUnlisted = false) {
    const problem = draftProblem(d);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    if (!fromUnlisted) setIsCreating(true);
    else setBusyId(`unlisted:${d.name}`);
    try {
      const created = await apiClient.post<ItemCatalogEntryDto>("/admin/item-catalog", toBody(d));
      setItems((all) => [...all, created].sort((a, b) => a.name.localeCompare(b.name)));
      setUnlisted((all) => all.filter((u) => u.name.toLowerCase() !== created.name.toLowerCase()));
      if (!fromUnlisted) setDraft(emptyDraft);
      showToast({ variant: "success", title: `"${created.name}" added to the list` });
    } catch (err) {
      const message = errorMessage(err, "Couldn't add the item.");
      if (fromUnlisted) showToast({ variant: "error", title: message });
      else setFormError(message);
    } finally {
      setIsCreating(false);
      setBusyId(null);
    }
  }

  async function saveEdit(id: string) {
    const problem = draftProblem(editDraft);
    if (problem) {
      showToast({ variant: "error", title: problem });
      return;
    }
    setBusyId(id);
    try {
      const updated = await apiClient.patch<ItemCatalogEntryDto>(`/admin/item-catalog/${id}`, toBody(editDraft));
      setItems((all) => all.map((i) => (i.id === id ? updated : i)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't save the item.") });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: ItemCatalogEntryDto) {
    setBusyId(item.id);
    try {
      await apiClient.delete(`/admin/item-catalog/${item.id}`);
      setItems((all) => all.filter((i) => i.id !== item.id));
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't remove the item.") });
    } finally {
      setBusyId(null);
    }
  }

  const draftField = (key: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`new-item-${key}`}>{label}</Label>
      <Input
        id={`new-item-${key}`}
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        {...props}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Items List</h1>
        <p className="text-sm text-muted-foreground">
          Recurring goods offered as people type a shipment&apos;s contents, with their kind of goods and HS code.
          Items not on the list are still accepted.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void create(draft);
            }}
            noValidate
          >
            {draftField("name", "Item", { placeholder: "e.g. Saree", autoComplete: "off" })}
            {draftField("category", "Kind of goods (optional)", { placeholder: "e.g. Garments" })}
            {draftField("hsCode", "HS code (optional)", { placeholder: "e.g. 5208", className: "font-mono" })}
            {draftField("defaultUnitValue", "Usual value ₹/unit (optional)", {
              type: "number",
              inputMode: "decimal",
              min: "0",
              step: "0.01",
            })}
            <Button type="submit" isLoading={isCreating}>
              <Plus className="h-4 w-4" aria-hidden /> Add to list
            </Button>
          </form>
          {formError && (
            <div className="mt-2">
              <FieldError>{formError}</FieldError>
            </div>
          )}
        </CardContent>
      </Card>

      {!isLoading && !error && unlisted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Typed but not in the list</CardTitle>
            <p className="text-sm text-muted-foreground">
              Entered on shipments in the last 90 days. Add the ones that recur; leave typos and one-offs.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-md border border-border">
              {unlisted.map((u) => (
                <li key={u.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{u.name}</span>
                    <span className="text-muted-foreground">
                      {u.category ? ` · ${u.category}` : ""}
                      {u.hsCode ? ` · HS ${u.hsCode}` : ""}
                      {u.unitValue ? ` · ${rupees(u.unitValue)}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    used {u.timesUsed} {u.timesUsed === 1 ? "time" : "times"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    isLoading={busyId === `unlisted:${u.name}`}
                    onClick={() =>
                      void create(
                        {
                          name: u.name,
                          category: u.category ?? "",
                          hsCode: u.hsCode ?? "",
                          defaultUnitValue: u.unitValue ? String(u.unitValue) : "",
                        },
                        true,
                      )
                    }
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <SearchInput
        className="sm:w-72"
        placeholder="Search items, kinds or HS codes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search the items list"
      />

      {isLoading && <TableSkeleton columns={5} />}
      {!isLoading && error && (
        <ErrorState
          message={error}
          onRetry={() => {
            setIsLoading(true);
            load();
          }}
        />
      )}
      {!isLoading && !error && shown.length === 0 && (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" aria-hidden />}
          title={items.length === 0 ? "The list is empty" : "No items match"}
          description={items.length === 0 ? "Add the goods you ship most, like Saree, Pickles or Medicines." : undefined}
        />
      )}

      {!isLoading && !error && shown.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Kind of goods</TableHead>
              <TableHead>HS code</TableHead>
              <TableHead>Usual value</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((item) =>
              editingId === item.id ? (
                <TableRow key={item.id}>
                  {(["name", "category", "hsCode", "defaultUnitValue"] as const).map((key) => (
                    <TableCell key={key}>
                      <Input
                        aria-label={
                          { name: "Item", category: "Kind of goods", hsCode: "HS code", defaultUnitValue: "Usual value" }[key]
                        }
                        value={editDraft[key]}
                        type={key === "defaultUnitValue" ? "number" : "text"}
                        className={key === "hsCode" ? "font-mono" : undefined}
                        onChange={(e) => setEditDraft((d) => ({ ...d, [key]: e.target.value }))}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => saveEdit(item.id)}
                        isLoading={busyId === item.id}
                        aria-label={`Save ${item.name}`}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel editing">
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.category ?? "—"}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{item.hsCode ?? "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {item.defaultUnitValue ? rupees(item.defaultUnitValue) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditDraft({
                            name: item.name,
                            category: item.category ?? "",
                            hsCode: item.hsCode ?? "",
                            defaultUnitValue: item.defaultUnitValue ? String(item.defaultUnitValue) : "",
                          });
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <ConfirmDialog
                        title={`Remove "${item.name}"?`}
                        description="It stops being offered when contents are typed. Shipments that already list it are not changed."
                        confirmLabel="Remove"
                        variant="danger"
                        onConfirm={() => remove(item)}
                        trigger={
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={busyId === item.id}
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
