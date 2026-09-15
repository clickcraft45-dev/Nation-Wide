"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import type { PickupRequestDto, QuoteDto, QuoteStatusCode } from "@nationwide/shared-types";
import { TabSlider } from "@/components/ui/tab-slider";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import { QuoteSummaryCard } from "@/components/quote/quote-summary-card";

type Tab = "all" | "action" | "review" | "pickups" | "orders" | "declined";

// The same stages staff see, worded for the customer. "Needs you" first: those are the quotes
// that sit still until the customer does something.
const TABS: { value: Tab; label: string; statuses: QuoteStatusCode[] | null }[] = [
  { value: "all", label: "All", statuses: null },
  { value: "action", label: "Needs you", statuses: ["RATED", "QUOTED", "PENDING_PICKUP_REQUEST"] },
  { value: "review", label: "Being priced", statuses: ["SUBMITTED", "NEEDS_MANUAL_REVIEW"] },
  { value: "pickups", label: "Pickups", statuses: ["PICKUP_REQUESTED"] },
  { value: "orders", label: "Orders", statuses: ["ACCEPTED"] },
  { value: "declined", label: "Declined", statuses: ["REJECTED", "CANCELLED"] },
];

export default function CustomerQuotesPage() {
  const [quotes, setQuotes] = useState<QuoteDto[]>([]);
  // Pickup requests by quote id, for the live progress on booked quotes.
  const [pickups, setPickups] = useState<Record<string, PickupRequestDto>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<QuoteDto[]>("/quotes/me")
      .then((rows) => {
        setQuotes(rows);
        if (rows.some((q) => q.status === "PICKUP_REQUESTED")) {
          // Secondary: a failure here just leaves the cards on their plain status note.
          apiClient
            .get<PickupRequestDto[]>("/pickup-requests/me")
            .then((requests) => setPickups(Object.fromEntries(requests.map((r) => [r.quoteId, r]))))
            .catch(() => undefined);
        }
      })
      .catch((err) => {
        setError(errorMessage(err, "Failed to load your quotes."));
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

  async function decline(id: string) {
    try {
      await apiClient.post(`/quotes/${id}/decline`, {});
      showToast({ variant: "success", title: "Quotation declined" });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't decline this quotation.") });
    }
  }

  const visible = useMemo(() => {
    const statuses = TABS.find((t) => t.value === tab)?.statuses;
    return statuses ? quotes.filter((q) => statuses.includes(q.status)) : quotes;
  }, [quotes, tab]);

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
        <TabSlider
          ariaLabel="Filter quotes by stage"
          tabs={TABS.map((t) => ({
            value: t.value,
            label: t.label,
            count: t.statuses ? quotes.filter((q) => t.statuses!.includes(q.status)).length : quotes.length,
          }))}
          value={tab}
          onChange={setTab}
        />
      )}

      {!isLoading && !error && quotes.length > 0 && visible.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing here right now.</p>
      )}

      {!isLoading && !error && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((q) => (
            <QuoteSummaryCard
              key={q.id}
              quote={q}
              pickup={q.status === "PICKUP_REQUESTED" ? pickups[q.id] : undefined}
              isAccepting={acceptingId === q.id}
              onAccept={() => void accept(q.id)}
              onDecline={() => decline(q.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
