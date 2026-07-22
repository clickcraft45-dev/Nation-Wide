"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import { listMockPayments } from "@/lib/mock-data";
import type { PaymentRecord } from "@/lib/types/placeholder";
import { SearchInput } from "@/components/ui/search-input";
import { NativeSelect } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog";

const STATUS_VARIANT = {
  PAID: "success",
  PENDING: "warning",
  CANCELLED: "danger",
} as const;

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    listMockPayments()
      .then(setPayments)
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = payments;
    if (statusFilter) result = result.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (p) => p.orderId.toLowerCase().includes(q) || p.customerName.toLowerCase().includes(q),
      );
    }
    return result;
  }, [payments, search, statusFilter]);

  function markPaid(id: string, method: PaymentRecord["method"]) {
    setPayments((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: "PAID", method, paidAt: new Date().toISOString() } : p,
      ),
    );
    showToast({ variant: "success", title: "Payment marked as paid" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Placeholder data — no payment backend yet. Actions here update the view locally only.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-72">
          <SearchInput
            placeholder="Search by order or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search payments"
          />
        </div>
        <NativeSelect
          className="sm:w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Cancelled</option>
        </NativeSelect>
      </div>

      {isLoading && <TableSkeleton columns={6} />}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<CreditCard className="h-8 w-8" aria-hidden />}
          title="No payments found"
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.orderId}</TableCell>
                <TableCell>{p.customerName}</TableCell>
                <TableCell>₹{p.amount.toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-muted-foreground">{p.method ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                </TableCell>
                <TableCell>
                  {p.status === "PENDING" ? (
                    <MarkPaidDialog
                      payment={p}
                      onConfirm={(method) => markPaid(p.id, method)}
                      trigger={
                        <Button variant="secondary" size="sm">
                          Mark Paid
                        </Button>
                      }
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
