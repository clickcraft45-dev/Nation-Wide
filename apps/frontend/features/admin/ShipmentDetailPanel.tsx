import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ShipmentAdminDetailDto } from "@nationwide/shared-types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/page-state";

export function ShipmentDetailPanel({ shipment }: { shipment: ShipmentAdminDetailDto }) {
  const latestEvent = shipment.events[shipment.events.length - 1];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Tracking number</p>
              <p className="font-mono text-lg text-foreground">
                {shipment.internalTrackingNumber}
              </p>
            </div>
            <TrackingStatusBadge status={shipment.currentStatus} />
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Order</dt>
              <dd>
                <Link
                  href={`/admin/orders/${shipment.orderId}`}
                  className="font-medium text-primary hover:underline"
                >
                  View order
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Provider</dt>
              <dd className="flex items-center gap-1.5 text-foreground">
                {shipment.providerCode}
                <Link
                  href="/admin/integrations"
                  aria-label="View provider details"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Current location</dt>
              <dd className="text-foreground">{latestEvent?.location ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Estimated delivery</dt>
              <dd className="text-muted-foreground">Not tracked yet</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Last synced</dt>
              <dd className="text-foreground">
                {shipment.lastSyncedAt
                  ? new Date(shipment.lastSyncedAt).toLocaleString()
                  : "Never"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>External tracking numbers</CardTitle>
        </CardHeader>
        <CardContent>
          {shipment.externalTrackingNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No carrier tracking number mapped yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {shipment.externalTrackingNumbers.map((etn) => (
                <li key={etn.id} className="font-mono text-foreground">
                  {etn.externalTrackingNumber}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tracking timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {shipment.events.length === 0 ? (
            <EmptyState title="No tracking events yet" />
          ) : (
            <ol className="space-y-4">
              {[...shipment.events].reverse().map((event, i) => (
                <li key={event.id} className="relative pl-5">
                  {i !== shipment.events.length - 1 && (
                    <span className="absolute left-[3px] top-3 h-full w-px bg-border" aria-hidden />
                  )}
                  <span
                    className="absolute left-0 top-1 h-2 w-2 rounded-full bg-primary"
                    aria-hidden
                  />
                  <p className="text-sm font-medium text-foreground">
                    {event.canonicalStatusLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.eventTime).toLocaleString()}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    raw: {event.rawStatus}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
