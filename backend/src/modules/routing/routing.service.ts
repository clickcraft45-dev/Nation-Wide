import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * How far the van actually drives.
 *
 * Road distance is a shortest-path search (Dijkstra, or A* with a geographic heuristic) over a
 * graph of the road network — which means it needs the road network. That graph is OpenStreetMap:
 * tens of millions of edges for India alone, far past anything this service could hold, so the
 * search runs in a routing engine that already has it loaded. OSRM is the one addressed here; it
 * answers with the driving route's length over exactly that graph.
 *
 * Point ROUTING_URL at your own OSRM instance in production. The public demo server is the
 * default so a dev box works out of the box, but it is rate-limited and offers no uptime promise.
 */
const DEFAULT_ROUTING_URL = 'https://router.project-osrm.org';
const ROUTE_TIMEOUT_MS = 4000;

export type DistanceSource = 'road' | 'straight-line';

export interface DistanceResult {
  km: number;
  source: DistanceSource;
}

interface OsrmRouteResponse {
  code?: string;
  routes?: { distance?: number }[];
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  // Warehouse-to-doorstep pairs repeat constantly (every cancellation quote re-asks, and a
  // customer opening the dialog twice asks twice), and a road distance between two fixed points
  // does not change within a process lifetime. Same reasoning as PincodesService's cache.
  private readonly cache = new Map<string, DistanceResult>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Driving distance in km, rounded to 100 m. Null unless both ends are known.
   *
   * Falls back to the straight-line distance when the routing engine cannot be reached, and says
   * so in `source`: a cancellation fee is charged off this number, so the caller has to be able
   * to tell the customer which one they are paying for rather than quietly billing an estimate.
   */
  async distanceKm(
    fromLat: number | null,
    fromLng: number | null,
    toLat: number | null,
    toLng: number | null,
  ): Promise<DistanceResult | null> {
    if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
      return null;
    }

    const key = `${fromLat},${fromLng};${toLat},${toLng}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const straightLine: DistanceResult = {
      km: haversineKm(fromLat, fromLng, toLat, toLng),
      source: 'straight-line',
    };

    const baseUrl =
      this.config.get<string>('ROUTING_URL') ?? DEFAULT_ROUTING_URL;
    // OSRM takes lng,lat — the opposite order to everything else here, which is the single
    // easiest thing to get wrong about this API.
    const url = `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`routing engine returned ${response.status}`);
      }
      const payload = (await response.json()) as OsrmRouteResponse;
      const metres = payload.routes?.[0]?.distance;
      if (payload.code !== 'Ok' || typeof metres !== 'number') {
        // A real answer meaning "no road connects these two points" — an island, a bad pin.
        // The straight line is the only thing left to charge on, and it is labelled as such.
        throw new Error(`no route found (${payload.code ?? 'no code'})`);
      }
      const result: DistanceResult = {
        km: Math.round(metres / 100) / 10,
        source: 'road',
      };
      this.cache.set(key, result);
      return result;
    } catch (error) {
      // Never fatal: a cancellation must not be blocked because a routing server is down.
      this.logger.warn(
        `Road distance lookup failed (${key}): ${
          error instanceof Error ? error.message : String(error)
        } — falling back to straight-line`,
      );
      // Deliberately not cached: the next request should try the road network again rather than
      // being stuck on an estimate for the life of the process.
      return straightLine;
    }
  }
}

/** Great-circle distance in km, rounded to 100 m — the fallback when there is no route. */
export function haversineKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a)) * 10) / 10;
}
