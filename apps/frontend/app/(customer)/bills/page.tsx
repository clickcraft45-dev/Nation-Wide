"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, ReceiptIndianRupee } from "lucide-react";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">My Bills</h1>
        <p className="text-sm text-muted-foreground">
          Your GST invoices. One is issued automatically each time a payment is recorded.
        </p>
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
            <div key={invoice.id} className="glass rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
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
                {invoice.status === "CANCELLED" && <Badge variant="danger">Cancelled</Badge>}
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Taxable {money(invoice.taxableValue, invoice.currency)} · Tax{" "}
                    {money(invoice.totalTax, invoice.currency)}
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
                  className="glass-interactive inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
