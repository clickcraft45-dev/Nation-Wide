"use client";

import { useEffect, useState } from "react";
import type { AuditLogEntryDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";

export default function AdminAuditLogsPage() {
  const [entries, setEntries] = useState<AuditLogEntryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<AuditLogEntryDto[]>("/admin/audit-logs")
      .then(setEntries)
      .catch(() => setError("Failed to load the audit log."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Audit log</h1>
      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isLoading && !error && entries.length === 0 && (
        <p className="text-sm text-zinc-500">No admin actions recorded yet.</p>
      )}
      {entries.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1 pr-4">When</th>
              <th className="py-1 pr-4">Actor</th>
              <th className="py-1 pr-4">Action</th>
              <th className="py-1 pr-4">Entity</th>
              <th className="py-1">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                <td className="py-2 pr-4 whitespace-nowrap">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4">{entry.actorEmail}</td>
                <td className="py-2 pr-4 font-mono text-xs">{entry.action}</td>
                <td className="py-2 pr-4">
                  {entry.entity}
                  <br />
                  <span className="text-xs text-zinc-500">{entry.entityId}</span>
                </td>
                <td className="py-2">
                  <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-500">
                    {JSON.stringify(entry.before)} → {JSON.stringify(entry.after)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
