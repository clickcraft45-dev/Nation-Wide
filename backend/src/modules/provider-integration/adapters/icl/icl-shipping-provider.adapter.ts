import * as https from 'node:https';
import * as http from 'node:http';
import { constants as cryptoConstants } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TrackingStatusCode } from '@nationwide/shared-types';
import type {
  NormalizedTrackingEvent,
  NormalizedTrackingResult,
  ShippingProvider,
} from '../../interfaces/shipping-provider.interface';
import { dayAnchoredEventTime } from '../day-anchored-timestamp.util';

interface RawHttpResponse {
  status: number;
  body: string;
}

// ICL's production host (an older IIS/.NET server) negotiates TLS in a way OpenSSL 3.x treats
// as "unsafe legacy renegotiation" and refuses by default — confirmed live: Node's global
// fetch() (undici) fails production with exactly that TLS error, even though the identical
// request via curl and via this UAT host both succeed. SSL_OP_LEGACY_SERVER_CONNECT tells
// Node's TLS stack to tolerate it, same as curl already does implicitly. This is why this
// adapter uses node:https directly instead of fetch — fetch's dispatcher isn't configurable
// without pulling in undici as an explicit dependency, and this is a one-call adapter.
function postJson(
  targetUrl: string,
  payload: unknown,
  timeoutMs: number,
): Promise<RawHttpResponse> {
  const url = new URL(targetUrl);
  const body = JSON.stringify(payload);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
        ...(isHttps
          ? { secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT }
          : {}),
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString('utf8');
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: responseBody });
        });
      },
    );

    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

interface ICLTrackingRecord {
  AWBNo: string;
  BookingDate: string; // "DD/MM/YYYY"
  Status: string; // free-text current status, e.g. "In Transit", "DELIVERED"
  DeliveryDate: string; // "DD/MM/YYYY", empty until delivered
  DeliveryTime: string; // "HHMM" (no separator), empty until delivered
  Origin?: string;
  Destination?: string;
}

interface ICLTrackingEvent {
  EventDate: string; // "DD/MM/YYYY"
  EventTime: string; // "HHMM" (no separator)
  Location: string;
  Status: string; // free-text, e.g. "Departed Facility in CINCINNATI HUB,OH-USA"
  Excp_Code: string; // short internal code (e.g. "PU", "DF", "OK") — undocumented, not relied on
}

interface ICLTrackingResponse {
  Response: {
    ResponseCode: string;
    ErrorCode: string; // "0" on success
    ErrorDisc: string;
    Tracking: ICLTrackingRecord[];
    // Confirmed via a real production AWB to be populated with full granular event history —
    // an earlier example ICL sent had this empty, which was a property of that AWB (freshly
    // booked, no scan events yet), not of the API. Both cases are handled.
    Events: ICLTrackingEvent[];
  };
}

