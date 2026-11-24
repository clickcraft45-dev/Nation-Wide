import { BadRequestException } from '@nestjs/common';
import { PostalCodesService } from './postal-codes.service';

const jsonResponse = (body: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('PostalCodesService', () => {
  let fetchMock: jest.Mock;
  let env: Record<string, string>;
  let pincodes: { lookup: jest.Mock };
  let service: PostalCodesService;
  const realFetch = global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    env = { GEONAMES_USERNAME: 'nationwide', GOOGLE_MAPS_SERVER_KEY: 'k' };
    pincodes = { lookup: jest.fn() };
    const prisma = {
      country: {
        findMany: jest.fn().mockResolvedValue([
          { code: 'US', name: 'United States' },
          { code: 'DE', name: 'Germany' },
          { code: 'IN', name: 'India' },
          { code: 'UK', name: 'United Kingdom' },
          { code: 'PT-AZORES', name: 'Azores (Portugal)' },
          { code: 'PT', name: 'Portugal' },
          { code: 'FX', name: 'France' },
        ]),
      },
    };
    service = new PostalCodesService(
      prisma as never,
      { get: (k: string) => env[k] } as never,
      pincodes as never,
    );
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('finds every country a code exists in, named as in our countries list', async () => {
    fetchMock.mockReturnValue(
      jsonResponse({
        postalCodes: [
          {
            postalCode: '10115',
            placeName: 'Berlin',
            adminName1: 'Berlin',
            countryCode: 'DE',
          },
          {
            postalCode: '10115',
            placeName: 'Berlin Mitte',
            adminName1: 'Berlin',
            countryCode: 'DE',
          },
          {
            postalCode: '10115',
            placeName: 'Somewhere',
            adminName1: 'X',
            countryCode: 'ZZ',
          },
        ],
      }),
    );

    const result = await service.lookup('10115');

    expect(result).toEqual({
      status: 'FOUND',
      places: [
        {
          postalCode: '10115',
          countryCode: 'DE',
          countryName: 'Germany',
          city: 'Berlin',
          district: null,
          state: 'Berlin',
        },
      ],
      elsewhere: [],
    });
    // One per country, and a country we do not ship to (ZZ) is left out.
  });

  it('says where a code is when it is not in the country chosen', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('geonames')
        ? url.includes('country=US')
          ? jsonResponse({ postalCodes: [] })
          : jsonResponse({
              postalCodes: [
                { postalCode: '10115', placeName: 'Berlin', countryCode: 'DE' },
              ],
            })
        : jsonResponse({ status: 'ZERO_RESULTS' }),
    );

    const result = await service.lookup('10115', 'United States');

    expect(result.status).toBe('NOT_FOUND');
    expect(result.elsewhere.map((p) => p.countryName)).toEqual(['Germany']);
  });

  it('asks India Post first for an Indian PIN', async () => {
    pincodes.lookup.mockResolvedValue({
      valid: true,
      city: 'Begumpet',
      district: 'Hyderabad',
      state: 'Telangana',
    });

    const result = await service.lookup('500016', 'India');

    expect(result.places[0]).toMatchObject({
      countryName: 'India',
      city: 'Begumpet',
      state: 'Telangana',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to Google when GeoNames refuses (quota, bad username)', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('geonames')
        ? jsonResponse({
            status: { message: 'daily limit exceeded', value: 18 },
          })
        : jsonResponse({
            status: 'OK',
            results: [
              {
                types: ['postal_code'],
                address_components: [
                  {
                    long_name: 'SW1A 1AA',
                    short_name: 'SW1A 1AA',
                    types: ['postal_code'],
                  },
                  {
                    long_name: 'London',
                    short_name: 'London',
                    types: ['postal_town'],
                  },
                  {
                    long_name: 'England',
                    short_name: 'England',
                    types: ['administrative_area_level_1'],
                  },
                  {
                    long_name: 'United Kingdom',
                    short_name: 'GB',
                    types: ['country'],
                  },
                ],
              },
            ],
          }),
    );

    const result = await service.lookup('sw1a 1aa', 'United Kingdom');

    expect(result.places[0]).toMatchObject({
      countryName: 'United Kingdom',
      city: 'London',
      state: 'England',
    });
  });

  it('translates our legacy country codes (France is FX) to ISO and back', async () => {
    fetchMock.mockReturnValue(
      jsonResponse({
        postalCodes: [
          {
            postalCode: '75008',
            placeName: 'Paris 08',
            adminName1: 'Île-de-France',
            countryCode: 'FR',
          },
        ],
      }),
    );
    const result = await service.lookup('75008', 'France');
    expect(fetchMock.mock.calls[0][0]).toContain('country=FR');
    expect(result.places[0]).toMatchObject({
      countryCode: 'FR',
      countryName: 'France',
      city: 'Paris 08',
    });
  });

  it('looks a region up under its country', async () => {
    fetchMock.mockReturnValue(
      jsonResponse({
        postalCodes: [
          {
            postalCode: '9500-001',
            placeName: 'Ponta Delgada',
            countryCode: 'PT',
          },
        ],
      }),
    );
    await service.lookup('9500-001', 'Azores (Portugal)');
    expect(fetchMock.mock.calls[0][0]).toContain('country=PT');
  });

  it('reports unavailable, not "no such code", when no source can be reached', async () => {
    env = {};
    const result = await service.lookup('10001', 'United States');
    expect(result.status).toBe('UNAVAILABLE');
  });

  it('rejects something that is not a postal code', async () => {
    await expect(service.lookup('<script>')).rejects.toThrow(
      BadRequestException,
    );
  });
});
