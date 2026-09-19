import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { B2bLinksService } from './b2b-links.service';

export const B2B_TOKEN_HEADER = 'x-b2b-token';

/** What the token resolved to, attached to the request for the controller to read. */
export interface B2bSession {
  linkId: string;
  customerId: string;
  label: string;
}

export type B2bRequest = Request & { b2b?: B2bSession };

/**
 * Authenticates the B2B portal by its link token, sent in a header rather than the URL path so it
 * does not end up in access logs, browser history or a Referer header on the way to third parties.
 *
 * Failure is a flat 404, never 401/403: a distinguishable "this token existed once" would confirm
 * a guess. There is no session, no cookie and no refresh — the link itself is the whole credential.
 */
@Injectable()
export class B2bTokenGuard implements CanActivate {
  constructor(private readonly links: B2bLinksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<B2bRequest>();
    const header = request.headers[B2B_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    const session = await this.links.resolve(token);
    if (!session) throw new NotFoundException();
    request.b2b = session;
    return true;
  }
}
