"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import type { PickupRequestDto, PickupRequestStatusCode } from "@nationwide/shared-types";
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
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";
import { PickupsMap, type MapPoint } from "@/components/ui/pickups-map";

// Colour by where the pickup is in its life, so the map reads at a glance.
function statusColor(status: PickupRequestStatusCode): string {
  if (status === "PENDING_ASSIGNMENT") return "#ea580c";
  if (status === "COMPLETED") return "#6b7280";
  if (status === "CANCELLED" || status === "REJECTED") return "#9ca3af";
  return "#16a34a";
}

// ponytail: exact single-status match, so SCHEDULED / OUT_FOR_PICKUP / CANCELLED / REJECTED
// only show under "All". Group them into tabs (backend `in` filter) if they need their own view.
const STATUS_TABS: { value: PickupRequestStatusCode | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING_ASSIGNMENT", label: "Pending" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "VERIFICATION_PENDING", label: "Verification" },
  { value: "COMPLETED", label: "Completed" },
];

export default function AdminPickupRequestsPage() {
  const [pickupRequests, setPickupRequests] = useState<PickupRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PickupRequestStatusCode | "">("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "map">("list");

  const points = useMemo<MapPoint[]>(
    () =>
      pickupRequests
        .filter((p) => p.pickupLatitude != null && p.pickupLongitude != null)
        .map((p) => ({
          id: p.id,
          lat: p.pickupLatitude!,
          lng: p.pickupLongitude!,
          title: p.customerName,
          subtitle: `${p.pickupAddressLine1}, ${p.pickupCity} · ${p.assignedPartnerName ?? "Unassigned"} · ${p.status.replace(/_/g, " ").toLowerCase()}`,
          href: `/admin/pickup-requests/${p.id}`,
          color: statusColor(p.status),
        })),
    [pickupRequests],
  );

  function load() {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const query = params.toString();

    apiClient
      .get<PickupRequestDto[]>(`/admin/pickup-requests${query ? `?${query}` : ""}`)
      .then(setPickupRequests)
      .catch((err) => {
        setError(errorMessage(err, "Failed to load pickup requests."));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refetching on filter change is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pickup Requests</h1>
        <p className="text-sm text-muted-foreground">
          Pre-order pickups awaiting partner assignment, verification, and acceptance.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl
          ariaLabel="Filter by status"
          options={STATUS_TABS}
          value={status}
          onChange={setStatus}
        />
        <SearchInput
          className="sm:ml-auto sm:w-72"
          placeholder="Customer name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search pickup requests"
        />
        <SegmentedControl
          ariaLabel="View"
          options={[
            { value: "list", label: "List" },
            { value: "map", label: "Map" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "map" && !error && (
        <div className="space-y-2">
          <PickupsMap points={points} className="h-[65vh] min-h-96" />
          <p className="text-xs text-muted-foreground">
            <span style={{ color: "#ea580c" }}>●</span> Awaiting a partner ·{" "}
            <span style={{ color: "#16a34a" }}>●</span> In progress ·{" "}
            <span style={{ color: "#6b7280" }}>●</span> Closed
            {pickupRequests.length - points.length > 0 &&
              ` · ${pickupRequests.length - points.length} without a map pin (warehouse drop-offs or typed addresses)`}
          </p>
        </div>
      )}

      {isLoading && <TableSkeleton columns={7} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && pickupRequests.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" aria-hidden />}
          title="No pickup requests found"
        />
      )}

      {view === "list" && !isLoading && !error && pickupRequests.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Pickup Address</TableHead>
              <TableHead>Carrier</TableHead>
              <TableHead>Quote</TableHead>
              <TableHead>Assigned Partner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pickupRequests.map((p) => (
              <TableRow key={p.id} href={`/admin/pickup-requests/${p.id}`}>
                <TableCell>
                  <span className="font-medium text-foreground">{p.customerName}</span>
                  <p className="text-xs text-muted-foreground">{p.customerPhone}</p>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {p.dropAtWarehouse ? "Warehouse drop-off" : `${p.pickupCity}, ${p.pickupState}`}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.rateProviderName ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {p.currency} {p.estimatedPrice.toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.assignedPartnerName ?? "Unassigned"}
                </TableCell>
                <TableCell>
                  <PickupRequestStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(p.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
