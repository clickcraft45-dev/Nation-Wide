"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { PickupRequestDto, PaymentMethodCode } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";

const PAYMENT_METHOD_LABEL: Record<PaymentMethodCode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  RAZORPAY: "Card",
};

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function AdminPickupRequestDetailPage() {
  const params = useParams<{ id: string }>();

  const [pickup, setPickup] = useState<PickupRequestDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PickupRequestDto>(`/admin/pickup-requests/${params.id}`)
      .then(setPickup)
      .catch((err) => {
        setError(err instanceof ApiError ? "Couldn't load this pickup request." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // One-shot lookup keyed off the route param, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !pickup) {
    return <ErrorState message={error ?? "Pickup request not found."} onRetry={load} />;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/pickup-requests"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to pickup requests
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{pickup.customerName}</h1>
          <p className="text-sm text-muted-foreground">{pickup.customerPhone}</p>
        </div>
        <PickupRequestStatusBadge status={pickup.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Currently assigned to{" "}
            <span className="font-medium text-foreground">
              {pickup.assignedPartnerName ?? "no one yet"}
            </span>
            .
          </p>
          {pickup.arrivedAt && (
            <p className="text-sm text-muted-foreground">
              Partner arrived at pickup{" "}
              <span className="font-medium text-foreground">
                {new Date(pickup.arrivedAt).toLocaleString()}
              </span>
              .
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pickup Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-muted-foreground">Pickup Address</p>
            <p className="font-medium text-foreground">
              {pickup.dropAtWarehouse
                ? "Warehouse drop-off"
                : `${pickup.pickupAddressLine1}${pickup.pickupAddressLine2 ? `, ${pickup.pickupAddressLine2}` : ""}, ${pickup.pickupCity}, ${pickup.pickupState} ${pickup.pickupPostalCode}`}
            </p>
          </div>
          {!pickup.dropAtWarehouse && (
            <div>
              <p className="text-muted-foreground">Scheduled</p>
              <p className="font-medium text-foreground">
                {pickup.pickupDate ?? "—"} · {pickup.pickupTimeSlot ?? "—"}
              </p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Destination</p>
            <p className="font-medium text-foreground">
              {pickup.destCity}, {pickup.destState}, {pickup.destCountry}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Carrier</p>
            <p className="font-medium text-foreground">{pickup.rateProviderName ?? "Manually quoted"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Estimated Quote</p>
            <p className="font-medium text-foreground">
              {formatMoney(pickup.estimatedPrice, pickup.currency)}
            </p>
          </div>
        </CardContent>
      </Card>

      {pickup.verifiedAt && (
        <Card>
          <CardHeader>
            <CardTitle>Verification History</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Verified Weight</p>
              <p className="font-medium text-foreground">{pickup.verifiedWeightKg}kg</p>
            </div>
            <div>
              <p className="text-muted-foreground">Verified Quote</p>
              <p className="font-medium text-foreground">
                {pickup.verifiedPrice !== null ? formatMoney(pickup.verifiedPrice, pickup.currency) : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Verified At</p>
              <p className="font-medium text-foreground">
                {new Date(pickup.verifiedAt).toLocaleString()}
              </p>
            </div>
            {pickup.verificationNotes && (
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Notes</p>
                <p className="font-medium text-foreground">{pickup.verificationNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {pickup.paymentCollectedAt && (
        <Card>
          <CardHeader>
            <CardTitle>Collected Payment</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Method</p>
              <p className="font-medium text-foreground">
                {pickup.paymentMethod ? PAYMENT_METHOD_LABEL[pickup.paymentMethod] : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Amount</p>
              <p className="font-medium text-foreground">
                {pickup.collectedAmount !== null
                  ? formatMoney(pickup.collectedAmount, pickup.currency)
                  : "—"}
              </p>
            </div>
            {pickup.paymentReference && (
              <div>
                <p className="text-muted-foreground">Reference</p>
                <p className="font-medium text-foreground">{pickup.paymentReference}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {pickup.status === "COMPLETED" && pickup.orderId && (
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <p className="text-sm font-medium text-success">
              Order generated and ready for carrier assignment / AWB mapping.
            </p>
            <Link href={`/admin/orders/${pickup.orderId}`}>
              <Button variant="secondary" size="sm">
                View Order
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {pickup.status === "REJECTED" && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-danger">Rejected: {pickup.rejectionReason}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
