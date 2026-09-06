import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@nationwide/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../../modules/auth/types/jwt-payload.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (user && requiredRoles.includes(user.role)) {
      return true;
    }

    // 404, not 403. A 403 confirms the route exists — someone probing with a low-privilege token
    // can map the entire admin surface by reading status codes alone, telling apart "no such
    // endpoint" from "an endpoint you may not use". Answering 404 makes those indistinguishable.
    //
    // This changes nothing about who is allowed in: authorisation already decided above, and the
    // request is refused either way. It only removes the confirmation. Authentication still
    // answers 401 from JwtAuthGuard, because a caller with no token needs to be told to sign in
    // rather than led to believe the route is missing.
    throw new NotFoundException();
  }
}
