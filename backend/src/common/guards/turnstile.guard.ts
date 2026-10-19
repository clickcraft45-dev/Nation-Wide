import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const TURNSTILE_ACTION = 'turnstileAction';
const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Sent as a header, not in the body: the DTOs whitelist their fields, so an extra body
// property would be rejected before this guard's work mattered.
export const TURNSTILE_HEADER = 'cf-turnstile-response';

/**
 * Cloudflare Turnstile on a public endpoint. `action` must match the widget's data-action on
 * the form that calls it, so a token solved on the login form cannot be spent on register.
 */
export const RequireTurnstile = (action: string) =>
  applyDecorators(
    SetMetadata(TURNSTILE_ACTION, action),
    UseGuards(TurnstileGuard),
  );

interface SiteverifyResult {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
  metadata?: { result_with_testing_key?: boolean };
}

/**
 * Off until TURNSTILE_SECRET is set, so a deploy that ships before the widget exists does not
 * lock everyone out of sign-in. Once set it fails closed: a missing, reused, wrong-action or
 * wrong-site token, or Cloudflare being unreachable, all refuse the request.
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get<string>('TURNSTILE_SECRET')?.trim();
    if (!secret) return true;

    const action = this.reflector.get<string>(
      TURNSTILE_ACTION,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers[TURNSTILE_HEADER];
    const hostnames = this.expectedHostnames();

    if (
      typeof token !== 'string' ||
      token.length === 0 ||
      token.length > 2048 ||
      hostnames.size === 0
    ) {
      throw this.refuse();
    }

    let result: SiteverifyResult;
    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret,
          response: token,
          ...(request.ip ? { remoteip: request.ip } : {}),
        }),
      });
      if (!response.ok) throw new Error(`siteverify ${response.status}`);
      result = (await response.json()) as SiteverifyResult;
    } catch (err) {
      this.logger.warn(
        `Turnstile check could not complete: ${(err as Error).message}`,
      );
      throw this.refuse();
    }

    // Cloudflare's test secret answers with hostname "example.com" and no action. Only a test
    // secret can produce this flag, and a deployment running one accepts every token anyway.
    const testing = result.metadata?.result_with_testing_key === true;
    if (
      !result.success ||
      (!testing &&
        (result.action !== action ||
          !result.hostname ||
          !hostnames.has(result.hostname)))
    ) {
      this.logger.warn(
        `Turnstile rejected (${action}): ${(result['error-codes'] ?? []).join(',') || `action=${result.action} hostname=${result.hostname}`}`,
      );
      throw this.refuse();
    }
    return true;
  }

  // TURNSTILE_HOSTNAMES when set; otherwise the hosts the CORS allow-list already trusts.
  private expectedHostnames(): Set<string> {
    const raw =
      this.config.get<string>('TURNSTILE_HOSTNAMES') ??
      this.config.get<string>('FRONTEND_URL') ??
      '';
    const hosts = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        try {
          return new URL(entry.includes('://') ? entry : `https://${entry}`)
            .hostname;
        } catch {
          return '';
        }
      })
      .filter(Boolean);
    return new Set(hosts);
  }

  private refuse(): ForbiddenException {
    return new ForbiddenException(
      'Please complete the security check and try again.',
    );
  }
}
