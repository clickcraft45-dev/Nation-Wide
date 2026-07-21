"use client";

import { useEffect, useState } from "react";
import type { IntegrationHealthDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";

const PROVIDER_CODE = "ICL";

export default function AdminIntegrationsPage() {
  const [health, setHealth] = useState<IntegrationHealthDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<IntegrationHealthDto>(`/admin/integrations/${PROVIDER_CODE}/health`)
      .then(setHealth)
      .catch(() => setError("Failed to load integration health."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Integration health</h1>
      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {health && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Provider" value={health.providerCode} />
          <Stat label="Calls (last window)" value={String(health.totalCalls)} />
          <Stat label="Successes" value={String(health.successCount)} />
          <Stat label="Errors" value={String(health.errorCount)} />
          <Stat label="Error rate" value={`${health.errorRatePercent}%`} />
          <Stat
            label="Avg latency"
            value={health.avgLatencyMs === null ? "—" : `${health.avgLatencyMs} ms`}
          />
          <Stat
            label="Last call"
            value={health.lastCallAt ? new Date(health.lastCallAt).toLocaleString() : "never"}
          />
          <Stat
            label="Last error"
            value={
              health.lastError
                ? `${health.lastError.message} (${new Date(health.lastError.occurredAt).toLocaleString()})`
                : "none"
            }
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
