"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, User, Truck } from "lucide-react";
import type { PickupDto, PickupStatusCode } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PickupStatusBadge } from "@/components/ui/status-badge";
import { ManagePickupDialog } from "@/components/pickups/manage-pickup-dialog";

export default function AdminPickupDetailPage() {
  const params = useParams<{ id: string }>();
  const [pickup, setPickup] = useState<PickupDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PickupDto>(`/admin/pickups/${params.id}`)
      .then(setPickup)
      .catch((err) => {
        setError(
          err instanceof ApiError && err.status === 404
            ? "Pickup not found."
            : "Failed to load this pickup.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refetching when the route param changes is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function save(update: { status: PickupStatusCode; weightVerifiedKg?: number; notes?: string }) {
    try {
      await apiClient.patch(`/admin/pickups/${params.id}/status`, update);
      showToast({ variant: "success", title: "Pickup updated" });
      load();
    } catch {
      showToast({ variant: "error", title: "Couldn't update the pickup. Please try again." });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/admin/pickups"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to pickups
      </Link>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && pickup && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                {pickup.method === "PICKUP" ? "Pickup" : "Warehouse Drop-off"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Created {new Date(pickup.createdAt).toLocaleString()}
              </p>
            </div>
            <PickupStatusBadge status={pickup.status} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" aria-hidden />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium text-foreground">{pickup.customerName}</p>
              <p className="text-muted-foreground">{pickup.customerPhone}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4 w-4" aria-hidden />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {pickup.method === "PICKUP" && (
                <p>
                  <span className="text-muted-foreground">Scheduled: </span>
                  {pickup.scheduledDate} · {pickup.scheduledTimeSlot}
                </p>
              )}
              {pickup.assignedStaffEmail && (
                <p>
                  <span className="text-muted-foreground">Assigned to: </span>
                  {pickup.assignedStaffEmail}
                </p>
              )}
              {pickup.confirmedByAdminEmail && (
                <p>
                  <span className="text-muted-foreground">Confirmed by: </span>
                  {pickup.confirmedByAdminEmail}
                  {pickup.confirmedAt && ` on ${new Date(pickup.confirmedAt).toLocaleString()}`}
                </p>
              )}
              {pickup.weightVerifiedKg != null && (
                <p>
                  <span className="text-muted-foreground">Verified weight: </span>
                  {pickup.weightVerifiedKg}kg
                </p>
              )}
              {pickup.notes && (
                <p>
                  <span className="text-muted-foreground">Notes: </span>
                  {pickup.notes}
                </p>
              )}
            </CardContent>
          </Card>

          <ManagePickupDialog
            pickup={pickup}
            onSave={save}
            trigger={<Button size="sm">Manage status</Button>}
          />
        </>
      )}
    </div>
  );
}
