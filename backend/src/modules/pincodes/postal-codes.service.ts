import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PostalLookupDto, PostalPlaceDto } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { PincodesService } from './pincodes.service';

const LOOKUP_TIMEOUT_MS = 5000;
const CACHE_LIMIT = 5000;

// Letters, digits, spaces and hyphens cover every national format (SW1A 1AA, 10001-1234, 1010).
const POSTAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9 -]{1,10}[A-Z0-9]$/;
const INDIAN_PIN = /^[1-9][0-9]{5}$/;

type ProviderResult = PostalPlaceDto[] | 'unavailable';

/**
 * Our countries table keeps a few legacy or carrier-style codes in place of ISO 3166-1 (the rate
 * cards and zones were imported that way, so they stay). Postal databases only know ISO, so these
 * are translated on the way out and back. Without it, France (FX) and the United Kingdom (UK)
 * never matched a single postal code.
 */
const ISO_FOR_LEGACY_CODE: Record<string, string> = {
  FX: 'FR', // Metropolitan France
  UK: 'GB',
  DY: 'BJ', // Dahomey, now Benin
  HV: 'BF', // Upper Volta, now Burkina Faso
  YU: 'RS', // Yugoslavia, now Serbia
};

interface GeoNamesCode {
  postalCode?: string;
  placeName?: string;
  adminName1?: string;
  adminName2?: string;
  countryCode?: string;
}

interface GoogleComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleResult {
  types: string[];
  partial_match?: boolean;
  address_components: GoogleComponent[];
}

/**
 * Where a postal code is, anywhere in the world, so typing it fills in the city, the state and,
 * where nothing has fixed it yet, the country.
 *
 * Three sources, most exact first:
 *   1. India Post for an Indian PIN: the authority, and exact to the post office.
 *   2. GeoNames: a free worldwide postal-code database (about 100 countries). The only one that
 *      can say which countries a code exists in when no country is given, which is what filling
 *      in the country needs. Needs GEONAMES_USERNAME (a free account with web services enabled).
 *   3. Google Geocoding: covers what GeoNames lacks (full UK postcodes, for one). Needs
 *      GOOGLE_MAPS_SERVER_KEY (or GOOGLE_MAPS_API_KEY) with the Geocoding API enabled.
 *
 * Countries are reported by the names in our own countries table, and only countries we ship to,
 * so a result can be selected straight into the destination dropdown.
 */
