"use client";

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import type { PickupDto, PickupStatusCode } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
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
import { PickupStatusBadge } from "@/components/ui/status-badge";
import { ManagePickupDialog } from "@/components/pickups/manage-pickup-dialog";
import { cn } from "@/lib/utils/cn";

type Tab = "pickups" | "drop-offs";
type RangeFilter = "" | "today" | "tomorrow" | "next7";

export default function AdminPickupsPage() {
  const [tab, setTab] = useState<Tab>("pickups");
  const [pickups, setPickups] = useState<PickupDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeFilter>("");
  const [statusFilter, setStatusFilter] = useState("");
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (range) params.set("range", range);
    if (statusFilter) params.set("status", statusFilter);
    const path = tab === "pickups" ? "/admin/pickups" : "/admin/pickups/drop-offs";
    const query = params.toString();

    apiClient
      .get<PickupDto[]>(`${path}${query ? `?${query}` : ""}`)
      .then(setPickups)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load pickups." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refetching on tab/filter change is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, range, statusFilter]);

  const statusOptions: PickupStatusCode[] =
    tab === "pickups"
      ? ["SCHEDULED", "PENDING", "ASSIGNED", "PICKUP_IN_PROGRESS", "PICKED_UP", "CANCELLED", "PICKUP_FAILED"]
      : ["SCHEDULED", "DROPPED_OFF", "CANCELLED"];

  async function save(id: string, update: { status: PickupStatusCode; weightVerifiedKg?: number; notes?: string }) {
    try {
      await apiClient.patch(`/admin/pickups/${id}/status`, update);
      showToast({ variant: "success", title: "Pickup updated" });
      load();
    } catch {
      showToast({ variant: "error", title: "Couldn't update the pickup. Please try again." });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pickups</h1>
        <p className="text-sm text-muted-foreground">
          Scheduled pickups and warehouse drop-offs.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["pickups", "drop-offs"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "pickups" ? "Pickups" : "Warehouse drop-offs"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {tab === "pickups" && (
          <NativeSelect
            className="sm:w-52"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeFilter)}
            aria-label="Filter by date range"
          >
            <option value="">All dates</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
            <option value="next7">Next 7 days</option>
          </NativeSelect>
        )}
        <NativeSelect
          className="sm:w-52"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isLoading && <TableSkeleton columns={6} />}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && pickups.length === 0 && (
        <EmptyState icon={<Truck className="h-8 w-8" aria-hidden />} title="No pickups found" />
      )}

      {!isLoading && !error && pickups.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              {tab === "pickups" && <TableHead>Date</TableHead>}
              {tab === "pickups" && <TableHead>Time Slot</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Confirmed By</TableHead>
              <TableHead>Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pickups.map((p) => (
              <TableRow key={p.id} href={`/admin/pickups/${p.id}`}>
                <TableCell>
                  <span className="font-medium text-foreground">{p.customerName}</span>
                  <p className="text-xs text-muted-foreground">{p.customerPhone}</p>
                </TableCell>
                {tab === "pickups" && (
                  <TableCell className="whitespace-nowrap">{p.scheduledDate ?? "—"}</TableCell>
                )}
                {tab === "pickups" && (
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {p.scheduledTimeSlot ?? "—"}
                  </TableCell>
                )}
                <TableCell>
                  <PickupStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.confirmedByAdminEmail ?? "—"}
                </TableCell>
                <TableCell>
                  <ManagePickupDialog
                    pickup={p}
                    onSave={(update) => save(p.id, update)}
                    trigger={
                      <Button variant="secondary" size="sm">
                        Manage
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
