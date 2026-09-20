"use client";

import { useState, type ReactNode } from "react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategoryCode,
  type ExpenseDto,
  type PaymentMethodCode,
} from "@nationwide/shared-types";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";

const METHODS: { value: PaymentMethodCode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
];

export interface ExpenseFormValues {
  expenseDate: string;
  category: ExpenseCategoryCode;
  amount: number;
  paymentMethod: PaymentMethodCode;
  paidTo: string;
  description?: string;
  referenceNo?: string;
}

/**
 * One dialog for both recording and correcting an expense — the fields are identical and the
 * backend takes the whole row either way, so a separate edit form would only be the same code
 * with a different title.
 */
export function ExpenseFormDialog({
  trigger,
  expense,
  onSubmit,
}: {
  trigger: ReactNode;
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
  const [category, setCategory] = useState<ExpenseCategoryCode>(expense?.category ?? "OTHER");
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>(
    expense?.paymentMethod ?? "BANK_TRANSFER",
  );
  const [paidTo, setPaidTo] = useState(expense?.paidTo ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [referenceNo, setReferenceNo] = useState(expense?.referenceNo ?? "");

  const isValid = Number(amount) > 0 && paidTo.trim().length >= 2 && expenseDate !== "";

  async function save() {
    setIsSaving(true);
    try {
      await onSubmit({
        expenseDate: new Date(`${expenseDate}T00:00:00`).toISOString(),
        category,
        amount: Number(amount),
        paymentMethod,
        paidTo: paidTo.trim(),
        description: description.trim() || undefined,
        referenceNo: referenceNo.trim() || undefined,
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
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategoryCode)}
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
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
