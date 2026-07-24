"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, Package, User, Truck, Receipt } from "lucide-react";
import type { QuoteAdminDetailDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteStatusBadge } from "@/components/ui/status-badge";

function AddressBlock({
  address,
}: {
  address: QuoteAdminDetailDto["origin"] | QuoteAdminDetailDto["destination"];
}) {
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium text-foreground">{address.name}</p>
      <p className="text-muted-foreground">{address.phone}</p>
      <p className="text-muted-foreground">
        {address.addressLine1}
        {address.addressLine2 ? `, ${address.addressLine2}` : ""}
      </p>
      <p className="text-muted-foreground">
        {address.city}, {address.state} {address.postalCode}
      </p>
      <p className="text-muted-foreground">{address.country}</p>
      {"instructions" in address && address.instructions && (
        <p className="text-xs italic text-muted-foreground">Note: {address.instructions}</p>
      )}
    </div>
  );
}

export default function AdminQuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const [quote, setQuote] = useState<QuoteAdminDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    setError(null);

    apiClient
      .get<QuoteAdminDetailDto>(`/admin/quotes/${params.id}`)
      .then((res) => {
        if (!cancelled) setQuote(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Quote not found."
            : "Failed to load this quote.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/quotes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to quote requests
      </Link>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && quote && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Quote {quote.id.slice(0, 8)}
              </h1>
              <p className="text-sm text-muted-foreground">
                Submitted {new Date(quote.createdAt).toLocaleString()}
              </p>
            </div>
            <QuoteStatusBadge status={quote.status} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" aria-hidden />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium text-foreground">{quote.customerName}</p>
              <p className="text-muted-foreground">{quote.customerPhone}</p>
              {quote.customerEmail && (
                <p className="text-muted-foreground">{quote.customerEmail}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" aria-hidden />
                Shipment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Type: </span>
                {quote.shipmentType.charAt(0) + quote.shipmentType.slice(1).toLowerCase()}
              </p>
              <p>
                <span className="text-muted-foreground">Weight: </span>
                {quote.weightKg}kg
              </p>
              {quote.description && (
                <p>
                  <span className="text-muted-foreground">Contents: </span>
                  {quote.description}
                </p>
              )}
              {quote.reviewReason && (
                <p className="text-warning">
                  Flagged: {quote.reviewReason.replace(/_/g, " ").toLowerCase()}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" aria-hidden />
                  Origin
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AddressBlock address={quote.origin} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" aria-hidden />
                  Destination
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AddressBlock address={quote.destination} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4 w-4" aria-hidden />
                Fulfillment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium text-foreground">
                {quote.fulfillmentMethod === "PICKUP" ? "Pickup" : "Warehouse Drop-off"}
              </p>
              {quote.fulfillmentMethod === "PICKUP" && (
                <p className="text-muted-foreground">
                  {quote.pickupDate} · {quote.pickupTimeSlot}
                </p>
              )}
              {quote.orderId && (
                <Link
                  href={`/admin/orders/${quote.orderId}`}
                  className="inline-block text-primary hover:underline"
                >
                  View order →
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" aria-hidden />
                Quote
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Amount: </span>
                {quote.quotedAmount
                  ? `${quote.quotedCurrency ?? "INR"} ${quote.quotedAmount.toLocaleString("en-IN")}`
                  : "Not yet quoted"}
              </p>
              {quote.quotedByAdminEmail && (
                <p className="text-muted-foreground">Quoted by {quote.quotedByAdminEmail}</p>
              )}
              {quote.rejectionReason && (
                <p className="text-danger">Rejected: {quote.rejectionReason}</p>
              )}
              {quote.internalNotes && (
                <p className="text-muted-foreground">
                  <span className="italic">Internal notes:</span> {quote.internalNotes}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
