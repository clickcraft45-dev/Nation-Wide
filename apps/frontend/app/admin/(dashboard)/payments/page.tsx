"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import type { OrderDto, CustomerDto, PaymentMethodCode } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
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
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PaymentStatusBadge } from "@/components/ui/status-badge";
import { MarkPaidDialog } from "@/components/payments/mark-paid-dialog";

export default function AdminPaymentsPage() {
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiClient.get<OrderDto[]>("/orders"),
      apiClient.get<CustomerDto[]>("/customers"),
    ])
      .then(([ordersRes, customersRes]) => {
        setOrders(ordersRes);
        setCustomers(customersRes);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load payments." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const filtered = useMemo(() => {
    let result = orders;
    if (statusFilter) result = result.filter((o) => o.paymentStatus === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((o) => {
        const customer = customerById.get(o.customerId);
        return (
          o.id.toLowerCase().includes(q) ||
          customer?.name.toLowerCase().includes(q) ||
          customer?.phone.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [orders, search, statusFilter, customerById]);

  async function markPaid(id: string, method: PaymentMethodCode, amount: number) {
    try {
      await apiClient.patch(`/admin/orders/${id}/payment`, {
        paymentStatus: "PAID",
        paymentMethod: method,
        paidAmount: amount,
      });
      showToast({ variant: "success", title: "Payment marked as paid" });
      load();
    } catch {
      showToast({ variant: "error", title: "Couldn't update payment. Please try again." });
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
        <NativeSelect
          className="sm:w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </NativeSelect>
      </div>

      {isLoading && <TableSkeleton columns={6} />}

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
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Settlement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const customer = customerById.get(o.customerId);
              return (
                <TableRow key={o.id} href={`/admin/orders/${o.id}`}>
                  <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                  <TableCell>{customer?.name ?? "Unknown"}</TableCell>
                  <TableCell>
                    {o.paidAmount != null ? `₹${o.paidAmount.toLocaleString("en-IN")}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {o.paymentMethod ?? "—"}
                  </TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={o.paymentStatus} />
                  </TableCell>
                  <TableCell>
                    {o.paymentStatus === "PENDING" ? (
                      <MarkPaidDialog
                        order={o}
                        onConfirm={(method, amount) => markPaid(o.id, method, amount)}
                        trigger={
                          <Button variant="secondary" size="sm">
                            Mark Paid
                          </Button>
                        }
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {o.paidAt ? new Date(o.paidAt).toLocaleDateString() : "—"}
                      </span>
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
