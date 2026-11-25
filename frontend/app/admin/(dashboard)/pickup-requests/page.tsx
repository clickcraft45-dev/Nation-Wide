"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, ClipboardList, RefreshCw } from "lucide-react";
import type { PickupPartnerDto, PickupRequestDto, PickupRequestStatusCode } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils/format-date-time";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";
import { PickupsMap, type MapPoint } from "@/components/ui/pickups-map";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Partner positions refresh this often while the map is open. */
const PARTNER_REFRESH_MS = 30_000;
/** A position older than this is drawn grey: the partner's app has not been open since. */
const STALE_AFTER_MS = 30 * 60_000;
const PARTNER_COLOR = "#0b0b0c";
const STALE_COLOR = "#a1a1aa";
const ACTIVE_STATUSES: PickupRequestStatusCode[] = ["ASSIGNED", "SCHEDULED", "OUT_FOR_PICKUP", "VERIFICATION_PENDING"];

function lastSeen(iso: string | null, now: number): string {
  if (!iso) return "never reported";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Colour by where the pickup is in its life, so the map reads at a glance.
function statusColor(status: PickupRequestStatusCode): string {
  if (status === "PENDING_ASSIGNMENT") return "#ea580c";
  if (status === "COMPLETED") return "#6b7280";
  if (status === "CANCELLED" || status === "REJECTED") return "#9ca3af";
  return "#16a34a";
}

// ponytail: exact single-status match, so SCHEDULED / OUT_FOR_PICKUP / CANCELLED / REJECTED
// only show under "All". Group them into tabs (backend `in` filter) if they need their own view.
const STATUS_TABS: { value: PickupRequestStatusCode | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING_ASSIGNMENT", label: "Pending" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "VERIFICATION_PENDING", label: "Verification" },
  { value: "COMPLETED", label: "Completed" },
];

export default function AdminPickupRequestsPage() {
  const [pickupRequests, setPickupRequests] = useState<PickupRequestDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PickupRequestStatusCode | "">("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const { showToast } = useToast();
  const [partners, setPartners] = useState<PickupPartnerDto[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [showPartners, setShowPartners] = useState(true);
  const [askingId, setAskingId] = useState<string | null>(null);
  // Re-read on each partner refresh, so "4 min ago" does not freeze while the map stays open.
  const [now, setNow] = useState(() => Date.now());

  function loadPartners() {
    setPartnersLoading(true);
    apiClient
      .get<PickupPartnerDto[]>("/admin/pickup-partners")
      .then((rows) => {
        setPartners(rows.filter((p) => p.isActive));
        setNow(Date.now());
      })
      .catch(() => {})
      .finally(() => setPartnersLoading(false));
  }

  useEffect(() => {
    if (view !== "map") return;
    // Polling while the map is on screen, not a one-shot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPartners();
    const timer = setInterval(loadPartners, PARTNER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [view]);

  async function askForLocation(partner: PickupPartnerDto) {
    setAskingId(partner.id);
    try {
      await apiClient.post(`/admin/pickup-partners/${partner.id}/request-location`, {});
      showToast({
        variant: "success",
        title: `Asked ${partner.name ?? partner.email} for their location`,
        description: "It shows here once they open the notification. This map refreshes every 30 seconds.",
      });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't reach that partner.") });
    } finally {
      setAskingId(null);
    }
  }

  const activeByPartner = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pickupRequests) {
      if (p.assignedPartnerId && ACTIVE_STATUSES.includes(p.status)) {
        counts.set(p.assignedPartnerId, (counts.get(p.assignedPartnerId) ?? 0) + 1);
      }
    }
    return counts;
  }, [pickupRequests]);

  const partnerPoints = useMemo<MapPoint[]>(
    () =>
      showPartners
        ? partners
            .filter((p) => p.lastLatitude != null && p.lastLongitude != null)
            .map((p) => {
              const stale = !p.locationUpdatedAt || now - new Date(p.locationUpdatedAt).getTime() > STALE_AFTER_MS;
              const active = activeByPartner.get(p.id) ?? 0;
              return {
                id: `partner-${p.id}`,
                lat: p.lastLatitude!,
                lng: p.lastLongitude!,
                title: p.name ?? p.email,
                subtitle: `Partner · seen ${lastSeen(p.locationUpdatedAt, now)} · ${active} active pickup${active === 1 ? "" : "s"}`,
                href: `/admin/pickup-partners/${p.id}`,
                linkLabel: "Open partner →",
                color: stale ? STALE_COLOR : PARTNER_COLOR,
                shape: "person" as const,
              };
            })
        : [],
    [partners, showPartners, activeByPartner, now],
  );

  const pickupPoints = useMemo<MapPoint[]>(
    () =>
      pickupRequests
        .filter((p) => p.pickupLatitude != null && p.pickupLongitude != null)
        .map((p) => ({
          id: p.id,
          lat: p.pickupLatitude!,
          lng: p.pickupLongitude!,
          title: p.customerName,
          subtitle: `${p.pickupAddressLine1}, ${p.pickupCity} · ${p.assignedPartnerName ?? "Unassigned"} · ${p.status.replace(/_/g, " ").toLowerCase()}`,
          href: `/admin/pickup-requests/${p.id}`,
          color: statusColor(p.status),
        })),
    [pickupRequests],
  );
  const points = useMemo(() => [...pickupPoints, ...partnerPoints], [pickupPoints, partnerPoints]);

  function load() {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const query = params.toString();

    apiClient
      .get<PickupRequestDto[]>(`/admin/pickup-requests${query ? `?${query}` : ""}`)
      .then(setPickupRequests)
      .catch((err) => {
        setError(errorMessage(err, "Failed to load pickup requests."));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refetching on filter change is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pickup Requests</h1>
        <p className="text-sm text-muted-foreground">
          Pre-order pickups awaiting partner assignment, verification, and acceptance.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl
          ariaLabel="Filter by status"
          options={STATUS_TABS}
          value={status}
          onChange={setStatus}
        />
        <SearchInput
          className="sm:ml-auto sm:w-72"
          placeholder="Customer name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search pickup requests"
        />
        <SegmentedControl
          ariaLabel="View"
          options={[
            { value: "list", label: "List" },
            { value: "map", label: "Map" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "map" && !error && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-9 items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={showPartners}
                onChange={(e) => setShowPartners(e.target.checked)}
              />
              Show partners
            </label>
            <Button size="sm" variant="secondary" onClick={loadPartners} isLoading={partnersLoading}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh locations
            </Button>
          </div>
          <PickupsMap points={points} className="h-[65vh] min-h-96" />
          <p className="text-xs text-muted-foreground">
            <span style={{ color: "#ea580c" }}>●</span> Awaiting a partner ·{" "}
            <span style={{ color: "#16a34a" }}>●</span> In progress ·{" "}
            <span style={{ color: "#6b7280" }}>●</span> Closed
            {showPartners && (
              <>
                {" "}· <span style={{ color: PARTNER_COLOR }}>⬤</span> Partner, seen in the last 30 min ·{" "}
                <span style={{ color: STALE_COLOR }}>⬤</span> Partner, older position
              </>
            )}
            {pickupRequests.length - pickupPoints.length > 0 &&
              ` · ${pickupRequests.length - pickupPoints.length} without a map pin (warehouse drop-offs or typed addresses)`}
          </p>

          {showPartners && partners.length > 0 && (
            <section aria-label="Partner locations" className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Partners</h2>
              <p className="text-xs text-muted-foreground">
                A partner&apos;s phone reports every 2 minutes while their app is open. Ask for a
                location to send them a notification that opens it.
              </p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {partners.map((partner) => {
                  const located = partner.lastLatitude != null && partner.lastLongitude != null;
                  return (
                    <li key={partner.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {partner.name ?? partner.email}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {located ? `Seen ${lastSeen(partner.locationUpdatedAt, now)}` : "No location yet"} ·{" "}
                          {activeByPartner.get(partner.id) ?? 0} active
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => askForLocation(partner)}
                        isLoading={askingId === partner.id}
                        disabled={askingId !== null && askingId !== partner.id}
                      >
                        <BellRing className="h-4 w-4" aria-hidden />
                        Ask for location
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {isLoading && <TableSkeleton columns={7} />}
      {!isLoading && error && <ErrorState message={error} onRetry={load} />}
      {!isLoading && !error && pickupRequests.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" aria-hidden />}
          title="No pickup requests found"
        />
      )}

      {view === "list" && !isLoading && !error && pickupRequests.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Pickup Address</TableHead>
              <TableHead>Carrier</TableHead>
              <TableHead>Quote</TableHead>
              <TableHead>Assigned Partner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pickupRequests.map((p) => (
              <TableRow key={p.id} href={`/admin/pickup-requests/${p.id}`}>
                <TableCell>
                  <span className="font-medium text-foreground">{p.customerName}</span>
                  <p className="text-xs text-muted-foreground">{p.customerPhone}</p>
                </TableCell>
                <TableCell className="max-w-50 truncate text-muted-foreground">
                  {p.dropAtWarehouse ? "Warehouse drop-off" : `${p.pickupCity}, ${p.pickupState}`}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.rateProviderName ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {p.currency} {p.estimatedPrice.toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.assignedPartnerName ?? "Unassigned"}
                </TableCell>
                <TableCell>
                  <PickupRequestStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(p.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
