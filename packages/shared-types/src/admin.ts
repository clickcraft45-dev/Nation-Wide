import type { TrackingStatusCode } from "./tracking";

export interface RawTrackingEventDto {
  id: string;
  rawStatus: string;
  canonicalStatus: TrackingStatusCode;
  canonicalStatusLabel: string;
  eventTime: string; // ISO 8601
  location: string | null;
}

export interface ExternalTrackingNumberDto {
  id: string;
  providerId: string;
  externalTrackingNumber: string;
}

export interface ShipmentAdminDetailDto {
  id: string;
  internalTrackingNumber: string;
  orderId: string;
  providerId: string;
  providerCode: string;
  currentStatus: TrackingStatusCode | null;
  lastSyncedAt: string | null; // ISO 8601
  externalTrackingNumbers: ExternalTrackingNumberDto[];
  events: RawTrackingEventDto[];
}

export interface IntegrationHealthDto {
  providerCode: string;
  windowSize: number;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  errorRatePercent: number;
  avgLatencyMs: number | null;
  lastCallAt: string | null; // ISO 8601
  lastError: { message: string; occurredAt: string } | null;
}

export interface AuditLogEntryDto {
  id: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  // Resolved live for WeightSlab entries only (see AdminService.listAuditLogs) — null for every
  // other entity type.
  rateProviderName: string | null;
  zoneName: string | null;
  createdAt: string; // ISO 8601
}

export interface DashboardSummaryDto {
  /** Total registered customers. A count, so the dashboard KPI never fetches the table to size it. */
  totalCustomers: number;
  newQuotes: number;
  needsManualReview: number;
  scheduledPickups: number;
  dropOffs: number;
  pendingPayments: number;
}

// ---------------------------------------------------------------------------
// Staff / admin account management
// ---------------------------------------------------------------------------

/**
 * A STAFF or ADMIN account. PICKUP_PARTNER rows live in the same table but are managed through
 * their own endpoints (see PickupPartnerDto) — the two have different lifecycles and different
 * people administer them.
 *
 * There is deliberately no password field: the hash never leaves the backend.
 */
export interface AdminUserDto {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: 'STAFF' | 'ADMIN';
  isActive: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateAdminUserDto {
  email: string;
  password: string;
  role: 'STAFF' | 'ADMIN';
  name?: string;
  phone?: string;
}

/** Every field optional — the dashboard PATCHes only what changed. */
export interface UpdateAdminUserDto {
  name?: string;
  phone?: string;
  role?: 'STAFF' | 'ADMIN';
  /** Deactivating also revokes the account's refresh token, ending its sessions. */
  isActive?: boolean;
}

export interface ResetAdminUserPasswordDto {
  password: string;
}
