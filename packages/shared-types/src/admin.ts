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
  newQuotes: number;
  needsManualReview: number;
  scheduledPickups: number;
  dropOffs: number;
  pendingPayments: number;
}
