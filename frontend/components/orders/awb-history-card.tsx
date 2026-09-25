"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import type { AuditLogEntryDto, ShipmentSummaryDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** The AWB before and after one mapping, as the audit log recorded it. */
function awbOf(value: unknown): string {
  if (value && typeof value === "object" && "externalTrackingNumber" in value) {
    const awb = (value as { externalTrackingNumber: unknown }).externalTrackingNumber;
    if (typeof awb === "string" && awb.length > 0) return awb;
  }
  return "none";
}

/**
 * Every time an AWB on this order was set or changed, and by whom.
 *
 * Read straight off the audit log rather than a second history table: mapping already writes an
 * entry there with the old and new number, which is exactly the question being asked when a
 * parcel is being chased on the carrier's number.
 */
export function AwbHistoryCard({ shipments }: { shipments: ShipmentSummaryDto[] }) {
  const [entries, setEntries] = useState<AuditLogEntryDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      shipments.map((shipment) =>
        apiClient
          .get<AuditLogEntryDto[]>(
            `/admin/audit-logs?entity=Shipment&entityId=${shipment.id}`,
          )
          .catch(() => []),
      ),
    ).then((results) => {
      if (cancelled) return;
      setEntries(
        results
          .flat()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [shipments]);

  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" aria-hidden />
          AWB history
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {entries.map((entry) => (
          <div key={entry.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
            <p className="font-medium text-foreground">
              {awbOf(entry.before)} → {awbOf(entry.after)}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString("en-IN")} · {entry.actorEmail}
              {entry.reason ? ` · ${entry.reason}` : ""}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
