import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

interface WhereClause {
  where: { email?: string; id?: string; phone?: string };
}

describe('AuthService', () => {
  const adminUser = {
    id: 'admin-1',
    email: 'staff@nationwide.dev',
    role: 'STAFF' as const,
    passwordHash: '',
    hashedRefreshToken: null as string | null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const customer = {
    id: 'customer-1',
    email: 'customer@example.com' as string | null,
    phone: '+919876500001',
    name: 'Test Customer',
    passwordHash: null as string | null,
    hashedRefreshToken: null as string | null,
    isActive: true,
    consentGivenAt: new Date(),
    consentSource: 'signup_form',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: {
    adminUser: { findUnique: jest.Mock; update: jest.Mock };
    customer: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };
  let jwtService: { signAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let authService: AuthService;

  beforeEach(async () => {
    adminUser.passwordHash = await bcrypt.hash('correct-password', 10);
    adminUser.hashedRefreshToken = null;
    adminUser.isActive = true;

    customer.passwordHash = null;
    customer.hashedRefreshToken = null;
    customer.isActive = true;
    customer.email = 'customer@example.com';

    prisma = {
      adminUser: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: WhereClause) =>
            Promise.resolve(
              where.email === adminUser.email || where.id === adminUser.id
                ? adminUser
                : null,
            ),
          ),
        update: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Partial<typeof adminUser> }) => ({
              ...adminUser,
              ...data,
            }),
          ),
      },
      customer: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: WhereClause) =>
            Promise.resolve(
              where.email === customer.email ||
                where.phone === customer.phone ||
                where.id === customer.id
                ? customer
                : null,
            ),
          ),
        update: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Partial<typeof customer> }) => ({
              ...customer,
              ...data,
            }),
          ),
        create: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Partial<typeof customer> }) => ({
              ...customer,
              ...data,
              id: 'customer-new',
            }),
          ),
      },
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
    };
    configService = {
      getOrThrow: jest.fn().mockReturnValue('config-value'),
    };

    authService = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
    );
  });

  describe('authenticate', () => {
    it('resolves an AdminUser account by email with its DB role', async () => {
      const result = await authService.authenticate(
        adminUser.email,
        'correct-password',
      );
      expect(result).toMatchObject({ id: adminUser.id, role: 'STAFF' });
    });

    it('resolves a Customer account by email with role CUSTOMER', async () => {
      customer.passwordHash = await bcrypt.hash('customer-password', 10);
      const result = await authService.authenticate(
        customer.email!,
        'customer-password',
      );
      expect(result).toMatchObject({ id: customer.id, role: 'CUSTOMER' });
    });

    it('throws when no account exists for the email', async () => {
      await expect(
        authService.authenticate('nobody@nationwide.dev', 'whatever'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when a Customer record has never set a password', async () => {
      // customer.passwordHash stays null — a staff-created record with no login yet.
      await expect(
        authService.authenticate(customer.email!, 'anything'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the password does not match', async () => {
      await expect(
        authService.authenticate(adminUser.email, 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a disabled account with the same generic error as bad credentials', async () => {
      adminUser.isActive = false;
      await expect(
        authService.authenticate(adminUser.email, 'correct-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('creates a new Customer when no record matches the phone', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      const result = await authService.register({
        name: 'New Person',
        phone: '+919876500002',
        email: 'new@example.com',
        password: 'a-strong-password',
      });

      expect(result.role).toBe('CUSTOMER');
      expect(prisma.customer.create).toHaveBeenCalled();
    });

    it('claims an existing staff-created Customer record by phone instead of duplicating it', async () => {
      prisma.customer.findUnique.mockImplementation(({ where }: WhereClause) =>
        Promise.resolve(where.phone === customer.phone ? customer : null),
      );

      await authService.register({
        name: customer.name,
        phone: customer.phone,
        email: 'claimed@example.com',
        password: 'a-strong-password',
      });

      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: customer.id } }),
      );
      expect(prisma.customer.create).not.toHaveBeenCalled();
    });

    it('rejects registration when the email is already in use', async () => {
      await expect(
        authService.register({
          name: 'Someone',
          phone: '+919876500003',
          email: customer.email!,
          password: 'a-strong-password',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects registration when the phone already has a password set', async () => {
      customer.passwordHash = 'already-set';
      prisma.customer.findUnique.mockImplementation(({ where }: WhereClause) =>
        Promise.resolve(where.phone === customer.phone ? customer : null),
      );

      await expect(
        authService.register({
          name: customer.name,
          phone: customer.phone,
          email: 'another@example.com',
          password: 'a-strong-password',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('refreshTokenPair', () => {
    it('throws and does not revoke when the account has no stored refresh token', async () => {
      await expect(
        authService.refreshTokenPair(adminUser.id, 'STAFF', 'presented-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
    });

    it('revokes the session when the presented token does not match the stored hash', async () => {
      adminUser.hashedRefreshToken = await bcrypt.hash('a-different-token', 10);

      await expect(
        authService.refreshTokenPair(adminUser.id, 'STAFF', 'presented-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: adminUser.id },
        data: { hashedRefreshToken: null },
      });
    });

    it('issues a new token pair when the presented token matches the stored hash', async () => {
      adminUser.hashedRefreshToken = await bcrypt.hash(
        'valid-refresh-token',
        10,
      );

      const result = await authService.refreshTokenPair(
        adminUser.id,
        'STAFF',
        'valid-refresh-token',
      );

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('routes a CUSTOMER role refresh to the Customer table, not AdminUser', async () => {
      customer.hashedRefreshToken = await bcrypt.hash(
        'valid-refresh-token',
        10,
      );

      await authService.refreshTokenPair(
        customer.id,
        'CUSTOMER',
        'valid-refresh-token',
      );

      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { id: customer.id },
      });
    });
  });
});
