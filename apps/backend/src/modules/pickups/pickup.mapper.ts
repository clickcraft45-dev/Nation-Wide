import type {
  FulfillmentMethodCode,
  PickupDto,
  PickupStatusCode,
  PickupTimeSlot,
} from '@nationwide/shared-types';
import type { PickupWithDetails } from './pickups.service';

export function toPickupDto(pickup: PickupWithDetails): PickupDto {
  return {
    id: pickup.id,
    quoteId: pickup.quoteId,
    orderId: pickup.orderId,
    method: pickup.method as FulfillmentMethodCode,
    status: pickup.status as PickupStatusCode,
    scheduledDate: pickup.scheduledDate
      ? pickup.scheduledDate.toISOString().slice(0, 10)
      : null,
    scheduledTimeSlot: pickup.scheduledTimeSlot as PickupTimeSlot | null,
    assignedStaffEmail: pickup.assignedStaff?.email ?? null,
    confirmedByAdminEmail: pickup.confirmedByAdmin?.email ?? null,
    confirmedAt: pickup.confirmedAt ? pickup.confirmedAt.toISOString() : null,
    weightVerifiedKg: pickup.weightVerifiedKg
      ? pickup.weightVerifiedKg.toNumber()
      : null,
    notes: pickup.notes,
    customerName: pickup.quote.customer.name,
    customerPhone: pickup.quote.customer.phone,
    createdAt: pickup.createdAt.toISOString(),
    updatedAt: pickup.updatedAt.toISOString(),
  };
}
