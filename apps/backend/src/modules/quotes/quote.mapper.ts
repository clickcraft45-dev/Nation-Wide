import type {
  CustomerRateQuoteOptionDto,
  FulfillmentMethodCode,
  PickupTimeSlot,
  QuoteAdminDetailDto,
  QuoteDto,
  QuoteReviewReasonCode,
  QuoteStatusCode,
  RateQuoteOptionDto,
  ShipmentTypeCode,
} from '@nationwide/shared-types';
import type { QuoteWithCustomer } from './quotes.service';

type QuoteOption = QuoteWithCustomer['rateQuoteOptions'][number];

// Full internal breakdown — admin-only, see toQuoteAdminDetailDto.
function toAdminRateQuoteOptionDto(option: QuoteOption): RateQuoteOptionDto {
  return {
    id: option.id,
    rateProviderId: option.rateProviderId,
    rateProviderName: option.rateProvider.name,
    currency: option.currency,
    baseRate: option.baseRate.toNumber(),
    pssAmount: option.pssAmount.toNumber(),
    fuelChargePercent: option.fuelChargePercent.toNumber(),
    fuelChargeAmount: option.fuelChargeAmount.toNumber(),
    taxableSubtotal: option.taxableSubtotal.toNumber(),
    gstPercent: option.gstPercent.toNumber(),
    gstAmount: option.gstAmount.toNumber(),
    nationwideCut: option.nationwideCut.toNumber(),
    finalPrice: option.finalPrice.toNumber(),
    createdAt: option.createdAt.toISOString(),
  };
}

// Slim, customer-safe shape — never includes baseRate/PSS/fuel charge/GST/margin.
function toCustomerRateQuoteOptionDto(option: QuoteOption): CustomerRateQuoteOptionDto {
  return {
    id: option.id,
    rateProviderId: option.rateProviderId,
    rateProviderName: option.rateProvider.name,
    currency: option.currency,
    finalPrice: option.finalPrice.toNumber(),
    createdAt: option.createdAt.toISOString(),
  };
}

// Shared by toQuoteDto (customer) and toQuoteAdminDetailDto (admin) — everything except the
// options themselves, whose shape (slim vs full breakdown) is the one thing that must differ
// between the two audiences.
function toQuoteDtoBase<TOption>(
  quote: QuoteWithCustomer,
  mapOption: (option: QuoteOption) => TOption,
): Omit<QuoteDto, 'rateQuoteOptions' | 'selectedOption'> & {
  rateQuoteOptions: TOption[];
  selectedOption: TOption | null;
} {
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
    rateQuoteOptions: quote.rateQuoteOptions.map(mapOption),
    selectedOption: quote.selectedOption ? mapOption(quote.selectedOption) : null,
    optionsExpireAt: quote.optionsExpireAt ? quote.optionsExpireAt.toISOString() : null,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

export function toQuoteDto(quote: QuoteWithCustomer): QuoteDto {
  return toQuoteDtoBase(quote, toCustomerRateQuoteOptionDto);
}

export function toQuoteAdminDetailDto(quote: QuoteWithCustomer): QuoteAdminDetailDto {
  return {
    ...toQuoteDtoBase(quote, toAdminRateQuoteOptionDto),
    internalNotes: quote.internalNotes,
    quotedByAdminEmail: quote.quotedBy?.email ?? null,
    customerName: quote.customer.name,
    customerEmail: quote.customer.email,
    customerPhone: quote.customer.phone,
  };
}
