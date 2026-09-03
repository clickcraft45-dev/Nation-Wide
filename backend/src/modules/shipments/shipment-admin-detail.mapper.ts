import type {
  ShipmentAdminDetailDto,
  TrackingStatusCode,
} from '@nationwide/shared-types';
import type { ShipmentAdminDetail } from './shipments.service';

export function toShipmentAdminDetailDto(
  shipment: ShipmentAdminDetail,
): ShipmentAdminDetailDto {
  return {
    id: shipment.id,
    internalTrackingNumber: shipment.internalTrackingNumber,
    orderId: shipment.orderId,
    providerId: shipment.providerId,
    providerCode: shipment.provider.code,
    currentStatus: shipment.currentStatus as TrackingStatusCode | null,
    lastSyncedAt: shipment.lastSyncedAt
      ? shipment.lastSyncedAt.toISOString()
      : null,
    externalTrackingNumbers: shipment.externalTrackingNumbers.map((etn) => ({
      id: etn.id,
      providerId: etn.providerId,
      externalTrackingNumber: etn.externalTrackingNumber,
    })),
    events: shipment.trackingEvents.map((event) => ({
      id: event.id,
      rawStatus: event.rawStatus,
      canonicalStatus: event.canonicalStatus.code as TrackingStatusCode,
      canonicalStatusLabel: event.canonicalStatus.displayLabel,
      eventTime: event.eventTime.toISOString(),
      location: event.location,
    })),
  };
}
