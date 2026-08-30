import type { CompanySettings } from '@prisma/client';
import type { CompanySettingsDto } from '@nationwide/shared-types';

export function toCompanySettingsDto(
  settings: CompanySettings,
): CompanySettingsDto {
  return {
    id: settings.id,
    companyName: settings.companyName,
    tagline: settings.tagline,
    logoUrl: settings.logoPath ? `/uploads/${settings.logoPath}` : null,
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
