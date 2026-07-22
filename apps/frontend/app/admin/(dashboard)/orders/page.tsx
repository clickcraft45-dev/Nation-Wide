"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpDown, Package, Plus } from "lucide-react";
import type { OrderDto, CustomerDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import { OrderStatusBadge, TrackingStatusBadge } from "@/components/ui/status-badge";
import { CreateOrderDialog } from "@/components/orders/create-order-dialog";

type SortKey = "id" | "customer" | "status" | "createdAt";
type SortDir = "asc" | "desc";

const IN_TRANSIT_STATUSES = ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"];

function SortableHead({
  label,
  sortField,
  onSort,
}: {
  label: string;
  sortField: SortKey;
  onSort: (key: SortKey) => void;
}) {
  return (
    <TableHead>
      <button onClick={() => onSort(sortField)} className="flex items-center gap-1 hover:text-foreground">
        {label}
        <ArrowUpDown className="h-3 w-3" aria-hidden />
      </button>
    </TableHead>
  );
}

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [providers, setProviders] = useState<ShippingProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const kpiStatus = searchParams.get("status"); // "in-transit" | "delivered" from dashboard KPI links

  const load = () => {
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiClient.get<OrderDto[]>("/orders"),
      apiClient.get<CustomerDto[]>("/customers"),
      apiClient.get<ShippingProviderDto[]>("/shipping-providers"),
    ])
      .then(([ordersRes, customersRes, providersRes]) => {
        setOrders(ordersRes);
        setCustomers(customersRes);
        setProviders(providersRes);
      })
      .catch(() => setError("Failed to load orders."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );
  const providerById = useMemo(
    () => new Map(providers.map((p) => [p.id, p])),
    [providers],
  );

  const primaryStatus = (order: OrderDto) => order.shipments[0]?.currentStatus ?? null;

  const filtered = useMemo(() => {
    let result = orders;

    if (kpiStatus === "in-transit") {
      result = result.filter((o) => IN_TRANSIT_STATUSES.includes(primaryStatus(o) ?? ""));
    } else if (kpiStatus === "delivered") {
      result = result.filter((o) => primaryStatus(o) === "DELIVERED");
    }

    if (statusFilter) {
      result = result.filter((o) => o.status === statusFilter);
    }
    if (providerFilter) {
      result = result.filter((o) => o.shipments[0]?.providerId === providerFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((o) => {
        const customer = customerById.get(o.customerId);
        return (
          o.id.toLowerCase().includes(q) ||
          o.shipments.some((s) => s.internalTrackingNumber.toLowerCase().includes(q)) ||
          customer?.name.toLowerCase().includes(q) ||
          customer?.phone.toLowerCase().includes(q)
        );
      });
    }

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = a.id.localeCompare(b.id);
          break;
        case "customer":
          cmp = (customerById.get(a.customerId)?.name ?? "").localeCompare(
            customerById.get(b.customerId)?.name ?? "",
          );
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [orders, statusFilter, providerFilter, search, sortKey, sortDir, customerById, kpiStatus]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {orders.length} total order{orders.length === 1 ? "" : "s"}
          </p>
        </div>
        <CreateOrderDialog
          customers={customers}
          providers={providers}
          onCreated={(order) => setOrders((prev) => [order, ...prev])}
          trigger={
            <Button>
              <Plus className="h-4 w-4" aria-hidden />
              Create Order
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <SearchInput
            placeholder="Search by order, customer, tracking #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search orders"
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
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </NativeSelect>
        <NativeSelect
          className="sm:w-44"
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          aria-label="Filter by provider"
        >
          <option value="">All providers</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && isLoading && <TableSkeleton columns={7} />}

      {!error && !isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<Package className="h-8 w-8" aria-hidden />}
          title="No orders found"
          description="Try adjusting your search or filters, or create a new order."
        />
      )}

      {!error && !isLoading && filtered.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Order ID" sortField="id" onSort={toggleSort} />
                <SortableHead label="Customer" sortField="customer" onSort={toggleSort} />
                <TableHead>Origin</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Provider</TableHead>
                <SortableHead label="Status" sortField="status" onSort={toggleSort} />
                <SortableHead label="Created" sortField="createdAt" onSort={toggleSort} />
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => {
                const customer = customerById.get(order.customerId);
                const shipment = order.shipments[0];
                const provider = shipment ? providerById.get(shipment.providerId) : undefined;
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">
                      {shipment?.internalTrackingNumber ?? order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell>{provider?.name ?? "—"}</TableCell>
                    <TableCell>
                      {shipment ? (
                        <TrackingStatusBadge status={shipment.currentStatus} />
                      ) : (
                        <OrderStatusBadge status={order.status} />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Origin/Destination aren&apos;t tracked in the order model yet — no shipper/consignee
            address data is captured today.
          </p>
        </>
      )}
    </div>
  );
}
