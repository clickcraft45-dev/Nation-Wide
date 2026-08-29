import type {
  CustomerRateQuoteOptionDto,
  PickupTimeSlot,
  QuoteAdminDetailDto,
  QuoteDto,
  RateQuoteOptionDto,
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
    baseRate: option.baseRate,
    pssAmount: option.pssAmount,
    fuelChargePercent: option.fuelChargePercent,
    fuelChargeAmount: option.fuelChargeAmount,
    taxableSubtotal: option.taxableSubtotal,
    gstPercent: option.gstPercent,
    gstAmount: option.gstAmount,
    nationwideCut: option.nationwideCut,
    finalPrice: option.finalPrice,
    createdAt: option.createdAt.toISOString(),
  };
}

// Slim, customer-safe shape — never includes baseRate/PSS/fuel charge/GST/margin.
function toCustomerRateQuoteOptionDto(
  option: QuoteOption,
): CustomerRateQuoteOptionDto {
  return {
    id: option.id,
    rateProviderId: option.rateProviderId,
    rateProviderName: option.rateProvider.name,
    currency: option.currency,
    finalPrice: option.finalPrice,
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
    shipmentType: quote.shipmentType,
    weightKg: quote.weightKg,
    description: quote.description,
    // Null on the new customer self-service flow (pickup logistics live on PickupRequest
    // instead) — originName is the sole discriminator since all origin fields go null together.
    origin: quote.originName
      ? {
          name: quote.originName,
          phone: quote.originPhone!,
          addressLine1: quote.originAddressLine1!,
          addressLine2: quote.originAddressLine2,
          city: quote.originCity!,
          state: quote.originState!,
          postalCode: quote.originPostalCode!,
          country: quote.originCountry!,
          instructions: quote.originInstructions,
        }
      : null,
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
    fulfillmentMethod: quote.fulfillmentMethod,
    pickupDate: quote.pickupDate
      ? quote.pickupDate.toISOString().slice(0, 10)
      : null,
    pickupTimeSlot: quote.pickupTimeSlot as PickupTimeSlot | null,
    status: quote.status,
    reviewReason: quote.reviewReason,
    quotedAmount: quote.quotedAmount ? quote.quotedAmount : null,
    quotedCurrency: quote.quotedCurrency,
    quotedAt: quote.quotedAt ? quote.quotedAt.toISOString() : null,
    rejectionReason: quote.rejectionReason,
    orderId: quote.orderId,
    rateQuoteOptions: quote.rateQuoteOptions.map(mapOption),
    selectedOption: quote.selectedOption
      ? mapOption(quote.selectedOption)
      : null,
    optionsExpireAt: quote.optionsExpireAt
      ? quote.optionsExpireAt.toISOString()
      : null,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

export function toQuoteDto(quote: QuoteWithCustomer): QuoteDto {
  return toQuoteDtoBase(quote, toCustomerRateQuoteOptionDto);
}

export function toQuoteAdminDetailDto(
  quote: QuoteWithCustomer,
): QuoteAdminDetailDto {
  return {
    ...toQuoteDtoBase(quote, toAdminRateQuoteOptionDto),
    internalNotes: quote.internalNotes,
    quotedByAdminEmail: quote.quotedBy?.email ?? null,
    customerName: quote.customer.name,
    customerEmail: quote.customer.email,
    customerPhone: quote.customer.phone,
  };
}
