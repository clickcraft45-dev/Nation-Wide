import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type ms from 'ms';
import type { Role } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from './types/jwt-payload.type';
import type { RegisterDto } from './dto/register.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * A unified view over the two tables that can authenticate — AdminUser (STAFF/ADMIN) and
 * Customer (CUSTOMER). The single-root-login flow needs to look a person up by email without
 * knowing in advance which table they live in; this shape lets the rest of AuthService stay
 * table-agnostic once an account is resolved.
 */
interface AuthAccount {
  id: string;
  email: string;
  role: Role;
  passwordHash: string | null;
  hashedRefreshToken: string | null;
  isActive: boolean;
}

const REFRESH_TOKEN_HASH_ROUNDS = 10;
const PASSWORD_HASH_ROUNDS = 10;
const INVALID_CREDENTIALS = 'Invalid credentials';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Single entry point for the unified login form. Never branches on the email string itself —
   * role comes only from whichever DB row actually matched, never guessed from input.
   */
  async authenticate(email: string, password: string): Promise<AuthAccount> {
    const account = await this.findAccountByEmail(email);

    if (!account || !account.passwordHash) {
      // No account, or a staff-created Customer record that has never set a password.
      this.audit('LOGIN_FAILED', { email });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!account.isActive) {
      this.audit('ACCOUNT_DISABLED', { email, accountId: account.id });
      // Deliberately the same generic message as bad credentials — disabled-vs-unknown-vs-wrong-
      // password must not be distinguishable to an unauthenticated caller.
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordMatches = await bcrypt.compare(
      password,
      account.passwordHash,
    );
    if (!passwordMatches) {
      this.audit('LOGIN_FAILED', { email, accountId: account.id });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    this.audit('LOGIN_SUCCESS', {
      email,
      accountId: account.id,
      role: account.role,
    });
    return account;
  }

  /**
   * Customer self-registration. "Claims" an existing staff-created Customer record by phone if
   * one exists and has no password yet, rather than creating a duplicate — staff commonly enter
   * a customer's details before that customer ever creates their own login.
   */
  async register(dto: RegisterDto): Promise<AuthAccount> {
    const existingByEmail = await this.prisma.customer.findUnique({
      where: { email: dto.email },
    });
    if (existingByEmail) {
      throw new ConflictException('An account with this email already exists');
    }

    const existingByPhone = await this.prisma.customer.findUnique({
      where: { phone: dto.phone },
    });
    if (existingByPhone?.passwordHash) {
      throw new ConflictException(
        'An account with this phone number already exists',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);

    const customer = existingByPhone
      ? await this.prisma.customer.update({
          where: { id: existingByPhone.id },
          data: { name: dto.name, email: dto.email, passwordHash },
        })
      : await this.prisma.customer.create({
          data: {
            name: dto.name,
            phone: dto.phone,
            email: dto.email,
            passwordHash,
            consentGivenAt: new Date(),
            consentSource: 'signup_form',
          },
        });

    this.audit('REGISTER', { email: customer.email, accountId: customer.id });

    return this.toAuthAccount(customer, 'CUSTOMER');
  }

  async issueTokenPair(
    account: Pick<AuthAccount, 'id' | 'email' | 'role'>,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: account.id,
      email: account.email,
      role: account.role,
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

    await this.storeHashedRefreshToken(account.id, account.role, refreshToken);

    return { accessToken, refreshToken };
  }

  async refreshTokenPair(
    userId: string,
    role: Role,
    presentedRefreshToken: string,
  ): Promise<TokenPair> {
    const account = await this.findAccountById(userId, role);
    if (!account?.hashedRefreshToken) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const matches = await bcrypt.compare(
      presentedRefreshToken,
      account.hashedRefreshToken,
    );
    if (!matches) {
      // Presented token doesn't match the last-issued one — possible reuse of a
      // rotated-out token. Revoke the session rather than silently ignoring it.
      await this.revokeRefreshToken(userId, role);
      throw new UnauthorizedException('Refresh token is invalid');
    }

    return this.issueTokenPair(account);
  }

  async revokeRefreshToken(userId: string, role: Role): Promise<void> {
    await this.updateAccount(userId, role, { hashedRefreshToken: null });
    this.audit('LOGOUT', { accountId: userId, role });
  }

  async changePassword(
    userId: string,
    role: Role,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const account = await this.findAccountById(userId, role);
    if (!account?.passwordHash) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const currentMatches = await bcrypt.compare(
      currentPassword,
      account.passwordHash,
    );
    if (!currentMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
    await this.updateAccount(userId, role, { passwordHash });
    this.audit('PASSWORD_CHANGED', { accountId: userId, role });
  }

  private async findAccountByEmail(email: string): Promise<AuthAccount | null> {
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { email },
    });
    if (adminUser) {
      return this.toAuthAccount(adminUser, adminUser.role);
    }

    const customer = await this.prisma.customer.findUnique({
      where: { email },
    });
    if (customer) {
      return this.toAuthAccount(customer, 'CUSTOMER');
    }

    return null;
  }

  private async findAccountById(
    id: string,
    role: Role,
  ): Promise<AuthAccount | null> {
    if (role === 'CUSTOMER') {
      const customer = await this.prisma.customer.findUnique({ where: { id } });
      return customer ? this.toAuthAccount(customer, 'CUSTOMER') : null;
    }
    const adminUser = await this.prisma.adminUser.findUnique({ where: { id } });
    return adminUser ? this.toAuthAccount(adminUser, adminUser.role) : null;
  }

  private async updateAccount(
    id: string,
    role: Role,
    data: { hashedRefreshToken?: string | null; passwordHash?: string },
  ): Promise<void> {
    if (role === 'CUSTOMER') {
      await this.prisma.customer.update({ where: { id }, data });
    } else {
      await this.prisma.adminUser.update({ where: { id }, data });
    }
  }

  private toAuthAccount(
    record: {
      id: string;
      email: string | null;
      passwordHash: string | null;
      hashedRefreshToken: string | null;
      isActive: boolean;
    },
    role: Role,
  ): AuthAccount {
    return {
      id: record.id,
      email: record.email ?? '',
      role,
      passwordHash: record.passwordHash,
      hashedRefreshToken: record.hashedRefreshToken,
      isActive: record.isActive,
    };
  }

  private async storeHashedRefreshToken(
    id: string,
    role: Role,
    refreshToken: string,
  ): Promise<void> {
    const hashedRefreshToken = await bcrypt.hash(
      refreshToken,
      REFRESH_TOKEN_HASH_ROUNDS,
    );
    await this.updateAccount(id, role, { hashedRefreshToken });
  }

  /**
   * Structured auth-event logging — deliberately not written into the AuditLog table, which is
   * hard-FK'd to AdminUser and scoped to staff mutation actions. Auth events (including customer
   * logins) are logged here instead; a real deployment would ship this log stream to its
   * SIEM/log aggregator, which satisfies "auditable" without forcing a schema change onto a
   * table designed for a different purpose.
   */
  private audit(event: string, details: Record<string, unknown>): void {
    this.logger.log({ event, ...details });
  }
}
