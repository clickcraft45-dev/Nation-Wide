"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Download, FileText, MessageCircle, ReceiptIndianRupee } from "lucide-react";
import type {
  CustomerDto,
  InvoiceBatchResultDto,
  InvoiceDto,
  InvoiceListDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError, errorMessage } from "@/lib/api-client";
import { Spinner } from "@/components/ui/spinner";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/components/ui/toast";
import { downloadBlob } from "@/lib/utils/download-blob";
import { todayIso } from "@/components/ui/calendar";
import { CompanySettingsDialog } from "@/components/pricing/company-settings-dialog";

function firstOfThisMonth(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-01`;
}

function money(value: number): string {
  return `₹${value.toFixed(2)}`;
}

export default function AdminInvoicesPage() {
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  // The consolidated invoice is for ONE named account — see ConsolidateInvoiceDto for why the
  // multi-customer bulk screen that used to live here was removed.
  const [consolidateCustomerId, setConsolidateCustomerId] = useState("");
  const [from, setFrom] = useState(firstOfThisMonth);
  const [to, setTo] = useState(todayIso);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  // Per-row, not a page-wide flag: downloading one invoice must not disable the other rows.
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Custom (order-less) invoice form.
  const [customCustomerId, setCustomCustomerId] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPlaceOfSupply, setCustomPlaceOfSupply] = useState("");

  const { showToast } = useToast();

  function load() {
    setIsLoading(true);
    setError(null);
    Promise.all([
      apiClient.get<CustomerDto[]>("/customers"),
      apiClient.get<InvoiceListDto>("/admin/invoices"),
    ])
      .then(([customersRes, invoicesRes]) => {
        setCustomers(customersRes);
        setInvoices(invoicesRes.items);
      })
      .catch((err) => {
        setError(
          errorMessage(err, "Failed to load invoices."),
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  /**
   * One invoice for everything a customer paid for between two dates.
   *
   * This replaced "Generate from orders", which issued one invoice per order across many
   * customers. That screen only existed because nothing invoiced automatically; every order is
   * now billed the moment its payment is recorded, whether an admin marks it or a pickup partner
   * collects it at the door. What it could not do — and what an account with forty parcels a
   * month actually asks for — is one bill for the period.
   */
  async function consolidate() {
    if (!consolidateCustomerId) {
      showToast({ title: "Choose a customer.", variant: "error" });
      return;
    }
    setIsWorking(true);
    try {
      const result = await apiClient.post<{
        invoice: InvoiceDto;
        skipped: { orderId: string }[];
      }>("/admin/invoices/consolidate", {
        customerId: consolidateCustomerId,
        // End of the chosen day, not its midnight — otherwise "to = today" silently excludes
        // everything paid today, which is the single most common thing to want.
        from: new Date(`${from}T00:00:00.000`).toISOString(),
        to: new Date(`${to}T23:59:59.999`).toISOString(),
      });
      showToast({
        variant: "success",
        title: `${result.invoice.invoiceNumber} issued for ${money(result.invoice.totalAmount)}`,
        description: result.skipped.length
          ? `${result.invoice.lineCount} orders billed. ${result.skipped.length} skipped — already on another invoice, or unpriced.`
          : `${result.invoice.lineCount} orders billed.`,
      });
      load();
    } catch (err) {
      // The server's reason is the useful part here: "ships from more than one state", "no
      // unbilled paid orders in that period" — each tells the admin exactly what to change.
      showToast({
        variant: "error",
        title: "Couldn't issue the consolidated invoice.",
        description: errorMessage(err, "Please try again."),
      });
    } finally {
      setIsWorking(false);
    }
  }

  /**
   * The bulk send reports partial success, because that is what the API returns and what
   * actually happens: one invoice with no rendered PDF among forty should not read as "sending
   * failed".
   */
  function reportBatch(result: InvoiceBatchResultDto, verb: string) {
    const parts = [`${result.created.length} ${verb}`];
    if (result.skipped.length) parts.push(`${result.skipped.length} skipped`);
    if (result.failed.length) parts.push(`${result.failed.length} failed`);
    showToast({
      title: parts.join(", "),
      variant: result.failed.length ? "error" : "success",
      // The reasons matter more than the count — which invoice, and why.
      description: result.failed.length
        ? result.failed
            .slice(0, 3)
            .map((f) => `${f.orderId.slice(0, 8)}: ${f.reason}`)
            .join(" · ")
        : undefined,
    });
  }

  async function sendSelected() {
    if (!selectedInvoiceIds.length) return;
    setIsWorking(true);
    try {
      const result = await apiClient.post<InvoiceBatchResultDto>("/admin/invoices/send", {
        invoiceIds: selectedInvoiceIds,
      });
      reportBatch(result, "queued for WhatsApp");
      setSelectedInvoiceIds([]);
      load();
    } catch {
      showToast({ title: "Send failed.", variant: "error" });
    } finally {
      setIsWorking(false);
    }
  }

  async function createCustom() {
    const grossAmount = Number(customAmount);
    if (!customCustomerId || !grossAmount || grossAmount <= 0 || customDescription.trim().length < 3) {
      showToast({
        variant: "error",
        title: "Pick a customer, an amount and a description first.",
      });
      return;
    }
    setIsWorking(true);
    try {
      const invoice = await apiClient.post<InvoiceDto>("/admin/invoices/custom", {
        customerId: customCustomerId,
        grossAmount,
        description: customDescription.trim(),
        placeOfSupplyState: customPlaceOfSupply.trim() || undefined,
      });
      showToast({ variant: "success", title: `Issued ${invoice.invoiceNumber}` });
      setCustomAmount("");
      setCustomDescription("");
      setCustomPlaceOfSupply("");
      load();
    } catch (err) {
      showToast({
        variant: "error",
        title:
          err instanceof ApiError && typeof err.body === "object" && err.body !== null
            ? String((err.body as { message?: string }).message ?? "Couldn't issue that invoice.")
            : "Couldn't issue that invoice.",
      });
    } finally {
      setIsWorking(false);
    }
  }

  async function download(invoice: InvoiceDto) {
    setDownloadingId(invoice.id);
    try {
      const { blob } = await apiClient.getBlob(`/admin/invoices/${invoice.id}/pdf`);
      // A zero-byte body still resolves as a Blob, so an empty or truncated file would "download"
      // as a broken PDF with no error anywhere. Refuse it instead.
      if (blob.size === 0) throw new ApiError(500, "Empty PDF body");
      downloadBlob(blob, `${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`);
    } catch (err) {
      // 404 here does not mean "no such invoice" — it is the API saying the invoice exists but
      // its rendered PDF is missing from storage, which is a different problem with a different
      // fix, and telling an admin "could not download" would send them looking in the wrong place.
      showToast({
        title:
          err instanceof ApiError && err.status === 404
            ? `${invoice.invoiceNumber} has no stored PDF file.`
            : "Could not download that invoice.",
        description:
          err instanceof ApiError && err.status === 404
            ? "It was issued but its PDF is missing from the server's storage. Re-issue it, or restore the storage/invoices directory."
            : undefined,
        variant: "error",
      });
    } finally {
      setDownloadingId(null);
    }
  }

  if (isLoading) return <TableSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-red">
            <ReceiptIndianRupee className="h-4 w-4" aria-hidden />
            Finance workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">GST Invoices</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Issue compliant tax invoices, keep the tax breakdown clear, and send selected records
            to customers on WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="glass-rim flex items-center gap-3 rounded-2xl bg-white/55 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red-tint text-brand-red">
              <FileText className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Issued records</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">{invoices.length}</p>
            </div>
          </div>
          <CompanySettingsDialog trigger={<Button variant="secondary" size="sm">Document brand</Button>} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
      <Card className="glass-sheen">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-foreground">Consolidated invoice</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                One invoice for everything a customer paid for in a period.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Customer</span>
            <NativeSelect
              value={consolidateCustomerId}
              onChange={(e) => setConsolidateCustomerId(e.target.value)}
            >
              <option value="">Choose a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </NativeSelect>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">From</span>
              {/* Native date inputs — the browser already ships a calendar, a locale, and
                  keyboard support that no picker component here would improve on. */}
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="glass-field h-10 w-full rounded-lg px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">To</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="glass-field h-10 w-full rounded-lg px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <Button
            className="w-full sm:w-auto"
            onClick={consolidate}
            disabled={isWorking || !consolidateCustomerId}
          >
            <FileText className="mr-2 h-4 w-4" aria-hidden />
            Issue consolidated invoice
          </Button>
          <p className="text-xs text-muted-foreground">
            Covers paid orders in the period that aren&apos;t already on an invoice. Every order is
            invoiced automatically when it&apos;s paid — use this when a customer wants one bill
            for the month instead.
          </p>
        </CardContent>
      </Card>

      <Card className="glass-sheen">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red text-white">
              <ReceiptIndianRupee className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-foreground">Create a custom invoice</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">For fees or adjustments that do not have an order.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Bill something that has no order behind it — a re-delivery fee, packaging, a
            correction. It takes the next number in the same statutory series and produces the
            same document.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Customer</span>
              <NativeSelect
                value={customCustomerId}
                onChange={(e) => setCustomCustomerId(e.target.value)}
                aria-label="Customer to invoice"
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.phone}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Amount (₹, including GST)
              </span>
              {/* Tax-inclusive on purpose — it is the figure the customer was quoted, and the
                  taxable value is back-derived from it so the total lands exactly there. */}
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="0.00"
                className="glass-field h-10 w-full rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              What is being billed
            </span>
            <input
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="e.g. Re-delivery attempt — AWB NW-26-000123"
              maxLength={300}
              className="glass-field h-10 w-full rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-xs text-muted-foreground">
              Printed as the invoice&apos;s line item.
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Place of supply (optional)
            </span>
            <input
              value={customPlaceOfSupply}
              onChange={(e) => setCustomPlaceOfSupply(e.target.value)}
              placeholder="Leave blank for an intra-state supply"
              className="glass-field h-10 w-full rounded-lg px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-xs text-muted-foreground">
              Naming another state is what makes this charge IGST instead of CGST+SGST.
            </span>
          </label>

          <Button className="w-full sm:w-auto" onClick={createCustom} disabled={isWorking}>
            <ReceiptIndianRupee className="mr-2 h-4 w-4" aria-hidden />
            Issue custom invoice
          </Button>
        </CardContent>
      </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-foreground">Issued invoices</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Download a clean PDF or send the selected invoices.</p>
          </div>
          <Button
            onClick={sendSelected}
            disabled={isWorking || !selectedInvoiceIds.length}
            variant="secondary"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Send{selectedInvoiceIds.length ? ` ${selectedInvoiceIds.length}` : ""} on WhatsApp
          </Button>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Generate invoices for a customer and date range above."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Place of supply</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className={inv.status === "CANCELLED" ? "opacity-50" : undefined}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${inv.invoiceNumber}`}
                        // A cancelled invoice must never be sendable.
                        disabled={inv.status === "CANCELLED"}
                        checked={selectedInvoiceIds.includes(inv.id)}
                        onChange={() =>
                          setSelectedInvoiceIds((prev) => toggle(prev, inv.id))
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold text-foreground">{inv.invoiceNumber}</p>
                      {inv.customLineDescription && <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground">{inv.customLineDescription}</p>}
                      {/* text-danger — `destructive` is not a token this app defines, so this
                          label was rendering in the default ink with no colour at all. */}
                      {inv.status === "CANCELLED" && (
                        <span className="ml-2 text-xs font-medium text-danger">CANCELLED</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{inv.customer?.name ?? inv.recipientName}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(inv.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                    <TableCell>
                      {inv.placeOfSupplyState}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {/* Which tax applied is not obvious from the total, and it is the thing
                            most likely to be queried later. */}
                        {inv.igstAmount > 0 ? "IGST" : "CGST+SGST"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{money(inv.taxableValue)}</TableCell>
                    <TableCell className="text-right">{money(inv.totalTax)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {money(inv.totalAmount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {inv.sentAt ? new Date(inv.sentAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => void download(inv)}
                        disabled={downloadingId === inv.id}
                        aria-label={`Download ${inv.invoiceNumber}`}
                        className="glass-interactive inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {downloadingId === inv.id ? (
                          <Spinner size="sm" />
                        ) : (
                          <Download className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
