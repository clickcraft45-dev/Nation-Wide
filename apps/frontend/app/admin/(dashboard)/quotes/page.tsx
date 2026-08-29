"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import type { QuoteAdminDetailDto, QuoteReviewReasonCode } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
import { SearchInput } from "@/components/ui/search-input";
import { NativeSelect } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { QuoteStatusBadge } from "@/components/ui/status-badge";
import { ReviewQuoteDialog } from "@/components/quotes/review-quote-dialog";

const REASON_LABEL: Record<QuoteReviewReasonCode, string> = {
  DANGEROUS_GOODS: "Dangerous Goods",
  OVERSIZED: "Oversized",
  RESTRICTED_DESTINATION: "Restricted Destination",
  SPECIAL_HANDLING: "Special Handling",
  MISCELLANEOUS: "Miscellaneous",
  NO_RATE_AVAILABLE: "No Rate Available",
};

const PAGE_SIZE = 25;

export default function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<QuoteAdminDetailDto[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (statusFilter) params.set("status", statusFilter);
    apiClient
      .getWithHeaders<QuoteAdminDetailDto[]>(`/admin/quotes?${params.toString()}`)
      .then(({ data, headers }) => {
        setQuotes(data);
        setTotal(Number(headers.get("X-Total-Count") ?? data.length));
      })
      .catch((err) => {
        setError(
          err instanceof ApiError ? "Failed to load quote requests." : "Something went wrong.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on filter/page change is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, statusFilter]);

  async function handleQuoted(id: string, amount: number, currency: string, notes: string) {
    try {
      await apiClient.post(`/admin/quotes/${id}/manual-quote`, {
        amount,
        currency,
        internalNotes: notes || undefined,
      });
      showToast({ variant: "success", title: "Quote sent to customer" });
      load();
    } catch {
      showToast({ variant: "error", title: "Couldn't save the quote. Please try again." });
    }
  }

  async function handleReject(id: string, reason: string) {
    try {
      await apiClient.post(`/admin/quotes/${id}/reject`, { reason });
      showToast({ variant: "success", title: "Quote rejected" });
      load();
    } catch {
      showToast({ variant: "error", title: "Couldn't reject the quote. Please try again." });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Quote Requests</h1>
          <p className="text-sm text-muted-foreground">
            Customer-submitted shipment requests awaiting pricing.
          </p>
        </div>
        <Link href="/admin/quotes/new">
          <Button size="sm">+ New Quote</Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-72">
          <SearchInput
            placeholder="Customer name, email or phone"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search quotes"
          />
        </div>
        <NativeSelect
          className="sm:w-56"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="RATED">Rated (awaiting customer)</option>
          <option value="NEEDS_MANUAL_REVIEW">Needs manual review</option>
          <option value="QUOTED">Quoted</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </NativeSelect>
      </div>

      {isLoading && <TableSkeleton columns={7} />}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && quotes.length === 0 && (
        <EmptyState
          icon={<FileQuestion className="h-8 w-8" aria-hidden />}
          title="No quote requests found"
        />
      )}

      {!isLoading && !error && quotes.length > 0 && (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Review Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quoted</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Link
                      href={`/admin/quotes/${q.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {q.customerName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {q.origin ? `${q.origin.city} → ` : "To "}
                    {q.destination.city}
                  </TableCell>
                  <TableCell>{q.weightKg}kg</TableCell>
                  <TableCell>
                    {q.reviewReason ? (
                      <Badge variant="info">{REASON_LABEL[q.reviewReason]}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <QuoteStatusBadge status={q.status} />
                  </TableCell>
                  <TableCell>
                    {q.quotedAmount
                      ? `${q.quotedCurrency ?? "INR"} ${q.quotedAmount.toLocaleString("en-IN")}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {q.status === "SUBMITTED" || q.status === "NEEDS_MANUAL_REVIEW" ? (
                      <ReviewQuoteDialog
                        quote={q}
                        onQuoted={(amount, currency, notes) =>
                          handleQuoted(q.id, amount, currency, notes)
                        }
                        onReject={(reason) => handleReject(q.id, reason)}
                        trigger={
                          <Button variant="secondary" size="sm">
                            Review
                          </Button>
                        }
                      />
                    ) : (
                      <Link
                        href={`/admin/quotes/${q.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
