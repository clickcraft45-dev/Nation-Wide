"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import type {
  InvoiceDto,
  InvoiceListDto,
  ReceiptDto,
  ReceiptListDto,
} from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * The paperwork this order produced: its tax invoice and any receipts against it.
 *
 * Fetched by customer and filtered down to this order rather than added as a new server-side
 * filter — an account's invoice list is small, and the alternative is a query parameter on two
 * endpoints for one screen.
 */
export function OrderDocumentsCard({
  orderId,
  customerId,
}: {
  orderId: string;
  customerId: string;
}) {
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [receipts, setReceipts] = useState<ReceiptDto[]>([]);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient
        .get<InvoiceListDto>(`/admin/invoices?customerIds=${customerId}&take=200`)
        .catch(() => ({ items: [], total: 0 })),
      apiClient
        .get<ReceiptListDto>(`/admin/receipts?customerId=${customerId}&take=200`)
        .catch(() => ({ items: [], total: 0 })),
    ]).then(([invoiceRes, receiptRes]) => {
      if (cancelled) return;
      setInvoices(invoiceRes.items.filter((i) => i.orderId === orderId));
      setReceipts(receiptRes.items.filter((r) => r.orderId === orderId));
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, customerId]);

  async function openPdf(path: string) {
    try {
      const { blob } = await apiClient.getBlob(path);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch {
      showToast({ variant: "error", title: "Couldn't open that document." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" aria-hidden />
          Invoices &amp; receipts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {invoices.length === 0 && receipts.length === 0 && (
          <p className="text-muted-foreground">
            Nothing issued for this order yet — an invoice and receipt are raised when the payment
            is recorded.
          </p>
        )}

        {invoices.map((invoice) => (
          <div key={invoice.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">{invoice.invoiceNumber}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(invoice.invoiceDate).toLocaleDateString("en-IN")} · {invoice.status}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openPdf(`/admin/invoices/${invoice.id}/pdf`)}
            >
              Invoice PDF
            </Button>
          </div>
        ))}

        {receipts.map((receipt) => (
          <div key={receipt.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">{receipt.receiptNumber}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(receipt.receivedAt).toLocaleDateString("en-IN")} · ₹
                {receipt.amount.toLocaleString("en-IN")} · {receipt.paymentMethod}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openPdf(`/admin/receipts/${receipt.id}/pdf`)}
            >
              Receipt PDF
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
