import type { ShipmentTypeCode } from "./quote";

// Branding/contact/legal text that automatically populates every generated Rate Card PDF —
// singleton, never per-provider or per-template.
export interface CompanySettingsDto {
  id: string;
  companyName: string;
  tagline: string | null;
  logoUrl: string | null; // served via the backend's /uploads static route
  primaryColor: string; // hex, e.g. "#4F46E5"
  website: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  address: string | null;
  termsAndConditions: string | null;
  footerNotes: string | null;
  insuranceDisclaimer: string | null;
  legalDisclaimer: string | null;
  restrictedItemsNotice: string | null;
  updatedAt: string; // ISO 8601
}

export interface UpdateCompanySettingsDto {
  companyName?: string;
  tagline?: string;
  primaryColor?: string;
  website?: string;
  supportEmail?: string;
  supportPhone?: string;
  address?: string;
  termsAndConditions?: string;
  footerNotes?: string;
  insuranceDisclaimer?: string;
  legalDisclaimer?: string;
  restrictedItemsNotice?: string;
}

export const RATE_CARD_TEMPLATE_KEYS = ["CLASSIC"] as const;
export type RateCardTemplateKey = (typeof RATE_CARD_TEMPLATE_KEYS)[number];

// A country the admin picked directly — no zone selection required. Each may resolve to a
// different zone/rate card under the provider; the transit time is per-country since different
// destinations legitimately take different amounts of time.
export interface RateCardCountrySelectionDto {
  countryId: string;
  transitTime?: string;
}

// Request shared by both the stateless /admin/rate-cards/preview endpoint (renders and streams a
// PDF, no history row) and /admin/rate-cards (renders, persists, returns this DTO's saved form).
export interface GenerateRateCardDto {
  rateProviderId: string;
  shipmentType: ShipmentTypeCode;
  countries: RateCardCountrySelectionDto[]; // at least one
  effectiveDate: string; // ISO date (yyyy-mm-dd)
  templateKey?: RateCardTemplateKey; // defaults to CLASSIC
}

// A country lookup scoped to a provider — every country mapped to any of that provider's zones,
// for the admin's country multi-select (which never surfaces zones directly).
export interface RateCardCountryOptionDto {
  id: string;
  code: string;
  name: string;
}

// A persisted, history-listed generation — the actual PDF bytes are fetched separately via
// GET /admin/rate-cards/:id/download so list views stay lightweight. rateProviderName is shown
// only in this internal admin history — the generated PDF itself never names the provider.
export interface RateCardDocumentDto {
  id: string;
  rateProviderId: string;
  rateProviderName: string;
  shipmentType: ShipmentTypeCode;
  countryNames: string[];
  effectiveDate: string; // ISO date
  templateKey: RateCardTemplateKey;
  version: number;
  pdfSizeBytes: number;
  generatedByAdminEmail: string;
  createdAt: string; // ISO 8601
}
