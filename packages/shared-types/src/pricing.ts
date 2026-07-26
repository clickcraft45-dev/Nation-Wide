import type { ShipmentTypeCode } from "./quote";

export interface RateProviderDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateRateProviderDto {
  code: string;
  name: string;
}

export interface UpdateRateProviderDto {
  name?: string;
  isActive?: boolean;
}

export interface CountryDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateCountryDto {
  code: string;
  name: string;
}

export interface UpdateCountryDto {
  name?: string;
  isActive?: boolean;
}

// A carrier-specific grouping of countries that share the same tariff (e.g. FedEx "Zone A", DHL
// "Zone 11") — zone definitions are never shared across providers. The admin manages zones
// directly (unlike the invisible RateCard grouping key).
export interface ZoneDto {
  id: string;
  rateProviderId: string;
  rateProviderName: string;
  name: string;
  countryCount: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateZoneDto {
  rateProviderId: string;
  name: string;
}

export interface UpdateZoneDto {
  name: string;
}

export interface ZoneCountryDto {
  zoneId: string;
  countryId: string;
  countryName: string;
}

// A single admin-managed rate for one (zone, shipment type, weight) combination — the unit of
// status, editing, and audit history in the admin panel. There is no user-facing "rate card"
// concept; provider/zone/shipmentType/currency are shown as flat context alongside the 5
// pricing fields.
export interface RateDto {
  id: string;
  rateProviderId: string;
  rateProviderName: string;
  zoneId: string;
  zoneName: string;
  shipmentType: ShipmentTypeCode;
  currency: string;
  weightFromKg: number;
  weightToKg: number;
  baseRate: number;
  pssAmount: number;
  fuelChargePercent: number;
  gstPercent: number;
  nationwideCut: number;
  isActive: boolean;
  createdByAdminEmail: string | null;
  updatedByAdminEmail: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateRateDto {
  zoneId: string;
  shipmentType: ShipmentTypeCode;
  weightFromKg: number;
  weightToKg: number;
  baseRate: number;
  pssAmount?: number;
  fuelChargePercent?: number;
  gstPercent?: number;
  nationwideCut?: number;
}

export interface UpdateRateDto {
  weightFromKg?: number;
  weightToKg?: number;
  baseRate?: number;
  pssAmount?: number;
  fuelChargePercent?: number;
  gstPercent?: number;
  nationwideCut?: number;
}

// The 409 response body when POST /admin/rates hits an exact-match active rate — the frontend
// renders this as "A rate already exists... Update Existing Rate / Cancel".
export interface DuplicateRateConflictDto {
  message: "duplicate_rate";
  existingRateId: string;
  rateProviderName: string;
  zoneName: string;
  shipmentType: ShipmentTypeCode;
  weightFromKg: number;
  weightToKg: number;
}

// Frozen snapshot of one provider's computed price for one Quote request — see Quote Snapshot.
export interface RateQuoteOptionDto {
  id: string;
  rateProviderId: string;
  rateProviderName: string;
  currency: string;
  baseRate: number;
  pssAmount: number;
  fuelChargePercent: number;
  fuelChargeAmount: number;
  taxableSubtotal: number;
  gstPercent: number;
  gstAmount: number;
  nationwideCut: number;
  finalPrice: number;
  createdAt: string; // ISO 8601
}
