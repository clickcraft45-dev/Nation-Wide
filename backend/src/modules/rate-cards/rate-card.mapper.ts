import type { Prisma } from '@prisma/client';
import type {
  RateCardDocumentDto,
  RateCardTemplateKey,
  ShipmentTypeCode,
} from '@nationwide/shared-types';

const withDetails = {
  include: {
    rateProvider: true,
    generatedBy: { select: { email: true } },
  },
} satisfies Prisma.RateCardDocumentDefaultArgs;

export type RateCardDocumentWithDetails = Prisma.RateCardDocumentGetPayload<
  typeof withDetails
>;

export { withDetails as rateCardDocumentWithDetails };

export function toRateCardDocumentDto(
  doc: RateCardDocumentWithDetails,
): RateCardDocumentDto {
  // The snapshot JSON is exactly the RateCardData built at generation time (see
  // RateCardDataService) — country names are read from there rather than re-joining Country rows,
  // since it's already the authoritative record of what this specific PDF actually contains.
  const snapshot = doc.snapshot as unknown as {
    countries: { id: string; name: string }[];
  };

  return {
    id: doc.id,
    rateProviderId: doc.rateProviderId,
    rateProviderName: doc.rateProvider.name,
    shipmentType: doc.shipmentType as ShipmentTypeCode,
    countryNames: snapshot.countries?.map((c) => c.name) ?? [],
    effectiveDate: doc.effectiveDate.toISOString().slice(0, 10),
    templateKey: doc.templateKey as RateCardTemplateKey,
    version: doc.version,
    pdfSizeBytes: doc.pdfSizeBytes,
    generatedByAdminEmail: doc.generatedBy.email,
    createdAt: doc.createdAt.toISOString(),
  };
}
