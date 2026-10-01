"use client";

import { useEffect, useState } from "react";
import { Download, FileText, History, MapPin, Package, X } from "lucide-react";
import type {
  B2bRequestSummaryDto,
  CustomerDto,
  InvoiceDto,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { TrackingStatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { TrackingSearchForm } from "@/features/tracking/TrackingSearchForm";
import { TrackingTimeline } from "@/features/tracking/TrackingTimeline";

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

export function OrdersPanel({
  orders,
  onTrack,
}: {
  orders: B2bRequestSummaryDto[];
  onTrack: (trackingNumber: string) => void;
}) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Package className="h-6 w-6" aria-hidden />}
        title="No orders yet"
        description="Shipments you request from this portal appear here."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {orders.map((row) => (
        <li key={row.id} className="glass rounded-2xl p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">
                {row.recipientName ?? "Recipient at pickup"} · {row.destinationCountry}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.pickupDate ? formatDate(row.pickupDate) : formatDate(row.createdAt)} ·{" "}
                {row.status.replaceAll("_", " ").toLowerCase()}
                {row.carrier ? ` · ${row.carrier}` : ""}
              </p>
            </div>
            <p className="font-semibold tabular-nums text-foreground">
              {money(row.price, row.currency)}
            </p>
          </div>
          {row.trackingNumber && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => onTrack(row.trackingNumber!)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 font-mono text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                {row.trackingNumber}
              </button>
              <TrackingStatusBadge status={row.shipmentStatus ?? undefined} />
            </div>
          )}
        </li>
      ))}
    </ul>
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

  if (isLoading) return <Skeleton className="h-40 w-full" />;
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
    <ul className="space-y-3">
      {invoices.map((invoice) => {
        const isCancelled = invoice.status === "CANCELLED";
        return (
          <li key={invoice.id} className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {invoice.invoiceNumber}
                  </p>
                  {invoice.kind === "CONSOLIDATED" && (
                    <Badge variant="neutral">{invoice.lineCount} shipments</Badge>
                  )}
                  {isCancelled && <Badge variant="danger">Cancelled</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {invoice.kind === "CONSOLIDATED" && invoice.periodFrom && invoice.periodTo
                    ? `${formatDate(invoice.periodFrom)} – ${formatDate(invoice.periodTo)}`
                    : `Issued ${formatDate(invoice.invoiceDate)}`}
                </p>
              </div>
              <p
                className={`text-lg font-semibold tabular-nums text-foreground${
                  isCancelled ? " text-muted-foreground line-through" : ""
                }`}
              >
                {money(invoice.totalAmount, invoice.currency)}
              </p>
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => void download(invoice)}
                disabled={busyId === invoice.id}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyId === invoice.id ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                Download
              </button>
            </div>
          </li>
        );
      })}
    </ul>
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
    <div className="space-y-5">
      <TrackingSearchForm
        onSubmit={search}
        isLoading={isLoading}
        initialValue={initialTracking}
      />

      {active.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">Shipments in transit</span>
          {active.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => void search(order.trackingNumber!)}
              className="glass glass-interactive flex w-full items-center justify-between rounded-2xl p-3 text-left active:bg-muted/60"
            >
              <span className="flex items-center gap-2 font-mono text-sm text-foreground">
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                {order.trackingNumber}
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

      {error && <ErrorState message={error} />}
      {result && <TrackingTimeline result={result} />}
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

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (error || !customer) return <ErrorState message={error ?? "Something went wrong."} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account details</CardTitle>
      </CardHeader>
      <CardContent className="max-w-sm space-y-4">
        {(
          [
            ["Business name", customer.name],
            ["Phone", customer.phone],
            ["Email", customer.email ?? "—"],
            ["Address", customer.address ?? "—"],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="space-y-1.5">
            <Label htmlFor={`profile-${label}`}>{label}</Label>
            <Input id={`profile-${label}`} value={value} readOnly disabled />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          To change any of these, ask your NationWide contact — or sign in to your business account
          and edit them under Profile.
        </p>
      </CardContent>
    </Card>
  );
}
