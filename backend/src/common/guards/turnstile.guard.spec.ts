import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { TurnstileGuard } from './turnstile.guard';

function contextWith(token?: string): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '203.0.113.7',
        headers: token ? { 'cf-turnstile-response': token } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

function guardWith(env: Record<string, string | undefined>) {
  const reflector = { get: () => 'login' } as unknown as Reflector;
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new TurnstileGuard(reflector, config);
}

function siteverifyReturns(body: object, status = 200) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

const ENABLED = {
  TURNSTILE_SECRET: 'secret',
  FRONTEND_URL: 'https://www.nationwidelogistics.co,http://localhost:3004',
};

describe('TurnstileGuard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lets everything through while no secret is configured', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(guardWith({}).canActivate(contextWith())).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a request with no token without calling Cloudflare', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(guardWith(ENABLED).canActivate(contextWith())).rejects.toThrow(
      ForbiddenException,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a valid token for this action on an allowed host', async () => {
    const fetchSpy = siteverifyReturns({
      success: true,
      action: 'login',
      hostname: 'www.nationwidelogistics.co',
    });
    await expect(
      guardWith(ENABLED).canActivate(contextWith('tok')),
    ).resolves.toBe(true);
    const body = (fetchSpy.mock.calls[0][1] as RequestInit)
      .body as URLSearchParams;
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('203.0.113.7');
  });

  it.each([
    [
      'a failed check',
      { success: false, 'error-codes': ['timeout-or-duplicate'] },
    ],
    [
      'a token solved for another action',
      {
        success: true,
        action: 'signup',
        hostname: 'www.nationwidelogistics.co',
      },
    ],
    [
      'a token solved on another site',
      { success: true, action: 'login', hostname: 'evil.example' },
    ],
  ])('refuses %s', async (_label, body) => {
    siteverifyReturns(body);
    await expect(
      guardWith(ENABLED).canActivate(contextWith('tok')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      guardWith(ENABLED).canActivate(contextWith('tok')),
    ).rejects.toThrow(ForbiddenException);
  });

  it("accepts Cloudflare's test-key answer, which has no action and a fixed host", async () => {
    siteverifyReturns({
      success: true,
      hostname: 'example.com',
      metadata: { result_with_testing_key: true },
    });
    await expect(
      guardWith(ENABLED).canActivate(contextWith('tok')),
    ).resolves.toBe(true);
  });

  it('prefers TURNSTILE_HOSTNAMES over FRONTEND_URL', async () => {
    siteverifyReturns({
      success: true,
      action: 'login',
      hostname: 'www.nationwidelogistics.co',
    });
    await expect(
      guardWith({
        ...ENABLED,
        TURNSTILE_HOSTNAMES: 'nationwidelogistics.co',
      }).canActivate(contextWith('tok')),
    ).rejects.toThrow(ForbiddenException);
  });
});
