import { NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Role } from '@nationwide/shared-types';
import { RolesGuard } from './roles.guard';

/**
 * SUPER_ADMIN being a superset of ADMIN is stated once, in this guard. If that rule breaks, the
 * top role silently loses access to most of the admin panel — and every route would have to be
 * re-read to notice.
 */
describe('RolesGuard', () => {
  function context(role?: Role): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => (role ? { user: { role } } : {}),
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  function guardFor(required: Role[] | undefined) {
    const reflector = { getAllAndOverride: () => required };
    return new RolesGuard(reflector as never);
  }

  it('lets a role through a route that names it', () => {
    expect(guardFor(['ADMIN']).canActivate(context('ADMIN'))).toBe(true);
  });

  it('lets SUPER_ADMIN through anything ADMIN may reach', () => {
    expect(guardFor(['ADMIN']).canActivate(context('SUPER_ADMIN'))).toBe(true);
  });

  it('does not let ADMIN into a SUPER_ADMIN route', () => {
    expect(() =>
      guardFor(['SUPER_ADMIN']).canActivate(context('ADMIN')),
    ).toThrow(NotFoundException);
  });

  it('does not promote any other role', () => {
    expect(() =>
      guardFor(['ADMIN']).canActivate(context('PICKUP_PARTNER')),
    ).toThrow(NotFoundException);
    expect(() => guardFor(['ADMIN']).canActivate(context('CUSTOMER'))).toThrow(
      NotFoundException,
    );
  });

  it('answers 404 rather than 403, so the admin surface cannot be mapped by probing', () => {
    expect(() => guardFor(['ADMIN']).canActivate(context())).toThrow(
      NotFoundException,
    );
  });

  it('allows a route that requires no role at all', () => {
    expect(guardFor(undefined).canActivate(context())).toBe(true);
  });
});
