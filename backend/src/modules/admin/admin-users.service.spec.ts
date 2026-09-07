import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminUsersService } from './admin-users.service';

// The guards worth a test are the ones whose failure mode is "nobody can administer this system
// any more", which no amount of UI care prevents and which has no in-app recovery.

const ADMIN = {
  id: 'admin-1',
  email: 'admin@nationwide.dev',
  role: 'ADMIN' as const,
  isActive: true,
  name: 'Admin',
  phone: null,
};
const STAFF = {
  ...ADMIN,
  id: 'staff-1',
  email: 's@n.dev',
  role: 'STAFF' as const,
};
const PARTNER = { ...ADMIN, id: 'p-1', role: 'PICKUP_PARTNER' as const };

function harness(found: unknown, activeAdmins = 2) {
  const prisma = {
    adminUser: {
      findUnique: jest.fn().mockResolvedValue(found),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(activeAdmins),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...ADMIN, ...args.data }),
      ),
      create: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return { prisma, service: new AdminUsersService(prisma as never) };
}

describe('AdminUsersService', () => {
  describe('self-lockout guards', () => {
    it('refuses to let an admin change their own role', async () => {
      const { service } = harness(ADMIN);
      await expect(
        service.update('admin-1', { role: 'STAFF' }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses to let an admin deactivate their own account', async () => {
      const { service } = harness(ADMIN);
      await expect(
        service.update('admin-1', { isActive: false }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still lets an admin edit their own name', async () => {
      const { service } = harness(ADMIN);
      await expect(
        service.update('admin-1', { name: 'New Name' }, 'admin-1'),
      ).resolves.toBeDefined();
    });
  });

  describe('last-admin guard', () => {
    it('refuses to demote the last active admin', async () => {
      const { service } = harness(ADMIN, 1);
      await expect(
        service.update('admin-1', { role: 'STAFF' }, 'other-admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to deactivate the last active admin', async () => {
      const { service } = harness(ADMIN, 1);
      await expect(
        service.update('admin-1', { isActive: false }, 'other-admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows demoting an admin while another active admin remains', async () => {
      const { service } = harness(ADMIN, 2);
      await expect(
        service.update('admin-1', { role: 'STAFF' }, 'other-admin'),
      ).resolves.toBeDefined();
    });

    it('does not consult the admin count when demoting a staff member', async () => {
      const { prisma, service } = harness(STAFF, 1);
      await service.update('staff-1', { isActive: false }, 'admin-1');
      expect(prisma.adminUser.count).not.toHaveBeenCalled();
    });
  });

  describe('session revocation', () => {
    it('clears the refresh token when deactivating, so live sessions end', async () => {
      const { prisma, service } = harness(STAFF);
      await service.update('staff-1', { isActive: false }, 'admin-1');
      const { data } = prisma.adminUser.update.mock.calls[0][0];
      expect(data.hashedRefreshToken).toBeNull();
    });

    it('clears the refresh token on a password reset', async () => {
      const { prisma, service } = harness(STAFF);
      await service.resetPassword(
        'staff-1',
        'a-long-enough-password',
        'admin-1',
      );
      const { data } = prisma.adminUser.update.mock.calls[0][0];
      expect(data.hashedRefreshToken).toBeNull();
      // The password itself must never reach the audit trail.
      const audit = prisma.auditLog.create.mock.calls[0][0] as {
        data: { after: Record<string, unknown> };
      };
      expect(JSON.stringify(audit.data.after)).not.toContain(
        'a-long-enough-password',
      );
    });

    it('leaves the refresh token alone on an ordinary edit', async () => {
      const { prisma, service } = harness(STAFF);
      await service.update('staff-1', { name: 'Renamed' }, 'admin-1');
      const { data } = prisma.adminUser.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('hashedRefreshToken');
    });
  });

  it('manages pickup partners too, so a role change is an edit rather than a recreate', async () => {
    const { prisma, service } = harness(PARTNER);
    await service.update('p-1', { role: 'STAFF' }, 'admin-1');
    expect(prisma.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'STAFF' }),
      }),
    );
  });

  describe('remove', () => {
    it('deletes an account that has no recorded activity', async () => {
      const { prisma, service } = harness(STAFF);
      await service.remove('staff-1', 'admin-1');
      expect(prisma.adminUser.delete).toHaveBeenCalledWith({
        where: { id: 'staff-1' },
      });
    });

    it('refuses an account with history, pointing at deactivation instead', async () => {
      const { prisma, service } = harness(STAFF);
      // What Postgres raises when a row is still referenced by any of the thirteen FKs.
      prisma.adminUser.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK violation', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );
      await expect(service.remove('staff-1', 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses to delete your own account', async () => {
      const { prisma, service } = harness(ADMIN);
      await expect(service.remove('admin-1', 'admin-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.adminUser.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete the last active admin', async () => {
      const { prisma, service } = harness(ADMIN, 1);
      await expect(
        service.remove('admin-1', 'someone-else'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.adminUser.delete).not.toHaveBeenCalled();
    });
  });
});
