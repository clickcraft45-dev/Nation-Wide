"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { ExpenseCategoryDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Every category flattened to "Parent → Child" options, for the pickers that file an expense. */
export function categoryOptions(categories: ExpenseCategoryDto[]): { id: string; label: string }[] {
  return categories.flatMap((parent) => [
    { id: parent.id, label: parent.name },
    ...parent.children.map((child) => ({
      id: child.id,
      label: `${parent.name} → ${child.name}`,
    })),
  ]);
}

/**
 * Where the admin owns their own filing system: add a heading, nest one under it, rename it, or
 * delete one nothing is filed under.
 *
 * Deleting a category in use is refused by the server rather than cascading — an expense already
 * filed under a heading is a record of where money went, and it has to keep meaning something.
 */
export function ManageCategoriesDialog({
  trigger,
  categories,
  onChanged,
}: {
  trigger: ReactNode;
  categories: ExpenseCategoryDto[];
  /** Called after any add/rename/delete so the page reloads its filters and totals. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [childFor, setChildFor] = useState<{
    parentId: string;
    name: string;
  } | null>(null);
  const { showToast } = useToast();

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      // The server's own words — "used by 4 expenses and cannot be deleted" says more than
      // anything this component could invent.
      showToast({ variant: "error", title: errorMessage(err, fallback) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(name: string, parentId?: string) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    return run(
      () =>
        apiClient.post("/admin/expense-categories", {
          name: trimmed,
          parentId,
        }),
      "Couldn't add that category.",
    );
  }

  function row(category: ExpenseCategoryDto, isChild: boolean) {
    const isRenaming = renaming?.id === category.id;
    const isOpen = expanded === category.id;

    return (
      <div key={category.id} className={isChild ? "ml-6 border-l border-border pl-3" : undefined}>
        <div className="flex items-center gap-2 py-1.5">
          {!isChild ? (
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : category.id)}
              aria-label={isOpen ? `Collapse ${category.name}` : `Expand ${category.name}`}
              className="text-muted-foreground hover:text-foreground"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          {isRenaming ? (
            <Input
              autoFocus
              value={renaming.name}
              aria-label={`Rename ${category.name}`}
              onChange={(e) => setRenaming({ id: category.id, name: e.target.value })}
              onKeyDown={async (e) => {
                if (e.key === "Escape") setRenaming(null);
                if (e.key !== "Enter") return;
                const ok = await run(
                  () =>
                    apiClient.patch(`/admin/expense-categories/${category.id}`, {
                      name: renaming.name.trim(),
                    }),
                  "Couldn't rename that category.",
                );
                if (ok) setRenaming(null);
              }}
              className="h-8"
            />
          ) : (
            <span className="flex-1 truncate text-sm text-foreground">{category.name}</span>
          )}

          <span className="tabular-nums text-sm text-muted-foreground">
            {rupees(category.spent)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Rename ${category.name}`}
            disabled={busy}
            onClick={() =>
              setRenaming(isRenaming ? null : { id: category.id, name: category.name })
            }
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <ConfirmDialog
            title={`Delete ${category.name}?`}
            description={
              category.spent > 0
                ? "Categories in use can't be deleted — the server will refuse this."
                : "Nothing is filed under it, so this is safe."
            }
            confirmLabel="Delete"
            variant="danger"
            onConfirm={() =>
              run(
                () => apiClient.delete(`/admin/expense-categories/${category.id}`),
                "Couldn't delete that category.",
              ).then(() => undefined)
            }
            trigger={
              <Button variant="secondary" size="sm" aria-label={`Delete ${category.name}`}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            }
          />
        </div>

        {!isChild && isOpen && (
          <div className="ml-4">
            {category.children.map((child) => row(child, true))}
            <div className="ml-6 flex items-center gap-2 py-1.5 pl-3">
              <Input
                placeholder="Add subcategory"
                className="h-8"
                aria-label={`Add a subcategory under ${category.name}`}
                value={childFor?.parentId === category.id ? childFor.name : ""}
                onChange={(e) => setChildFor({ parentId: category.id, name: e.target.value })}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter" || !childFor) return;
                  if (await addCategory(childFor.name, category.id)) setChildFor(null);
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || childFor?.parentId !== category.id || !childFor.name.trim()}
                onClick={async () => {
                  if (!childFor) return;
                  if (await addCategory(childFor.name, category.id)) setChildFor(null);
                }}
                aria-label={`Save subcategory under ${category.name}`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title="Manage categories"
          description="The headings your spending is filed under."
          className="max-w-lg"
        >
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="New category"
                aria-label="New category"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  if (await addCategory(newName)) setNewName("");
                }}
              />
              <Button
                size="sm"
                disabled={busy || !newName.trim()}
                onClick={async () => {
                  if (await addCategory(newName)) setNewName("");
                }}
                aria-label="Add category"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <div className="divide-y divide-border">
              {categories.map((category) => row(category, false))}
            </div>

            <p className="text-xs text-muted-foreground">
              Categories in use can&apos;t be deleted. Rename them instead.
            </p>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
