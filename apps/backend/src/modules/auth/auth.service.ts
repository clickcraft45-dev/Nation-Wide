import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type ms from 'ms';
import type { AdminUser } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from './types/jwt-payload.type';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_HASH_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateAdminCredentials(
    email: string,
    password: string,
  ): Promise<AdminUser> {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async issueTokenPair(
    user: Pick<AdminUser, 'id' | 'email' | 'role'>,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    // A per-issuance jti keeps each refresh token unique even when issued within the
    // same iat second (e.g. login immediately followed by refresh), which matters
    // because rotation compares/stores a hash of the whole token.
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: this.configService.getOrThrow<string>(
            'JWT_ACCESS_EXPIRES_IN',
          ) as ms.StringValue,
        },
      ),
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.getOrThrow<string>(
            'JWT_REFRESH_EXPIRES_IN',
          ) as ms.StringValue,
        },
      ),
    ]);

    await this.storeHashedRefreshToken(user.id, refreshToken);

    return { accessToken, refreshToken };
  }

  async refreshTokenPair(
    userId: string,
    presentedRefreshToken: string,
  ): Promise<TokenPair> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
    });
    if (!user?.hashedRefreshToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const matches = await bcrypt.compare(
      presentedRefreshToken,
      user.hashedRefreshToken,
    );
    if (!matches) {
      // Presented token doesn't match the last-issued one — possible reuse of a
      // rotated-out token. Revoke the session rather than silently ignoring it.
      await this.revokeRefreshToken(userId);
      throw new UnauthorizedException('Refresh token is invalid');
    }

    return this.issueTokenPair(user);
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    await this.prisma.adminUser.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
  }

  private async storeHashedRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hashedRefreshToken = await bcrypt.hash(
      refreshToken,
      REFRESH_TOKEN_HASH_ROUNDS,
    );
    await this.prisma.adminUser.update({
      where: { id: userId },
      data: { hashedRefreshToken },
    });
  }
}
