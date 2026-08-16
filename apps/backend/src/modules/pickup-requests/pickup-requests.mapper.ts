import type { PickupRequestDto } from '@nationwide/shared-types';
import type { PickupRequestWithDetails } from './pickup-requests.service';

export function toPickupRequestDto(
  pickupRequest: PickupRequestWithDetails,
): PickupRequestDto {
  return {
    id: pickupRequest.id,
    quoteId: pickupRequest.quoteId,
    customerId: pickupRequest.customerId,
    customerName: pickupRequest.customer.name,
    customerPhone: pickupRequest.customer.phone,

    rateProviderId: pickupRequest.rateProviderId,
    rateProviderName: pickupRequest.rateProviderName,
    shipmentType: pickupRequest.shipmentType,
    estimatedWeightKg: pickupRequest.estimatedWeightKg.toNumber(),
    estimatedPrice: pickupRequest.estimatedPrice.toNumber(),
    currency: pickupRequest.currency,

    dropAtWarehouse: pickupRequest.dropAtWarehouse,
    pickupContactName: pickupRequest.pickupContactName,
    pickupContactPhone: pickupRequest.pickupContactPhone,
    pickupAddressLine1: pickupRequest.pickupAddressLine1,
    pickupAddressLine2: pickupRequest.pickupAddressLine2,
    pickupCity: pickupRequest.pickupCity,
    pickupState: pickupRequest.pickupState,
    pickupPostalCode: pickupRequest.pickupPostalCode,
    pickupDate: pickupRequest.pickupDate
      ? pickupRequest.pickupDate.toISOString().slice(0, 10)
      : null,
    pickupTimeSlot:
      pickupRequest.pickupTimeSlot as PickupRequestDto['pickupTimeSlot'],
    pickupInstructions: pickupRequest.pickupInstructions,

    destCity: pickupRequest.quote.destCity,
    destState: pickupRequest.quote.destState,
    destCountry: pickupRequest.quote.destCountry,

    status: pickupRequest.status,

    assignedPartnerId: pickupRequest.assignedPartnerId,
    assignedPartnerName:
      pickupRequest.assignedPartner?.name ??
      pickupRequest.assignedPartner?.email ??
      null,
    assignedAt: pickupRequest.assignedAt
      ? pickupRequest.assignedAt.toISOString()
      : null,

    arrivedAt: pickupRequest.arrivedAt
      ? pickupRequest.arrivedAt.toISOString()
      : null,

    verifiedWeightKg: pickupRequest.verifiedWeightKg
      ? pickupRequest.verifiedWeightKg.toNumber()
      : null,
    verifiedShipmentType: pickupRequest.verifiedShipmentType,
    verifiedPrice: pickupRequest.verifiedPrice
      ? pickupRequest.verifiedPrice.toNumber()
      : null,
    verificationNotes: pickupRequest.verificationNotes,
    verifiedAt: pickupRequest.verifiedAt
      ? pickupRequest.verifiedAt.toISOString()
      : null,

    paymentMethod: pickupRequest.paymentMethod,
    collectedAmount: pickupRequest.collectedAmount
      ? pickupRequest.collectedAmount.toNumber()
      : null,
    paymentReference: pickupRequest.paymentReference,
    paymentNotes: pickupRequest.paymentNotes,
    paymentCollectedAt: pickupRequest.paymentCollectedAt
      ? pickupRequest.paymentCollectedAt.toISOString()
      : null,

    parcelPackedProperly: pickupRequest.parcelPackedProperly,
    weightVerifiedFlag: pickupRequest.weightVerifiedFlag,
    restrictedItemsChecked: pickupRequest.restrictedItemsChecked,
    documentsVerified: pickupRequest.documentsVerified,
    isFragile: pickupRequest.isFragile,
    insuranceRequired: pickupRequest.insuranceRequired,
    acceptanceRemarks: pickupRequest.acceptanceRemarks,

    rejectionReason: pickupRequest.rejectionReason,
    orderId: pickupRequest.orderId,

    createdAt: pickupRequest.createdAt.toISOString(),
    updatedAt: pickupRequest.updatedAt.toISOString(),
  };
}
