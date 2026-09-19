import {
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { B2bLinksService } from './b2b-links.service';
import { B2bAccountsService } from './b2b-accounts.service';

export const B2B_TOKEN_HEADER = 'x-b2b-token';

/** What the caller resolved to, attached to the request for the controller to read. */
export interface B2bSession {
  linkId: string | null;
  customerId: string;
  label: string;
}

export type B2bRequest = Request & { b2b?: B2bSession };

/**
 * Two ways into the B2B portal, one guard.
 *
 * A signed-in business account (a Customer with isB2b) is the normal route — the ordinary login,
 * an ordinary JWT. A standing link token in the `x-b2b-token` header is the alternative for a
 * despatch desk that does not keep individual logins; it is sent in a header rather than the URL
 * so it stays out of access logs and Referer headers.
 *
 * Either way the customer is resolved HERE, never taken from the request body, so one caller can
 * never reach another business's data. Failure is a flat 404 rather than 401/403: a
 * distinguishable answer would confirm that a guessed token or a non-B2B account exists.
 */
@Injectable()
export class B2bAccessGuard extends AuthGuard('jwt-access') {
  constructor(
    private readonly links: B2bLinksService,
    private readonly accounts: B2bAccountsService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<B2bRequest>();
    const header = request.headers[B2B_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;

    if (token) {
      const link = await this.links.resolve(token);
      if (!link) throw new NotFoundException();
      request.b2b = {
        linkId: link.linkId,
        customerId: link.customerId,
        label: link.label,
      };
      return true;
    }

    // No link token: fall back to the ordinary session. AuthGuard populates request.user or
    // throws 401; a signed-in account that is not a live B2B customer gets the same 404 as a bad
    // token, so the portal never confirms who is or is not a business.
    await super.canActivate(context);
    const user = (request as { user?: { sub?: string; role?: string } }).user;
    if (!user?.sub || user.role !== 'CUSTOMER') throw new NotFoundException();
    if (!(await this.accounts.isB2bCustomer(user.sub))) {
      throw new NotFoundException();
    }
    request.b2b = {
      linkId: null,
      customerId: user.sub,
      label: 'Signed in',
    };
    return true;
  }
}
