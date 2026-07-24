import type {
  FulfillmentMethodCode,
  PickupTimeSlot,
  QuoteAdminDetailDto,
  QuoteDto,
  QuoteReviewReasonCode,
  QuoteStatusCode,
  ShipmentTypeCode,
} from '@nationwide/shared-types';
import type { QuoteWithCustomer } from './quotes.service';

export function toQuoteDto(quote: QuoteWithCustomer): QuoteDto {
  return {
    id: quote.id,
    customerId: quote.customerId,
    shipmentType: quote.shipmentType as ShipmentTypeCode,
    weightKg: quote.weightKg.toNumber(),
    description: quote.description,
    origin: {
      name: quote.originName,
      phone: quote.originPhone,
      addressLine1: quote.originAddressLine1,
      addressLine2: quote.originAddressLine2,
      city: quote.originCity,
      state: quote.originState,
      postalCode: quote.originPostalCode,
      country: quote.originCountry,
      instructions: quote.originInstructions,
    },
    destination: {
      name: quote.destName,
      phone: quote.destPhone,
      addressLine1: quote.destAddressLine1,
      addressLine2: quote.destAddressLine2,
      city: quote.destCity,
      state: quote.destState,
      postalCode: quote.destPostalCode,
      country: quote.destCountry,
    },
    fulfillmentMethod: quote.fulfillmentMethod as FulfillmentMethodCode,
    pickupDate: quote.pickupDate ? quote.pickupDate.toISOString().slice(0, 10) : null,
    pickupTimeSlot: quote.pickupTimeSlot as PickupTimeSlot | null,
    status: quote.status as QuoteStatusCode,
    reviewReason: quote.reviewReason as QuoteReviewReasonCode | null,
    quotedAmount: quote.quotedAmount ? quote.quotedAmount.toNumber() : null,
    quotedCurrency: quote.quotedCurrency,
    quotedAt: quote.quotedAt ? quote.quotedAt.toISOString() : null,
    rejectionReason: quote.rejectionReason,
    orderId: quote.orderId,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

export function toQuoteAdminDetailDto(
  quote: QuoteWithCustomer,
): QuoteAdminDetailDto {
  return {
    ...toQuoteDto(quote),
    internalNotes: quote.internalNotes,
    quotedByAdminEmail: quote.quotedBy?.email ?? null,
    customerName: quote.customer.name,
    customerEmail: quote.customer.email,
    customerPhone: quote.customer.phone,
  };
}