// ICL gives no discrete vocabulary doc — mapped defensively from confirmed real values (see
// buildEvents' callers) plus conventional courier-status wording. Matched by substring on a
// normalized (uppercased, non-alphanumerics stripped) status, EXCEPT DELIVERED, which requires
// the normalized string to *start with* "DELIVERED" rather than merely contain "DELIVER" —
// real ICL data includes "With delivery courier" and "Arrived at Delivery Facility in ..." for
// shipments that are still in transit, and a bare substring match misclassified both of those
// as DELIVERED. Order matters: EXCEPTION and DELIVERED are checked before the broader
// transit-network markers so a terminal/failure status never gets swallowed by them.
const EXCEPTION_MARKERS = [
  'RTO',
  'RETURN',
  'UNDELIVER',
  'EXCEPTION',
  'HOLD',
  'HELD',
  'CANCEL',
  'FAIL',
  'LOST',
  'DAMAGE',
];
const OUT_FOR_DELIVERY_MARKERS = [
  'OUTFORDELIVER',
  'WITHDELIVERYCOURIER',
  'WITHCOURIER',
  'ONVEHICLEFORDELIVERY',
];
// Transit-network chatter (facility scans, customs, flights) — matched explicitly as IN_TRANSIT
// rather than falling through to the unmatched-default, so routine scan events don't spam the
// "did not match any known mapping" warning.
const IN_TRANSIT_MARKERS = [
  'TRANSIT',
  'DEPART',
  'ARRIV',
  'PROCESSED',
  'FACILITY',
  'HUB',
  'CUSTOM',
  'CLEARANCE',
  'SORT',
  'FLIGHT',
  'FORWARD',
];
const PICKED_UP_MARKERS = ['PICK', 'BOOK', 'MANIFEST'];

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function mapRawStatus(rawStatus: string): {
  status: TrackingStatusCode;
  matched: boolean;
} {
  const normalized = normalize(rawStatus);

  if (EXCEPTION_MARKERS.some((marker) => normalized.includes(marker))) {
    return { status: 'EXCEPTION', matched: true };
  }
  if (normalized.startsWith('DELIVERED')) {
    return { status: 'DELIVERED', matched: true };
  }
  if (OUT_FOR_DELIVERY_MARKERS.some((marker) => normalized.includes(marker))) {
    return { status: 'OUT_FOR_DELIVERY', matched: true };
  }
  if (IN_TRANSIT_MARKERS.some((marker) => normalized.includes(marker))) {
    return { status: 'IN_TRANSIT', matched: true };
  }
  if (PICKED_UP_MARKERS.some((marker) => normalized.includes(marker))) {
    return { status: 'PICKED_UP', matched: true };
  }

  return { status: 'IN_TRANSIT', matched: false };
}

// ICL times are "HHMM" with no separator (e.g. "1303" = 13:03) in real production data, though
// nothing rules out a colon-separated form elsewhere — both are handled.
function parseICLTime(time: string): { hours: number; minutes: number } | null {
  if (!time) return null;
  if (time.includes(':')) {
    const [hours, minutes] = time.split(':').map(Number);
    return Number.isNaN(hours) ? null : { hours, minutes: minutes || 0 };
  }
  const digits = time.replace(/\D/g, '');
  if (!digits) return null;
  const minutes = Number(digits.slice(-2));
  const hours = Number(digits.slice(0, -2) || '0');
  return Number.isNaN(hours) || Number.isNaN(minutes)
    ? null
    : { hours, minutes };
}

// ICL dates are "DD/MM/YYYY"; returns null for blank/unparseable values so callers can fall
// back to a synthetic timestamp instead of constructing an Invalid Date.
function parseICLDate(value: string, time?: string): Date | null {
  if (!value) return null;
  const [day, month, year] = value.split('/').map(Number);
  if (!day || !month || !year) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  const parsedTime = time ? parseICLTime(time) : null;
  if (parsedTime) {
    date.setUTCHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  }
  return date;
}

/**
 * Real ICL Tracking API integration (Section 6/31), replacing StubShippingProviderAdapter for
 * the ICL provider row. Endpoint confirmed by ICL directly: POST {ICL_TRACKING_API_URL} with a
 * JSON body carrying auth fields alongside the AWB (no separate header auth, no CustomerCode
 * required for tracking — unlike their Booking API).
 */
