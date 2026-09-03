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
});
