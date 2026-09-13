"use client";

import { useEffect, useMemo, useState } from "react";
import { Warehouse } from "lucide-react";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";

const CLOSED = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);

type Tab = "waiting" | "closed" | "all";

const TABS: { value: Tab; label: string }[] = [
  { value: "waiting", label: "Waiting" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

// Customers who chose to bring the parcel to the warehouse. These never go to a pickup partner —
// staff receive, weigh, take payment and complete them here.
export default function WarehouseDropoffsPage() {
  const [rows, setRows] = useState<PickupRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("waiting");
  const [search, setSearch] = useState("");

  function load() {
    setIsLoading(true);
    setError(null);
    // ponytail: filtered client-side from the full pickup-request list, like the admin page next
    // door. Add a dropAtWarehouse query filter server-side if that list grows large.
    apiClient
      .get<PickupRequestDto[]>("/admin/pickup-requests")
      .then((all) => setRows(all.filter((p) => p.dropAtWarehouse)))
      .catch((err) => setError(errorMessage(err, "Failed to load warehouse drop-offs.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // One-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (p) =>
        (tab === "all" || (tab === "closed") === CLOSED.has(p.status)) &&
        (!q ||
          p.customerName.toLowerCase().includes(q) ||
          p.customerPhone.includes(q) ||
          p.pickupContactName.toLowerCase().includes(q)),
    );
  }, [rows, tab, search]);

  const waiting = rows.filter((p) => !CLOSED.has(p.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Warehouse Drop-offs</h1>
        <p className="text-sm text-muted-foreground">
          Parcels customers bring to the warehouse. Receive, weigh, take payment and complete them here
          {!isLoading && waiting > 0 ? ` — ${waiting} waiting.` : "."}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl ariaLabel="Filter drop-offs" options={TABS} value={tab} onChange={setTab} />
        <SearchInput
          className="sm:ml-auto sm:w-72"
          placeholder="Customer name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search warehouse drop-offs"
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && visible.length === 0 && (
        <EmptyState icon={<Warehouse className="h-8 w-8" aria-hidden />} title="No warehouse drop-offs here" />
      )}

      {!isLoading && !error && visible.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Shipment</TableHead>
              <TableHead>Quote</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((p) => (
              <TableRow key={p.id} href={`/admin/warehouse-dropoffs/${p.id}`}>
                <TableCell>
                  <span className="font-medium text-foreground">{p.customerName}</span>
                  <p className="text-xs text-muted-foreground">{p.customerPhone}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.pickupContactName}
                  <p className="text-xs">{p.pickupContactPhone}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {p.shipmentType.charAt(0) + p.shipmentType.slice(1).toLowerCase()} · {p.estimatedWeightKg}kg →{" "}
                  {p.destCountry}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {p.currency} {p.estimatedPrice.toLocaleString("en-IN")}
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
