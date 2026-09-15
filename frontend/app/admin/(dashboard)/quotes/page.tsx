"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import type {
  QuoteAdminDetailDto,
  QuoteReviewReasonCode,
  QuoteStatusCode,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
import { SearchInput } from "@/components/ui/search-input";
import { NativeSelect } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { QuoteStatusBadge } from "@/components/ui/status-badge";
import { ReviewQuoteDialog } from "@/components/quotes/review-quote-dialog";
import { TabSlider } from "@/components/ui/tab-slider";

const REASON_LABEL: Record<QuoteReviewReasonCode, string> = {
  DANGEROUS_GOODS: "Dangerous Goods",
  OVERSIZED: "Oversized",
  RESTRICTED_DESTINATION: "Restricted Destination",
  SPECIAL_HANDLING: "Special Handling",
  MISCELLANEOUS: "Miscellaneous",
  NO_RATE_AVAILABLE: "No Rate Available",
};

const PAGE_SIZE = 25;
const DAY_MS = 86_400_000;

type TabKey = "new" | "sent" | "pickups" | "orders" | "declined";

interface FilterOption {
  value: string;
  label: string;
}

/**
 * The quote lifecycle as tabs, left to right in the order a quote moves through them:
 * requested -> quotation sent -> accepted (out for pickup) -> order, or declined.
 *
 * Each tab owns its own dropdown, because what is worth filtering changes with the stage: the
 * review reason matters while pricing, how long a quotation has gone unanswered once it is sent,
 * and so on. `params` turns the tab + its dropdown value into the list query.
 */
