"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpDown, Package, Plus } from "lucide-react";
import type { OrderDto, ShippingProviderDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
import { useToast } from "@/components/ui/toast";

type SortKey = "id" | "customer" | "status" | "createdAt";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

const AWB_TABS = [
  { value: "", label: "All" },
  { value: "mapped", label: "AWB mapped" },
  { value: "unmapped", label: "AWB not mapped" },
  // Cancelled orders are a workload of their own — chasing refunds and parcels, not AWBs — so
  // they get their own view instead of sitting in a queue of work that will never be done on
  // them. The server drops them from "AWB not mapped" for the same reason.
  { value: "cancelled", label: "Cancelled" },
];

const REFUND_TABS = [
  { value: "", label: "Any refund" },
  { value: "refunded", label: "Refunded" },
  { value: "not-refunded", label: "Not refunded" },
];

const RETURN_TABS = [
  { value: "", label: "Any parcel" },
  { value: "returned", label: "Returned" },
  { value: "not-returned", label: "Not returned" },
];

const STATUS_TABS = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  // No CANCELLED here: it is the "Cancelled" view above, which carries the refund and parcel
  // filters that only make sense for one.
];

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
  const [providers, setProviders] = useState<ShippingProviderDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [awbFilter, setAwbFilter] = useState("");
  const { showToast } = useToast();
  const [refundFilter, setRefundFilter] = useState("");
  const [returnedFilter, setReturnedFilter] = useState("");
  const isCancelledView = awbFilter === "cancelled";
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
    // "cancelled" is a status, not an AWB state — it shares the control because it is the same
    // question ("which pile am I working through?"), not the same parameter.
    if (isCancelledView) {
      params.set("status", "CANCELLED");
      if (refundFilter) params.set("refund", refundFilter);
      if (returnedFilter) params.set("returned", returnedFilter);
    } else if (awbFilter) {
      params.set("awb", awbFilter);
    }
    if (kpiStatus === "in-transit" || kpiStatus === "delivered") {
      params.set("trackingGroup", kpiStatus);
    }
    // The customer table is not fetched here: every order already carries customerName, joined
    // server-side for exactly this row. Providers are a short list and are fetched once.
    Promise.all([
      apiClient.getWithHeaders<OrderDto[]>(`/orders?${params.toString()}`),
      providers.length === 0
        ? apiClient.get<ShippingProviderDto[]>("/shipping-providers")
        : Promise.resolve(providers),
    ])
      .then(([ordersRes, providersRes]) => {
        setOrders(ordersRes.data);
        setTotal(Number(ordersRes.headers.get("X-Total-Count") ?? ordersRes.data.length));
        setProviders(providersRes);
      })
      .catch(() => setError("Failed to load orders."))
      .finally(() => setIsLoading(false));
  };

  /**
   * Record whether the cancelled order's parcel has come back. Toggling, not one-way: this gets
   * clicked on the wrong row, and an undo has to exist.
   */
  async function setReturned(order: OrderDto, returned: boolean) {
    try {
      await apiClient.patch(`/admin/orders/${order.id}/returned`, { returned });
      showToast({
        variant: "success",
        title: returned ? "Marked as returned" : "Return undone",
      });
      load();
    } catch (err) {
      showToast({
        variant: "error",
        title: errorMessage(err, "Couldn't update the parcel's return."),
      });
    }
  }

  useEffect(() => {
    // Fetching on filter/sort/page change is a one-shot lookup, not a subscription to external
    // state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    debouncedSearch,
    statusFilter,
    awbFilter,
    refundFilter,
    returnedFilter,
    sortKey,
    sortDir,
    kpiStatus,
  ]);

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
        {/* Books a pickup for a customer and assigns a partner; the order follows at pickup. */}
        <Link href="/admin/orders/new">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            Create Order
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl
          ariaLabel="Filter by AWB mapping"
          options={AWB_TABS}
          value={awbFilter}
          onChange={(value) => {
            handleFilterChange(setAwbFilter, value);
            // Status filter only exists under "AWB mapped"; don't let it silently linger.
            if (value !== "mapped") setStatusFilter("");
            // Same for the cancelled-only filters.
            if (value !== "cancelled") {
              setRefundFilter("");
              setReturnedFilter("");
            }
          }}
        />
        <div className="sm:ml-auto sm:w-72">
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
      </div>
      {awbFilter === "mapped" && (
        <div className="flex">
          <SegmentedControl
            ariaLabel="Filter by status"
            options={STATUS_TABS}
            value={statusFilter}
            onChange={(value) => handleFilterChange(setStatusFilter, value)}
          />
        </div>
      )}

      {/* Two independent questions about a cancelled order: has the money gone back, and has the
          parcel. Refunded-but-not-returned is the pile someone actually has to chase. */}
      {isCancelledView && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <SegmentedControl
            ariaLabel="Filter by refund"
            options={REFUND_TABS}
            value={refundFilter}
            onChange={(value) => handleFilterChange(setRefundFilter, value)}
          />
          <SegmentedControl
            ariaLabel="Filter by whether the parcel came back"
            options={RETURN_TABS}
            value={returnedFilter}
            onChange={(value) => handleFilterChange(setReturnedFilter, value)}
          />
        </div>
      )}

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
                {isCancelledView && <TableHead>Refund / parcel</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const shipment = order.shipments[0];
                const provider = shipment ? providerById.get(shipment.providerId) : undefined;
                return (
                  <TableRow key={order.id} href={`/admin/orders/${order.id}`}>
                    <TableCell className="font-mono text-xs">
                      {shipment?.internalTrackingNumber ?? order.id.slice(0, 8)}
                      {shipment && (
                        <span className="mt-0.5 block text-[11px] font-normal">
                          {shipment.externalTrackingNumber ? (
                            <span className="text-muted-foreground">
                              AWB {shipment.externalTrackingNumber}
                            </span>
                          ) : (
                            <span className="text-warning">AWB not mapped</span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{order.customerName ?? "—"}</TableCell>
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
                    {isCancelledView && (
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {order.refundedAt ? "Refunded" : "Not refunded"}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            // The row is a link to the order; toggling the parcel state from here
                            // must not navigate away from the list being worked through.
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void setReturned(order, !order.returnedAt);
                            }}
                          >
                            {order.returnedAt ? "Parcel returned" : "Mark returned"}
                          </Button>
                        </div>
                      </TableCell>
                    )}
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
