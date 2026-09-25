/** Statuses a tax invoice can hold. Never deleted — a cancelled invoice keeps its number. */
export type InvoiceStatus = "ISSUED" | "CANCELLED";

/**
 * Where the invoice's tax figures came from. Not equally precise, which is why it is shown to
 * staff rather than kept internal: MANUAL_QUOTE_INCLUSIVE means the taxable value was
 * back-derived from a staff-typed gross amount, not computed by the pricing engine.
 */
/**
 * What kind of document an invoice is.
 *
 * ORDER is the default: one order, one invoice, raised automatically when the order is paid.
 * CUSTOM is a one-off with nothing behind it. CONSOLIDATED bills many orders over a window on a
 * single document and carries a `lines` array instead of a single derived description.
 */
export type InvoiceKind = "ORDER" | "CUSTOM" | "CONSOLIDATED";

export type InvoiceBreakdownSource =
  | "PICKUP_VERIFICATION"
  | "RATE_OPTION"
  | "MANUAL_QUOTE_INCLUSIVE"
  /** A one-off invoice an admin raised by hand, with no order behind it. */
  | "CUSTOM"
  /** A consolidated invoice, whose lines can each come from a different source. */
  | "CONSOLIDATED";

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  financialYear: string;
  /** Null on a one-off invoice raised without an order — see customLineDescription. */
  orderId: string | null;
  /** What is being billed, when there is no order to describe it. */
  customLineDescription: string | null;
  customerId: string;
  customer: { name: string; phone: string } | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  invoiceDate: string; // ISO 8601

  /** The window a CONSOLIDATED invoice covers. Null on every other kind. */
  periodFrom: string | null; // ISO 8601
  periodTo: string | null; // ISO 8601
  /** How many orders a CONSOLIDATED invoice bills. 0 on every other kind. */
  lineCount: number;

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

/**
 * One shipment on a custom invoice's annexure — the shape of the freight schedule the office
 * already bills from: one row per AWB, with the charges that make up its total spelled out
 * separately because the customer reconciles them separately.
 *
 * Everything except the amount is optional: a row for a correction or a re-delivery fee has no
 * AWB and no weight, and forcing a placeholder into those columns would put fiction on a tax
 * document.
 */
export interface CustomInvoiceLineDto {
  awbNumber?: string | null;
  /** Date of supply for this shipment, ISO 8601. */
  supplyDate?: string | null;
  destination?: string | null;
  /** Carrier network the shipment moved on, e.g. "FDX". */
  network?: string | null;
  /** Document or sample/parcel service code, e.g. "SPX" / "FE". */
  service?: string | null;
  weightKg?: number | null;
  /** Base freight. */
  amount: number;
  /** GMR / commercial charge. */
  otherCharges?: number | null;
  /** Peak season surcharge. */
  pss?: number | null;
  /** Fuel surcharge. */
  fsc?: number | null;
}

/**
 * What a row adds up to. Lives in shared-types and is used by BOTH the admin form's running
 * total and the server that issues the invoice, so the figure on screen and the figure on the
 * document cannot drift — the server still recomputes it rather than trusting the client.
 */
export function customInvoiceLineTotal(line: CustomInvoiceLineDto): number {
  const sum =
    (line.amount ?? 0) +
    (line.otherCharges ?? 0) +
    (line.pss ?? 0) +
    (line.fsc ?? 0);
  return Math.round(sum * 100) / 100;
}

export function customInvoiceTotal(lines: CustomInvoiceLineDto[]): number {
  const sum = lines.reduce((acc, line) => acc + customInvoiceLineTotal(line), 0);
  return Math.round(sum * 100) / 100;
}
