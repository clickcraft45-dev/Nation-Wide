"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, CalendarClock, Inbox, MapPinPen, Trash2 } from "lucide-react";
import type {
  PickupPartnerDto,
  PickupRequestDto,
  PickupRequestStatusCode,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { distanceKm } from "@/lib/google-maps";
import { formatDateTime } from "@/lib/utils/format-date-time";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RescheduleDialog, PICKUP_SLOT_LABELS } from "@/components/pickup-requests/reschedule-dialog";
import { CancelPickupDialog } from "@/components/pickup-requests/cancel-pickup-dialog";
import { EditAddressDialog } from "@/components/pickup-requests/edit-address-dialog";

/** A new request shows up without a reload, at the partner app's own cadence. */
const REFRESH_MS = 30_000;

/** On a partner's plate: assigned and not yet finished. */
const ACTIVE_STATUSES: PickupRequestStatusCode[] = [
  "ASSIGNED",
  "SCHEDULED",
  "OUT_FOR_PICKUP",
  "VERIFICATION_PENDING",
];

type Tab = "unassigned" | "assigned";

function slotLabel(slot: string | null): string {
  if (!slot) return "no slot";
  return PICKUP_SLOT_LABELS[slot as keyof typeof PICKUP_SLOT_LABELS] ?? slot;
}

/** Whether the partner has said yes, for the Assigned tab. */
function acceptance(p: PickupRequestDto): { text: string; accepted: boolean } {
  if (p.status === "SCHEDULED") {
    const moved = p.rescheduledAt != null && p.acceptedAt === p.rescheduledAt;
    return { text: moved ? "Moved by partner, accepted" : "Accepted", accepted: true };
  }
  return { text: "Waiting for partner to accept", accepted: false };
}

const ICON_BUTTON =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted disabled:pointer-events-none disabled:opacity-40";

function partnerName(p: PickupPartnerDto): string {
  return p.name ?? p.email;
}

function shipmentLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

/** Can still be handed to someone else: assigned, but the partner is not at the door yet. */
function isReassignable(p: PickupRequestDto): boolean {
  return (p.status === "ASSIGNED" || p.status === "SCHEDULED") && !p.arrivedAt;
}

/**
 * Where every pickup request is handed to a partner. Partners do not see or take requests
 * themselves: each one waits here, PENDING_ASSIGNMENT, until staff choose who collects it.
 * Partners are offered nearest first (from where their phone last reported) with how many
 * pickups they already have.
 */
