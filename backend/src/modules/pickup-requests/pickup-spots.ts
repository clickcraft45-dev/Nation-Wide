import type { PickupSpotsDto, PickupSpotDto } from '@nationwide/shared-types';

/**
 * The building at a pin and the ways into it: its outline, its entrances and the points a vehicle
 * can stop at. Staff use it to pin the gate rather than the middle of a rooftop, which is what a
 * shared Google Maps link usually points at.
 *
 * Google serves this only from the Geocoding API v4 "SearchDestinations" method, a server-to-
 * server API (the browser Geocoder has no entrances). It needs a key without an HTTP-referrer
 * restriction: GOOGLE_MAPS_SERVER_KEY, falling back to GOOGLE_MAPS_API_KEY. Without a usable key,
 * or for a spot Google has no building data for, the answer is simply empty and the map still
 * works as a plain pin.
 */
const ENDPOINT = 'https://geocode.googleapis.com/v4/geocode/destinations';
const FIELD_MASK = [
  'destinations.primary.displayName',
  'destinations.primary.displayPolygon',
  'destinations.primary.structureType',
  'destinations.entrances',
  'destinations.navigationPoints',
].join(',');

export const EMPTY_SPOTS: PickupSpotsDto = {
  buildingName: null,
  outline: null,
  spots: [],
};

export async function findPickupSpots(
  latitude: number,
  longitude: number,
  key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY,
): Promise<PickupSpotsDto> {
  if (!key) return EMPTY_SPOTS;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        locationQuery: {
          location: { latitude, longitude },
          placeFilter: { structureType: 'BUILDING', addressability: 'ANY' },
        },
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return EMPTY_SPOTS;
    return parseDestinations(await res.json());
  } catch {
    return EMPTY_SPOTS;
  }
}

type LatLngJson = {
  latitude?: unknown;
  longitude?: unknown;
  lat?: unknown;
  lng?: unknown;
};

function point(raw: unknown): { latitude: number; longitude: number } | null {
  const loc = (raw ?? {}) as LatLngJson;
  const latitude = Number(loc.latitude ?? loc.lat);
  const longitude = Number(loc.longitude ?? loc.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** The outer ring of a GeoJSON Polygon / MultiPolygon, as [lng, lat] pairs. */
function outerRing(polygon: unknown): [number, number][] | null {
  const geo = (polygon ?? {}) as { type?: string; coordinates?: unknown };
  const rings =
    geo.type === 'Polygon'
      ? (geo.coordinates as unknown[])
      : geo.type === 'MultiPolygon'
        ? ((geo.coordinates as unknown[][])?.[0] ?? null)
        : null;
  const ring = rings?.[0];
  if (!Array.isArray(ring)) return null;
  const pairs = ring
    .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2)
    .map(([lng, lat]) => [Number(lng), Number(lat)] as [number, number])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  return pairs.length >= 3 ? pairs : null;
}

/** Exported for the tests; Google's v4 response, read defensively. */
export function parseDestinations(body: unknown): PickupSpotsDto {
  const destination = ((body as { destinations?: unknown[] })?.destinations ??
    [])[0] as
    | {
        primary?: { displayName?: { text?: string }; displayPolygon?: unknown };
        entrances?: {
          location?: unknown;
          tags?: string[];
          displayName?: { text?: string };
        }[];
        navigationPoints?: {
          location?: unknown;
          displayName?: { text?: string };
        }[];
      }
    | undefined;
  if (!destination) return EMPTY_SPOTS;

  const spots: PickupSpotDto[] = [];
  const entrances = destination.entrances ?? [];
  // Google's preferred entrance first: that is the one the pin snaps to.
  const isPreferred = (e: { tags?: string[] }) =>
    Boolean(e.tags?.includes('PREFERRED'));
  const ordered = [...entrances].sort(
    (a, b) => Number(isPreferred(b)) - Number(isPreferred(a)),
  );
  for (const [i, e] of ordered.entries()) {
    const at = point(e.location);
    if (!at) continue;
    const preferred = isPreferred(e);
    spots.push({
      kind: 'ENTRANCE',
      label:
        e.displayName?.text ||
        (preferred ? 'Main entrance' : `Entrance ${i + 1}`),
      preferred,
      ...at,
    });
  }
  for (const [i, n] of (destination.navigationPoints ?? []).entries()) {
    const at = point(n.location);
    if (!at) continue;
    spots.push({
      kind: 'STOP',
      label: n.displayName?.text || `Drop-off point ${i + 1}`,
      preferred: false,
      ...at,
    });
  }

  return {
    buildingName: destination.primary?.displayName?.text || null,
    outline:
      outerRing(destination.primary?.displayPolygon)?.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      })) ?? null,
    spots: spots.slice(0, 8),
  };
}
