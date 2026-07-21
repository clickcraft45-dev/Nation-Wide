import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const adminUser = {
    id: 'user-1',
    email: 'staff@nationwide.dev',
    role: 'STAFF' as const,
    passwordHash: '',
    hashedRefreshToken: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: { adminUser: { findUnique: jest.Mock; update: jest.Mock } };
  let jwtService: { signAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let authService: AuthService;

  beforeEach(async () => {
    adminUser.passwordHash = await bcrypt.hash('correct-password', 10);
    adminUser.hashedRefreshToken = null;

    prisma = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue(adminUser),
        update: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Partial<typeof adminUser> }) => ({
              ...adminUser,
              ...data,
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

  describe('validateAdminCredentials', () => {
    it('returns the user when the password matches', async () => {
      const result = await authService.validateAdminCredentials(
        adminUser.email,
        'correct-password',
      );
      expect(result).toEqual(adminUser);
    });

    it('throws when no user exists for the email', async () => {
      prisma.adminUser.findUnique.mockResolvedValueOnce(null);
      await expect(
        authService.validateAdminCredentials(
          'nobody@nationwide.dev',
          'whatever',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws when the password does not match', async () => {
      await expect(
        authService.validateAdminCredentials(adminUser.email, 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokenPair', () => {
    it('throws and does not revoke when the user has no stored refresh token', async () => {
      prisma.adminUser.findUnique.mockResolvedValueOnce({
        ...adminUser,
        hashedRefreshToken: null,
      });

      await expect(
        authService.refreshTokenPair(adminUser.id, 'presented-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
    });

    it('revokes the session when the presented token does not match the stored hash', async () => {
      prisma.adminUser.findUnique.mockResolvedValueOnce({
        ...adminUser,
        hashedRefreshToken: await bcrypt.hash('a-different-token', 10),
      });

      await expect(
        authService.refreshTokenPair(adminUser.id, 'presented-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: adminUser.id },
        data: { hashedRefreshToken: null },
      });
    });

    it('issues a new token pair when the presented token matches the stored hash', async () => {
      const storedHash = await bcrypt.hash('valid-refresh-token', 10);
      prisma.adminUser.findUnique.mockResolvedValueOnce({
        ...adminUser,
        hashedRefreshToken: storedHash,
      });

      const result = await authService.refreshTokenPair(
        adminUser.id,
        'valid-refresh-token',
      );

      expect(result).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });
  });
});
