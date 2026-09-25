"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import type { OrderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
import { useToast } from "@/components/ui/toast";
import { PaymentStatusBadge } from "@/components/ui/status-badge";
import { MarkPaidDialog, type MarkPaidDetails } from "@/components/payments/mark-paid-dialog";
import { RefundDialog } from "@/components/payments/refund-dialog";

// The four states a payment can be in, as one row of choices rather than a dropdown: there are
// only ever these five options, and the count of each is what an admin is scanning for.
type StatusFilter = "" | "PENDING" | "PAID" | "FAILED" | "REFUNDED";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PAID", label: "Paid" },
  { value: "FAILED", label: "Failed" },
  { value: "REFUNDED", label: "Refunded" },
];

export default function AdminPaymentsPage() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    // Just the orders: each one already carries its customer's name (that is what customerName
    // on OrderDto is for), so the whole customer table used to be downloaded alongside to build
    // an id -> name map that the server had already built.
    apiClient
      .get<OrderDto[]>("/orders")
      .then(setOrders)
      .catch((err) => {
        setError(errorMessage(err, "Failed to load payments."));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filtered = useMemo(() => {
    let result = orders;
    if (statusFilter) result = result.filter((o) => o.paymentStatus === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          (o.customerName ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [orders, search, statusFilter]);

  async function markPaid(id: string, details: MarkPaidDetails) {
    try {
      await apiClient.patch(`/admin/orders/${id}/payment`, {
        paymentStatus: "PAID",
        paymentMethod: details.method,
        paidAmount: details.amount,
        paymentPayerName: details.payerName,
        paymentNote: details.note,
        couponCode: details.couponCode,
      });
      showToast({ variant: "success", title: "Payment marked as paid" });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't update payment.") });
    }
  }

  async function markRefunded(id: string, amount: number, note?: string) {
    try {
      await apiClient.patch(`/admin/orders/${id}/payment`, {
        paymentStatus: "REFUNDED",
        refundedAmount: amount,
        refundNote: note,
      });
      showToast({ variant: "success", title: "Refund recorded" });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't record the refund.") });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Payment status per order. No online payment gateway yet — mark payments received
          manually.
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
        <div className="sm:flex-1">
          <SegmentedControl
            ariaLabel="Filter by status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_TABS}
          />
        </div>
      </div>

      {isLoading && <TableSkeleton columns={7} />}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          icon={<CreditCard className="h-8 w-8" aria-hidden />}
          title="No payments found"
        />
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Refunded</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Settlement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => {
              return (
                <TableRow key={o.id} href={`/admin/orders/${o.id}`}>
                  <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                  <TableCell>{o.customerName ?? "Unknown"}</TableCell>
                  <TableCell>
                    {o.paidAmount != null ? `₹${o.paidAmount.toLocaleString("en-IN")}` : "—"}
                  </TableCell>
                  <TableCell>
                    {o.refundedAmount != null
                      ? `₹${o.refundedAmount.toLocaleString("en-IN")}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.paymentMethod ?? "—"}
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={o.paymentStatus} />
                  </TableCell>
                  <TableCell>
                    {o.paymentStatus === "PAID" ? (
                      // Refunding is only meaningful against money that actually came in.
                      <RefundDialog
                        order={o}
                        onConfirm={(amount, note) => markRefunded(o.id, amount, note)}
                        trigger={
                          <Button variant="secondary" size="sm">
                            Refund
                          </Button>
                        }
                      />
                    ) : o.paymentStatus === "REFUNDED" ? (
                      <span className="text-xs text-muted-foreground">
                        {o.refundedAt ? new Date(o.refundedAt).toLocaleDateString() : "Refunded"}
                      </span>
                    ) : (
                      <MarkPaidDialog
                        order={o}
                        onConfirm={(details) => markPaid(o.id, details)}
                        trigger={
                          <Button variant="secondary" size="sm">
                            Mark Paid
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
