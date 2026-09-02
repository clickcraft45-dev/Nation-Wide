"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileText, Loader2, ReceiptIndianRupee } from "lucide-react";
import type { InvoiceDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import { downloadBlob } from "@/lib/utils/download-blob";

function money(value: number, currency: string): string {
  return `${currency === "INR" ? "₹" : `${currency} `}${value.toFixed(2)}`;
}

export default function CustomerBillsPage() {
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<InvoiceDto[]>("/invoices/me")
      .then(setInvoices)
      .catch((err) =>
        setError(
          err instanceof ApiError ? "Failed to load your bills." : "Something went wrong.",
        ),
      )
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function download(invoice: InvoiceDto) {
    setDownloadingId(invoice.id);
    try {
      const { blob } = await apiClient.getBlob(`/invoices/me/${invoice.id}/pdf`);
      if (blob.size === 0) throw new ApiError(500, "Empty PDF body");
      downloadBlob(blob, `${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`);
    } catch {
      showToast({
        variant: "error",
        title: "Couldn't download that bill.",
        description: "Please try again, or contact support if it keeps failing.",
      });
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="page-enter space-y-6">
      <div className="glass-sheen relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground sm:p-6">
        <div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border border-white/15" aria-hidden />
        <div className="absolute -right-2 top-3 h-24 w-24 rounded-full border border-white/10" aria-hidden />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Payment records</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">My bills</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-white/70">
              Tax invoices are issued after payment is recorded and stay available here whenever you need them.
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/18">
            <ReceiptIndianRupee className="h-5 w-5" aria-hidden />
          </div>
        </div>
        <div className="relative mt-5 flex items-center gap-2 text-xs text-white/70">
          <CheckCircle2 className="h-4 w-4 text-white" aria-hidden />
          GST breakdown included on every PDF
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && invoices.length === 0 && (
        <EmptyState
          icon={<ReceiptIndianRupee className="h-8 w-8" aria-hidden />}
          title="No bills yet"
          description="Once a shipment is paid for, its tax invoice will appear here to download."
        />
      )}

      {!isLoading && !error && invoices.length > 0 && (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="glass glass-interactive rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-brand-red" aria-hidden />
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">GST invoice</span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-foreground">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {invoice.customLineDescription ? ` · ${invoice.customLineDescription}` : ""}
                  </p>
                </div>
                <Badge variant={invoice.status === "CANCELLED" ? "danger" : "success"}>
                  {invoice.status === "CANCELLED" ? "Cancelled" : "Issued"}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Taxable {money(invoice.taxableValue, invoice.currency)} · Tax {money(invoice.totalTax, invoice.currency)}
                    {/* Which tax applied is the thing most likely to be queried later, and it is
                        not recoverable from the total. */}
                    <span className="ml-1">
                      ({invoice.igstAmount > 0 ? "IGST" : "CGST+SGST"})
                    </span>
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-foreground">
                    {money(invoice.totalAmount, invoice.currency)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void download(invoice)}
                  disabled={downloadingId === invoice.id}
                  className="glass-interactive inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_8px_18px_-12px_rgba(9,9,11,0.65)] hover:!bg-primary-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {downloadingId === invoice.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden />
                  )}
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
