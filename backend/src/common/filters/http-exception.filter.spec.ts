import type { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/v1/auth/login' }),
    }),
  } as unknown as ArgumentsHost;
  new GlobalExceptionFilter().catch(exception, host);
  return {
    code: (status.mock.calls[0] as unknown[])[0],
    body: json.mock.calls[0][0],
  };
}

describe('GlobalExceptionFilter', () => {
  it('answers an oversized body with 413, not a 500', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      expose: true,
      status: 413,
      type: 'entity.too.large',
    });
    const { code, body } = run(tooLarge);
    expect(code).toBe(413);
    expect(body.message).toBe('The request is too large.');
  });

  it('still hides an unknown error behind a generic 500', () => {
    const { code, body } = run(new TypeError('x is undefined'));
    expect(code).toBe(500);
    expect(body.message).toBe('Something went wrong. Please try again.');
  });
});
