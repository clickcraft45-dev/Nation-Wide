"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { QuoteDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { QuoteStatusBadge } from "@/components/ui/status-badge";

export default function CustomerQuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<QuoteDto[]>("/quotes/me")
      .then((quotes) => {
        const found = quotes.find((q) => q.id === params.id);
        if (!found) {
          setError("Quote not found.");
          return;
        }
        setQuote(found);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load this quote." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Refetching when the route param changes is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function selectOption(optionId: string) {
    if (!quote) return;
    setSelectingId(optionId);
    try {
      await apiClient.post(`/quotes/${quote.id}/select-option`, { optionId });
      showToast({ variant: "success", title: "Provider selected — your order has been created" });
      load();
    } catch {
      showToast({
        variant: "error",
        title: "We couldn't process your request right now. Please try again.",
      });
    } finally {
      setSelectingId(null);
    }
  }

  async function accept() {
    if (!quote) return;
    setIsAccepting(true);
    try {
      await apiClient.post(`/quotes/${quote.id}/accept`, {});
      showToast({ variant: "success", title: "Quote accepted — your order has been created" });
      load();
    } catch {
      showToast({
        variant: "error",
        title: "We couldn't process your request right now. Please try again.",
      });
    } finally {
      setIsAccepting(false);
    }
  }

  const optionsExpired =
    quote?.status === "RATED" &&
    quote.optionsExpireAt !== null &&
    new Date(quote.optionsExpireAt) < new Date();

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/quotes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to my quotes
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
                {quote.origin.city} → {quote.destination.city}
              </h1>
              <p className="text-sm text-muted-foreground">
                {quote.shipmentType.charAt(0) + quote.shipmentType.slice(1).toLowerCase()} ·{" "}
                {quote.weightKg}kg · Requested {new Date(quote.createdAt).toLocaleDateString()}
              </p>
            </div>
            <QuoteStatusBadge status={quote.status} />
          </div>

          {quote.status === "RATED" && !optionsExpired && (
            <Card>
              <CardHeader>
                <CardTitle>Available shipping options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quote.rateQuoteOptions.map((option) => (
                  <div
                    key={option.id}
                    className="flex items-center justify-between rounded-md border border-border p-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {option.rateProviderName}
                      </p>
                      <p className="text-lg font-semibold text-foreground">
                        {option.currency} {option.finalPrice.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      isLoading={selectingId === option.id}
                      disabled={selectingId !== null}
                      onClick={() => selectOption(option.id)}
                    >
                      Select
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {quote.status === "RATED" && optionsExpired && (
            <Card>
              <CardContent className="pt-5 text-sm text-muted-foreground">
                These prices have expired.{" "}
                <Link href="/quote" className="text-primary hover:underline">
                  Submit a new request
                </Link>{" "}
                to get current pricing.
              </CardContent>
            </Card>
          )}

          {quote.status === "NEEDS_MANUAL_REVIEW" && (
            <Card>
              <CardContent className="pt-5 text-sm text-muted-foreground">
                Our team will review your shipment details and contact you shortly with a
                customized quotation.
              </CardContent>
            </Card>
          )}

          {quote.status === "QUOTED" && quote.quotedAmount != null && (
            <Card>
              <CardHeader>
                <CardTitle>Quoted price</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <p className="text-lg font-semibold text-foreground">
                  {quote.quotedCurrency ?? "INR"} {quote.quotedAmount.toLocaleString("en-IN")}
                </p>
                <Button size="sm" isLoading={isAccepting} onClick={accept}>
                  Accept
                </Button>
              </CardContent>
            </Card>
          )}

          {quote.status === "REJECTED" && quote.rejectionReason && (
            <Card>
              <CardContent className="pt-5 text-sm text-danger">
                Declined: {quote.rejectionReason}
              </CardContent>
            </Card>
          )}

          {quote.status === "ACCEPTED" && quote.orderId && (
            <Card>
              <CardContent className="flex items-center justify-between pt-5">
                <p className="text-sm text-muted-foreground">
                  This quote has been accepted and turned into an order.
                </p>
                <Button size="sm" variant="secondary" onClick={() => router.push("/orders")}>
                  View my orders
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