export default function AdminPickupAssignmentsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("unassigned");
  const [requests, setRequests] = useState<PickupRequestDto[]>([]);
  const [partners, setPartners] = useState<PickupPartnerDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The partner picked on each row, by pickup id. */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);

  function load() {
    const statuses: PickupRequestStatusCode[] = ["PENDING_ASSIGNMENT", ...ACTIVE_STATUSES];
    Promise.all([
      ...statuses.map((status) =>
        apiClient.get<PickupRequestDto[]>(`/admin/pickup-requests?status=${status}`),
      ),
      apiClient.get<PickupPartnerDto[]>("/admin/pickup-partners"),
    ])
      .then((results) => {
        const allPartners = results.pop() as PickupPartnerDto[];
        setRequests((results as PickupRequestDto[][]).flat().filter((p) => !p.dropAtWarehouse));
        setPartners(allPartners.filter((p) => p.isActive));
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, "Failed to load pickup requests.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // isLoading starts true; load() itself only sets state once the fetch settles.
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const workload = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of requests) {
      if (p.assignedPartnerId && ACTIVE_STATUSES.includes(p.status)) {
        counts.set(p.assignedPartnerId, (counts.get(p.assignedPartnerId) ?? 0) + 1);
      }
    }
    return counts;
  }, [requests]);

  // Oldest first: whoever has waited longest is collected first.
  const unassigned = useMemo(
    () =>
      requests
        .filter((p) => p.status === "PENDING_ASSIGNMENT" && !p.assignedPartnerId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [requests],
  );
  const reassignable = useMemo(
    () =>
      requests
        .filter(isReassignable)
        .sort((a, b) => (a.pickupDate ?? "").localeCompare(b.pickupDate ?? "")),
    [requests],
  );
  const rows = tab === "unassigned" ? unassigned : reassignable;

  /** Partners for one pickup, nearest first when both it and the partner have a location. */
  function partnerOptions(pickup: PickupRequestDto) {
    const pin =
      pickup.pickupLatitude != null && pickup.pickupLongitude != null
        ? { lat: pickup.pickupLatitude, lng: pickup.pickupLongitude }
        : null;
    return partners
      .map((partner) => ({
        partner,
        km:
          pin && partner.lastLatitude != null && partner.lastLongitude != null
            ? distanceKm(pin, { lat: partner.lastLatitude, lng: partner.lastLongitude })
            : null,
        load: workload.get(partner.id) ?? 0,
      }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.load - b.load);
  }

  async function assign(pickup: PickupRequestDto) {
    const partnerId = picked[pickup.id];
    if (!partnerId) return;
    setAssigningId(pickup.id);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `/admin/pickup-requests/${pickup.id}/assign`,
        { partnerId },
      );
      setRequests((all) => all.map((p) => (p.id === updated.id ? updated : p)));
      setPicked((all) => ({ ...all, [pickup.id]: "" }));
      showToast({
        variant: "success",
        title: `${updated.pickupContactName}: assigned to ${updated.assignedPartnerName ?? "partner"}`,
      });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't assign the partner.") });
      load();
    } finally {
      setAssigningId(null);
    }
  }

  function replace(updated: PickupRequestDto) {
    setRequests((all) => all.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function remove(pickup: PickupRequestDto) {
    try {
      await apiClient.delete(`/admin/pickup-requests/${pickup.id}`);
      setRequests((all) => all.filter((p) => p.id !== pickup.id));
      showToast({ variant: "success", title: `Pickup for ${pickup.customerName} deleted` });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't delete the pickup.") });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pickup Assignments</h1>
        <p className="text-sm text-muted-foreground">
          Every pickup request waits here until you choose the partner who collects it. The partner
          accepts it or asks for another time. Reschedule, cancel or delete a pickup from its row.
        </p>
      </div>

      <SegmentedControl
        ariaLabel="Which pickups"
        options={[
          { value: "unassigned", label: `To assign (${unassigned.length})` },
          { value: "assigned", label: `Assigned, not started (${reassignable.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {isLoading && <TableSkeleton columns={6} />}
      {!isLoading && error && <ErrorState message={error} onRetry={() => {
            setIsLoading(true);
            load();
          }} />}
      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          icon={<Inbox className="h-8 w-8" aria-hidden />}
          title={tab === "unassigned" ? "Nothing to assign" : "No pickups waiting to start"}
          description={
            tab === "unassigned"
              ? "New pickup requests appear here as customers book them."
              : "Pickups a partner has not reached yet can be reassigned from here."
          }
        />
      )}
      {!isLoading && !error && rows.length > 0 && partners.length === 0 && (
        <p className="text-sm text-warning">
          There are no active pickup partners. Add one under{" "}
          <Link href="/admin/people" className="font-medium underline">
            People
          </Link>
          .
        </p>
      )}

      {!isLoading && !error && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Pickup</TableHead>
              <TableHead>Parcel</TableHead>
              <TableHead>{tab === "unassigned" ? "Waiting since" : "Assigned to"}</TableHead>
              <TableHead className="min-w-64">{tab === "unassigned" ? "Partner" : "Reassign to"}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const selectId = `assign-${p.id}`;
              const choice = picked[p.id] ?? "";
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/admin/pickup-requests/${p.id}`}
                      className="font-medium text-foreground hover:underline focus-visible:underline"
                    >
                      {p.customerName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{p.pickupContactPhone}</p>
                  </TableCell>
                  <TableCell className="max-w-64">
                    <p className="truncate text-foreground">
                      {p.pickupAddressLine1}, {p.pickupCity}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.pickupDate ?? "No date"} · {slotLabel(p.pickupTimeSlot)}
                      {p.pickupLatitude == null && " · no map pin"}
                    </p>
                    {p.rescheduleReason && (
                      <p className="truncate text-xs text-muted-foreground" title={p.rescheduleReason}>
                        Moved: {p.rescheduleReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {p.estimatedWeightKg > 0
                      ? `${shipmentLabel(p.shipmentType)} · ${p.estimatedWeightKg} kg`
                      : "Taken at the door"}
                    <p className="text-xs">
                      {p.estimatedPrice > 0
                        ? `${p.currency} ${Math.round(p.estimatedPrice).toLocaleString("en-IN")}`
                        : "Priced at pickup"}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {tab === "unassigned" ? (
                      formatDateTime(p.createdAt)
                    ) : (
                      <>
                        {p.assignedPartnerName ?? "—"}
                        <p className={acceptance(p).accepted ? "text-xs text-success" : "text-xs text-warning"}>
                          {acceptance(p).text}
                        </p>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <label htmlFor={selectId} className="sr-only">
                      Partner for {p.customerName}
                    </label>
                    <select
                      id={selectId}
                      value={choice}
                      disabled={partners.length === 0 || assigningId === p.id}
                      onChange={(e) => setPicked((all) => ({ ...all, [p.id]: e.target.value }))}
                      className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <option value="">Choose a partner…</option>
                      {partnerOptions(p)
                        .filter(({ partner }) => partner.id !== p.assignedPartnerId)
                        .map(({ partner, km, load }) => (
                          <option key={partner.id} value={partner.id}>
                            {[
                              partnerName(partner),
                              km != null ? `${km.toFixed(1)} km` : null,
                              `${load} active`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </option>
                        ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        onClick={() => assign(p)}
                        isLoading={assigningId === p.id}
                        disabled={!choice || (assigningId !== null && assigningId !== p.id)}
                      >
                        {tab === "unassigned" ? "Assign" : "Reassign"}
                      </Button>
                      <RescheduleDialog
                        pickup={p}
                        endpoint={`/admin/pickup-requests/${p.id}/reschedule`}
                        description={
                          p.assignedPartnerId
                            ? `${p.customerName}, now ${p.pickupDate ?? "no date"} · ${slotLabel(p.pickupTimeSlot)}. The customer gets the new time on WhatsApp, and ${p.assignedPartnerName ?? "the partner"} is asked to accept it again.`
                            : undefined
                        }
                        onDone={(updated) => {
                          replace(updated);
                          showToast({ variant: "success", title: `Pickup for ${updated.customerName} moved` });
                        }}
                        trigger={
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={`Reschedule pickup for ${p.customerName}`}
                            title="Reschedule"
                          >
                            <CalendarClock className="h-4 w-4" aria-hidden />
                          </button>
                        }
                      />
                      <EditAddressDialog
                        pickup={p}
                        endpoint={`/admin/pickup-requests/${p.id}/address`}
                        onDone={(updated) => {
                          replace(updated);
                          showToast({ variant: "success", title: `Address saved for ${updated.customerName}` });
                        }}
                        trigger={
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={`Edit pickup address for ${p.customerName}`}
                            title="Edit address"
                          >
                            <MapPinPen className="h-4 w-4" aria-hidden />
                          </button>
                        }
                      />
                      <CancelPickupDialog
                        pickup={p}
                        onDone={(updated) => {
                          setRequests((all) => all.filter((r) => r.id !== updated.id));
                          showToast({ variant: "success", title: `Pickup for ${updated.customerName} cancelled` });
                        }}
                        trigger={
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={`Cancel pickup for ${p.customerName}`}
                            title="Cancel pickup"
                          >
                            <Ban className="h-4 w-4" aria-hidden />
                          </button>
                        }
                      />
                      <ConfirmDialog
                        title={`Delete the pickup for ${p.customerName}?`}
                        description="For duplicates and bookings made by mistake. It is removed for good and the audit log keeps a record. To keep its history, cancel it instead."
                        confirmLabel="Delete pickup"
                        variant="danger"
                        onConfirm={() => remove(p)}
                        trigger={
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={`Delete pickup for ${p.customerName}`}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
