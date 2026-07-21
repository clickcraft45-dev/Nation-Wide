import type { ShipmentAdminDetailDto } from "@nationwide/shared-types";

export function ShipmentDetailPanel({ shipment }: { shipment: ShipmentAdminDetailDto }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Tracking number</p>
        <p className="font-mono text-lg">{shipment.internalTrackingNumber}</p>
        <p className="mt-2 text-sm">
          Status:{" "}
          <span className="font-medium">
            {shipment.currentStatus ?? "Not yet available"}
          </span>
        </p>
        <p className="text-xs text-zinc-500">
          Provider: {shipment.providerCode} — Last synced:{" "}
          {shipment.lastSyncedAt ? new Date(shipment.lastSyncedAt).toLocaleString() : "never"}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">External tracking numbers</p>
        {shipment.externalTrackingNumbers.length === 0 ? (
          <p className="text-sm text-zinc-500">No carrier tracking number mapped yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {shipment.externalTrackingNumbers.map((etn) => (
              <li key={etn.id} className="font-mono">
                {etn.externalTrackingNumber}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Raw event history</p>
        {shipment.events.length === 0 ? (
          <p className="text-sm text-zinc-500">No tracking events yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 pr-4">Time</th>
                <th className="py-1 pr-4">Raw status</th>
                <th className="py-1 pr-4">Canonical status</th>
                <th className="py-1">Location</th>
              </tr>
            </thead>
            <tbody>
              {shipment.events.map((event) => (
                <tr key={event.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-1 pr-4">{new Date(event.eventTime).toLocaleString()}</td>
                  <td className="py-1 pr-4 font-mono">{event.rawStatus}</td>
                  <td className="py-1 pr-4">{event.canonicalStatusLabel}</td>
                  <td className="py-1">{event.location ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
