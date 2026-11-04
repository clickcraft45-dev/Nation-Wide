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
const OTHER_ADMIN = {
  ...ADMIN,
  id: 'admin-2',
  email: 'second@n.dev',
  role: 'ADMIN' as const,
};
const PARTNER = { ...OTHER_ADMIN, id: 'p-1', role: 'PICKUP_PARTNER' as const };

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
        service.update(
          'admin-1',
          { role: 'SUPER_ADMIN' },
          'admin-1',
          'SUPER_ADMIN',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses to let an admin deactivate their own account', async () => {
      const { service } = harness(ADMIN);
      await expect(
        service.update(
          'admin-1',
          { isActive: false },
          'admin-1',
          'SUPER_ADMIN',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still lets an admin edit their own name', async () => {
      const { service } = harness(ADMIN);
      await expect(
        service.update(
          'admin-1',
          { name: 'New Name' },
          'admin-1',
          'SUPER_ADMIN',
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('last-admin guard', () => {
    it('refuses to demote the last active admin', async () => {
      const { service } = harness(ADMIN, 1);
      await expect(
        service.update(
          'admin-1',
          { role: 'PICKUP_PARTNER' },
          'other-admin',
          'SUPER_ADMIN',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to deactivate the last active admin', async () => {
      const { service } = harness(ADMIN, 1);
      await expect(
        service.update(
          'admin-1',
          { isActive: false },
          'other-admin',
          'SUPER_ADMIN',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows demoting an admin while another active admin remains', async () => {
      const { service } = harness(ADMIN, 2);
      await expect(
        service.update(
          'admin-1',
          { role: 'PICKUP_PARTNER' },
          'other-admin',
          'SUPER_ADMIN',
        ),
      ).resolves.toBeDefined();
    });

    it('does not consult the admin count when deactivating a partner', async () => {
      const { prisma, service } = harness(PARTNER, 1);
      await service.update(
        'p-1',
        { isActive: false },
        'admin-1',
        'SUPER_ADMIN',
      );
      expect(prisma.adminUser.count).not.toHaveBeenCalled();
    });
  });

  describe('session revocation', () => {
    it('clears the refresh token when deactivating, so live sessions end', async () => {
      const { prisma, service } = harness(ADMIN);
      await service.update(
        'staff-1',
        { isActive: false },
        'admin-1',
        'SUPER_ADMIN',
      );
      const { data } = prisma.adminUser.update.mock.calls[0][0];
      expect(data.hashedRefreshToken).toBeNull();
    });

    it('clears the refresh token on a password reset', async () => {
      const { prisma, service } = harness(ADMIN);
      await service.resetPassword(
        'staff-1',
        'a-long-enough-password',
        'admin-1',
        'SUPER_ADMIN',
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
      const { prisma, service } = harness(ADMIN);
      await service.update(
        'staff-1',
        { name: 'Renamed' },
        'admin-1',
        'SUPER_ADMIN',
      );
      const { data } = prisma.adminUser.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('hashedRefreshToken');
    });
  });

  it('manages pickup partners too, so a role change is an edit rather than a recreate', async () => {
    const { prisma, service } = harness(PARTNER);
    await service.update('p-1', { role: 'ADMIN' }, 'admin-1', 'SUPER_ADMIN');
    expect(prisma.adminUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'ADMIN' }),
      }),
    );
  });

  describe('remove', () => {
    it('deletes an account that has no recorded activity', async () => {
      const { prisma, service } = harness(ADMIN);
      await service.remove('staff-1', 'admin-1', 'SUPER_ADMIN');
      expect(prisma.adminUser.delete).toHaveBeenCalledWith({
        where: { id: 'staff-1' },
      });
    });

    it('refuses an account with history, pointing at deactivation instead', async () => {
      const { prisma, service } = harness(ADMIN);
      // What Postgres raises when a row is still referenced by any of the thirteen FKs.
      prisma.adminUser.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('FK violation', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.remove('staff-1', 'admin-1', 'SUPER_ADMIN'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to delete your own account', async () => {
      const { prisma, service } = harness(ADMIN);
      await expect(
        service.remove('admin-1', 'admin-1', 'SUPER_ADMIN'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.adminUser.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete the last active admin', async () => {
      const { prisma, service } = harness(ADMIN, 1);
      await expect(
        service.remove('admin-1', 'someone-else', 'SUPER_ADMIN'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.adminUser.delete).not.toHaveBeenCalled();
    });
  });

  // An ADMIN managing a SUPER_ADMIN was the hole: promote someone, or reset the super admin's
  // password and sign in as them.
  describe('super admin boundary', () => {
    const SUPER = {
      ...OTHER_ADMIN,
      id: 'super-1',
      role: 'SUPER_ADMIN' as const,
    };

    it('refuses an admin promoting anyone to super admin', async () => {
      const { prisma, service } = harness(PARTNER);
      await expect(
        service.update('p-1', { role: 'SUPER_ADMIN' }, 'admin-1', 'ADMIN'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
    });

    it('refuses an admin editing, deactivating or demoting a super admin', async () => {
      for (const dto of [
        { name: 'x' },
        { isActive: false },
        { role: 'ADMIN' as const },
      ]) {
        const { prisma, service } = harness(SUPER);
        await expect(
          service.update('super-1', dto, 'admin-1', 'ADMIN'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.adminUser.update).not.toHaveBeenCalled();
      }
    });

    it("refuses an admin resetting a super admin's password or deleting one", async () => {
      const { prisma, service } = harness(SUPER);
      await expect(
        service.resetPassword(
          'super-1',
          'a-long-enough-password',
          'admin-1',
          'ADMIN',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.remove('super-1', 'admin-1', 'ADMIN'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
      expect(prisma.adminUser.delete).not.toHaveBeenCalled();
    });

    it('refuses an admin creating a super admin', async () => {
      const { prisma, service } = harness(null);
      await expect(
        service.create(
          {
            email: 'x@n.dev',
            password: 'a-long-enough-password',
            role: 'SUPER_ADMIN',
            name: 'X',
          } as never,
          'admin-1',
          'ADMIN',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.adminUser.create).not.toHaveBeenCalled();
    });

    it('still lets an admin manage admins and partners, and a super admin manage super admins', async () => {
      await harness(PARTNER).service.update(
        'p-1',
        { role: 'ADMIN' },
        'admin-1',
        'ADMIN',
      );
      await harness(OTHER_ADMIN).service.update(
        'admin-2',
        { name: 'Renamed' },
        'admin-1',
        'ADMIN',
      );
      await harness(SUPER).service.update(
        'super-1',
        { name: 'Renamed' },
        'admin-1',
        'SUPER_ADMIN',
      );
      await harness(PARTNER).service.update(
        'p-1',
        { role: 'SUPER_ADMIN' },
        'admin-1',
        'SUPER_ADMIN',
      );
    });
  });
});