@Injectable()
export class PostalCodesService {
  private readonly logger = new Logger(PostalCodesService.name);
  // Postal codes barely change; a bounded process-lifetime cache saves the third-party quota
  // (GeoNames' free tier is 1,000 lookups an hour) when the same code is typed again.
  private readonly cache = new Map<string, PostalLookupDto>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly pincodes: PincodesService,
  ) {}

  async lookup(rawCode: string, rawCountry?: string): Promise<PostalLookupDto> {
    const code = rawCode.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!POSTAL_CODE_PATTERN.test(code)) {
      throw new BadRequestException(
        'A postal code is 3 to 12 letters, digits, spaces or hyphens',
      );
    }

    const { countries, aliases } = await this.shippableCountries();
    let countryCode: string | null = null;
    if (rawCountry?.trim()) {
      countryCode = aliases.get(rawCountry.trim().toLowerCase()) ?? null;
      if (!countryCode) {
        throw new BadRequestException(`Unknown country ${rawCountry}`);
      }
    }

    const cacheKey = `${countryCode ?? '*'}|${code}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let result: PostalLookupDto;
    const here = await this.search(code, countryCode, countries);
    if (here === 'unavailable') {
      result = { status: 'UNAVAILABLE', places: [], elsewhere: [] };
    } else if (here.length > 0) {
      result = { status: 'FOUND', places: here, elsewhere: [] };
    } else {
      // Not in the chosen country: say where it IS, so a wrong country is caught, not just a
      // wrong code.
      const anywhere = countryCode
        ? await this.search(code, null, countries)
        : [];
      result = {
        status: 'NOT_FOUND',
        places: [],
        elsewhere: anywhere === 'unavailable' ? [] : anywhere,
      };
    }

    // Unavailable is not cached: the next keystroke should try again.
    if (result.status !== 'UNAVAILABLE') {
      if (this.cache.size >= CACHE_LIMIT) {
        this.cache.delete(this.cache.keys().next().value as string);
      }
      this.cache.set(cacheKey, result);
    }
    return result;
  }

  /** Every source in turn; the first that knows the code answers. */
  private async search(
    code: string,
    countryCode: string | null,
    countries: Map<string, string>,
  ): Promise<ProviderResult> {
    let anyAnswered = false;
    const found: PostalPlaceDto[] = [];
    const add = (places: PostalPlaceDto[]) => {
      for (const place of places) {
        if (!countries.has(place.countryCode)) continue; // a country we do not ship to
        if (found.some((p) => p.countryCode === place.countryCode)) continue;
        found.push({
          ...place,
          countryName: countries.get(place.countryCode)!,
        });
      }
    };

    // India Post first for a six-digit code when India is possible: it is exact.
    if ((!countryCode || countryCode === 'IN') && INDIAN_PIN.test(code)) {
      const india = await this.fromIndiaPost(code);
      if (india !== 'unavailable') {
        anyAnswered = true;
        add(india);
      }
      if (countryCode === 'IN' && found.length > 0) return found;
    }

    const geonames = await this.fromGeoNames(code, countryCode);
    if (geonames !== 'unavailable') {
      anyAnswered = true;
      add(geonames);
    }

    // Google only when GeoNames had nothing: it costs money and, without a country, returns a
    // single best guess rather than every country the code exists in.
    if (found.length === 0) {
      const google = await this.fromGoogle(code, countryCode);
      if (google !== 'unavailable') {
        anyAnswered = true;
        add(google);
      }
    }

    if (found.length > 0) return found;
    return anyAnswered ? [] : 'unavailable';
  }

  private async fromIndiaPost(code: string): Promise<ProviderResult> {
    try {
      const pin = await this.pincodes.lookup(code);
      if (!pin.valid) return [];
      return [
        {
          postalCode: code,
          countryCode: 'IN',
          countryName: 'India',
          city: pin.city,
          district: pin.district,
          state: pin.state,
        },
      ];
    } catch {
      return 'unavailable';
    }
  }

  private async fromGeoNames(
    code: string,
    countryCode: string | null,
  ): Promise<ProviderResult> {
    const username = this.config.get<string>('GEONAMES_USERNAME')?.trim();
    if (!username) return 'unavailable';
    const params = new URLSearchParams({
      postalcode: code,
      maxRows: '30',
      username,
    });
    if (countryCode) params.set('country', countryCode);
    try {
      const response = await fetch(
        `https://secure.geonames.org/postalCodeSearchJSON?${params.toString()}`,
        { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`GeoNames returned ${response.status}`);
      const body = (await response.json()) as {
        postalCodes?: GeoNamesCode[];
        status?: { message?: string };
      };
      // GeoNames reports a bad username or an exhausted quota as a 200 with a status object.
      if (body.status) throw new Error(body.status.message ?? 'GeoNames error');
      return (body.postalCodes ?? [])
        .filter((p) => p.countryCode)
        .map((p) => ({
          postalCode: p.postalCode ?? code,
          countryCode: p.countryCode!.toUpperCase(),
          countryName: '',
          city: p.placeName ?? null,
          district: p.adminName2 ?? null,
          state: p.adminName1 ?? null,
        }));
    } catch (error) {
      this.logger.warn(
        `GeoNames lookup failed for ${code}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'unavailable';
    }
  }

  private async fromGoogle(
    code: string,
    countryCode: string | null,
  ): Promise<ProviderResult> {
    const key =
      this.config.get<string>('GOOGLE_MAPS_SERVER_KEY')?.trim() ||
      this.config.get<string>('GOOGLE_MAPS_API_KEY')?.trim();
    if (!key) return 'unavailable';
    const components = [`postal_code:${code}`];
    if (countryCode) components.push(`country:${countryCode}`);
    const params = new URLSearchParams({
      components: components.join('|'),
      language: 'en',
      key,
    });
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
        { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`Google returned ${response.status}`);
      const body = (await response.json()) as {
        status: string;
        results?: GoogleResult[];
        error_message?: string;
      };
      if (body.status === 'ZERO_RESULTS') return [];
      if (body.status !== 'OK') {
        throw new Error(body.error_message ?? body.status);
      }
      return (body.results ?? [])
        .filter((r) => r.types.includes('postal_code') && !r.partial_match)
        .map((r) => {
          const part = (type: string) =>
            r.address_components.find((c) => c.types.includes(type));
          return {
            postalCode: part('postal_code')?.long_name ?? code,
            countryCode: part('country')?.short_name.toUpperCase() ?? '',
            countryName: '',
            city:
              part('locality')?.long_name ??
              part('postal_town')?.long_name ??
              part('sublocality')?.long_name ??
              null,
            district: part('administrative_area_level_2')?.long_name ?? null,
            state: part('administrative_area_level_1')?.long_name ?? null,
          };
        })
        .filter((p) => p.countryCode);
    } catch (error) {
      this.logger.warn(
        `Google postal lookup failed for ${code}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'unavailable';
    }
  }

  /**
   * The countries we ship to: ISO code to our name for it, plus every way a caller may name one
   * (our code, the ISO code or the name, any case). A region such as "Azores (Portugal)" (PT-AZORES) resolves to its
   * country's code, which is what postal databases file it under.
   */
  private async shippableCountries(): Promise<{
    countries: Map<string, string>;
    aliases: Map<string, string>;
  }> {
    const rows = await this.prisma.country.findMany({
      where: { isActive: true },
      select: { code: true, name: true },
    });
    const countries = new Map<string, string>();
    const aliases = new Map<string, string>();
    for (const row of rows) {
      const code = row.code.toUpperCase();
      const own = code.split('-')[0];
      const iso = ISO_FOR_LEGACY_CODE[own] ?? own;
      if (!code.includes('-')) countries.set(iso, row.name);
      aliases.set(code.toLowerCase(), iso);
      aliases.set(iso.toLowerCase(), iso);
      aliases.set(row.name.toLowerCase(), iso);
    }
    return { countries, aliases };
  }
}
