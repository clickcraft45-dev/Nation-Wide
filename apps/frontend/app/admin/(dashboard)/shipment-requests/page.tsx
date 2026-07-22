"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { listMockShipmentRequests } from "@/lib/mock-data";
import type { ShipmentRequest, ShipmentRequestStatus } from "@/lib/types/placeholder";
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
import { NativeSelect } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

const STATUS_VARIANT = {
  NEW: "info",
  IN_REVIEW: "warning",
  CONVERTED: "success",
  DECLINED: "danger",
} as const;

const STATUSES: ShipmentRequestStatus[] = ["NEW", "IN_REVIEW", "CONVERTED", "DECLINED"];

export default function AdminShipmentRequestsPage() {
  const [requests, setRequests] = useState<ShipmentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    listMockShipmentRequests()
      .then(setRequests)
      .finally(() => setIsLoading(false));
  }, []);

  function updateStatus(id: string, status: ShipmentRequestStatus) {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    showToast({ variant: "success", title: "Request updated" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Shipment Requests</h1>
        <p className="text-sm text-muted-foreground">
          Placeholder data — no shipment-request backend yet.
        </p>
      </div>

      {isLoading && <TableSkeleton columns={4} />}

      {!isLoading && requests.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" aria-hidden />}
          title="No shipment requests"
        />
      )}

      {!isLoading && requests.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Requested Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Update</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.customerName}</TableCell>
                <TableCell className="text-muted-foreground">{r.requestedService}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status.replace(/_/g, " ")}</Badge>
                </TableCell>
                <TableCell>
                  <NativeSelect
                    className="w-40"
                    value={r.status}
                    onChange={(e) =>
                      updateStatus(r.id, e.target.value as ShipmentRequestStatus)
                    }
                    aria-label={`Update status for ${r.customerName}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
