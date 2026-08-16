import { NotFoundException } from '@nestjs/common';
import { RateCardDocumentsService } from './rate-card-documents.service';

function makeData(overrides: Record<string, unknown> = {}) {
  return {
    countries: [{ id: 'country-1', name: 'India' }],
    ...overrides,
  };
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    rateProviderId: 'provider-1',
    rateProvider: { name: 'FedEx' },
    shipmentType: 'PACKAGE',
    countryIds: ['country-1'],
    effectiveDate: new Date('2026-01-01'),
    templateKey: 'CLASSIC',
    version: 1,
    pdf: Buffer.from('pdf-bytes'),
    pdfSizeBytes: 9,
    snapshot: makeData(),
    generatedByAdminId: 'admin-1',
    generatedBy: { email: 'admin@nationwide.dev' },
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('RateCardDocumentsService', () => {
  let prisma: {
    rateCardDocument: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let rateCardDataService: { build: jest.Mock };
  let rateCardPdfService: { render: jest.Mock };
  let service: RateCardDocumentsService;

  beforeEach(() => {
    prisma = {
      rateCardDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(makeDoc()),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(makeDoc()),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    rateCardDataService = { build: jest.fn().mockResolvedValue(makeData()) };
    rateCardPdfService = {
      render: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    };
    service = new RateCardDocumentsService(
      prisma as never,
      rateCardDataService as never,
      rateCardPdfService as never,
    );
  });

  describe('preview', () => {
    it('renders a PDF without writing to the database', async () => {
      const pdf = await service.preview({
        rateProviderId: 'provider-1',
        shipmentType: 'PACKAGE',
        countries: ['country-1'],
        effectiveDate: '2026-01-01',
      } as never);

      expect(pdf).toEqual(Buffer.from('pdf-bytes'));
      expect(prisma.rateCardDocument.create).not.toHaveBeenCalled();
    });

    it('defaults to the CLASSIC template when none is given', async () => {
      await service.preview({
        rateProviderId: 'provider-1',
        shipmentType: 'PACKAGE',
        countries: ['country-1'],
        effectiveDate: '2026-01-01',
      } as never);
      expect(rateCardPdfService.render).toHaveBeenCalledWith(
        makeData(),
        'CLASSIC',
      );
    });
  });

  describe('generate', () => {
    it('starts version numbering at 1 when no prior document exists for the provider', async () => {
      await service.generate(
        {
          rateProviderId: 'provider-1',
          shipmentType: 'PACKAGE',
          countries: ['country-1'],
          effectiveDate: '2026-01-01',
        } as never,
        'admin-1',
      );
      expect(prisma.rateCardDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 1 }),
        }),
      );
    });

    it('increments the version from the latest document for that provider', async () => {
      prisma.rateCardDocument.findFirst.mockResolvedValue({ version: 4 });
      await service.generate(
        {
          rateProviderId: 'provider-1',
          shipmentType: 'PACKAGE',
          countries: ['country-1'],
          effectiveDate: '2026-01-01',
        } as never,
        'admin-1',
      );
      expect(prisma.rateCardDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 5 }),
        }),
      );
    });

    it('writes a RATE_CARD_GENERATED audit log after creating the document', async () => {
      await service.generate(
        {
          rateProviderId: 'provider-1',
          shipmentType: 'PACKAGE',
          countries: ['country-1'],
          effectiveDate: '2026-01-01',
        } as never,
        'admin-1',
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'admin-1',
          action: 'RATE_CARD_GENERATED',
          entity: 'RateCardDocument',
          entityId: 'doc-1',
        }),
      });
    });

    it('returns both the mapped document DTO and the raw PDF buffer', async () => {
      const result = await service.generate(
        {
          rateProviderId: 'provider-1',
          shipmentType: 'PACKAGE',
          countries: ['country-1'],
          effectiveDate: '2026-01-01',
        } as never,
        'admin-1',
      );
      expect(result.document.id).toBe('doc-1');
      expect(result.document.rateProviderName).toBe('FedEx');
      expect(result.pdf).toEqual(Buffer.from('pdf-bytes'));
    });
  });

  describe('findAll', () => {
    it('filters by rateProviderId only when supplied', async () => {
      await service.findAll({});
      expect(prisma.rateCardDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );

      await service.findAll({ rateProviderId: 'provider-1' });
      expect(prisma.rateCardDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { rateProviderId: 'provider-1' } }),
      );
    });
  });

  describe('getPdf', () => {
    it('404s when the document does not exist', async () => {
      prisma.rateCardDocument.findUnique.mockResolvedValue(null);
      await expect(service.getPdf('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the document alongside a Buffer-wrapped pdf', async () => {
      const result = await service.getPdf('doc-1');
      expect(result.pdf).toBeInstanceOf(Buffer);
      expect(result.document.id).toBe('doc-1');
    });
  });

  describe('remove', () => {
    it('404s when the document does not exist', async () => {
      prisma.rateCardDocument.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.rateCardDocument.delete).not.toHaveBeenCalled();
    });

    it('deletes the document and writes a RATE_CARD_DELETED audit log', async () => {
      await service.remove('doc-1', 'admin-1');
      expect(prisma.rateCardDocument.delete).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'admin-1',
          action: 'RATE_CARD_DELETED',
          entity: 'RateCardDocument',
          entityId: 'doc-1',
        }),
      });
    });
  });
});
