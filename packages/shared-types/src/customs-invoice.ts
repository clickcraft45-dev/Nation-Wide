/**
 * The invoice that travels with a personal international shipment: consignor, consignee, each box
 * with its weight and size, and what is in it at a declared value. Generated on demand as a PDF
 * and not stored or numbered: it is a customs declaration, not a GST tax invoice.
 */
export interface CustomsInvoiceItemDto {
  description: string;
  quantity: number;
  /** Declared value of one unit, in INR. */
  rate: number;
}

export interface CustomsInvoiceBoxDto {
  /** Actual weight in kg, printed as "BOX - 1 WEIGHT : 21.800KGS". */
  weightKg: number;
  /** As written on the label, e.g. "61*42*24". */
  dimensions?: string | null;
  items: CustomsInvoiceItemDto[];
}

export interface CustomsInvoiceDto {
  invoiceNumber?: string | null;
  /** YYYY-MM-DD. */
  invoiceDate: string;

  consignorName: string;
  /** Multi-line address, one line per row on the invoice. */
  consignorAddress: string;
  consignorPhone?: string | null;
  /** E.g. "AADHAAR NO." or "PAN NO."; printed in front of the number. */
  consignorIdLabel?: string | null;
  consignorIdNumber?: string | null;

  consigneeName: string;
  consigneeAddress: string;
  consigneeCountry: string;
  consigneePhone?: string | null;

  buyer?: string | null;
  countryOfOrigin: string;
  countryOfDestination: string;
  /** E.g. "FOR PERSONAL USE". */
  terms?: string | null;
  preCarriageBy?: string | null;
  placeOfReceipt?: string | null;
  vesselFlightNo?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  finalDestination?: string | null;

  /** Chargeable total; left blank, the sum of the box weights is printed. */
  totalWeightKg?: number | null;
  boxes: CustomsInvoiceBoxDto[];
  /** The declaration under the total, one line per row. */
  declaration?: string | null;
}

export const CUSTOMS_INVOICE_DEFAULT_TERMS = "FOR PERSONAL USE";

export function customsInvoiceDefaultDeclaration(destination: string): string {
  return [
    `We are sending the above items to ${destination || "the destination"} FOR PERSONAL USE`,
    "And it is not for sale and does not have any commercial value. Value declared for customs purpose only.",
    "We certify that the information given above is true and correct",
    "to the best of our knowledge",
  ].join("\n");
}

export function customsInvoiceTotal(boxes: CustomsInvoiceBoxDto[]): number {
  return boxes.reduce(
    (sum, box) =>
      sum + box.items.reduce((s, item) => s + (item.quantity || 0) * (item.rate || 0), 0),
    0,
  );
}
