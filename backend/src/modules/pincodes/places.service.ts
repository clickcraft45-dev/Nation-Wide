import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  PlaceAddressDto,
  PlaceSuggestionDto,
} from '@nationwide/shared-types';

/**
 * Place search for the address and map-pin fields, served from the backend so the suggestions
 * keep working when the browser key cannot call the Places API (not enabled, or referrer rules).
 *
 * Google Places (New) on GOOGLE_MAPS_SERVER_KEY first. When Google refuses or has no key, the
 * suggestions come from OpenStreetMap through Photon (photon.komoot.io), which needs no key and
 * returns the address and coordinates in the same answer.
 */
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
/** After Google refuses the key, skip it for this long rather than paying a round trip per keystroke. */
const REFUSAL_BACKOFF_MS = 10 * 60 * 1000;
/** India's bounding box (west, south, east, north), for keeping OpenStreetMap results in India. */
const INDIA_BBOX = '68.1,6.5,97.5,35.7';

type Component = { long: string; short: string; types: string[] };

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly cache = new Map<
    string,
    { at: number; value: PlaceSuggestionDto[] }
  >();
  private googleRefusedAt = 0;

  private get key(): string {
    return (
      process.env.GOOGLE_MAPS_SERVER_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      ''
    );
  }

  private googleUsable(): boolean {
    return (
      Boolean(this.key) &&
      Date.now() - this.googleRefusedAt > REFUSAL_BACKOFF_MS
    );
  }

  async suggest(
    rawQuery: string,
    region: string | undefined,
    near: { lat: number; lng: number } | null,
  ): Promise<PlaceSuggestionDto[]> {
    const query = rawQuery.trim().slice(0, 120);
    if (query.length < 3) return [];
    const regionCode = /^[a-z]{2}$/i.test(region ?? '')
      ? region!.toLowerCase()
      : '';
    const cacheKey = `${regionCode}|${query.toLowerCase()}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    let found: PlaceSuggestionDto[] = [];
    if (this.googleUsable())
      found = await this.googleSuggest(query, regionCode, near);
    if (found.length === 0)
      found = await this.photonSuggest(query, regionCode, near);

    if (this.cache.size >= CACHE_MAX) {
      // Maps keep insertion order: the first key is the oldest entry.
      for (const oldest of this.cache.keys()) {
        this.cache.delete(oldest);
        break;
      }
    }
    this.cache.set(cacheKey, { at: Date.now(), value: found });
    return found;
  }

  /** The address and point of a Google suggestion, fetched when it is picked. */
  async details(placeId: string): Promise<PlaceAddressDto> {
    if (!/^[\w-]{10,300}$/.test(placeId) || !this.key)
      throw new NotFoundException('Place not found');
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          headers: {
            'X-Goog-Api-Key': this.key,
            'X-Goog-FieldMask': 'addressComponents,location,formattedAddress',
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) throw new Error(`Google returned ${res.status}`);
      const body = (await res.json()) as {
        addressComponents?: {
          longText?: string;
          shortText?: string;
          types?: string[];
        }[];
        location?: { latitude?: number; longitude?: number };
        formattedAddress?: string;
      };
      const parsed = parseComponents(
        (body.addressComponents ?? []).map((c) => ({
          long: c.longText ?? '',
          short: c.shortText ?? '',
          types: c.types ?? [],
        })),
        body.formattedAddress ?? '',
      );
      return {
        ...parsed,
        latitude:
          typeof body.location?.latitude === 'number'
            ? body.location.latitude
            : null,
        longitude:
          typeof body.location?.longitude === 'number'
            ? body.location.longitude
            : null,
      };
    } catch (error) {
      this.logger.warn(`Place details failed: ${String(error)}`);
      throw new NotFoundException('Place not found');
    }
  }

  private async googleSuggest(
    input: string,
    regionCode: string,
    near: { lat: number; lng: number } | null,
  ): Promise<PlaceSuggestionDto[]> {
    try {
      const res = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.key,
          },
          body: JSON.stringify({
            input,
            ...(regionCode ? { includedRegionCodes: [regionCode] } : {}),
            ...(near
              ? {
                  locationBias: {
                    circle: {
                      center: { latitude: near.lat, longitude: near.lng },
                      radius: 50000,
                    },
                  },
                }
              : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (res.status === 403 || res.status === 401) {
        this.googleRefusedAt = Date.now();
        this.logger.warn(
          'Google Places refused the server key; using OpenStreetMap suggestions.',
        );
        return [];
      }
      if (!res.ok) return [];
      const body = (await res.json()) as {
        suggestions?: {
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            structuredFormat?: {
              mainText?: { text?: string };
              secondaryText?: { text?: string };
            };
          };
        }[];
      };
      return (body.suggestions ?? []).flatMap((s) => {
        const p = s.placePrediction;
        if (!p?.placeId) return [];
        const primary =
          p.structuredFormat?.mainText?.text ?? p.text?.text ?? '';
        const secondary = p.structuredFormat?.secondaryText?.text ?? '';
        return [
          {
            id: p.placeId,
            primary,
            secondary,
            source: 'google' as const,
            address: null,
          },
        ];
      });
    } catch {
      return [];
    }
  }

  private async photonSuggest(
    q: string,
    regionCode: string,
    near: { lat: number; lng: number } | null,
  ): Promise<PlaceSuggestionDto[]> {
    const params = new URLSearchParams({ q, limit: '8', lang: 'en' });
    if (regionCode === 'in') params.set('bbox', INDIA_BBOX);
    if (near) {
      params.set('lat', String(near.lat));
      params.set('lon', String(near.lng));
    }
    try {
      const res = await fetch(
        `https://photon.komoot.io/api/?${params.toString()}`,
        {
          headers: { 'User-Agent': 'NationWideLogistics-AddressSearch/1.0' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) return [];
      const body = (await res.json()) as { features?: PhotonFeature[] };
      const seen = new Set<string>();
      return (body.features ?? [])
        .flatMap((f) => {
          const s = photonSuggestion(f);
          if (!s || (regionCode && s.address?.countryCode !== regionCode))
            return [];
          const key = `${s.primary}|${s.secondary}`;
          if (seen.has(key)) return [];
          seen.add(key);
          return [s];
        })
        .slice(0, 6);
    } catch {
      return [];
    }
  }
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
  };
}

