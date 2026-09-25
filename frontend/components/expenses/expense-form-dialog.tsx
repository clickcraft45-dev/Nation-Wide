"use client";

import { useRef, useState, type ReactNode } from "react";
import { Paperclip, X } from "lucide-react";
import type { ExpenseCategoryDto, ExpenseDto, PaymentMethodCode } from "@nationwide/shared-types";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
// categoryOptions flattened parent and child into one list; the two are now chosen separately,
// so the parent list and its children are read straight off the tree.

const METHODS: { value: PaymentMethodCode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
];

export interface ExpenseFormValues {
  expenseDate: string;
  categoryId: string;
  amount: number;
  paymentMethod: PaymentMethodCode;
  paidTo: string;
  description?: string;
  referenceNo?: string;
  /**
   * The vendor's own bill, if there is one. Uploaded by the caller AFTER the expense is saved —
   * the file needs an expense id to hang off, and a failed upload must not lose the expense
   * itself, which is the record that actually matters.
   */
  receiptFile?: File;
}

/**
 * One dialog for both recording and correcting an expense — the fields are identical and the
 * backend takes the whole row either way, so a separate edit form would only be the same code
 * with a different title.
 */
export function ExpenseFormDialog({
  trigger,
  categories,
  expense,
  onSubmit,
}: {
  trigger: ReactNode;
  categories: ExpenseCategoryDto[];
  /** Omitted when recording a new expense. */
  expense?: ExpenseDto;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // ponytail: native <input type="date">, not the DateField calendar — this is an admin typing a
  // date they already know, not picking one off a month view.
  const [expenseDate, setExpenseDate] = useState(
    (expense?.expenseDate ?? new Date().toISOString()).slice(0, 10),
  );
  // Which top-level heading the expense sits under, and which child of it (if any). Editing an
  // existing expense has to work backwards from the single stored id to find its parent.
  const parentOf = (childId: string) =>
    categories.find((c) => c.id === childId || c.children.some((s) => s.id === childId));
  const initialParent = expense?.categoryId ? parentOf(expense.categoryId) : undefined;
  const [parentId, setParentId] = useState(initialParent?.id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(
    expense?.categoryId && expense.categoryId !== initialParent?.id ? expense.categoryId : "",
  );
  const subcategories = categories.find((c) => c.id === parentId)?.children ?? [];
  // What actually gets filed: the subcategory when one is chosen, otherwise the heading itself.
  const categoryId = subcategoryId || parentId;
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>(
    expense?.paymentMethod ?? "BANK_TRANSFER",
  );
  const [paidTo, setPaidTo] = useState(expense?.paidTo ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [referenceNo, setReferenceNo] = useState(expense?.referenceNo ?? "");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A category is required: the whole point of the ledger is knowing what the money went on.
  const isValid =
    Number(amount) > 0 && paidTo.trim().length >= 2 && expenseDate !== "" && categoryId !== "";

  async function save() {
    setIsSaving(true);
    try {
      await onSubmit({
        expenseDate: new Date(`${expenseDate}T00:00:00`).toISOString(),
        categoryId,
        amount: Number(amount),
        paymentMethod,
        paidTo: paidTo.trim(),
        description: description.trim() || undefined,
        referenceNo: referenceNo.trim() || undefined,
        receiptFile: receiptFile ?? undefined,
      });
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title={expense ? "Edit expense" : "Record an expense"}
          description="Money the company paid out."
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="expense-date">Date</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-amount">Amount (₹)</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-category">Category</Label>
                <NativeSelect
                  id="expense-category"
                  value={parentId}
                  onChange={(e) => {
                    setParentId(e.target.value);
                    // The old subcategory belongs to the old heading; keeping it would file the
                    // expense under a child of a category it is no longer in.
                    setSubcategoryId("");
                  }}
                >
                  <option value="">Choose a category…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-subcategory">Sub-category</Label>
                <NativeSelect
                  id="expense-subcategory"
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  // Nothing to choose until a heading is picked, and plenty of headings have no
                  // children at all — the expense then files under the heading itself.
                  disabled={subcategories.length === 0}
                >
                  <option value="">
                    {!parentId
                      ? "Pick a category first"
                      : subcategories.length === 0
                        ? "None under this category"
                        : "None — file under the category"}
                  </option>
                  {subcategories.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-method">Paid by</Label>
                <NativeSelect
                  id="expense-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodCode)}
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-paid-to">Paid to</Label>
              <Input
                id="expense-paid-to"
                placeholder="Vendor, landlord, employee…"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-description">Description (optional)</Label>
              <Input
                id="expense-description"
                placeholder="What it was for"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-reference">Bill / reference no. (optional)</Label>
              <Input
                id="expense-reference"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-receipt">Bill / invoice (optional)</Label>
              {/* A photo of the counter slip or the PDF the vendor emailed. Uploaded after the
                  expense is saved, so a failed upload never costs the expense itself. */}
              <input
                ref={fileInput}
                id="expense-receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                className="hidden"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
              {receiptFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="truncate text-foreground">{receiptFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptFile(null);
                      // Without this the same file cannot be re-picked: the input still holds it,
                      // so choosing it again fires no change event.
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Remove the attached bill"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="inline-flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Paperclip className="h-4 w-4" aria-hidden />
                  Attach the bill — photo or PDF
                </button>
              )}
              {expense?.hasReceipt && !receiptFile && (
                <span className="text-xs text-muted-foreground">
                  {expense.receiptName ?? "A bill"} is already attached. Attaching another
                  replaces it.
                </span>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button size="sm" disabled={!isValid || isSaving} onClick={save}>
                {expense ? "Save changes" : "Record expense"}
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
