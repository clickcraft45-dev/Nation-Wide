"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet, Pencil, Trash2 } from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseListDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { SearchInput } from "@/components/ui/search-input";
import { NativeSelect } from "@/components/ui/select";
import { Input, Label } from "@/components/ui/input";
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
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  ExpenseFormDialog,
  type ExpenseFormValues,
} from "@/components/expenses/expense-form-dialog";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** First day of the current month, as the value a date input wants. */
function startOfThisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function AdminExpensesPage() {
  const [data, setData] = useState<ExpenseListDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  // Defaults to this month — the window an admin actually asks about, and it keeps the first
  // load off the whole ledger.
  const [from, setFrom] = useState(startOfThisMonth);
  const [to, setTo] = useState("");
  const { showToast } = useToast();

  const load = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    // Inclusive of the end day: a "to" of the 30th must include the 30th's expenses.
    if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
    // ponytail: no pagination — 200 rows covers any single month. Add it when a filter can
    // realistically return more.
    params.set("take", "200");

    apiClient
      .get<ExpenseListDto>(`/admin/expenses?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(errorMessage(err, "Failed to load expenses.")))
      .finally(() => setIsLoading(false));
  }, [search, category, from, to]);

  useEffect(() => {
    // Refetching when a filter changes is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function save(values: ExpenseFormValues, id?: string) {
    try {
      if (id) await apiClient.patch(`/admin/expenses/${id}`, values);
      else await apiClient.post("/admin/expenses", values);
      showToast({ variant: "success", title: id ? "Expense updated" : "Expense recorded" });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't save the expense.") });
    }
  }

  async function remove(id: string) {
    try {
      await apiClient.delete(`/admin/expenses/${id}`);
      showToast({ variant: "success", title: "Expense deleted" });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't delete the expense.") });
    }
  }

  const topCategory = data?.byCategory[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            What the company spent — salaries, rent, fuel, packaging and the rest.
          </p>
        </div>
        <ExpenseFormDialog
          trigger={<Button size="sm">Record expense</Button>}
          onSubmit={(values) => save(values)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total in this view" value={rupees(data?.totalAmount ?? 0)} icon={Wallet} />
        <StatCard label="Expenses recorded" value={data?.total ?? 0} />
        <StatCard
          label="Biggest category"
          value={topCategory ? EXPENSE_CATEGORY_LABELS[topCategory.category] : "—"}
          caption={topCategory ? rupees(topCategory.amount) : undefined}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <SearchInput
            placeholder="Search vendor, note or bill no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search expenses"
          />
        </div>
        <NativeSelect
          className="sm:w-48"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {EXPENSE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
        <div className="space-y-1.5">
          <Label htmlFor="expense-from">From</Label>
          <Input
            id="expense-from"
            type="date"
            className="sm:w-40"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-to">To</Label>
          <Input
            id="expense-to"
            type="date"
            className="sm:w-40"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <TableSkeleton columns={7} />}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && data?.items.length === 0 && (
        <EmptyState
          icon={<Wallet className="h-8 w-8" aria-hidden />}
          title="No expenses in this period"
          description="Record one to start tracking where the money goes."
        />
      )}

      {!isLoading && !error && data && data.items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Paid to</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{new Date(expense.expenseDate).toLocaleDateString("en-IN")}</TableCell>
                <TableCell>{EXPENSE_CATEGORY_LABELS[expense.category]}</TableCell>
                <TableCell>{expense.paidTo}</TableCell>
                <TableCell className="text-muted-foreground">
                  {expense.description ?? "—"}
                  {expense.referenceNo ? ` · ${expense.referenceNo}` : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">{expense.paymentMethod}</TableCell>
                <TableCell className="font-medium">{rupees(expense.amount)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <ExpenseFormDialog
                      expense={expense}
                      trigger={
                        <Button variant="secondary" size="sm" aria-label="Edit expense">
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      }
                      onSubmit={(values) => save(values, expense.id)}
                    />
                    <ConfirmDialog
                      title="Delete this expense?"
                      description={`${rupees(expense.amount)} paid to ${expense.paidTo}. This cannot be undone.`}
                      confirmLabel="Delete"
                      variant="danger"
                      onConfirm={() => remove(expense.id)}
                      trigger={
                        <Button variant="secondary" size="sm" aria-label="Delete expense">
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