export function photonSuggestion(f: PhotonFeature): PlaceSuggestionDto | null {
  const p = f.properties ?? {};
  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const primary = p.name || street || p.locality || p.district || p.city || '';
  if (!primary) return null;
  const city = p.city || p.county || p.district || '';
  const line1 = [p.name, street, p.locality || p.district]
    .filter(
      (part, i, all): part is string =>
        Boolean(part) && all.indexOf(part) === i && part !== city,
    )
    .join(', ');
  const secondaryParts = [
    p.locality,
    p.district,
    city,
    p.state,
    p.country,
  ].filter(
    (part, i, all): part is string =>
      Boolean(part) && part !== primary && all.indexOf(part) === i,
  );
  const formatted = [primary, ...secondaryParts, p.postcode]
    .filter(Boolean)
    .join(', ');
  return {
    id: `osm:${p.osm_type ?? ''}${p.osm_id ?? `${lat},${lng}`}`,
    primary,
    secondary: secondaryParts.join(', '),
    source: 'osm',
    address: {
      addressLine1: (line1 || primary).slice(0, 200),
      city,
      state: p.state ?? '',
      postalCode: (p.postcode ?? '').replace(/\s+/g, ''),
      countryCode: (p.countrycode ?? '').toLowerCase(),
      formatted,
      latitude: lat,
      longitude: lng,
    },
  };
}

/** Google's address components onto the form's fields; mirrors frontend lib/google-maps.ts. */
function parseComponents(
  components: Component[],
  formatted: string,
): Omit<PlaceAddressDto, 'latitude' | 'longitude'> {
  const get = (type: string, form: 'long' | 'short' = 'long') =>
    components.find((c) => c.types.includes(type))?.[form] ?? '';
  const street = [get('street_number'), get('route')].filter(Boolean).join(' ');
  const parts = [
    get('subpremise'),
    get('premise'),
    street,
    get('sublocality_level_2'),
    get('sublocality_level_1') || get('neighborhood'),
  ].filter((part, i, all) => part && all.indexOf(part) === i);
  const line1 =
    parts.length > 0
      ? parts.join(', ')
      : (formatted.split(',')[0]?.trim() ?? '');
  return {
    addressLine1: line1.slice(0, 200),
    city:
      get('locality') ||
      get('postal_town') ||
      get('administrative_area_level_3') ||
      get('administrative_area_level_2'),
    state: get('administrative_area_level_1'),
    postalCode: get('postal_code'),
    countryCode: get('country', 'short').toLowerCase(),
    formatted,
  };
}
