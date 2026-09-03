import type { Invoice } from '@prisma/client';
import type {
  InvoiceBreakdownSource,
  InvoiceDto,
} from '@nationwide/shared-types';

type InvoiceWithCustomer = Invoice & {
  customer?: { name: string; phone: string } | null;
};

/**
 * Deliberately omits the supplier snapshot columns. They are identical on every invoice a given
 * company issues and are already visible in Settings — shipping them on each row of a 200-row
 * list is pure weight. They are on the PDF, which is the document that matters.
 */
export function toInvoiceDto(invoice: InvoiceWithCustomer): InvoiceDto {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    financialYear: invoice.financialYear,
    orderId: invoice.orderId,
    customLineDescription: invoice.customLineDescription,
    customerId: invoice.customerId,
    customer: invoice.customer
      ? { name: invoice.customer.name, phone: invoice.customer.phone }
      : null,
    status: invoice.status,
    invoiceDate: invoice.invoiceDate.toISOString(),

    recipientName: invoice.recipientName,
    recipientGstin: invoice.recipientGstin,
    placeOfSupplyState: invoice.placeOfSupplyState,
    placeOfSupplyCode: invoice.placeOfSupplyCode,

    currency: invoice.currency,
    taxableValue: invoice.taxableValue,
    cgstRate: invoice.cgstRate,
    cgstAmount: invoice.cgstAmount,
    sgstRate: invoice.sgstRate,
    sgstAmount: invoice.sgstAmount,
    igstRate: invoice.igstRate,
    igstAmount: invoice.igstAmount,
    totalTax: invoice.totalTax,
    nonTaxableCharges: invoice.nonTaxableCharges,
    totalAmount: invoice.totalAmount,
    breakdownSource: invoice.breakdownSource as InvoiceBreakdownSource,

    sentAt: invoice.sentAt?.toISOString() ?? null,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    cancellationReason: invoice.cancellationReason,
  };
}
