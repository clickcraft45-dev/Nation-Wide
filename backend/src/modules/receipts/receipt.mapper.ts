import type { Receipt } from '@prisma/client';
import type { ReceiptDto } from '@nationwide/shared-types';

type ReceiptWithRelations = Receipt & {
  customer?: { name: string; phone: string } | null;
  invoice?: { invoiceNumber: string } | null;
};

/**
 * Omits the supplier snapshot for the same reason toInvoiceDto does: it is identical on every
 * receipt the company issues, it is already in Settings, and it is on the PDF — which is the
 * document that actually matters.
 */
export function toReceiptDto(receipt: ReceiptWithRelations): ReceiptDto {
  return {
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    financialYear: receipt.financialYear,
    customerId: receipt.customerId,
    customer: receipt.customer
      ? { name: receipt.customer.name, phone: receipt.customer.phone }
      : null,
    orderId: receipt.orderId,
    invoiceId: receipt.invoiceId,
    invoiceNumber: receipt.invoice?.invoiceNumber ?? null,

    recipientName: receipt.recipientName,
    currency: receipt.currency,
    amount: receipt.amount,
    paymentMethod: receipt.paymentMethod,
    receivedAt: receipt.receivedAt.toISOString(),

    sentAt: receipt.sentAt?.toISOString() ?? null,
    createdAt: receipt.createdAt.toISOString(),
  };
}
