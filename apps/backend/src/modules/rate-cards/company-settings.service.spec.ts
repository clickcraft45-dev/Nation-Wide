import { REGISTERED_COMPANY } from '@nationwide/shared-types';
import { CompanySettingsService } from './company-settings.service';

const EXISTING_SETTINGS = {
  id: 'settings-1',
  companyName: 'NationWide',
  logoPath: null,
  primaryColor: '#4F46E5',
  website: null,
  supportEmail: null,
  supportPhone: null,
  address: null,
  termsAndConditions: null,
  footerNotes: null,
  insuranceDisclaimer: null,
  legalDisclaimer: null,
  restrictedItemsNotice: null,
  updatedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CompanySettingsService', () => {
  let prisma: {
    companySettings: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let service: CompanySettingsService;

  beforeEach(() => {
    prisma = {
      companySettings: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    service = new CompanySettingsService(prisma as never);
  });

  describe('get', () => {
    it('returns the existing row when one already exists', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(EXISTING_SETTINGS);

      const result = await service.get();

      expect(result).toBe(EXISTING_SETTINGS);
      expect(prisma.companySettings.create).not.toHaveBeenCalled();
    });

    it('creates the row from the GST registration when none exists yet', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(null);
      prisma.companySettings.create.mockResolvedValue(EXISTING_SETTINGS);

      const result = await service.get();

      // A blank row here would make the first invoice on a fresh deployment fail its
      // statutory-fields check — see CompanySettingsService.get.
      expect(prisma.companySettings.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gstin: REGISTERED_COMPANY.gstin,
          legalName: REGISTERED_COMPANY.legalName,
          stateCode: REGISTERED_COMPANY.stateCode,
          sacCode: REGISTERED_COMPANY.sacCode,
        }),
      });
      expect(result).toBe(EXISTING_SETTINGS);
    });
  });

  describe('update', () => {
    it('updates the singleton row and writes an audit log entry', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(EXISTING_SETTINGS);
      const updated = { ...EXISTING_SETTINGS, companyName: 'Acme Shipping' };
      prisma.companySettings.update.mockResolvedValue(updated);

      const result = await service.update(
        { companyName: 'Acme Shipping' },
        'admin-1',
      );

      expect(prisma.companySettings.update).toHaveBeenCalledWith({
        where: { id: EXISTING_SETTINGS.id },
        data: { companyName: 'Acme Shipping', updatedByAdminId: 'admin-1' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'admin-1',
          action: 'COMPANY_SETTINGS_UPDATED',
          entity: 'CompanySettings',
          entityId: EXISTING_SETTINGS.id,
        }),
      });
      expect(result).toBe(updated);
    });
  });

  describe('saveLogo', () => {
    it('sets the new logo path and deletes the previous file', async () => {
      const withOldLogo = { ...EXISTING_SETTINGS, logoPath: 'logos/old.png' };
      prisma.companySettings.findFirst.mockResolvedValue(withOldLogo);
      const updated = { ...withOldLogo, logoPath: 'logos/new.png' };
      prisma.companySettings.update.mockResolvedValue(updated);

      const result = await service.saveLogo(
        { filename: 'new.png' } as Express.Multer.File,
        'admin-1',
      );

      expect(prisma.companySettings.update).toHaveBeenCalledWith({
        where: { id: withOldLogo.id },
        data: { logoPath: 'logos/new.png', updatedByAdminId: 'admin-1' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'COMPANY_LOGO_UPDATED' }),
      });
      expect(result).toBe(updated);
    });
  });
});
