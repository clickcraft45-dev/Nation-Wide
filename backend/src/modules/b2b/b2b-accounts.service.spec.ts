import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { B2bAccountsService } from './b2b-accounts.service';

const CUSTOMER = {
  id: 'customer-1',
  name: 'Kirana Exports',
  email: 'Asha@Kirana.example',
  isActive: true,
  isB2b: false,
};

describe('B2bAccountsService', () => {
  let prisma: {
    customer: { findUnique: jest.Mock; update: jest.Mock };
    passwordResetToken: { updateMany: jest.Mock; create: jest.Mock };
    b2bLink: { updateMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let service: B2bAccountsService;

  beforeEach(() => {
    prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue(CUSTOMER),
        update: jest.fn().mockResolvedValue({ ...CUSTOMER, isB2b: true }),
      },
      passwordResetToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      b2bLink: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    mail = { send: jest.fn().mockResolvedValue(true) };
    service = new B2bAccountsService(
      prisma as never,
      mail as never,
      {
        get: () => 'https://nw.example',
      } as never,
    );
  });

  describe('invite', () => {
    it('marks the account B2B and emails a set-password link, storing only its hash', async () => {
      await service.invite('customer-1', 'admin-1');

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { isB2b: true },
      });

      const sent = mail.send.mock.calls[0][0] as { to: string; text: string };
      const url = sent.text.match(
        /https:\/\/\S+reset-password\?token=(\S+)/,
      )![1];
      const stored = (
        prisma.passwordResetToken.create.mock.calls[0] as [
          { data: { tokenHash: string; email: string } },
        ]
      )[0].data;
      expect(stored.tokenHash).toBe(
        createHash('sha256').update(url).digest('hex'),
      );
      // Lower-cased, matching how AuthService looks an account up by email.
      expect(stored.email).toBe('asha@kirana.example');
      expect(sent.to).toBe('asha@kirana.example');
    });

    it('invalidates any outstanding link before issuing a new one', async () => {
      await service.invite('customer-1', 'admin-1');
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { email: 'asha@kirana.example', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('refuses a customer with no email, or a deactivated one', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...CUSTOMER,
        email: null,
      });
      await expect(service.invite('customer-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );

      prisma.customer.findUnique.mockResolvedValue({
        ...CUSTOMER,
        isActive: false,
      });
      await expect(service.invite('customer-1', 'admin-1')).rejects.toThrow(
        /deactivated/,
      );
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  describe('revokeAccess', () => {
    it('clears the flag and revokes their standing links with it', async () => {
      await service.revokeAccess('customer-1', 'admin-1');

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { isB2b: false },
      });
      // Otherwise "revoked" would only be half true — the link is a second way in.
      expect(prisma.b2bLink.updateMany).toHaveBeenCalledWith({
        where: { customerId: 'customer-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('isB2bCustomer', () => {
    it('is false for a deactivated business account', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        isB2b: true,
        isActive: false,
      });
      await expect(service.isB2bCustomer('customer-1')).resolves.toBe(false);
    });
  });
});
