/** Statuses a tax invoice can hold. Never deleted — a cancelled invoice keeps its number. */
export type InvoiceStatus = "ISSUED" | "CANCELLED";

/**
 * Where the invoice's tax figures came from. Not equally precise, which is why it is shown to
 * staff rather than kept internal: MANUAL_QUOTE_INCLUSIVE means the taxable value was
 * back-derived from a staff-typed gross amount, not computed by the pricing engine.
 */
export type InvoiceBreakdownSource =
  | "PICKUP_VERIFICATION"
  | "RATE_OPTION"
  | "MANUAL_QUOTE_INCLUSIVE";

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  financialYear: string;
  orderId: string;
  customerId: string;
  customer: { name: string; phone: string } | null;
  status: InvoiceStatus;
  invoiceDate: string; // ISO 8601

  recipientName: string;
  recipientGstin: string | null;
  placeOfSupplyState: string;
  placeOfSupplyCode: string;

  currency: string;
  taxableValue: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalTax: number;
  nonTaxableCharges: number;
  totalAmount: number;
  breakdownSource: InvoiceBreakdownSource;

  sentAt: string | null; // when the WhatsApp send was ACCEPTED, not when delivered
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface InvoiceListDto {
  items: InvoiceDto[];
  total: number;
}

/**
 * Result of a bulk generate or send. Partial success is normal — one unpriced order must not
 * stop the rest — so every outcome is reported rather than collapsed into an error.
 */
export interface InvoiceBatchResultDto {
  created: string[];
  skipped: { orderId: string; invoiceId: string }[];
  failed: { orderId: string; reason: string }[];
}

export interface GenerateInvoicesRequest {
  customerIds: string[];
  from: string; // ISO 8601
  to: string; // ISO 8601
}
