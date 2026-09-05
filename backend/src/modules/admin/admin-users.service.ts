import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { AdminUser, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

const PASSWORD_HASH_ROUNDS = 10;

/** STAFF and ADMIN only. PICKUP_PARTNER rows are managed by PickupPartnersService. */
const MANAGED_ROLES: Prisma.EnumAdminRoleFilter = { in: ['STAFF', 'ADMIN'] };

/**
 * Staff/admin account management — the gap PickupPartnersService's own comment names: until now
 * STAFF/ADMIN rows could only be created by the seed script, and a role could never be changed.
 *
 * THERE IS NO DELETE, and that is not an oversight. AdminUser is the target of twelve foreign
 * keys (audit logs, quoted quotes, assigned pickups, issued invoices, ...), so Postgres refuses
 * the delete outright — and it should: removing the actor would erase who priced a quote or
 * issued a statutory invoice. Deactivation is the terminal state.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<AdminUser[]> {
    return this.prisma.adminUser.findMany({
      where: { role: MANAGED_ROLES },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateAdminUserDto, actorId: string): Promise<AdminUser> {
    // Checked against the whole table, not just STAFF/ADMIN: email is globally unique, so a
    // clash with a customer-facing pickup partner must report the conflict rather than a
    // confusing P2002 from Prisma.
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException(
        `An account with email ${dto.email} already exists`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);
    const created = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        name: dto.name,
        phone: dto.phone,
      },
    });

    await this.audit(
      actorId,
      'ADMIN_USER_CREATED',
      created.id,
      {},
      {
        email: created.email,
        role: created.role,
      },
    );
    return created;
  }

  async update(
    id: string,
    dto: UpdateAdminUserDto,
    actorId: string,
  ): Promise<AdminUser> {
    const existing = await this.findManagedOrThrow(id);

    // Self-lockout guard. An admin demoting or deactivating their own account is how an
    // organisation ends up with no one who can administer it — and there is no recovery path
    // in the app, only a hand-written database UPDATE.
    if (id === actorId) {
      if (dto.role && dto.role !== existing.role) {
        throw new ForbiddenException('You cannot change your own role');
      }
      if (dto.isActive === false) {
        throw new ForbiddenException('You cannot deactivate your own account');
      }
    }

    // Losing the last active admin locks everyone out just as effectively as self-demotion.
    const losingAdmin =
      existing.role === 'ADMIN' &&
      ((dto.role && dto.role !== 'ADMIN') || dto.isActive === false);
    if (losingAdmin && (await this.activeAdminCount()) <= 1) {
      throw new BadRequestException(
        'This is the last active admin — promote another admin first',
      );
    }

    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...dto,
        // Deactivation has to end existing sessions, not just block new logins. The refresh
        // token is the long-lived credential; clearing it means the next refresh fails and the
        // access token expires on its own within JWT_ACCESS_EXPIRES_IN.
        ...(dto.isActive === false ? { hashedRefreshToken: null } : {}),
      },
    });

    await this.audit(
      actorId,
      'ADMIN_USER_UPDATED',
      id,
      { role: existing.role, isActive: existing.isActive, name: existing.name },
      { role: updated.role, isActive: updated.isActive, name: updated.name },
    );
    return updated;
  }

  async resetPassword(
    id: string,
    password: string,
    actorId: string,
  ): Promise<AdminUser> {
    await this.findManagedOrThrow(id);
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

    const updated = await this.prisma.adminUser.update({
      where: { id },
      // Same reasoning as deactivation: a password reset that leaves existing sessions alive
      // does not lock out whoever the reset was protecting against.
      data: { passwordHash, hashedRefreshToken: null },
    });

    // The new password is never an audit value — this records that a reset happened, not what to.
    await this.audit(actorId, 'ADMIN_USER_PASSWORD_RESET', id, {}, {});
    return updated;
  }

  private activeAdminCount(): Promise<number> {
    return this.prisma.adminUser.count({
      where: { role: 'ADMIN', isActive: true },
    });
  }

  private async findManagedOrThrow(id: string): Promise<AdminUser> {
    const user = await this.prisma.adminUser.findUnique({ where: { id } });
    // A PICKUP_PARTNER id must 404 here rather than being editable through this endpoint —
    // otherwise this becomes a second, ruleless way to edit partner accounts.
    if (!user || (user.role !== 'STAFF' && user.role !== 'ADMIN')) {
      throw new NotFoundException(`Admin user ${id} not found`);
    }
    return user;
  }

  private audit(
    actorId: string,
    action: string,
    entityId: string,
    before: Prisma.InputJsonValue,
    after: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entity: 'AdminUser', entityId, before, after },
    });
  }
}
