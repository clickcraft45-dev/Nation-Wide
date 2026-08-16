import type { ShipmentTypeCode } from "./quote";

export interface RateProviderDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  // Provider Configuration — constant across every country/weight/shipment-type this provider
  // quotes. Fuel Charge applies as a percentage of Base Rate; PSS is a flat rate per kg, scaled
  // by the shipment's weight at quote time. See RateProviderDto docs / pricing engine.
  fuelChargePercent: number;
  pssPerKg: number;
  // Countries currently configured under this provider (via ZoneCountry) that are themselves
  // active — feeds the Providers grid without a second request per card.
  activeCountryCount: number;
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
  fuelChargePercent?: number;
  pssPerKg?: number;
  reason?: string;
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
// concept; provider/zone/shipmentType/currency are shown as flat context alongside the 3
// pricing fields (Fuel Charge % and PSS live on RateProviderDto instead — see its docs).
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
  gstPercent?: number;
  nationwideCut?: number;
  reason?: string;
}

export interface UpdateRateDto {
  weightFromKg?: number;
  weightToKg?: number;
  baseRate?: number;
  gstPercent?: number;
  nationwideCut?: number;
  reason?: string;
}

export interface SetRateActiveDto {
  isActive: boolean;
  reason?: string;
}

// Values-only bulk edit — weight ranges are fixed (see RatesService.bulkUpdate for why the
// overlap check doesn't apply here).
export interface BulkUpdateRateRowDto {
  id: string;
  baseRate: number;
  gstPercent?: number;
  nationwideCut?: number;
}

export interface BulkUpdateRatesDto {
  updates: BulkUpdateRateRowDto[];
  reason?: string;
}

// No-persistence request for the Individual Rate Editor's live "Final Calculated Price".
export interface PreviewRateDto {
  rateProviderId: string;
  weightKg: number;
  baseRate: number;
  gstPercent?: number;
  nationwideCut?: number;
}

// Response of POST /admin/rates/preview — the same 7-step breakdown as RateQuoteOptionDto,
// minus the persisted-row fields (id/createdAt) a preview never has.
export interface RatePreviewResultDto {
  rateProviderId: string;
  rateProviderName: string;
  baseRate: number;
  pssAmount: number;
  fuelChargePercent: number;
  fuelChargeAmount: number;
  taxableSubtotal: number;
  gstPercent: number;
  gstAmount: number;
  nationwideCut: number;
  finalPrice: number;
}

// One country configured under a provider, with a rollup of how much rate configuration exists
// for it — the Providers -> Countries drill-down list (GET /admin/rate-providers/:id/countries).
export interface ProviderCountryDto {
  countryId: string;
  countryCode: string;
  countryName: string;
  isActive: boolean;
  zoneId: string;
  zoneName: string;
  availableShipmentTypes: ShipmentTypeCode[];
  weightSlabCount: number;
  lastUpdatedAt: string | null; // ISO 8601
}

// GET /admin/rate-providers/:id/countries/:countryId — per-shipment-type configuration status,
// feeding the shipment-type pill selector above Weight Category Selection.
export interface CountryDetailDto {
  countryId: string;
  countryCode: string;
  countryName: string;
  isActive: boolean;
  zoneId: string;
  zoneName: string;
  services: {
    shipmentType: ShipmentTypeCode;
    weightSlabCount: number;
    lastUpdatedAt: string | null; // ISO 8601
  }[];
  lastUpdatedAt: string | null; // ISO 8601
}

// GET /admin/pricing/dashboard-summary — the Pricing Dashboard's summary tiles.
export interface PricingDashboardSummaryDto {
  totalProviders: number;
  activeCountries: number;
  totalZones: number;
  totalRateCards: number;
  lastUpdatedAt: string | null; // ISO 8601
  // Rate edits made since the most recently generated rate card PDF — not yet reflected in any
  // published document.
  pendingChangesCount: number;
  lastGeneratedPdf: { rateProviderName: string; createdAt: string } | null;
}

// GET /admin/pricing/search — one (provider, country) match for the Pricing Dashboard's global
// search; clicking a result deep-links straight into that country's detail page.
export interface PricingSearchResultDto {
  rateProviderId: string;
  rateProviderName: string;
  countryId: string;
  countryName: string;
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
