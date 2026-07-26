"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AuditLogEntryDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/page-state";
import { History } from "lucide-react";

// Reuses the existing /admin/audit-logs endpoint scoped to this one rate — no dedicated
// rate-history endpoint needed, every create/update/activate/deactivate already writes a
// field-level AuditLog row against entity 'WeightSlab'.
export function RateHistoryDialog({ trigger, rateId }: { trigger: ReactNode; rateId: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditLogEntryDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  function load() {
    setIsLoading(true);
    apiClient
      .get<AuditLogEntryDto[]>(`/admin/audit-logs?entity=WeightSlab&entityId=${rateId}`)
      .then(setEntries)
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    if (!open) return;
    // The trigger is a plain span (not RadixDialog.Trigger), so opening never goes through
    // Radix's own onOpenChange — this effect on `open` is what actually fires the fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rateId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title="Rate history">
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {isLoading && <TableSkeleton columns={2} />}
            {!isLoading && entries.length === 0 && (
              <EmptyState icon={<History className="h-6 w-6" aria-hidden />} title="No changes recorded yet" />
            )}
            {!isLoading &&
              entries.map((entry) => (
                <div key={entry.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {entry.action.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.actorEmail}</p>
                  <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                    {JSON.stringify(entry.before)} → {JSON.stringify(entry.after)}
                  </pre>
                </div>
              ))}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
