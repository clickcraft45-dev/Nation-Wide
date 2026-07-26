"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import type { QuoteDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import { QuoteStatusBadge } from "@/components/ui/status-badge";

export default function CustomerQuotesPage() {
  const [quotes, setQuotes] = useState<QuoteDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<QuoteDto[]>("/quotes/me")
      .then(setQuotes)
      .catch((err) => {
        setError(err instanceof ApiError ? "Failed to load your quotes." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function accept(id: string) {
    setAcceptingId(id);
    try {
      await apiClient.post(`/quotes/${id}/accept`, {});
      showToast({ variant: "success", title: "Quote accepted — your order has been created" });
      load();
    } catch {
      showToast({ variant: "error", title: "We couldn't process your request right now. Please try again." });
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Quotes</h1>
          <p className="text-sm text-muted-foreground">Track the status of your shipment requests.</p>
        </div>
        <Link href="/quote">
          <Button>Request a quote</Button>
        </Link>
      </div>

      {isLoading && <TableSkeleton columns={4} />}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && quotes.length === 0 && (
        <EmptyState
          icon={<FileQuestion className="h-8 w-8" aria-hidden />}
          title="No quote requests yet"
          action={
            <Link href="/quote">
              <Button size="sm">Request your first quote</Button>
            </Link>
          }
        />
      )}

      {!isLoading && !error && quotes.length > 0 && (
        <div className="space-y-3">
          {quotes.map((q) => (
            <Card key={q.id}>
              <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {q.origin.city} → {q.destination.city}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {q.shipmentType.charAt(0) + q.shipmentType.slice(1).toLowerCase()} · {q.weightKg}kg ·{" "}
                    {new Date(q.createdAt).toLocaleDateString()}
                  </p>
                  {q.status === "NEEDS_MANUAL_REVIEW" && (
                    <p className="text-xs text-warning">
                      Our team will review your shipment details and contact you shortly with a
                      customized quotation.
                    </p>
                  )}
                  {q.status === "RATED" && (
                    <p className="text-xs text-info">
                      {q.rateQuoteOptions.length} provider
                      {q.rateQuoteOptions.length === 1 ? "" : "s"} available to compare.
                    </p>
                  )}
                  {q.status === "QUOTED" && q.quotedAmount != null && (
                    <p className="text-sm font-medium text-foreground">
                      Quoted: {q.quotedCurrency ?? "INR"} {q.quotedAmount.toLocaleString("en-IN")}
                    </p>
                  )}
                  {q.status === "REJECTED" && q.rejectionReason && (
                    <p className="text-xs text-danger">Declined: {q.rejectionReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <QuoteStatusBadge status={q.status} />
                  {q.status === "RATED" ? (
                    <Link href={`/quotes/${q.id}`}>
                      <Button size="sm">Compare</Button>
                    </Link>
                  ) : q.status === "QUOTED" ? (
                    <Button
                      size="sm"
                      isLoading={acceptingId === q.id}
                      disabled={acceptingId === q.id}
                      onClick={() => accept(q.id)}
                    >
                      Accept
                    </Button>
                  ) : (
                    <Link href={`/quotes/${q.id}`} className="text-xs text-primary hover:underline">
                      View
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