@Injectable()
export class ICLShippingProviderAdapter implements ShippingProvider {
  private readonly logger = new Logger(ICLShippingProviderAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async trackShipment(
    externalTrackingNumber: string,
  ): Promise<NormalizedTrackingResult> {
    const baseUrl = this.configService.get<string>('ICL_TRACKING_API_URL');
    const userId = this.configService.get<string>('ICL_API_USER_ID');
    const password = this.configService.get<string>('ICL_API_PASSWORD');
    const timeoutMs =
      this.configService.get<number>('TRACKING_PROVIDER_TIMEOUT_MS') ?? 6000;

    if (!baseUrl || !userId || !password) {
      throw new Error(
        'ICLShippingProviderAdapter is not configured: set ICL_TRACKING_API_URL, ICL_API_USER_ID, and ICL_API_PASSWORD',
      );
    }

    const response = await postJson(
      baseUrl,
      { UserID: userId, Password: password, AWBNo: externalTrackingNumber },
      timeoutMs,
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `ICL Tracking API returned HTTP ${response.status} for AWB ${externalTrackingNumber}`,
      );
    }

    const parsed = JSON.parse(response.body) as ICLTrackingResponse;
    const { ErrorCode, ErrorDisc, Tracking, Events } = parsed.Response ?? {};

    if (ErrorCode !== '0') {
      throw new Error(
        `ICL Tracking API error for AWB ${externalTrackingNumber}: ${ErrorDisc ?? ErrorCode}`,
      );
    }

    const record = Tracking?.[0];
    if (!record) {
      throw new Error(
        `ICL Tracking API returned no tracking record for AWB ${externalTrackingNumber}`,
      );
    }

    return {
      events:
        Events && Events.length > 0
          ? this.buildEventsFromHistory(record, Events)
          : this.buildEventsFromSummary(record),
    };
  }

  // Preferred path: ICL's per-scan event history, each with its own real timestamp. Sorted
  // ascending since ICL has returned it newest-first in practice, but sorting rather than
  // reversing is robust to either order.
  private buildEventsFromHistory(
    record: ICLTrackingRecord,
    history: ICLTrackingEvent[],
  ): NormalizedTrackingEvent[] {
    const events = history
      .map((raw) => {
        const eventTime = parseICLDate(raw.EventDate, raw.EventTime);
        if (!eventTime) return null;
        const { status, matched } = mapRawStatus(raw.Status);
        if (!matched) {
          this.logger.warn(
            `ICL event status "${raw.Status}" for AWB ${record.AWBNo} did not match any known mapping — defaulted to IN_TRANSIT`,
          );
        }
        return {
          status,
          rawStatus: raw.Status,
          location: raw.Location || null,
          eventTime,
        } satisfies NormalizedTrackingEvent;
      })
      .filter((event): event is NormalizedTrackingEvent => event !== null);

    events.sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime());
    return events;
  }

  // Fallback path for an AWB with no scan history yet: synthesize from the summary record
  // (BookingDate for the initial PICKED_UP event; DeliveryDate/Time if actually delivered;
  // otherwise a day-anchored synthetic timestamp for the current status) — mirrors
  // StubShippingProviderAdapter's dedupe-safe approach for statuses lacking a real timestamp.
  private buildEventsFromSummary(
    record: ICLTrackingRecord,
  ): NormalizedTrackingEvent[] {
    const events: NormalizedTrackingEvent[] = [];

    const bookingTime = parseICLDate(record.BookingDate);
    if (bookingTime) {
      events.push({
        status: 'PICKED_UP',
        rawStatus: 'Booked',
        location: record.Origin ?? null,
        eventTime: bookingTime,
      });
    }

    const { status: currentStatus, matched } = mapRawStatus(record.Status);
    const isDuplicateOfBooking =
      events.length > 0 && currentStatus === 'PICKED_UP';

    if (!matched) {
      this.logger.warn(
        `ICL status "${record.Status}" for AWB ${record.AWBNo} did not match any known mapping — defaulted to IN_TRANSIT`,
      );
    }

    if (!isDuplicateOfBooking) {
      const deliveredTime =
        currentStatus === 'DELIVERED'
          ? parseICLDate(record.DeliveryDate, record.DeliveryTime)
          : null;

      if (currentStatus === 'DELIVERED' && !deliveredTime) {
        this.logger.warn(
          `ICL reported DELIVERED for AWB ${record.AWBNo} without a usable DeliveryDate/DeliveryTime — falling back to a synthetic timestamp`,
        );
      }

      events.push({
        status: currentStatus,
        rawStatus: record.Status,
        location: record.Destination ?? null,
        eventTime: deliveredTime ?? dayAnchoredEventTime(record.Status),
      });
    }

    return events;
  }
}
