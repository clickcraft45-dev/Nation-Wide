"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpDown, Package, Plus } from "lucide-react";
import type { OrderDto, CustomerDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { NativeSelect } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
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

const PAGE_SIZE = 25;

function SortableHead({
  label,
  sortField,
  activeKey,
  activeDir,
  onSort,
}: {
  label: string;
  sortField: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <TableHead>
      <button onClick={() => onSort(sortField)} className="flex items-center gap-1 hover:text-foreground">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${activeKey === sortField ? "text-foreground" : ""}`}
          aria-hidden
        />
        {activeKey === sortField && (
          <span className="sr-only">({activeDir === "asc" ? "ascending" : "descending"})</span>
        )}
      </button>
    </TableHead>
  );
}

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const kpiStatus = searchParams.get("status"); // "in-transit" | "delivered" from dashboard KPI links

  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [total, setTotal] = useState(0);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [providers, setProviders] = useState<ShippingProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const load = () => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sortKey,
      sortDir,
    });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (providerFilter) params.set("providerId", providerFilter);
    if (kpiStatus === "in-transit" || kpiStatus === "delivered") {
      params.set("trackingGroup", kpiStatus);
    }
    Promise.all([
      apiClient.getWithHeaders<OrderDto[]>(`/orders?${params.toString()}`),
      customers.length === 0 ? apiClient.get<CustomerDto[]>("/customers") : Promise.resolve(customers),
      providers.length === 0
        ? apiClient.get<ShippingProviderDto[]>("/shipping-providers")
        : Promise.resolve(providers),
    ])
      .then(([ordersRes, customersRes, providersRes]) => {
        setOrders(ordersRes.data);
        setTotal(Number(ordersRes.headers.get("X-Total-Count") ?? ordersRes.data.length));
        setCustomers(customersRes);
        setProviders(providersRes);
      })
      .catch(() => setError("Failed to load orders."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    // Fetching on filter/sort/page change is a one-shot lookup, not a subscription to external
    // state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, statusFilter, providerFilter, sortKey, sortDir, kpiStatus]);

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );
  const providerById = useMemo(
    () => new Map(providers.map((p) => [p.id, p])),
    [providers],
  );

  function handleFilterChange(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {total} total order{total === 1 ? "" : "s"}
          </p>
        </div>
        <CreateOrderDialog
          customers={customers}
          providers={providers}
          onCreated={load}
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
            placeholder="Order, customer or tracking #"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search orders"
          />
        </div>
        <NativeSelect
          className="sm:w-44"
          value={statusFilter}
          onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
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
          onChange={(e) => handleFilterChange(setProviderFilter, e.target.value)}
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

      {!error && !isLoading && orders.length === 0 && (
        <EmptyState
          icon={<Package className="h-8 w-8" aria-hidden />}
          title="No orders found"
          description="Try adjusting your search or filters, or create a new order."
        />
      )}

      {!error && !isLoading && orders.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Order ID"
                  sortField="id"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Customer"
                  sortField="customer"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
                <TableHead>Origin</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Provider</TableHead>
                <SortableHead
                  label="Status"
                  sortField="status"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Created"
                  sortField="createdAt"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={toggleSort}
                />
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const customer = customerById.get(order.customerId);
                const shipment = order.shipments[0];
                const provider = shipment ? providerById.get(shipment.providerId) : undefined;
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">
                      {shipment?.internalTrackingNumber ?? order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{customer?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {order.origin ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {order.destination ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
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
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
