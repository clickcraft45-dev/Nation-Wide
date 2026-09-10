"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, FileText, ReceiptIndianRupee, Share2 } from "lucide-react";
import type { InvoiceDto, PaymentMethodCode, ReceiptDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import { downloadBlob } from "@/lib/utils/download-blob";
import { cn } from "@/lib/utils/cn";

/**
 * A customer's documents: every tax invoice they have been issued and every receipt for money
 * they have paid.
 *
 * Replaces the invoices-only Bills page. The two are kept on separate tabs rather than merged
 * into one list because they answer different questions — "what was I charged" and "can I prove
 * I paid" — and a customer filing for their accountant needs the invoices, while one disputing
 * a payment needs the receipt. Interleaving them by date would make both harder to find.
 *
 * Both are stored in S3 at issue time and served from there, so what a customer downloads here
 * is byte-for-byte the document they were sent on WhatsApp.
 */

type Tab = "invoices" | "receipts";

const METHOD_LABELS: Record<PaymentMethodCode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  RAZORPAY: "Online",
};

function money(value: number, currency: string): string {
  return `${currency === "INR" ? "₹" : `${currency} `}${value.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fileName(number: string): string {
  return `${number.replace(/\//g, "-")}.pdf`;
}

export default function CustomerDocumentsPage() {
  const [tab, setTab] = useState<Tab>("invoices");
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [receipts, setReceipts] = useState<ReceiptDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    // Both at once: the tab counts are shown before either tab is opened, so both lists are
    // needed on arrival anyway.
    Promise.all([
      apiClient.get<InvoiceDto[]>("/invoices/me"),
      apiClient.get<ReceiptDto[]>("/receipts/me"),
    ])
      .then(([invoiceList, receiptList]) => {
        setInvoices(invoiceList);
        setReceipts(receiptList);
      })
      .catch((err) => setError(errorMessage(err, "Failed to load your documents.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function fetchPdf(path: string): Promise<Blob> {
    const { blob } = await apiClient.getBlob(path);
    return blob;
  }

  async function download(id: string, path: string, number: string) {
    setBusyId(id);
    try {
      downloadBlob(await fetchPdf(path), fileName(number));
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

  /**
   * Hands the PDF to the phone's own share sheet — WhatsApp, email, Drive, whatever the customer
   * uses — via the Web Share API. Sharing the FILE rather than a link: the document links are
   * signed and deliberately never shown to the customer's browser, and a file is what an
   * accountant on the other end actually wants.
   *
   * Browsers without file sharing (most desktops) fall back to a download, which is the next
   * best thing and never a dead button.
   */
  async function share(id: string, path: string, number: string, title: string) {
    setBusyId(id);
    try {
      const blob = await fetchPdf(path);
      const file = new File([blob], fileName(number), { type: "application/pdf" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        downloadBlob(blob, fileName(number));
        showToast({
          variant: "success",
          title: "Downloaded instead",
          description: "This browser can't share files directly — attach the downloaded PDF.",
        });
      }
    } catch (err) {
      // Dismissing the share sheet rejects with AbortError. That is the user changing their
      // mind, not a failure, and must not raise an error toast.
      if (err instanceof DOMException && err.name === "AbortError") return;
      showToast({
        variant: "error",
        title: "Couldn't share that document.",
        description: errorMessage(err, "Please try again."),
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Invoices &amp; receipts</h1>
        <p className="text-sm text-muted-foreground">
          Every bill you&apos;ve been issued and every payment you&apos;ve made, ready to download
          or share.
        </p>
      </div>

      <div role="tablist" aria-label="Document type" className="glass inline-flex rounded-xl p-1">
        {(
          [
            { key: "invoices", label: "Invoices", count: invoices.length, icon: FileText },
            { key: "receipts", label: "Receipts", count: receipts.length, icon: ReceiptIndianRupee },
          ] as const
        ).map(({ key, label, count, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {!isLoading && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  tab === key ? "bg-white/20" : "bg-muted",
                )}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!isLoading && error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && tab === "invoices" && (
        invoices.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" aria-hidden />}
            title="No invoices yet"
            description="Your invoice is issued automatically as soon as a shipment is paid for."
          />
        ) : (
          <ul className="space-y-3">
            {invoices.map((invoice) => {
              const isCancelled = invoice.status === "CANCELLED";
              const path = `/invoices/me/${invoice.id}/pdf`;
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
                      className={cn(
                        "text-lg font-semibold tabular-nums text-foreground",
                        isCancelled && "text-muted-foreground line-through",
                      )}
                    >
                      {money(invoice.totalAmount, invoice.currency)}
                    </p>
                  </div>
                  <DocumentActions
                    busy={busyId === invoice.id}
                    onDownload={() => download(invoice.id, path, invoice.invoiceNumber)}
                    onShare={() =>
                      share(invoice.id, path, invoice.invoiceNumber, `Invoice ${invoice.invoiceNumber}`)
                    }
                  />
                </li>
              );
            })}
          </ul>
        )
      )}

      {!isLoading && !error && tab === "receipts" && (
        receipts.length === 0 ? (
          <EmptyState
            icon={<ReceiptIndianRupee className="h-6 w-6" aria-hidden />}
            title="No receipts yet"
            description="A receipt is issued the moment your payment is received."
          />
        ) : (
          <ul className="space-y-3">
            {receipts.map((receipt) => {
              const path = `/receipts/me/${receipt.id}/pdf`;
              return (
                <li key={receipt.id} className="glass rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-foreground">
                          {receipt.receiptNumber}
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Paid
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {METHOD_LABELS[receipt.paymentMethod]} · {formatDate(receipt.receivedAt)}
                        {receipt.invoiceNumber && ` · for ${receipt.invoiceNumber}`}
                      </p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {money(receipt.amount, receipt.currency)}
                    </p>
                  </div>
                  <DocumentActions
                    busy={busyId === receipt.id}
                    onDownload={() => download(receipt.id, path, receipt.receiptNumber)}
                    onShare={() =>
                      share(receipt.id, path, receipt.receiptNumber, `Receipt ${receipt.receiptNumber}`)
                    }
                  />
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}

function DocumentActions({
  busy,
  onDownload,
  onShare,
}: {
  busy: boolean;
  onDownload: () => void;
  onShare: () => void;
}) {
  const buttonClass =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <div className="mt-3 flex gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className={cn(buttonClass, "bg-primary text-primary-foreground hover:bg-primary-hover")}
      >
        {busy ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" aria-hidden />}
        Download
      </button>
      <button
        type="button"
        onClick={onShare}
        disabled={busy}
        className={cn(buttonClass, "border border-border text-foreground hover:bg-muted")}
      >
        <Share2 className="h-4 w-4" aria-hidden />
        Share
      </button>
    </div>
  );
}
