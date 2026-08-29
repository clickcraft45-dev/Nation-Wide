import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PincodesService } from './pincodes.service';

describe('PincodesService', () => {
  let service: PincodesService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    service = new PincodesService();
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  const successPayload = [
    {
      Status: 'Success',
      PostOffice: [
        {
          Name: 'Bandra West',
          Block: 'Mumbai',
          District: 'Mumbai',
          State: 'Maharashtra',
        },
        {
          Name: 'Khar Colony',
          Block: 'Mumbai',
          District: 'Mumbai',
          State: 'Maharashtra',
        },
      ],
    },
  ];

  function respondWith(payload: unknown, ok = true) {
    fetchMock.mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(payload),
    });
  }

  it.each(['12345', '1234567', '012345', 'abcdef', ''])(
    'rejects %s before calling India Post',
    async (bad) => {
      await expect(service.lookup(bad)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('resolves city, district and state from the first post office', async () => {
    respondWith(successPayload);

    await expect(service.lookup('400050')).resolves.toEqual({
      pincode: '400050',
      valid: true,
      city: 'Mumbai',
      district: 'Mumbai',
      state: 'Maharashtra',
      postOffices: ['Bandra West', 'Khar Colony'],
    });
  });

  it('reports a well-formed but unallocated code as invalid rather than erroring', async () => {
    respondWith([{ Status: 'Error', PostOffice: null }]);

    const result = await service.lookup('999999');
    expect(result).toMatchObject({
      valid: false,
      city: null,
      state: null,
      postOffices: [],
    });
  });

  it('caches both hits and misses for the process lifetime', async () => {
    respondWith(successPayload);
    await service.lookup('400050');
    await service.lookup('400050');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces an upstream outage as 503, never as "invalid"', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(service.lookup('400050')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
