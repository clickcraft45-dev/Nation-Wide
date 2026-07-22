import type { AuditLogEntryDto } from "@nationwide/shared-types";
import { MapPin, Link2, Activity } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page-state";

const ACTION_LABEL: Record<string, string> = {
  OVERRIDE_TRACKING_STATUS: "Tracking status updated",
  MAP_EXTERNAL_TRACKING_NUMBER: "Tracking number mapped",
};

const ACTION_ICON: Record<string, typeof MapPin> = {
  OVERRIDE_TRACKING_STATUS: MapPin,
  MAP_EXTERNAL_TRACKING_NUMBER: Link2,
};

function describe(entry: AuditLogEntryDto): string {
  const label = ACTION_LABEL[entry.action] ?? entry.action.replace(/_/g, " ").toLowerCase();
  return `${label} — ${entry.entity} ${entry.entityId.slice(0, 8)}`;
}

export function RecentActivity({
  entries,
  isLoading,
}: {
  entries: AuditLogEntryDto[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!isLoading && entries.length === 0 && (
          <EmptyState
            icon={<Activity className="h-8 w-8" aria-hidden />}
            title="No activity yet"
            description="Staff actions like tracking overrides and number mappings will show up here."
          />
        )}
        {!isLoading && entries.length > 0 && (
          <ol className="space-y-4">
            {entries.slice(0, 8).map((entry) => {
              const Icon = ACTION_ICON[entry.action] ?? Activity;
              return (
                <li key={entry.id} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{describe(entry)}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.actorEmail} · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
