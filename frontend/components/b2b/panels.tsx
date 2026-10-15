"use client";

import { useEffect, useState } from "react";
import { Download, FileText, History, MapPin, Package, Search, X } from "lucide-react";
import type {
  B2bRequestSummaryDto,
  CustomerDto,
  InvoiceDto,
  PickupRequestStatusCode,
  TrackingResultDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError, errorMessage } from "@/lib/api-client";
import type { B2bClient } from "@/lib/b2b-client";
import { downloadBlob } from "@/lib/utils/download-blob";
import {
  clearTrackingHistory,
  readTrackingHistory,
  rememberTrackingNumber,
} from "@/lib/tracking-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { PICKUP_REQUEST_STATUS_VARIANT, TrackingStatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { TrackingSearchForm } from "@/features/tracking/TrackingSearchForm";
import { TrackingTimeline } from "@/features/tracking/TrackingTimeline";
import { OrderDetailsDialog } from "@/components/b2b/order-details";

/**
 * The B2B portal's read-only tabs: what the business has ordered, what it has been billed, where a
 * parcel is, and who the account is. Every call goes through the injected portal client, so these
 * work the same for a signed-in business account and for a standing despatch-desk link — the
 * server scopes each one to the customer the guard resolved.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const money = (value: number, currency: string) =>
  `${currency === "INR" ? "₹" : `${currency} `}${Math.round(value).toLocaleString("en-IN")}`;

const sentence = (code: string) => {
  const words = code.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function RequestStatusBadge({ status }: { status: string }) {
  const variant = PICKUP_REQUEST_STATUS_VARIANT[status as PickupRequestStatusCode] ?? "neutral";
  return <Badge variant={variant}>{sentence(status)}</Badge>;
}

// Filters by where the order is in its life, not by every raw status: that is the question a
// despatch desk actually asks ("what is still waiting to be collected?").
type OrderFilter = "all" | "open" | "done" | "closed";
const FILTERS: { value: OrderFilter; label: string }[] = [
  { value: "all", label: "All orders" },
  { value: "open", label: "Awaiting pickup" },
  { value: "done", label: "Completed" },
  { value: "closed", label: "Cancelled or rejected" },
];
const stageOf = (status: string): Exclude<OrderFilter, "all"> =>
  status === "COMPLETED" ? "done" : status === "CANCELLED" || status === "REJECTED" ? "closed" : "open";

const PAGE = 20;

export function OrdersPanel({
  client,
  orders,
  onTrack,
  onBook,
}: {
  client: B2bClient;
  orders: B2bRequestSummaryDto[];
  onTrack: (trackingNumber: string) => void;
  onBook?: () => void;
}) {
  const [opened, setOpened] = useState<B2bRequestSummaryDto | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [shown, setShown] = useState(PAGE);

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" aria-hidden />}
        title="No orders yet"
        description="Shipments you request from this portal appear here."
        action={onBook && <Button onClick={onBook}>Book a pickup</Button>}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = orders.filter(
    (o) =>
      (filter === "all" || stageOf(o.status) === filter) &&
      (!q ||
        [o.recipientName, o.destinationCountry, o.trackingNumber, o.carrier]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))),
  );
  const awaiting = orders.filter((o) => stageOf(o.status) === "open").length;
  // Cancelled and rejected orders were never charged, so they stay out of the value.
  const value = orders
    .filter((o) => stageOf(o.status) !== "closed" && o.currency === "INR")
    .reduce((sum, o) => sum + o.price, 0);

  return (
    <div className="space-y-4">
      <dl className="glass grid grid-cols-3 divide-x divide-[color:var(--glass-edge)] rounded-2xl">
        {(
          [
            ["Orders", orders.length.toLocaleString("en-IN")],
            ["To collect", awaiting.toLocaleString("en-IN")],
            ["Order value", money(value, "INR")],
          ] as const
        ).map(([label, figure]) => (
          <div key={label} className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
            <dt className="truncate text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground sm:text-2xl">
              {figure}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search orders"
            placeholder="Search name, country or tracking no."
            className="h-10 pl-9"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
          />
        </div>
        <div className="sm:w-56">
          <NativeSelect
            aria-label="Filter by status"
            className="h-10"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as OrderFilter);
              setShown(PAGE);
            }}
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden />}
          title="No orders match"
          description="Try a different search, or show every order."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          {/* Column heads for the desktop table; on a phone each row is its own card. */}
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_7rem] gap-4 border-b border-[color:var(--glass-edge)] px-5 py-3 text-xs font-medium text-muted-foreground md:grid">
            <span>Recipient</span>
            <span>Status</span>
            <span>Tracking</span>
            <span className="text-right">Amount</span>
          </div>
          <ul className="divide-y divide-[color:var(--glass-edge)]">
            {filtered.slice(0, shown).map((row) => (
              <li
                key={row.id}
                // The name's button stretches over the whole row (after:inset-0), so the row opens the
                // order; the Track button sits above that layer and keeps its own action.
                className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-white/60 sm:px-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_7rem] md:items-center"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpened(row)}
                    className="block max-w-full truncate text-left font-medium text-foreground after:absolute after:inset-0 after:rounded-none after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                  >
                    {row.recipientName ?? "Recipient at pickup"}
                  </button>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.destinationCountry} ·{" "}
                    {row.pickupDate ? formatDate(row.pickupDate) : formatDate(row.createdAt)}
                  </p>
                </div>
                <p className="text-right font-semibold tabular-nums text-foreground md:order-last">
                  {money(row.price, row.currency)}
                </p>
                <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
                  <RequestStatusBadge status={row.status} />
                  {row.carrier && <span className="text-xs text-muted-foreground">{row.carrier}</span>}
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-1">
                  {row.trackingNumber ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onTrack(row.trackingNumber!)}
                        aria-label={`Track ${row.trackingNumber}`}
                        className="relative z-10 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white/50 px-2.5 font-mono text-xs text-foreground transition-colors hover:border-foreground/40 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        {row.trackingNumber}
                      </button>
                      <TrackingStatusBadge status={row.shipmentStatus ?? undefined} />
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Issued once collected</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {filtered.length > shown && (
            <div className="border-t border-[color:var(--glass-edge)] p-3 text-center">
              <Button variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({filtered.length - shown} left)
              </Button>
            </div>
          )}
        </div>
      )}

      <OrderDetailsDialog
        client={client}
        row={opened}
        onClose={() => setOpened(null)}
        onTrack={(trackingNumber) => {
          setOpened(null);
          onTrack(trackingNumber);
        }}
      />
    </div>
  );
}

