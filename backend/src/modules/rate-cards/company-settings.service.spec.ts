import { REGISTERED_COMPANY } from '@nationwide/shared-types';
import { CompanySettingsService } from './company-settings.service';

const EXISTING_SETTINGS = {
  id: 'settings-1',
  name: 'Default',
  isActive: true,
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
  let storage: { put: jest.Mock; delete: jest.Mock };
  let prisma: {
    companySettings: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
    auditLog: { create: jest.Mock };
  };
  let service: CompanySettingsService;

  beforeEach(() => {
    prisma = {
      companySettings: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        // No other template shares a logo unless a test says so.
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      auditLog: { create: jest.fn() },
    };
    storage = {
      put: jest.fn().mockResolvedValue({ key: 'k', size: 4 }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new CompanySettingsService(prisma as never, storage as never);
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

  describe('brand templates', () => {
    const OTHER = {
      ...EXISTING_SETTINGS,
      id: 'settings-2',
      name: 'Export',
      isActive: false,
    };

    it('get() returns the active template', async () => {
      prisma.companySettings.findFirst.mockResolvedValue(EXISTING_SETTINGS);
      await service.get();
      expect(prisma.companySettings.findFirst).toHaveBeenCalledWith({
        where: { isActive: true },
      });
    });

    it('creates a new template as an inactive copy of the active one', async () => {
      prisma.companySettings.findFirst.mockResolvedValue({
        ...EXISTING_SETTINGS,
        termsAndConditions: 'Goods at owner risk',
      });
      prisma.companySettings.create.mockResolvedValue(OTHER);

      await service.create('  Export  ', undefined, 'admin-1');

      expect(prisma.companySettings.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Export',
          isActive: false,
          termsAndConditions: 'Goods at owner risk',
        }),
      });
      const data = (
        prisma.companySettings.create.mock.calls[0] as [
          { data: Record<string, unknown> },
        ]
      )[0].data;
      expect(data).not.toHaveProperty('id');
    });

    it('switches the active template atomically', async () => {
      prisma.companySettings.findUnique.mockResolvedValue(OTHER);
      prisma.companySettings.findFirst.mockResolvedValue(EXISTING_SETTINGS);
      prisma.companySettings.update.mockResolvedValue({
        ...OTHER,
        isActive: true,
      });

      const result = await service.activate('settings-2', 'admin-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.companySettings.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
      expect(prisma.companySettings.update).toHaveBeenCalledWith({
        where: { id: 'settings-2' },
        data: { isActive: true, updatedByAdminId: 'admin-1' },
      });
      expect(result.isActive).toBe(true);
    });

    it('refuses to delete the template in use', async () => {
      prisma.companySettings.findUnique.mockResolvedValue(EXISTING_SETTINGS);
      await expect(service.remove('settings-1', 'admin-1')).rejects.toThrow(
        /in use/,
      );
      expect(prisma.companySettings.delete).not.toHaveBeenCalled();
    });

    it('keeps a logo object another template still uses', async () => {
      prisma.companySettings.findUnique.mockResolvedValue({
        ...OTHER,
        logoPath: 'uploads/company-logos/settings-1/shared.png',
      });
      prisma.companySettings.count.mockResolvedValue(1);

      await service.remove('settings-2', 'admin-1');

      expect(prisma.companySettings.delete).toHaveBeenCalledWith({
        where: { id: 'settings-2' },
      });
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  describe('saveLogo', () => {
    it('uploads to S3, records the key, and deletes the previous object', async () => {
      const oldKey = 'uploads/company-logos/settings-1/old.png';
      const withOldLogo = { ...EXISTING_SETTINGS, logoPath: oldKey };
      prisma.companySettings.findFirst.mockResolvedValue(withOldLogo);
      const updated = {
        ...withOldLogo,
        logoPath: 'uploads/company-logos/x.png',
      };
      prisma.companySettings.update.mockResolvedValue(updated);

      const result = await service.saveLogo(
        {
          originalname: 'new.png',
          mimetype: 'image/png',
          buffer: Buffer.from('png'),
        } as Express.Multer.File,
        'admin-1',
      );

      // Uploaded under the company-logos prefix, keeping the original extension, and never
      // under the client-supplied filename.
      const [key, body, contentType] = storage.put.mock.calls[0] as [
        string,
        Buffer,
        string,
      ];
      expect(key).toMatch(
        /^uploads\/company-logos\/settings-1\/[0-9a-f-]{36}\.png$/,
      );
      expect(body).toEqual(Buffer.from('png'));
      expect(contentType).toBe('image/png');

      // The row records the key that was actually uploaded.
      expect(prisma.companySettings.update).toHaveBeenCalledWith({
        where: { id: withOldLogo.id },
        data: { logoPath: key, updatedByAdminId: 'admin-1' },
      });
      // The replaced object is cleaned up, so a logo swap doesn't leak storage.
      expect(storage.delete).toHaveBeenCalledWith(oldKey);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'COMPANY_LOGO_UPDATED' }),
      });
      expect(result).toBe(updated);
    });
  });
});
