import type {
  KycDocumentType,
  ParcelPackageDto,
  PaymentSplitDto,
  PickupPhotoDto,
  PickupRequestDto,
  ShipmentItemDto,
} from '@nationwide/shared-types';
import type { PickupRequestWithDetails } from './pickup-requests.service';

function toPhotoDto(photo: {
  id: string;
  kind: PickupPhotoDto['kind'];
  label: string;
  createdAt: Date;
}): PickupPhotoDto {
  return {
    id: photo.id,
    kind: photo.kind,
    label: photo.label,
    createdAt: photo.createdAt.toISOString(),
  };
}

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
    estimatedWeightKg: pickupRequest.estimatedWeightKg,
    estimatedPrice: pickupRequest.estimatedPrice,
    currency: pickupRequest.currency,
    couponCode: pickupRequest.coupon?.code ?? null,
    discountAmount: pickupRequest.discountAmount,
    doorDiscount: pickupRequest.doorDiscountAmount
      ? {
          amount: pickupRequest.doorDiscountAmount,
          reason: pickupRequest.doorDiscountReason ?? '',
          approvedByAdminName:
            pickupRequest.doorDiscountApprovedBy?.name ??
            pickupRequest.doorDiscountApprovedBy?.email ??
            null,
        }
      : null,
    // Computed here so the customer app, the partner app and the door all quote one figure.
    payableAmount:
      Math.round(
        Math.max(
          0,
          (pickupRequest.verifiedPrice ?? pickupRequest.estimatedPrice) -
            (pickupRequest.discountAmount ?? 0) -
            (pickupRequest.doorDiscountAmount ?? 0),
        ) * 100,
      ) / 100,

    dropAtWarehouse: pickupRequest.dropAtWarehouse,
    pickupContactName: pickupRequest.pickupContactName,
    pickupContactPhone: pickupRequest.pickupContactPhone,
    pickupAddressLine1: pickupRequest.pickupAddressLine1,
    pickupAddressLine2: pickupRequest.pickupAddressLine2,
    pickupCity: pickupRequest.pickupCity,
    pickupState: pickupRequest.pickupState,
    pickupPostalCode: pickupRequest.pickupPostalCode,
    pickupLatitude: pickupRequest.pickupLatitude,
    pickupLongitude: pickupRequest.pickupLongitude,
    pickupMapsUrl: pickupRequest.pickupMapsUrl,
    pickupDate: pickupRequest.pickupDate
      ? pickupRequest.pickupDate.toISOString().slice(0, 10)
      : null,
    pickupTimeSlot:
      pickupRequest.pickupTimeSlot as PickupRequestDto['pickupTimeSlot'],
    pickupInstructions: pickupRequest.pickupInstructions,

    destCity: pickupRequest.quote.destCity,
    destState: pickupRequest.quote.destState,
    destPostalCode: pickupRequest.quote.destPostalCode,
    destCountry: pickupRequest.quote.destCountry,
    // Null until someone has entered the delivery address — the customer may leave it for the
    // partner to take down at pickup.
    recipient: pickupRequest.quote.destAddressLine1
      ? {
          name: pickupRequest.quote.destName ?? '',
          phone: pickupRequest.quote.destPhone ?? '',
          addressLine1: pickupRequest.quote.destAddressLine1,
          addressLine2: pickupRequest.quote.destAddressLine2,
          city: pickupRequest.quote.destCity ?? '',
          state: pickupRequest.quote.destState ?? '',
          postalCode: pickupRequest.quote.destPostalCode ?? '',
        }
      : null,
    recipientVerifiedAt: pickupRequest.recipientVerifiedAt
      ? pickupRequest.recipientVerifiedAt.toISOString()
      : null,

    packages: pickupRequest.quote.packages as ParcelPackageDto[] | null,
    verifiedPackages: pickupRequest.verifiedPackages as
      ParcelPackageDto[] | null,
    items: pickupRequest.quote.items as ShipmentItemDto[] | null,
    kycDocument:
      pickupRequest.customer.kycDocumentType &&
      pickupRequest.customer.kycDocumentNumber
        ? {
            type: pickupRequest.customer.kycDocumentType as KycDocumentType,
            number: pickupRequest.customer.kycDocumentNumber,
          }
        : null,
    // Labels only. The photos themselves go out solely as short-lived links, on request.
    kycPhotos: pickupRequest.customer.photos.map(toPhotoDto),
    parcelPhotos: pickupRequest.photos
      .filter((p) => p.kind === 'PARCEL')
      .map(toPhotoDto),
    paymentPhotos: pickupRequest.photos
      .filter((p) => p.kind === 'PAYMENT')
      .map(toPhotoDto),

    status: pickupRequest.status,

    assignedPartnerId: pickupRequest.assignedPartnerId,
    assignedPartnerName:
      pickupRequest.assignedPartner?.name ??
      pickupRequest.assignedPartner?.email ??
      null,
    // Shown to the customer once a partner has accepted, so they can call whoever is coming.
    assignedPartnerPhone: pickupRequest.assignedPartner?.phone ?? null,
    assignedAt: pickupRequest.assignedAt
      ? pickupRequest.assignedAt.toISOString()
      : null,

    arrivedAt: pickupRequest.arrivedAt
      ? pickupRequest.arrivedAt.toISOString()
      : null,

    verifiedWeightKg: pickupRequest.verifiedWeightKg
      ? pickupRequest.verifiedWeightKg
      : null,
    verifiedShipmentType: pickupRequest.verifiedShipmentType,
    verifiedPrice: pickupRequest.verifiedPrice
      ? pickupRequest.verifiedPrice
      : null,
    verificationNotes: pickupRequest.verificationNotes,
    verifiedAt: pickupRequest.verifiedAt
      ? pickupRequest.verifiedAt.toISOString()
      : null,

    paymentMethod: pickupRequest.paymentMethod,
    collectedAmount: pickupRequest.collectedAmount
      ? pickupRequest.collectedAmount
      : null,
    paymentReference: pickupRequest.paymentReference,
    paymentNotes: pickupRequest.paymentNotes,
    paymentCollectedAt: pickupRequest.paymentCollectedAt
      ? pickupRequest.paymentCollectedAt.toISOString()
      : null,
    paymentDeferredAt: pickupRequest.paymentDeferredAt
      ? pickupRequest.paymentDeferredAt.toISOString()
      : null,
    paymentDueApprovedByAdminName:
      pickupRequest.paymentDueApprovedBy?.name ?? null,
    paymentDueNote: pickupRequest.paymentDueNote,
    paymentSplits: pickupRequest.paymentSplits as PaymentSplitDto[] | null,

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
