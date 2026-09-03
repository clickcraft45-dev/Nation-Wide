import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import * as https from 'node:https';
import { ConfigService } from '@nestjs/config';
import { ICLShippingProviderAdapter } from './icl-shipping-provider.adapter';

jest.mock('node:http');
jest.mock('node:https');

type FakeRequest = EventEmitter & {
  write: jest.Mock;
  end: jest.Mock;
  destroy: jest.Mock;
};

function buildConfigService(
  overrides: Record<string, string | number> = {},
): ConfigService {
  const values: Record<string, string | number> = {
    ICL_TRACKING_API_URL: 'http://icl.test/api/v1/Tracking/Tracking',
    ICL_API_USER_ID: 'test',
    ICL_API_PASSWORD: 'test@99',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function makeFakeRequest(): FakeRequest {
  const req = new EventEmitter() as FakeRequest;
  req.write = jest.fn();
  req.end = jest.fn();
  req.destroy = jest.fn((err?: Error) => {
    if (err) queueMicrotask(() => req.emit('error', err));
  });
  return req;
}

// The adapter talks to node:http/node:https directly (not fetch — see the adapter's own
// comment on why), so these mock the request()/response-emitter shape instead of fetch.
function mockRequestOnce(
  module: 'http' | 'https',
  status: number,
  body: string,
  onRequest?: (req: FakeRequest) => void,
) {
  const mod = module === 'http' ? http : https;
  (mod.request as unknown as jest.Mock).mockImplementationOnce(
    (
      _options: unknown,
      callback: (res: EventEmitter & { statusCode: number }) => void,
    ) => {
      const req = makeFakeRequest();
      onRequest?.(req);
      // Fired synchronously (not setImmediate/queueMicrotask): several of these tests run
      // under jest.useFakeTimers(), which can intercept both macrotasks and microtasks, so
      // scheduling anything async here risks the mock never resolving. postJson's real
      // callback attaches its res.on('data'/'end') listeners synchronously anyway, so nothing
      // requires this to be async in the mock.
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = status;
      callback(res);
      res.emit('data', Buffer.from(body));
      res.emit('end');
      return req;
    },
  );
}

// Deliberately doesn't emit 'timeout' itself: postJson only attaches req.on('timeout', ...)
// AFTER client.request() returns, so emitting inside this factory (before the caller gets the
// req back) would fire on an object with no listeners yet and the event would be lost. Instead
// this hands the req back via onRequest so the test can emit once trackShipment() has run its
// synchronous setup (everything up to its first real await) and the listener is attached.
function mockTimeoutOnce(
  module: 'http' | 'https',
  onRequest: (req: FakeRequest) => void,
) {
  const mod = module === 'http' ? http : https;
  (mod.request as unknown as jest.Mock).mockImplementationOnce(() => {
    const req = makeFakeRequest();
    onRequest(req);
    return req;
  });
}

describe('ICLShippingProviderAdapter', () => {
  beforeEach(() => {
    (http.request as unknown as jest.Mock).mockReset();
    (https.request as unknown as jest.Mock).mockReset();
  });

  it('maps ICL\'s confirmed real response ("In Transit") into a PICKED_UP + IN_TRANSIT sequence', async () => {
    let capturedRequest: FakeRequest | undefined;
    mockRequestOnce(
      'http',
      200,
      JSON.stringify({
        Response: {
          ResponseCode: 'RT01',
          ErrorCode: '0',
          ErrorDisc: 'Success',
          Tracking: [
            {
              AWBNo: '21206253',
              BookingDate: '03/03/2021',
              Origin: 'BOMBAY',
              Destination: 'DUBAI',
              Status: 'In Transit',
              DeliveryDate: '',
              DeliveryTime: '',
            },
          ],
          Events: [],
        },
      }),
      (req) => {
        capturedRequest = req;
      },
    );

    const adapter = new ICLShippingProviderAdapter(buildConfigService());
    const result = await adapter.trackShipment('21206253');

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      status: 'PICKED_UP',
      location: 'BOMBAY',
    });
    expect(result.events[0].eventTime.toISOString()).toBe(
      '2021-03-03T00:00:00.000Z',
    );
    expect(result.events[1]).toMatchObject({
      status: 'IN_TRANSIT',
      rawStatus: 'In Transit',
      location: 'DUBAI',
    });
    expect(result.events[1].eventTime.getTime()).toBeGreaterThan(
      result.events[0].eventTime.getTime(),
    );

    expect(capturedRequest!.write).toHaveBeenCalled();
    const [sentBody] = capturedRequest!.write.mock.calls[0];
    expect(JSON.parse(sentBody)).toEqual({
      UserID: 'test',
      Password: 'test@99',
      AWBNo: '21206253',
    });
  });

  it('uses the real DeliveryDate/DeliveryTime once ICL reports Delivered', async () => {
    mockRequestOnce(
      'http',
      200,
      JSON.stringify({
        Response: {
          ErrorCode: '0',
          ErrorDisc: 'Success',
          Tracking: [
            {
              AWBNo: 'AWB-DELIVERED',
              BookingDate: '01/01/2026',
              Status: 'Delivered',
              DeliveryDate: '05/01/2026',
              DeliveryTime: '14:30:00',
            },
          ],
          Events: [],
        },
      }),
    );

    const adapter = new ICLShippingProviderAdapter(buildConfigService());
    const result = await adapter.trackShipment('AWB-DELIVERED');

    const deliveredEvent = result.events[result.events.length - 1];
    expect(deliveredEvent.status).toBe('DELIVERED');
    expect(deliveredEvent.eventTime.toISOString()).toBe(
      '2026-01-05T14:30:00.000Z',
    );
  });

  it('produces identical synthetic timestamps across same-day polls of an unchanged status (regression: no dedupe-defeating drift)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T02:00:00.000Z'));
    mockRequestOnce(
      'http',
      200,
      JSON.stringify({
        Response: {
          ErrorCode: '0',
          Tracking: [
            {
              AWBNo: 'SAME-DAY',
              BookingDate: '01/01/2026',
              Status: 'In Transit',
              DeliveryDate: '',
              DeliveryTime: '',
            },
          ],
          Events: [],
        },
      }),
    );
    const adapter = new ICLShippingProviderAdapter(buildConfigService());
    const first = await adapter.trackShipment('SAME-DAY');

    jest.setSystemTime(new Date('2026-06-15T20:00:00.000Z'));
    mockRequestOnce(
      'http',
      200,
      JSON.stringify({
        Response: {
          ErrorCode: '0',
          Tracking: [
            {
              AWBNo: 'SAME-DAY',
              BookingDate: '01/01/2026',
              Status: 'In Transit',
              DeliveryDate: '',
              DeliveryTime: '',
            },
          ],
          Events: [],
        },
      }),
    );
    const second = await adapter.trackShipment('SAME-DAY');

    expect(second.events).toEqual(first.events);
    jest.useRealTimers();
  });

  it('gives distinct timestamps for two different statuses reached the same day', async () => {
    mockRequestOnce(
      'http',
      200,
      JSON.stringify({
        Response: {
          ErrorCode: '0',
          Tracking: [
            {
              AWBNo: 'AWB-A',
              BookingDate: '01/01/2026',
              Status: 'In Transit',
              DeliveryDate: '',
              DeliveryTime: '',
            },
          ],
          Events: [],
        },
      }),
    );
    const adapter = new ICLShippingProviderAdapter(buildConfigService());
    const inTransit = await adapter.trackShipment('AWB-A');

    mockRequestOnce(
      'http',
      200,
      JSON.stringify({
        Response: {
          ErrorCode: '0',
          Tracking: [
            {
              AWBNo: 'AWB-A',
              BookingDate: '01/01/2026',
              Status: 'Out for Delivery',
              DeliveryDate: '',
              DeliveryTime: '',
            },
          ],
          Events: [],
        },
      }),
    );
    const outForDelivery = await adapter.trackShipment('AWB-A');

    const inTransitEvent = inTransit.events[inTransit.events.length - 1];
    const outForDeliveryEvent =
      outForDelivery.events[outForDelivery.events.length - 1];
    expect(outForDeliveryEvent.status).toBe('OUT_FOR_DELIVERY');
    expect(outForDeliveryEvent.eventTime.getTime()).not.toBe(
      inTransitEvent.eventTime.getTime(),
    );
  });

  it('maps unrecognized status strings to EXCEPTION when they look like failures', async () => {
    mockRequestOnce(
      'http',
      200,
      JSON.stringify({
        Response: {
          ErrorCode: '0',
          Tracking: [
            {
              AWBNo: 'AWB-RTO',
              BookingDate: '01/01/2026',
              Status: 'RTO Initiated',
              DeliveryDate: '',
              DeliveryTime: '',
            },
          ],
          Events: [],
        },
      }),
    );
    const adapter = new ICLShippingProviderAdapter(buildConfigService());
    const result = await adapter.trackShipment('AWB-RTO');
    expect(result.events[result.events.length - 1].status).toBe('EXCEPTION');
  });

  it('throws when ICL responds with a non-zero ErrorCode', async () => {
    mockRequestOnce(
      'http',
      200,
      JSON.stringify({
        Response: {
          ErrorCode: '1',
          ErrorDisc: 'Invalid AWB',
          Tracking: [],
          Events: [],
        },
      }),
    );
    const adapter = new ICLShippingProviderAdapter(buildConfigService());
    await expect(adapter.trackShipment('BAD-AWB')).rejects.toThrow(
      'Invalid AWB',
    );
  });

  it('throws on a non-OK HTTP response', async () => {
    mockRequestOnce('http', 500, '{}');
    const adapter = new ICLShippingProviderAdapter(buildConfigService());
    await expect(adapter.trackShipment('AWB')).rejects.toThrow('HTTP 500');
  });

  it('rejects when the request times out', async () => {
    let capturedRequest: FakeRequest | undefined;
    mockTimeoutOnce('http', (req) => {
      capturedRequest = req;
    });
    const adapter = new ICLShippingProviderAdapter(buildConfigService());
    const promise = adapter.trackShipment('AWB');
    capturedRequest!.emit('timeout');
    await expect(promise).rejects.toThrow('timed out');
  });

  it('throws a clear configuration error when credentials are missing', async () => {
    const adapter = new ICLShippingProviderAdapter(
      buildConfigService({ ICL_API_PASSWORD: '' }),
    );
    await expect(adapter.trackShipment('AWB')).rejects.toThrow(
      'not configured',
    );
    expect(http.request).not.toHaveBeenCalled();
    expect(https.request).not.toHaveBeenCalled();
  });

  it('uses node:https with SSL_OP_LEGACY_SERVER_CONNECT for an https:// URL (ICL production requires this)', async () => {
    mockRequestOnce(
      'https',
      200,
      JSON.stringify({
        Response: {
          ErrorCode: '0',
          Tracking: [
            {
              AWBNo: 'AWB-HTTPS',
              BookingDate: '01/01/2026',
              Status: 'In Transit',
              DeliveryDate: '',
              DeliveryTime: '',
            },
          ],
          Events: [],
        },
      }),
    );
    const adapter = new ICLShippingProviderAdapter(
      buildConfigService({
        ICL_TRACKING_API_URL:
          'https://cloud.iclinternational.in/api/v1/Tracking/Tracking',
      }),
    );
    await adapter.trackShipment('AWB-HTTPS');

    expect(https.request).toHaveBeenCalledTimes(1);
    const [options] = (https.request as unknown as jest.Mock).mock.calls[0];
    expect(options.secureOptions).toBeDefined();
  });

  // Regression coverage using a trimmed, real production response (AWB 6000005372, captured
  // live) — the full Events array is the normal case, not the empty-Events fallback.
  describe('with a populated Events array (real production shape)', () => {
    const REAL_RESPONSE = {
      Response: {
        ErrorCode: '0',
        ErrorDisc: 'Success',
        Tracking: [
          {
            AWBNo: '6000005372',
            BookingDate: '26/11/2021',
            Origin: 'HYDERABAD',
            Destination: 'U.S.A.',
            Status: 'DELIVERED',
            DeliveryDate: '29/11/2021',
            DeliveryTime: '1303',
          },
        ],
        // Deliberately newest-first, matching what ICL actually returns.
        Events: [
          {
            EventDate: '29/11/2021',
            EventTime: '1303',
            Location: 'EAST WINDSOR,NJ-USA',
            Status: 'Delivered - Signed for by',
            Excp_Code: 'OK',
          },
          {
            EventDate: '29/11/2021',
            EventTime: '1031',
            Location: 'EAST WINDSOR,NJ-USA',
            Status: 'With delivery courier',
            Excp_Code: 'WC',
          },
          {
            EventDate: '29/11/2021',
            EventTime: '0715',
            Location: 'EAST WINDSOR,NJ-USA',
            Status: 'Arrived at Delivery Facility in EAST WINDSOR,NJ-USA',
            Excp_Code: 'AR',
          },
          {
            EventDate: '26/11/2021',
            EventTime: '1350',
            Location: 'HYDERABAD-IND',
            Status: 'Shipment picked up',
            Excp_Code: 'PU',
          },
        ],
      },
    };

    it('uses the real per-scan Events history instead of the BookingDate/Status summary', async () => {
      mockRequestOnce('http', 200, JSON.stringify(REAL_RESPONSE));
      const adapter = new ICLShippingProviderAdapter(buildConfigService());
      const result = await adapter.trackShipment('6000005372');

      expect(result.events.map((e) => e.rawStatus)).toEqual([
        'Shipment picked up',
        'Arrived at Delivery Facility in EAST WINDSOR,NJ-USA',
        'With delivery courier',
        'Delivered - Signed for by',
      ]);
    });

    it('sorts events chronologically ascending regardless of the newest-first input order', async () => {
      mockRequestOnce('http', 200, JSON.stringify(REAL_RESPONSE));
      const adapter = new ICLShippingProviderAdapter(buildConfigService());
      const result = await adapter.trackShipment('6000005372');

      for (let i = 1; i < result.events.length; i++) {
        expect(result.events[i].eventTime.getTime()).toBeGreaterThan(
          result.events[i - 1].eventTime.getTime(),
        );
      }
    });

    it('parses "HHMM" event times correctly (regression: 1303 must mean 13:03, not hour 1303)', async () => {
      mockRequestOnce('http', 200, JSON.stringify(REAL_RESPONSE));
      const adapter = new ICLShippingProviderAdapter(buildConfigService());
      const result = await adapter.trackShipment('6000005372');

      const delivered = result.events[result.events.length - 1];
      expect(delivered.eventTime.toISOString()).toBe(
        '2021-11-29T13:03:00.000Z',
      );
      const pickedUp = result.events[0];
      expect(pickedUp.eventTime.toISOString()).toBe('2021-11-26T13:50:00.000Z');
    });

    it('does not classify "With delivery courier" or "Arrived at Delivery Facility" as DELIVERED (regression)', async () => {
      mockRequestOnce('http', 200, JSON.stringify(REAL_RESPONSE));
      const adapter = new ICLShippingProviderAdapter(buildConfigService());
      const result = await adapter.trackShipment('6000005372');

      const withCourier = result.events.find(
        (e) => e.rawStatus === 'With delivery courier',
      );
      const arrivedAtFacility = result.events.find(
        (e) =>
          e.rawStatus === 'Arrived at Delivery Facility in EAST WINDSOR,NJ-USA',
      );
      expect(withCourier?.status).toBe('OUT_FOR_DELIVERY');
      expect(arrivedAtFacility?.status).toBe('IN_TRANSIT');
    });

    it('only classifies the actual "Delivered - ..." event as DELIVERED', async () => {
      mockRequestOnce('http', 200, JSON.stringify(REAL_RESPONSE));
      const adapter = new ICLShippingProviderAdapter(buildConfigService());
      const result = await adapter.trackShipment('6000005372');

      const deliveredEvents = result.events.filter(
        (e) => e.status === 'DELIVERED',
      );
      expect(deliveredEvents).toHaveLength(1);
      expect(deliveredEvents[0].rawStatus).toBe('Delivered - Signed for by');
    });

    it('classifies "Shipment picked up" as PICKED_UP', async () => {
      mockRequestOnce('http', 200, JSON.stringify(REAL_RESPONSE));
      const adapter = new ICLShippingProviderAdapter(buildConfigService());
      const result = await adapter.trackShipment('6000005372');
      expect(result.events[0].status).toBe('PICKED_UP');
    });
  });
});
