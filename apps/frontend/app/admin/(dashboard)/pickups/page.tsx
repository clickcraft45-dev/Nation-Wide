"use client";

import { useEffect, useMemo, useState } from "react";
import { Truck } from "lucide-react";
import { listMockPickups } from "@/lib/mock-data";
import type { PickupRecord } from "@/lib/types/placeholder";
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
import { ManagePickupDialog } from "@/components/pickups/manage-pickup-dialog";

const STATUS_VARIANT = {
  PENDING: "warning",
  COMPLETED: "success",
  RESCHEDULED: "neutral",
} as const;

const TODAY = new Date().toISOString().slice(0, 10);

export default function AdminPickupsPage() {
  const [pickups, setPickups] = useState<PickupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<"" | "today" | "PENDING" | "COMPLETED" | "RESCHEDULED">("");
  const { showToast } = useToast();

  useEffect(() => {
    listMockPickups()
      .then(setPickups)
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (view === "today") return pickups.filter((p) => p.date === TODAY);
    if (view) return pickups.filter((p) => p.status === view);
    return pickups;
  }, [pickups, view]);

  function save(id: string, update: Partial<PickupRecord>) {
    setPickups((prev) => prev.map((p) => (p.id === id ? { ...p, ...update } : p)));
    showToast({ variant: "success", title: "Pickup updated" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pickups</h1>
        <p className="text-sm text-muted-foreground">
          Placeholder data — no pickup backend yet. Actions here update the view locally only.
        </p>
      </div>

      <NativeSelect
        className="sm:w-52"
        value={view}
        onChange={(e) => setView(e.target.value as typeof view)}
        aria-label="Filter pickups"
      >
        <option value="">All pickups</option>
        <option value="today">Today&apos;s pickups</option>
        <option value="PENDING">Pending</option>
        <option value="COMPLETED">Completed</option>
        <option value="RESCHEDULED">Rescheduled</option>
      </NativeSelect>

      {isLoading && <TableSkeleton columns={6} />}

      {!isLoading && filtered.length === 0 && (
        <EmptyState icon={<Truck className="h-8 w-8" aria-hidden />} title="No pickups found" />
      )}

      {!isLoading && filtered.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pickup</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Time Slot</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.orderId}</TableCell>
                <TableCell>{p.customerName}</TableCell>
                <TableCell className="whitespace-nowrap">{p.date}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {p.timeSlot}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.assignedManagerEmail ?? "Unassigned"}
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
