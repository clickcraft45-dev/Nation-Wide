import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { RateCardDocumentDto } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../database/storage.service';
import { RateCardDataService } from './rate-card-data.service';
import { RateCardPdfService } from './rate-card-pdf.service';
import { GenerateRateCardDto } from './dto/generate-rate-card.dto';
import { QueryRateCardDocumentsDto } from './dto/query-rate-card-documents.dto';
import {
  rateCardDocumentWithDetails,
  toRateCardDocumentDto,
  type RateCardDocumentWithDetails,
} from './rate-card.mapper';

@Injectable()
export class RateCardDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateCardDataService: RateCardDataService,
    private readonly rateCardPdfService: RateCardPdfService,
    private readonly storage: StorageService,
  ) {}

  // No DB write — lets the admin iterate on country/date selections without cluttering history.
  async preview(dto: GenerateRateCardDto): Promise<Buffer> {
    const data = await this.rateCardDataService.build({
      rateProviderId: dto.rateProviderId,
      shipmentType: dto.shipmentType,
      countries: dto.countries,
      effectiveDate: dto.effectiveDate,
    });
    return this.rateCardPdfService.render(data, dto.templateKey ?? 'CLASSIC');
  }

  async generate(
    dto: GenerateRateCardDto,
    actorId: string,
  ): Promise<{ document: RateCardDocumentDto; pdf: Buffer }> {
    const data = await this.rateCardDataService.build({
      rateProviderId: dto.rateProviderId,
      shipmentType: dto.shipmentType,
      countries: dto.countries,
      effectiveDate: dto.effectiveDate,
    });
    const templateKey = dto.templateKey ?? 'CLASSIC';
    const pdf = await this.rateCardPdfService.render(data, templateKey);

    const latest = await this.prisma.rateCardDocument.findFirst({
      where: { rateProviderId: dto.rateProviderId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    // Uploaded before the row is written: a row pointing at a missing object would render a
    // broken download, whereas an object with no row is just an orphan the bucket lifecycle
    // rule sweeps up.
    const storageKey = `rate-cards/${dto.rateProviderId}/v${version}-${randomUUID()}.pdf`;
    await this.storage.put(storageKey, pdf, 'application/pdf');

    const created = await this.prisma.rateCardDocument.create({
      data: {
        rateProviderId: dto.rateProviderId,
        shipmentType: dto.shipmentType,
        countryIds: data.countries.map((c) => c.id),
        effectiveDate: new Date(dto.effectiveDate),
        templateKey,
        version,
        storageKey,
        pdfSizeBytes: pdf.length,
        snapshot: data as unknown as Prisma.InputJsonValue,
        generatedByAdminId: actorId,
      },
      include: rateCardDocumentWithDetails.include,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RATE_CARD_GENERATED',
        entity: 'RateCardDocument',
        entityId: created.id,
        before: {},
        after: {
          rateProviderId: dto.rateProviderId,
          countryIds: data.countries.map((c) => c.id),
          version,
        },
      },
    });

    return { document: toRateCardDocumentDto(created), pdf };
  }

  async findAll(
    query: QueryRateCardDocumentsDto,
  ): Promise<RateCardDocumentDto[]> {
    const where: Prisma.RateCardDocumentWhereInput = {};
    if (query.rateProviderId) where.rateProviderId = query.rateProviderId;

    const docs = await this.prisma.rateCardDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: rateCardDocumentWithDetails.include,
    });
    return docs.map(toRateCardDocumentDto);
  }

  async getPdf(
    id: string,
  ): Promise<{ document: RateCardDocumentWithDetails; pdf: Buffer }> {
    const doc = await this.prisma.rateCardDocument.findUnique({
      where: { id },
      include: rateCardDocumentWithDetails.include,
    });
    if (!doc) {
      throw new NotFoundException(`Rate card document ${id} not found`);
    }
    return { document: doc, pdf: await this.storage.get(doc.storageKey) };
  }

  async remove(id: string, actorId: string): Promise<void> {
    const doc = await this.prisma.rateCardDocument.findUnique({
      where: { id },
    });
    if (!doc) {
      throw new NotFoundException(`Rate card document ${id} not found`);
    }
    await this.prisma.rateCardDocument.delete({ where: { id } });
    // After the row, not before: if the delete fails the download stays working.
    await this.storage.delete(doc.storageKey);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RATE_CARD_DELETED',
        entity: 'RateCardDocument',
        entityId: id,
        before: { rateProviderId: doc.rateProviderId, version: doc.version },
        after: {},
      },
    });
  }
}
