import { RoutingService } from './routing.service';

/**
 * The fallback is the part worth pinning: a cancellation fee is charged off this number, so a
 * routing engine that is down must produce a labelled estimate rather than a blocked cancellation
 * or a silent one.
 */
describe('RoutingService', () => {
  const config = { get: () => 'https://routing.test' } as never;
  // Hyderabad warehouse to a pickup ~1.6km due north.
  const from = { lat: 17.385, lng: 78.4867 };
  const to = { lat: 17.3995, lng: 78.4867 };

  let service: RoutingService;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    service = new RoutingService(config);
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  function respond(body: unknown, ok = true) {
    fetchMock.mockResolvedValue({
      ok,
      status: ok ? 200 : 503,
      json: () => Promise.resolve(body),
    });
  }

  it('measures the driving route, asking the engine in lng,lat order', async () => {
    respond({ code: 'Ok', routes: [{ distance: 2148 }] });

    const result = await service.distanceKm(from.lat, from.lng, to.lat, to.lng);

    expect(result).toEqual({ km: 2.1, source: 'road' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://routing.test/route/v1/driving/78.4867,17.385;78.4867,17.3995?overview=false',
    );
  });

  it('answers from cache rather than asking twice for the same pair', async () => {
    respond({ code: 'Ok', routes: [{ distance: 2148 }] });

    await service.distanceKm(from.lat, from.lng, to.lat, to.lng);
    await service.distanceKm(from.lat, from.lng, to.lat, to.lng);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the straight line, labelled, when the engine is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await service.distanceKm(from.lat, from.lng, to.lat, to.lng);

    expect(result).toEqual({ km: 1.6, source: 'straight-line' });
  });

  it('retries the road network next time rather than caching an estimate', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await service.distanceKm(from.lat, from.lng, to.lat, to.lng);

    respond({ code: 'Ok', routes: [{ distance: 2148 }] });
    const result = await service.distanceKm(from.lat, from.lng, to.lat, to.lng);

    expect(result).toEqual({ km: 2.1, source: 'road' });
  });

  it('falls back when the engine answers that no road connects the two points', async () => {
    respond({ code: 'NoRoute', routes: [] });

    const result = await service.distanceKm(from.lat, from.lng, to.lat, to.lng);

    expect(result?.source).toBe('straight-line');
  });

  it('has no distance to give when either end is unknown', async () => {
    expect(await service.distanceKm(from.lat, from.lng, null, null)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
