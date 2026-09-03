"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import type { QuoteDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import { QuoteSummaryCard } from "@/components/quote/quote-summary-card";

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
          <p className="text-sm text-muted-foreground">
            Track the status of your shipment requests.
          </p>
        </div>
        <Link href="/quote">
          <Button>Request a quote</Button>
        </Link>
      </div>

      {/* Card-shaped skeletons, not a table's — this list has never been a table, and a
          four-column grid flashing before three stacked cards is a visible layout jump. */}
      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      )}

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
            <QuoteSummaryCard
              key={q.id}
              quote={q}
              isAccepting={acceptingId === q.id}
              onAccept={() => void accept(q.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