export function InvoicesPanel({ client }: { client: B2bClient }) {
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    client
      .get<InvoiceDto[]>("/invoices")
      .then(setInvoices)
      .catch((err) => setError(errorMessage(err, "Failed to load your invoices.")))
      .finally(() => setIsLoading(false));
  }, [client]);

  async function download(invoice: InvoiceDto) {
    setBusyId(invoice.id);
    try {
      const blob = await client.getBlob(`/invoices/${invoice.id}/pdf`);
      downloadBlob(blob, `${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`);
    } catch (err) {
      showToast({
        variant: "error",
        title: "Download failed.",
        description: errorMessage(err, "Please try again."),
      });
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (error) return <ErrorState message={error} />;
  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" aria-hidden />}
        title="No invoices yet"
        description="A tax invoice is issued once a shipment has been collected and paid for."
      />
    );
  }

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_8rem_8rem] gap-4 border-b border-[color:var(--glass-edge)] px-5 py-3 text-xs font-medium text-muted-foreground md:grid">
        <span>Invoice</span>
        <span>Period</span>
        <span className="text-right">Total</span>
        <span className="sr-only">Download</span>
      </div>
      <ul className="divide-y divide-[color:var(--glass-edge)]">
        {invoices.map((invoice) => {
          const isCancelled = invoice.status === "CANCELLED";
          return (
            <li
              key={invoice.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_8rem_8rem]"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="font-mono text-sm font-semibold text-foreground">{invoice.invoiceNumber}</p>
                {invoice.kind === "CONSOLIDATED" && (
                  <Badge variant="neutral">{invoice.lineCount} shipments</Badge>
                )}
                {isCancelled && <Badge variant="danger">Cancelled</Badge>}
              </div>
              <p
                className={cn(
                  "text-right font-semibold tabular-nums md:order-3",
                  isCancelled ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {money(invoice.totalAmount, invoice.currency)}
              </p>
              <p className="text-xs text-muted-foreground md:order-2 md:text-sm">
                {invoice.kind === "CONSOLIDATED" && invoice.periodFrom && invoice.periodTo
                  ? `${formatDate(invoice.periodFrom)} – ${formatDate(invoice.periodTo)}`
                  : `Issued ${formatDate(invoice.invoiceDate)}`}
              </p>
              <div className="text-right md:order-4">
                <button
                  type="button"
                  onClick={() => void download(invoice)}
                  disabled={busyId === invoice.id}
                  aria-label={`Download invoice ${invoice.invoiceNumber}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === invoice.id ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden />
                  )}
                  PDF
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The same lookup the customer tracking page offers — the tracking endpoint is public, so this
 * needs no portal route of its own. Shipments still out for delivery are listed from the portal's
 * own order history so nobody has to type a number they already have on screen.
 */
export function TrackingPanel({
  orders,
  initialTracking,
}: {
  orders: B2bRequestSummaryDto[];
  initialTracking?: string;
}) {
  const [result, setResult] = useState<TrackingResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Filled after mount: localStorage does not exist during the server render.
  const [recent, setRecent] = useState<string[]>([]);

  const active = orders.filter((o) => o.trackingNumber && o.shipmentStatus !== "DELIVERED");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readTrackingHistory());
  }, []);

  async function search(trackingNumber: string) {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiClient.get<TrackingResultDto>(
        `/tracking/${encodeURIComponent(trackingNumber)}`,
      );
      setResult(data);
      setRecent(rememberTrackingNumber(data.internalTrackingNumber));
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? "We couldn't find that tracking number."
          : "Temporarily unable to fetch live status. Please try again shortly.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // A one-shot lookup when the portal arrives here from an order, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialTracking) void search(initialTracking);
  }, [initialTracking]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <div className="lg:col-span-2 lg:max-w-2xl">
        <TrackingSearchForm
          onSubmit={search}
          isLoading={isLoading}
          initialValue={initialTracking}
        />
      </div>
      <div className="space-y-5">

        {active.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Shipments in transit</span>
            {active.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => void search(order.trackingNumber!)}
                className="glass glass-interactive flex w-full items-center justify-between gap-3 rounded-2xl p-3 text-left active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-mono text-sm text-foreground">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    {order.trackingNumber}
                  </span>
                  <span className="mt-0.5 block truncate pl-6 text-xs text-muted-foreground">
                    {order.recipientName ?? "Recipient at pickup"} · {order.destinationCountry}
                  </span>
                </span>
                <TrackingStatusBadge status={order.shipmentStatus ?? undefined} />
              </button>
            ))}
          </div>
        )}

        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <History className="h-3.5 w-3.5" aria-hidden />
              Recently tracked
            </span>
            {recent.map((trackingNumber) => (
              <button
                key={trackingNumber}
                type="button"
                onClick={() => void search(trackingNumber)}
                className="glass-pill rounded-full border px-2.5 py-1 font-mono text-xs text-foreground transition-colors hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {trackingNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                clearTrackingHistory();
                setRecent([]);
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" aria-hidden />
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0">
        {isLoading && <Skeleton className="h-72 w-full rounded-2xl" />}
        {error && <ErrorState message={error} />}
        {result && <TrackingTimeline result={result} />}
        {!isLoading && !error && !result && (
          <EmptyState
            icon={<MapPin className="h-6 w-6" aria-hidden />}
            title="Track a shipment"
            description="Enter a tracking number, or pick one of your shipments in transit."
          />
        )}
      </div>
    </div>
  );
}

/**
 * The account behind the portal, read-only.
 *
 * ponytail: deliberately not editable here. The standing link is a shared credential sitting on a
 * despatch desk — letting it rewrite the business's billing email or address would make every
 * invoice redirectable by anyone holding the link. A signed-in account edits these at /profile.
 */
export function ProfilePanel({ client }: { client: B2bClient }) {
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .get<CustomerDto>("/profile")
      .then(setCustomer)
      .catch((err) => setError(errorMessage(err, "Failed to load the account details.")))
      .finally(() => setIsLoading(false));
  }, [client]);

  if (isLoading) return <Skeleton className="h-56 w-full max-w-3xl rounded-2xl" />;
  if (error || !customer) return <ErrorState message={error ?? "Something went wrong."} />;

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Account details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["Business name", customer.name, false],
              ["Phone", customer.phone, false],
              ["Email", customer.email ?? "—", false],
              ["Address", customer.address ?? "—", true],
            ] as const
          ).map(([label, value, wide]) => (
            <div key={label} className={cn("space-y-1.5", wide && "sm:col-span-2")}>
              <Label htmlFor={`profile-${label}`}>{label}</Label>
              <Input id={`profile-${label}`} value={value} readOnly disabled />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          To change any of these, ask your NationWide contact, or sign in to your business account
          and edit them under Profile.
        </p>
      </CardContent>
    </Card>
  );
}
