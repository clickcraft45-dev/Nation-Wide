"use client";

import { useEffect, useState } from "react";
import type { IntegrationHealthDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";

const PROVIDER_CODE = "ICL";

export default function AdminIntegrationsPage() {
  const [health, setHealth] = useState<IntegrationHealthDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<IntegrationHealthDto>(`/admin/integrations/${PROVIDER_CODE}/health`)
      .then(setHealth)
      .catch(() => setError("Failed to load integration health."))
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
        <h1 className="text-xl font-semibold text-foreground">Integration health</h1>
        <p className="text-sm text-muted-foreground">
          Live call metrics for each shipping provider adapter.
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {isLoading && !error && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {health && !isLoading && !error && (
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
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
