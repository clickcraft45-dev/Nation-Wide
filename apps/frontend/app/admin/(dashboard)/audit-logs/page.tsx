"use client";

import { useEffect, useState } from "react";
import type { AuditLogEntryDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
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
import { History } from "lucide-react";

export default function AdminAuditLogsPage() {
  const [entries, setEntries] = useState<AuditLogEntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<AuditLogEntryDto[]>("/admin/audit-logs")
      .then(setEntries)
      .catch(() => setError("Failed to load the audit log."))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every staff mutation, recorded for compliance.</p>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && isLoading && <TableSkeleton columns={5} />}

      {!error && !isLoading && entries.length === 0 && (
        <EmptyState
          icon={<History className="h-8 w-8" aria-hidden />}
          title="No admin actions recorded yet"
        />
      )}

      {!error && !isLoading && entries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>{entry.actorEmail}</TableCell>
                <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                <TableCell>
                  {entry.entity}
                  <br />
                  <span className="text-xs text-muted-foreground">{entry.entityId}</span>
                </TableCell>
                <TableCell>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                    {JSON.stringify(entry.before)} → {JSON.stringify(entry.after)}
                  </pre>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