const TABS: {
  key: TabKey;
  label: string;
  statuses: QuoteStatusCode[];
  hint: string;
  filterLabel: string;
  filters: FilterOption[];
  params: (filter: string) => Record<string, string>;
}[] = [
  {
    key: "new",
    label: "New Requests",
    statuses: ["SUBMITTED", "NEEDS_MANUAL_REVIEW", "RATED"],
    hint: "Requests waiting on a price — review and send a quotation.",
    filterLabel: "Filter new requests",
    filters: [
      { value: "", label: "All new requests" },
      { value: "status:NEEDS_MANUAL_REVIEW", label: "Needs manual pricing" },
      { value: "status:RATED", label: "Auto-rated, awaiting customer" },
      ...Object.entries(REASON_LABEL).map(([value, label]) => ({ value: `reason:${value}`, label: `Reason: ${label}` })),
    ],
    params: (f): Record<string, string> =>
      f.startsWith("status:")
        ? { status: f.slice(7) }
        : f.startsWith("reason:")
          ? { statuses: "SUBMITTED,NEEDS_MANUAL_REVIEW,RATED", reviewReason: f.slice(7) }
          : { statuses: "SUBMITTED,NEEDS_MANUAL_REVIEW,RATED" },
  },
  {
    key: "sent",
    label: "Quotation Sent",
    statuses: ["QUOTED"],
    hint: "Priced and sent — waiting for the customer to accept or decline.",
    filterLabel: "Filter sent quotations",
    filters: [
      { value: "", label: "Any time" },
      { value: "1", label: "Unanswered over 24 hours" },
      { value: "3", label: "Unanswered over 3 days" },
      { value: "7", label: "Unanswered over 7 days" },
    ],
    params: (f): Record<string, string> => ({
      status: "QUOTED",
      ...(f ? { quotedBefore: new Date(Date.now() - Number(f) * DAY_MS).toISOString() } : {}),
    }),
  },
  {
    key: "pickups",
    label: "Accepted · Pickups",
    statuses: ["PENDING_PICKUP_REQUEST", "PICKUP_REQUESTED"],
    hint: "Accepted by the customer and on their way to pickup. Completed pickups move to Orders.",
    filterLabel: "Filter accepted quotes",
    filters: [
      { value: "", label: "All accepted" },
      { value: "PENDING_PICKUP_REQUEST", label: "Waiting for pickup details" },
      { value: "PICKUP_REQUESTED", label: "Sent for pickup" },
    ],
    params: (f): Record<string, string> => (f ? { status: f } : { statuses: "PENDING_PICKUP_REQUEST,PICKUP_REQUESTED" }),
  },
  {
    key: "orders",
    label: "Orders",
    statuses: ["ACCEPTED"],
    hint: "Pickup done — these are real orders now.",
    filterLabel: "Filter orders",
    filters: [
      { value: "", label: "All time" },
      { value: "7", label: "Requested in the last 7 days" },
      { value: "30", label: "Requested in the last 30 days" },
    ],
    params: (f): Record<string, string> => ({
      status: "ACCEPTED",
      ...(f ? { createdAfter: new Date(Date.now() - Number(f) * DAY_MS).toISOString() } : {}),
    }),
  },
  {
    key: "declined",
    label: "Declined",
    statuses: ["REJECTED", "CANCELLED"],
    hint: "Declined by the customer, rejected by staff, or cancelled.",
    filterLabel: "Filter declined quotes",
    filters: [
      { value: "", label: "All declined" },
      { value: "REJECTED", label: "Declined / rejected" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
    params: (f): Record<string, string> => (f ? { status: f } : { statuses: "REJECTED,CANCELLED" }),
  },
];

export default function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<QuoteAdminDetailDto[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<QuoteStatusCode, number>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tabKey, setTabKey] = useState<TabKey>("new");
  // One remembered dropdown value per tab, so switching away and back keeps its filter.
  const [filters, setFilters] = useState<Record<TabKey, string>>({
    new: "",
    sent: "",
    pickups: "",
    orders: "",
    declined: "",
  });
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);
  const { showToast } = useToast();

  const tab = TABS.find((t) => t.key === tabKey)!;
  const filter = filters[tabKey];

  function load() {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      ...tab.params(filter),
    });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    apiClient
      .getWithHeaders<QuoteAdminDetailDto[]>(`/admin/quotes?${params.toString()}`)
      .then(({ data, headers }) => {
        setQuotes(data);
        setTotal(Number(headers.get("X-Total-Count") ?? data.length));
      })
      .catch((err) => setError(errorMessage(err, "Failed to load quote requests.")))
      .finally(() => setIsLoading(false));
    // The badges on the tabs. Secondary — a failure leaves them blank, never blocks the list.
    apiClient
      .get<Partial<Record<QuoteStatusCode, number>>>("/admin/quotes/counts")
      .then(setCounts)
      .catch(() => undefined);
  }

  useEffect(() => {
    // Fetching on tab/filter/page change is a one-shot lookup, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, tabKey, filter]);

  async function handleQuoted(id: string, amount: number, currency: string, notes: string) {
    try {
      await apiClient.post(`/admin/quotes/${id}/manual-quote`, {
        amount,
        currency,
        internalNotes: notes || undefined,
      });
      showToast({ variant: "success", title: "Quotation sent — moved to Quotation Sent" });
      load();
    } catch {
      showToast({ variant: "error", title: "Couldn't save the quote. Please try again." });
    }
  }

  async function handleReject(id: string, reason: string) {
    try {
      await apiClient.post(`/admin/quotes/${id}/reject`, { reason });
      showToast({ variant: "success", title: "Quote rejected — moved to Declined" });
      load();
    } catch {
      showToast({ variant: "error", title: "Couldn't reject the quote. Please try again." });
    }
  }

  const countFor = (statuses: QuoteStatusCode[]) => statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Quote Requests</h1>
          <p className="text-sm text-muted-foreground">
            Every quotation customers request, from pricing through to pickup and order.
          </p>
        </div>
        <Link href="/admin/quotes/new">
          <Button size="sm">+ New Quote</Button>
        </Link>
      </div>

      <TabSlider
        ariaLabel="Quote stage"
        tabs={TABS.map((t) => ({ value: t.key, label: t.label, count: countFor(t.statuses) }))}
        value={tabKey}
        onChange={(next) => {
          setTabKey(next);
          setPage(1);
        }}
      />

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{tab.hint}</p>
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
            key={tab.key}
            className="sm:w-64"
            value={filter}
            onChange={(e) => {
              setFilters((current) => ({ ...current, [tabKey]: e.target.value }));
              setPage(1);
            }}
            aria-label={tab.filterLabel}
          >
            {tab.filters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {isLoading && <TableSkeleton columns={7} />}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && quotes.length === 0 && (
        <EmptyState icon={<FileQuestion className="h-8 w-8" aria-hidden />} title={`Nothing in ${tab.label}`} />
      )}

      {!isLoading && !error && quotes.length > 0 && (
        <div className="space-y-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>{tabKey === "new" ? "Review Reason" : "Status"}</TableHead>
                <TableHead>Quoted</TableHead>
                <TableHead>{tabKey === "sent" ? "Sent" : "Requested"}</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => (
                <TableRow key={q.id} href={`/admin/quotes/${q.id}`}>
                  <TableCell>
                    <span className="font-medium text-foreground">{q.customerName}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {q.origin?.city ? `${q.origin.city} → ` : "To "}
                    {[q.destination.city, q.destination.country].filter(Boolean).join(", ")}
                  </TableCell>
                  <TableCell>{q.weightKg}kg</TableCell>
                  <TableCell>
                    {tabKey === "new" ? (
                      q.reviewReason ? (
                        <Badge variant="info">{REASON_LABEL[q.reviewReason]}</Badge>
                      ) : (
                        <QuoteStatusBadge status={q.status} />
                      )
                    ) : (
                      <div className="space-y-1">
                        <QuoteStatusBadge status={q.status} />
                        {q.status === "REJECTED" && q.rejectionReason && (
                          <p className="max-w-48 truncate text-xs text-muted-foreground">{q.rejectionReason}</p>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {q.quotedAmount
                      ? `${q.quotedCurrency ?? "INR"} ${q.quotedAmount.toLocaleString("en-IN")}`
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date((tabKey === "sent" && q.quotedAt) || q.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    {q.status === "SUBMITTED" || q.status === "NEEDS_MANUAL_REVIEW" ? (
                      <ReviewQuoteDialog
                        quote={q}
                        onQuoted={(amount, currency, notes) => handleQuoted(q.id, amount, currency, notes)}
                        onReject={(reason) => handleReject(q.id, reason)}
                        trigger={
                          <Button variant="secondary" size="sm">
                            Review
                          </Button>
                        }
                      />
                    ) : q.status === "PICKUP_REQUESTED" ? (
                      <Link href="/admin/pickup-requests" className="text-sm font-medium text-primary hover:underline">
                        View pickups
                      </Link>
                    ) : q.status === "ACCEPTED" && q.orderId ? (
                      <Link href={`/admin/orders/${q.orderId}`} className="text-sm font-medium text-primary hover:underline">
                        View order
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
