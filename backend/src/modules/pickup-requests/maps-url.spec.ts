import { chargeableWeightKg } from '@nationwide/shared-types';
import { isGoogleMapsUrl, parseMapsUrl, resolveMapsUrl } from './maps-url';

describe('parseMapsUrl', () => {
  it('reads the @lat,lng viewport', () => {
    expect(
      parseMapsUrl('https://www.google.com/maps/@17.3850,78.4867,15z'),
    ).toEqual({ latitude: 17.385, longitude: 78.4867 });
  });

  it('prefers the place pin over the viewport', () => {
    expect(
      parseMapsUrl(
        'https://www.google.com/maps/place/Charminar/@17.36,78.47,17z/data=!3m1!4b1!4m6!3m5!3d17.3616!4d78.4747',
      ),
    ).toEqual({ latitude: 17.3616, longitude: 78.4747 });
  });

  it('reads q= and encoded commas', () => {
    expect(parseMapsUrl('https://maps.google.com/?q=12.97%2C77.59')).toEqual({
      latitude: 12.97,
      longitude: 77.59,
    });
  });

  it('is null for a link with no coordinates', () => {
    expect(
      parseMapsUrl('https://www.google.com/maps/place/Charminar'),
    ).toBeNull();
  });

  it('rejects out-of-range values', () => {
    expect(
      parseMapsUrl('https://www.google.com/maps/@97.1,78.4,15z'),
    ).toBeNull();
  });
});

describe('resolveMapsUrl', () => {
  it('never fetches a non-Google host', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    expect(isGoogleMapsUrl('https://169.254.169.254/latest')).toBe(false);
    expect(isGoogleMapsUrl('http://maps.app.goo.gl/x')).toBe(false);
    await expect(
      resolveMapsUrl('https://evil.example/@1,2'),
    ).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('follows a short link to its coordinates', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      headers: new Headers({
        location: 'https://www.google.com/maps/place/x/@17.4,78.5,17z',
      }),
    } as Response);
    await expect(
      resolveMapsUrl('https://maps.app.goo.gl/abc'),
    ).resolves.toEqual({
      latitude: 17.4,
      longitude: 78.5,
    });
    fetchSpy.mockRestore();
  });
});

describe('chargeableWeightKg', () => {
  it('charges each box at the greater of actual and volumetric', () => {
    // 50x40x30 / 5000 = 12 kg volumetric beats 5 kg actual; the envelope has no dimensions.
    expect(
      chargeableWeightKg([
        { weightKg: 5, lengthCm: 50, widthCm: 40, heightCm: 30 },
        { weightKg: 0.5 },
      ]),
    ).toBe(12.5);
  });

  it('rounds up to the cent, never down, and ignores float noise', () => {
    expect(chargeableWeightKg([{ weightKg: 1.001 }])).toBe(1.01);
    expect(chargeableWeightKg([{ weightKg: 0.1 }, { weightKg: 0.2 }])).toBe(
      0.3,
    );
  });
});
