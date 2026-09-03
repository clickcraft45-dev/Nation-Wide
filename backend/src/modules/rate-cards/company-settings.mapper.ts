import type { CompanySettings } from '@prisma/client';
import type { CompanySettingsDto } from '@nationwide/shared-types';

/**
 * `logoUrl` is passed in rather than derived: the logo lives in a private S3 bucket, so the URL
 * is a short-lived presigned one that only an async caller holding StorageService can mint. The
 * DTO shape is unchanged — consumers still get a URL they can put in an <img src>.
 */
export function toCompanySettingsDto(
  settings: CompanySettings,
  logoUrl: string | null = null,
): CompanySettingsDto {
  return {
    id: settings.id,
    companyName: settings.companyName,
    tagline: settings.tagline,
    logoUrl,
    primaryColor: settings.primaryColor,
    website: settings.website,
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    address: settings.address,
    termsAndConditions: settings.termsAndConditions,
    footerNotes: settings.footerNotes,
    insuranceDisclaimer: settings.insuranceDisclaimer,
    legalDisclaimer: settings.legalDisclaimer,
    restrictedItemsNotice: settings.restrictedItemsNotice,
    gstin: settings.gstin,
    legalName: settings.legalName,
    stateName: settings.stateName,
    stateCode: settings.stateCode,
    sacCode: settings.sacCode,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
