import type { PaymentMethodCode } from "./order";

/**
 * A payment receipt — the acknowledgement that money arrived.
 *
 * Deliberately not a variant of InvoiceDto. An invoice is a demand and a tax document; a receipt
 * records a payment against one (or against several, when a consolidated invoice is settled in
 * one go). They carry separate numbering series, are raised at different moments by different
 * people, and only the invoice can be claimed against — collapsing them into one type invites
 * exactly the confusion the two documents exist to avoid.
 */
export interface ReceiptDto {
  id: string;
  /** "RCP/2026-27/00019" — its own series, never a number out of the invoice sequence. */
  receiptNumber: string;
  financialYear: string;

  customerId: string;
  customer: { name: string; phone: string } | null;

  /** The order this settles. Null when the payment covered a consolidated invoice. */
  orderId: string | null;
  /** Null when payment was taken before an invoice could be raised. */
  invoiceId: string | null;
  invoiceNumber: string | null;

  recipientName: string;
  currency: string;
  amount: number;
  paymentMethod: PaymentMethodCode;
  receivedAt: string; // ISO 8601

  sentAt: string | null; // when the WhatsApp send was ACCEPTED, not when delivered
  createdAt: string; // ISO 8601
}

export interface ReceiptListDto {
  items: ReceiptDto[];
  total: number;
}
