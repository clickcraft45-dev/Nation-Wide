"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, ReceiptIndianRupee, Send } from "lucide-react";
import type {
  CustomerDto,
  InvoiceBatchResultDto,
  InvoiceDto,
  InvoiceListDto,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { SearchInput } from "@/components/ui/search-input";
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
import { cn } from "@/lib/utils/cn";

/** yyyy-mm-dd, the value format <input type="date"> requires. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function firstOfThisMonth(): string {
  const now = new Date();
  return isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
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

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [from, setFrom] = useState(firstOfThisMonth);
  const [to, setTo] = useState(() => isoDay(new Date()));
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
          err instanceof ApiError ? "Failed to load invoices." : "Something went wrong.",
        );
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Fetching on mount is a one-shot lookup, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    );
  }, [customers, customerSearch]);

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  /**
   * Both bulk actions report partial success, because that is what the API returns and what
   * actually happens: one unpriced order among forty should not read as "generation failed".
   */
  function reportBatch(result: InvoiceBatchResultDto, verb: string) {
    // Nothing at all came back — no orders matched the customers and window. That is a filter
    // problem, not a failure, and "0 generated" on its own sent admins hunting for a bug.
    if (!result.created.length && !result.skipped.length && !result.failed.length) {
      showToast({
        variant: "error",
        title: "No invoiceable orders in that range.",
        description:
          "Those customers have no non-cancelled orders created between the selected dates. Widen the range, or use Custom invoice below to bill something without an order.",
      });
      return;
    }

    const parts = [`${result.created.length} ${verb}`];
    if (result.skipped.length) parts.push(`${result.skipped.length} already existed`);
    if (result.failed.length) parts.push(`${result.failed.length} failed`);
    showToast({
      title: parts.join(", "),
      variant: result.failed.length ? "error" : "success",
      // The reasons matter more than the count — an admin needs to know WHICH order and why,
      // and the first few are enough to recognise the pattern without burying the screen.
      description: result.failed.length
        ? result.failed
            .slice(0, 3)
            .map((f) => `Order ${f.orderId.slice(0, 8)}: ${f.reason}`)
            .join(" · ")
        : undefined,
    });
  }

  async function generate() {
    if (!selectedCustomerIds.length) {
      showToast({ title: "Select at least one customer.", variant: "error" });
      return;
    }
    setIsWorking(true);
    try {
      const result = await apiClient.post<InvoiceBatchResultDto>(
        "/admin/invoices/generate",
        {
          customerIds: selectedCustomerIds,
          // End of the chosen day, not its midnight — otherwise "to = today" silently excludes
          // everything ordered today, which is the single most common thing to want.
          from: new Date(`${from}T00:00:00.000`).toISOString(),
          to: new Date(`${to}T23:59:59.999`).toISOString(),
        },
      );
      reportBatch(result, "generated");
      load();
    } catch (err) {
      showToast({
        title:
          err instanceof ApiError && typeof err.body === "object" && err.body !== null
            ? String((err.body as { message?: string }).message ?? "Generation failed.")
            : "Generation failed.",
        variant: "error",
      });
    } finally {
      setIsWorking(false);
    }
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">GST Invoices</h1>
        <p className="text-sm text-muted-foreground">
          Generate tax invoices for selected customers over a date range, then send them on
          WhatsApp.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">To</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                Customers ({selectedCustomerIds.length} selected)
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelectedCustomerIds(
                    selectedCustomerIds.length === filteredCustomers.length
                      ? []
                      : filteredCustomers.map((c) => c.id),
                  )
                }
                className="text-xs font-medium text-primary hover:underline"
              >
                {selectedCustomerIds.length === filteredCustomers.length
                  ? "Clear all"
                  : "Select all shown"}
              </button>
            </div>
            <SearchInput
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search customers by name or phone"
              aria-label="Search customers"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {filteredCustomers.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No customers match.</p>
              ) : (
                filteredCustomers.map((c) => (
                  <label
                    key={c.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0",
                      selectedCustomerIds.includes(c.id) && "bg-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(c.id)}
                      onChange={() =>
                        setSelectedCustomerIds((prev) => toggle(prev, c.id))
                      }
                    />
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="text-muted-foreground">{c.phone}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <Button onClick={generate} disabled={isWorking || !selectedCustomerIds.length}>
            <FileText className="mr-2 h-4 w-4" aria-hidden />
            Generate invoices
          </Button>
          <p className="text-xs text-muted-foreground">
            One invoice per order. Orders already invoiced are skipped, and cancelled orders are
            never invoiced.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom invoice</CardTitle>
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
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              Naming another state is what makes this charge IGST instead of CGST+SGST.
            </span>
          </label>

          <Button onClick={createCustom} disabled={isWorking}>
            <ReceiptIndianRupee className="mr-2 h-4 w-4" aria-hidden />
            Issue custom invoice
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Issued invoices</CardTitle>
          <Button
            onClick={sendSelected}
            disabled={isWorking || !selectedInvoiceIds.length}
            variant="secondary"
          >
            <Send className="mr-2 h-4 w-4" aria-hidden />
            Send {selectedInvoiceIds.length || ""} on WhatsApp
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
                    <TableCell className="font-medium">
                      {inv.invoiceNumber}
                      {/* text-danger — `destructive` is not a token this app defines, so this
                          label was rendering in the default ink with no colour at all. */}
                      {inv.status === "CANCELLED" && (
                        <span className="ml-2 text-xs font-medium text-danger">CANCELLED</span>
                      )}
                    </TableCell>
                    <TableCell>{inv.customer?.name ?? inv.recipientName}</TableCell>
                    <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
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
                    <TableCell className="text-right font-medium">
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
                        className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        {downloadingId === inv.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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
