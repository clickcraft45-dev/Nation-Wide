import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PickupPartnersService } from './pickup-partners.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

function makePartner(overrides: Record<string, unknown> = {}) {
  return {
    id: 'partner-1',
    email: 'partner1@nationwide.dev',
    name: 'Partner One',
    phone: '+919000000001',
    role: 'PICKUP_PARTNER',
    passwordHash: 'hashed-password',
    ...overrides,
  };
}

describe('PickupPartnersService', () => {
  let prisma: {
    adminUser: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: PickupPartnersService;
  let mail: { send: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      adminUser: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(makePartner()),
        update: jest.fn().mockResolvedValue(makePartner()),
      },
    };
    mail = { send: jest.fn().mockResolvedValue(true) };
    service = new PickupPartnersService(
      prisma as never,
      mail as never,
      { get: jest.fn().mockReturnValue('https://nationwidelogistics.co') } as never,
    );
  });

  describe('findAll', () => {
    it('filters to role PICKUP_PARTNER only', async () => {
      await service.findAll();
      expect(prisma.adminUser.findMany).toHaveBeenCalledWith({
        where: { role: 'PICKUP_PARTNER' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('create', () => {
    it('rejects a duplicate email', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(makePartner());
      await expect(
        service.create({
          email: 'partner1@nationwide.dev',
          password: 'Secret123!',
          name: 'Dup',
          phone: '+919000000002',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.adminUser.create).not.toHaveBeenCalled();
    });

    it('generates a password and emails it when the admin supplies none', async () => {
      await service.create({ email: 'new@nationwide.dev', name: 'New Partner' });

      // Whatever was generated must be the same string that was hashed and the same string that
      // went out in the mail — a mismatch would create an account nobody can ever sign in to.
      const hashed = (bcrypt.hash as jest.Mock).mock.calls[0][0] as string;
      expect(hashed).toHaveLength(16);
      const sent = mail.send.mock.calls[0][0] as { text: string; to: string };
      expect(sent.to).toBe('new@nationwide.dev');
      expect(sent.text).toContain(hashed);
    });

    it('still creates the account when the credentials email cannot be sent', async () => {
      // Email is a notification channel, not a system of record. A Brevo outage must not undo
      // an onboarding that already wrote a row.
      mail.send.mockResolvedValue(false);
      await expect(
        service.create({ email: 'new@nationwide.dev', name: 'New Partner' }),
      ).resolves.toBeDefined();
      expect(prisma.adminUser.create).toHaveBeenCalled();
    });

    it('hashes the password and forces role PICKUP_PARTNER', async () => {
      await service.create({
        email: 'new@nationwide.dev',
        password: 'Secret123!',
        name: 'New Partner',
        phone: '+919000000003',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('Secret123!', 10);
      expect(prisma.adminUser.create).toHaveBeenCalledWith({
        data: {
          email: 'new@nationwide.dev',
          passwordHash: 'hashed-password',
          role: 'PICKUP_PARTNER',
          name: 'New Partner',
          phone: '+919000000003',
        },
      });
    });
  });

  describe('update', () => {
    it('404s when no account exists with that id', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s when the account exists but is not a PICKUP_PARTNER (no cross-role editing)', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(
        makePartner({ role: 'ADMIN' }),
      );
      await expect(service.update('partner-1', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
    });

    it('updates when the account is a genuine PICKUP_PARTNER', async () => {
      prisma.adminUser.findUnique.mockResolvedValue(makePartner());
      await service.update('partner-1', { name: 'Updated Name' });
      expect(prisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: 'partner-1' },
        data: { name: 'Updated Name' },
      });
    });
  });
});
