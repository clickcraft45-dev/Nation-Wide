import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

function recordNotFoundError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: '6.19.3',
  });
}

describe('CustomersService', () => {
  let prisma: {
    customer: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: CustomersService;

  beforeEach(() => {
    prisma = {
      customer: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new CustomersService(prisma as never);
  });

  describe('create', () => {
    it('stamps consentGivenAt at creation time', async () => {
      let capturedData:
        { consentGivenAt: Date; consentSource: string } | undefined;
      prisma.customer.create.mockImplementation(
        (args: { data: { consentGivenAt: Date; consentSource: string } }) => {
          capturedData = args.data;
          return Promise.resolve({ id: 'c-1' });
        },
      );

      await service.create({
        name: 'Jane Doe',
        phone: '+919876543210',
        consentSource: 'signup_form',
      });

      expect(capturedData?.consentGivenAt).toBeInstanceOf(Date);
      expect(capturedData?.consentSource).toBe('signup_form');
    });

    it('throws ConflictException when the phone number already exists', async () => {
      prisma.customer.create.mockRejectedValue(uniqueConstraintError());

      await expect(
        service.create({
          name: 'Jane Doe',
          phone: '+919876543210',
          consentSource: 'staff_entry',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when no customer matches the id', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the customer when found', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c-1' });
      await expect(service.findOne('c-1')).resolves.toEqual({ id: 'c-1' });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the record does not exist', async () => {
      prisma.customer.update.mockRejectedValue(recordNotFoundError());
      await expect(
        service.update('missing-id', { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when updating to a phone that already exists', async () => {
      prisma.customer.update.mockRejectedValue(uniqueConstraintError());
      await expect(
        service.update('c-1', { phone: '+919876543210' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll date range', () => {
    beforeEach(() => {
      prisma.customer.findMany.mockResolvedValue([]);
    });

    it('bounds the window to whole UTC days, so the last day is not dropped', async () => {
      await service.findAll({
        createdFrom: '2026-09-01',
        createdTo: '2026-09-07',
      });

      const { where } = prisma.customer.findMany.mock.calls[0][0] as {
        where: { createdAt: { gte: Date; lte: Date } };
      };
      expect(where.createdAt.gte.toISOString()).toBe(
        '2026-09-01T00:00:00.000Z',
      );
      expect(where.createdAt.lte.toISOString()).toBe(
        '2026-09-07T23:59:59.999Z',
      );
    });

    it('combines a search with the window rather than replacing it', async () => {
      await service.findAll({ search: 'priya', createdFrom: '2026-09-01' });

      const { where } = prisma.customer.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[]; createdAt?: unknown };
      };
      expect(where.OR).toHaveLength(3);
      expect(where.createdAt).toBeDefined();
    });

    it('filters on nothing when neither bound is given', async () => {
      await service.findAll({});

      const { where } = prisma.customer.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(where).toEqual({});
    });
  });
});
