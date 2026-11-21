"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type {
  InvoiceBatchResultDto,
  InvoiceDto,
  UpdateInvoiceInput,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

/** Open by shipment (right after an AWB is mapped) or with an invoice already in hand. */
export type InvoiceReviewSource = { trackingNumber: string } | { invoice: InvoiceDto };

interface EditForm {
  recipientName: string;
  recipientPhone: string;
  recipientGstin: string;
  recipientAddress: string;
  placeOfSupplyState: string;
  taxableValue: string;
  nonTaxableCharges: string;
  discountAmount: string;
}

const formFrom = (invoice: InvoiceDto): EditForm => ({
  recipientName: invoice.recipientName,
  recipientPhone: invoice.recipientPhone,
  recipientGstin: invoice.recipientGstin ?? "",
  recipientAddress: invoice.recipientAddress ?? "",
  placeOfSupplyState: invoice.placeOfSupplyState,
  taxableValue: String(invoice.taxableValue),
  nonTaxableCharges: String(invoice.nonTaxableCharges),
  discountAmount: String(invoice.discountAmount),
});

const inr = (value: number) =>
  `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Staff check an order's invoice before the customer gets it.
 *
 * Opened after an AWB is mapped or changed: the PDF is redrawn with that AWB and shown here.
 * Corrections are allowed until it is sent (tax is recalculated by the server); nothing reaches
 * the customer until Send is pressed.
 */
export function InvoiceReviewDialog({
  source,
  onClose,
  onSent,
}: {
  source: InvoiceReviewSource | null;
  onClose: () => void;
  onSent?: (invoice: InvoiceDto) => void;
}) {
  const { showToast } = useToast();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "unpaid" }
    | { kind: "ready"; invoice: InvoiceDto }
  >({ kind: "loading" });
  const [form, setForm] = useState<EditForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfVersion, setPdfVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const open = source !== null;
  const invoice = state.kind === "ready" ? state.invoice : null;
  const editable = Boolean(
    invoice && invoice.status === "ISSUED" && invoice.kind === "ORDER" && !invoice.sentAt,
  );
  const dirty = Boolean(invoice && form && JSON.stringify(form) !== JSON.stringify(formFrom(invoice)));

  // Keyed on a string, not the object: callers build `source` inline, and a parent re-render must
  // not redraw the invoice again.
  const sourceKey = !source
    ? null
    : "invoice" in source
      ? `invoice:${source.invoice.id}`
      : `shipment:${source.trackingNumber}`;
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  });

  // Load (or redraw) the invoice for this shipment.
  useEffect(() => {
    const source = sourceRef.current;
    if (!sourceKey || !source) return;
    let cancelled = false;
    const show = (next: InvoiceDto | null) => {
      if (cancelled) return;
      if (!next) {
        setState({ kind: "unpaid" });
        return;
      }
      setState({ kind: "ready", invoice: next });
      setForm(formFrom(next));
      setPdfVersion((v) => v + 1);
    };
    // Resetting for a new source: one render, on open.
     
    setState({ kind: "loading" });
    setFormError(null);
    if ("invoice" in source) {
      show(source.invoice);
    } else {
      apiClient
        .post<{ invoice: InvoiceDto | null }>(
          `/admin/invoices/review-for-shipment/${encodeURIComponent(source.trackingNumber)}`,
          {},
        )
        .then((res) => show(res.invoice))
        .catch((err) => {
          if (!cancelled) {
            setState({ kind: "error", message: errorMessage(err, "Couldn't prepare the invoice.") });
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  // The PDF as it stands on the server, refetched after every save.
  const invoiceId = invoice?.id;
  useEffect(() => {
    if (!invoiceId || pdfVersion === 0) return;
    let cancelled = false;
    let url: string | null = null;
    apiClient
      .getBlob(`/admin/invoices/${invoiceId}/pdf`)
      .then(({ blob }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPdfUrl(null);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [invoiceId, pdfVersion]);

  function set<K extends keyof EditForm>(key: K, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!invoice || !form) return;
    const amounts = {
      taxableValue: Number(form.taxableValue),
      nonTaxableCharges: Number(form.nonTaxableCharges || 0),
      discountAmount: Number(form.discountAmount || 0),
    };
    if (!form.recipientName.trim()) return setFormError("Enter the customer's name.");
    if (!form.recipientPhone.trim()) return setFormError("Enter the customer's phone.");
    const gstin = form.recipientGstin.trim().toUpperCase();
    if (gstin && !GSTIN.test(gstin)) return setFormError("GSTIN must be 15 characters, e.g. 36ABCDE1234F1Z5.");
    if (Object.values(amounts).some((n) => !Number.isFinite(n) || n < 0)) {
      return setFormError("Amounts must be numbers of 0 or more.");
    }
    const body: UpdateInvoiceInput = {
      recipientName: form.recipientName.trim(),
      recipientPhone: form.recipientPhone.trim(),
      recipientGstin: gstin,
      recipientAddress: form.recipientAddress.trim(),
      placeOfSupplyState: form.placeOfSupplyState.trim(),
      ...amounts,
    };
    setFormError(null);
    setIsSaving(true);
    try {
      const updated = await apiClient.patch<InvoiceDto>(`/admin/invoices/${invoice.id}`, body);
      setState({ kind: "ready", invoice: updated });
      setForm(formFrom(updated));
      setPdfVersion((v) => v + 1);
      showToast({ variant: "success", title: "Invoice updated", description: "Check the preview, then send it." });
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't save the changes."));
    } finally {
      setIsSaving(false);
    }
  }

  async function send() {
    if (!invoice) return;
    setIsSending(true);
    try {
      const result = await apiClient.post<InvoiceBatchResultDto>("/admin/invoices/send", {
        invoiceIds: [invoice.id],
      });
      const failure = result.failed[0];
      if (failure) throw new Error(failure.reason);
      const sent = { ...invoice, sentAt: new Date().toISOString() };
      showToast({
        variant: "success",
        title: `Invoice ${invoice.invoiceNumber} sent`,
        description: "The customer gets it on WhatsApp.",
      });
      onSent?.(sent);
      onClose();
    } catch (err) {
      showToast({ variant: "error", title: "Couldn't send the invoice", description: errorMessage(err, "Please try again.") });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={invoice ? `Review invoice ${invoice.invoiceNumber}` : "Review invoice"}
        description="Nothing is sent to the customer until you press Send."
        className="max-w-5xl"
      >
        {state.kind === "loading" && (
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]" aria-busy="true">
            <Skeleton className="h-[60vh] w-full rounded-xl" />
            <Skeleton className="h-[60vh] w-full rounded-xl" />
          </div>
        )}

        {state.kind === "error" && <FieldError>{state.message}</FieldError>}

        {state.kind === "unpaid" && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              There is no invoice yet because this order isn&apos;t marked paid. It is created when the
              payment is recorded. Then update the AWB again, or open it from the order&apos;s
              Documents, to review and send it.
            </p>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {invoice && form && (
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="overflow-hidden rounded-xl border border-border bg-muted">
              {pdfUrl ? (
                <iframe
                  key={pdfUrl}
                  src={pdfUrl}
                  title={`Invoice ${invoice.invoiceNumber} preview`}
                  className="h-[60vh] w-full"
                />
              ) : (
                <Skeleton className="h-[60vh] w-full" />
              )}
            </div>

            <div className="space-y-4">
              {invoice.status === "CANCELLED" ? (
                <p className="text-sm text-danger">
                  This invoice was cancelled{invoice.cancellationReason ? `: ${invoice.cancellationReason}` : ""}.
                  Issue a new one from Invoices.
                </p>
              ) : !editable ? (
                <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                  {invoice.sentAt
                    ? `Sent on ${new Date(invoice.sentAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}. It can't be edited now. The preview shows the new AWB; send it again so the customer has it. To change an amount, cancel it and issue a new one.`
                    : "This kind of invoice can't be edited here."}
                </p>
              ) : null}

              <fieldset disabled={!editable || isSaving} className="space-y-3">
                <legend className="sr-only">Invoice details</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="inv-name" label="Customer name">
                    <Input id="inv-name" value={form.recipientName} onChange={(e) => set("recipientName", e.target.value)} />
                  </Field>
                  <Field id="inv-phone" label="Phone">
                    <Input id="inv-phone" type="tel" value={form.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} />
                  </Field>
                </div>
                <Field id="inv-gstin" label="Customer GSTIN (optional)">
                  <Input
                    id="inv-gstin"
                    value={form.recipientGstin}
                    onChange={(e) => set("recipientGstin", e.target.value.toUpperCase())}
                    className="font-mono"
                    maxLength={15}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </Field>
                <Field id="inv-address" label="Billing address (optional)">
                  <textarea
                    id="inv-address"
                    rows={2}
                    value={form.recipientAddress}
                    onChange={(e) => set("recipientAddress", e.target.value)}
                    className="glass-field w-full rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </Field>
                <Field id="inv-pos" label="Place of supply (state)">
                  <Input id="inv-pos" value={form.placeOfSupplyState} onChange={(e) => set("placeOfSupplyState", e.target.value)} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field id="inv-taxable" label="Taxable value (₹)">
                    <Input id="inv-taxable" type="number" min="0" step="0.01" inputMode="decimal" value={form.taxableValue} onChange={(e) => set("taxableValue", e.target.value)} className="tabular-nums" />
                  </Field>
                  <Field id="inv-other" label="Other charges (₹)">
                    <Input id="inv-other" type="number" min="0" step="0.01" inputMode="decimal" value={form.nonTaxableCharges} onChange={(e) => set("nonTaxableCharges", e.target.value)} className="tabular-nums" />
                  </Field>
                  <Field id="inv-discount" label="Discount (₹)">
                    <Input id="inv-discount" type="number" min="0" step="0.01" inputMode="decimal" value={form.discountAmount} onChange={(e) => set("discountAmount", e.target.value)} className="tabular-nums" />
                  </Field>
                </div>
              </fieldset>

              <dl className="space-y-1 rounded-lg border border-border px-3 py-2 text-sm tabular-nums">
                <Row label={invoice.igstAmount > 0 ? `IGST ${invoice.igstRate}%` : `CGST + SGST ${invoice.cgstRate + invoice.sgstRate}%`} value={inr(invoice.totalTax)} />
                <Row label="Total" value={inr(invoice.totalAmount)} strong />
                {dirty && <p className="pt-1 text-xs text-muted-foreground">Tax and total update when you save.</p>}
              </dl>

              {formError && <FieldError>{formError}</FieldError>}

              <div className="flex flex-wrap gap-2">
                {editable && (
                  <Button type="button" variant="secondary" onClick={save} isLoading={isSaving} disabled={!dirty || isSending}>
                    Save changes
                  </Button>
                )}
                {invoice.status === "ISSUED" && (
                  <Button type="button" onClick={send} isLoading={isSending} disabled={dirty || isSaving}>
                    <Send className="h-4 w-4" aria-hidden />
                    {invoice.sentAt ? "Send again" : "Send to customer"}
                  </Button>
                )}
              </div>
              {dirty && <p className="text-xs text-muted-foreground">Save your changes before sending.</p>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-semibold text-foreground" : "text-foreground"}>{value}</dd>
    </div>
  );
}
