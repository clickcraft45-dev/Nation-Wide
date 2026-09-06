import { publicFrontendUrl } from './public-urls';

function config(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as never;
}

describe('publicFrontendUrl', () => {
  it('uses PUBLIC_FRONTEND_URL when set', () => {
    expect(
      publicFrontendUrl(
        config({
          PUBLIC_FRONTEND_URL: 'https://www.nationwidelogistics.co',
          FRONTEND_URL: 'http://localhost:3004,https://other.example',
        }),
      ),
    ).toBe('https://www.nationwidelogistics.co');
  });

  it('never returns the whole CORS allow-list, which is not a URL', () => {
    // The actual production value that produced
    // "http://localhost:3004,https://nationwidelogistics.co,...:/login" in redirects and emails.
    const result = publicFrontendUrl(
      config({
        FRONTEND_URL:
          'http://localhost:3004,https://nationwidelogistics.co,https://www.nationwidelogistics.co',
      }),
    );
    expect(result).not.toContain(',');
    expect(result).toBe('https://nationwidelogistics.co');
  });

  it('skips localhost so a deployed box never mails a link to the recipient own machine', () => {
    expect(
      publicFrontendUrl(config({ FRONTEND_URL: 'http://127.0.0.1:3004,https://live.example' })),
    ).toBe('https://live.example');
  });

  it('falls back to localhost when that is genuinely all there is', () => {
    expect(publicFrontendUrl(config({ FRONTEND_URL: 'http://localhost:3004' }))).toBe(
      'http://localhost:3004',
    );
  });

  it('strips a trailing slash so callers can append a path unconditionally', () => {
    expect(publicFrontendUrl(config({ PUBLIC_FRONTEND_URL: 'https://x.example/' }))).toBe(
      'https://x.example',
    );
  });

  it('defaults when nothing is configured at all', () => {
    expect(publicFrontendUrl(config({}))).toBe('http://localhost:3004');
  });
});
