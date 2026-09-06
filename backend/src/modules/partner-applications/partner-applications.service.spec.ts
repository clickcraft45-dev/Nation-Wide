import { ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerApplicationsService } from './partner-applications.service';

function makeApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    name: 'Ravi Kumar',
    email: 'ravi@example.com',
    phone: '+919876543210',
    serviceArea: 'Hyderabad — Madhapur',
    note: null,
    status: 'PENDING',
    ...overrides,
  };
}

const VALID_APPLICATION = {
  name: 'Ravi Kumar',
  email: 'Ravi@Example.com',
  phone: '+919876543210',
  serviceArea: 'Hyderabad — Madhapur',
};

describe('PartnerApplicationsService', () => {
  let prisma: {
    partnerApplication: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    adminUser: { findUnique: jest.Mock };
  };
  let pickupPartners: { create: jest.Mock };
  let service: PartnerApplicationsService;

  beforeEach(() => {
    prisma = {
      partnerApplication: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'app-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'app-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      adminUser: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    pickupPartners = { create: jest.fn().mockResolvedValue({ id: 'admin-9' }) };
    service = new PartnerApplicationsService(
      prisma as never,
      pickupPartners as never,
    );
  });

  describe('create', () => {
    it('stores the email lowercased so a duplicate cannot slip through on casing', async () => {
      await service.create(VALID_APPLICATION);
      expect(prisma.partnerApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'ravi@example.com' }),
        }),
      );
    });

    it('never creates an account — only an application row', async () => {
      await service.create(VALID_APPLICATION);
      expect(pickupPartners.create).not.toHaveBeenCalled();
    });

    it('rejects a second application while one is still pending', async () => {
      prisma.partnerApplication.findFirst.mockResolvedValue({ id: 'app-0' });
      await expect(service.create(VALID_APPLICATION)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.partnerApplication.create).not.toHaveBeenCalled();
    });

    it('gives the same answer when an account already exists, so the endpoint cannot be used to probe for one', async () => {
      prisma.adminUser.findUnique.mockResolvedValue({ id: 'admin-1' });
      await expect(service.create(VALID_APPLICATION)).rejects.toThrow(
        'An application with this email or phone number is already awaiting review',
      );
    });
  });

  describe('approve', () => {
    it('creates the partner account and records which admin approved it', async () => {
      prisma.partnerApplication.findUnique.mockResolvedValue(makeApplication());

      const result = await service.approve('app-1', { password: 'LongEnough123' }, 'admin-7');

      expect(pickupPartners.create).toHaveBeenCalledWith({
        email: 'ravi@example.com',
        password: 'LongEnough123',
        name: 'Ravi Kumar',
        phone: '+919876543210',
      });
      expect(result).toMatchObject({
        status: 'APPROVED',
        reviewedByAdminId: 'admin-7',
        createdAdminUserId: 'admin-9',
      });
    });

    it('refuses to approve twice, which would mint a second account', async () => {
      prisma.partnerApplication.findUnique.mockResolvedValue(
        makeApplication({ status: 'APPROVED' }),
      );
      await expect(
        service.approve('app-1', { password: 'LongEnough123' }, 'admin-7'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(pickupPartners.create).not.toHaveBeenCalled();
    });

    it('throws when the application does not exist', async () => {
      prisma.partnerApplication.findUnique.mockResolvedValue(null);
      await expect(
        service.approve('nope', { password: 'LongEnough123' }, 'admin-7'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reject', () => {
    it('marks it rejected without creating any account', async () => {
      prisma.partnerApplication.findUnique.mockResolvedValue(makeApplication());

      const result = await service.reject('app-1', {}, 'admin-7');

      expect(pickupPartners.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'REJECTED', reviewedByAdminId: 'admin-7' });
    });
  });
});
