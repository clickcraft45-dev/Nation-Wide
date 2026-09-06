import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

const CUSTOMER = {
  id: 'cust-1',
  email: 'ravi@example.com',
  passwordHash: 'old-hash',
  hashedRefreshToken: 'refresh-hash',
  isActive: true,
};

describe('AuthService password reset', () => {
  let prisma: {
    adminUser: { findUnique: jest.Mock; update: jest.Mock };
    customer: { findUnique: jest.Mock; update: jest.Mock };
    passwordResetToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let mail: { send: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      adminUser: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      customer: {
        findUnique: jest.fn().mockResolvedValue(CUSTOMER),
        update: jest.fn().mockResolvedValue(CUSTOMER),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({ id: 'tok-1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    mail = { send: jest.fn().mockResolvedValue(true) };
    service = new AuthService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      mail as never,
    );
  });

  describe('requestPasswordReset', () => {
    it('emails a link and stores only the hash of the token', async () => {
      await service.requestPasswordReset('ravi@example.com', 'https://app.test');

      const stored = prisma.passwordResetToken.create.mock.calls[0][0].data;
      const sentUrl: string = mail.send.mock.calls[0][0].text;
      const token = sentUrl.match(/reset-password\?token=([\w-]+)/)?.[1];

      expect(token).toBeTruthy();
      // The row must never hold anything usable as a reset link.
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.tokenHash).toBe(
        createHash('sha256').update(token as string).digest('hex'),
      );
    });

    it('invalidates any earlier outstanding link', async () => {
      await service.requestPasswordReset('ravi@example.com', 'https://app.test');
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'ravi@example.com', usedAt: null } }),
      );
    });

    it('stays silent for an unknown address, so it cannot be used to enumerate accounts', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.requestPasswordReset('nobody@example.com', 'https://app.test'),
      ).resolves.toBeUndefined();
      expect(mail.send).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('does not send to a disabled account', async () => {
      prisma.customer.findUnique.mockResolvedValue({ ...CUSTOMER, isActive: false });
      await service.requestPasswordReset('ravi@example.com', 'https://app.test');
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const future = () => new Date(Date.now() + 60_000);
    const past = () => new Date(Date.now() - 60_000);

    it('sets the new password, consumes the token and ends every session', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        email: 'ravi@example.com',
        expiresAt: future(),
        usedAt: null,
      });

      await service.resetPassword('raw-token', 'BrandNewPass123');

      const update = prisma.customer.update.mock.calls[0][0];
      expect(update.data.passwordHash).not.toBe('old-hash');
      // Resetting may be someone locking an intruder out — stale refresh tokens must not survive.
      expect(update.data.hashedRefreshToken).toBeNull();
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
      );
    });

    it('refuses a token that was already used', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        email: 'ravi@example.com',
        expiresAt: future(),
        usedAt: new Date(),
      });
      await expect(service.resetPassword('raw', 'BrandNewPass123')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('refuses an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        email: 'ravi@example.com',
        expiresAt: past(),
        usedAt: null,
      });
      await expect(service.resetPassword('raw', 'BrandNewPass123')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('gives an unknown token the same message as an expired one', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword('raw', 'BrandNewPass123')).rejects.toThrow(
        'This reset link is invalid or has expired. Request a new one.',
      );
    });
  });
});
