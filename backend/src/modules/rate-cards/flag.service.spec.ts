import { readFile } from 'node:fs/promises';
import { FlagService } from './flag.service';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

// getFlagPng()'s success path awaits a dynamic `import('sharp')`, which this project's
// CommonJS-targeted ts-jest config cannot intercept without --experimental-vm-modules (a change
// that would ripple across the whole test suite). These tests instead cover everything reachable
// without that native rasterization step: path resolution, the missing-flag fallback, and the
// per-code cache — the rasterization itself is exercised indirectly by the rate-card PDF e2e/
// generation flow.
describe('FlagService', () => {
  let service: FlagService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FlagService();
  });

  it('uppercases the country code when resolving the SVG path', async () => {
    (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

    await service.getFlagPng('in');

    expect((readFile as jest.Mock).mock.calls[0][0]).toMatch(/IN\.svg$/);
  });

  it('returns undefined and caches the miss when the flag file is missing', async () => {
    (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

    const first = await service.getFlagPng('zz');
    expect(first).toBeUndefined();

    const second = await service.getFlagPng('zz');
    expect(second).toBeUndefined();
    // readFile is only attempted once — the second call is served from the null cache entry.
    expect(readFile as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('caches misses independently per country code', async () => {
    (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

    await service.getFlagPng('yy1');
    await service.getFlagPng('yy2');

    expect(readFile as jest.Mock).toHaveBeenCalledTimes(2);
  });
});
