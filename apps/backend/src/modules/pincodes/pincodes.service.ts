import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PincodeLookupDto } from '@nationwide/shared-types';

// India Post's public PIN directory. Keyless, no quota published, and the only authoritative
// source for "does this PIN exist and where is it" — the alternative is shipping a ~155k-row
// dataset we would then have to keep current ourselves.
const POSTAL_API = 'https://api.postalpincode.in/pincode';
const LOOKUP_TIMEOUT_MS = 4000;

// 6 digits, first never 0 — India Post never allocated a leading-zero circle.
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

interface PostOfficeRecord {
  Name?: string;
  District?: string;
  State?: string;
  Block?: string;
}

interface PostalApiResponse {
  Status?: string;
  PostOffice?: PostOfficeRecord[] | null;
}

@Injectable()
export class PincodesService {
  private readonly logger = new Logger(PincodesService.name);

  // PIN allocations effectively never change, so a process-lifetime cache is enough — no Redis
  // round-trip, no invalidation story to get wrong. Negative results are cached too: a typo'd
  // code retyped in the same session shouldn't hit India Post again.
  private readonly cache = new Map<string, PincodeLookupDto>();

  async lookup(pincode: string): Promise<PincodeLookupDto> {
    const code = pincode.trim();
    if (!PINCODE_PATTERN.test(code)) {
      throw new BadRequestException(
        'A PIN code is six digits and cannot start with 0',
      );
    }

    const cached = this.cache.get(code);
    if (cached) return cached;

    const result = await this.fetchFromIndiaPost(code);
    this.cache.set(code, result);
    return result;
  }

  private async fetchFromIndiaPost(code: string): Promise<PincodeLookupDto> {
    let payload: PostalApiResponse[];
    try {
      const response = await fetch(`${POSTAL_API}/${code}`, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`India Post returned ${response.status}`);
      }
      payload = (await response.json()) as PostalApiResponse[];
    } catch (error) {
      // Verification is a convenience, never a gate: the caller shows "couldn't verify" and the
      // customer still submits. Surfacing 503 (rather than a fake "invalid") is what lets the
      // frontend tell those two cases apart.
      this.logger.warn(
        `PIN lookup failed for ${code}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'PIN code verification is unavailable right now',
      );
    }

    const offices = payload[0]?.PostOffice ?? [];
    if (payload[0]?.Status !== 'Success' || offices.length === 0) {
      return {
        pincode: code,
        valid: false,
        city: null,
        district: null,
        state: null,
        postOffices: [],
      };
    }

    const first = offices[0];
    return {
      pincode: code,
      valid: true,
      // Block is the town for rural codes and repeats the office name for urban ones — either
      // way it is the closer match to what someone would write on the "City" line.
      city: first.Block ?? first.Name ?? null,
      district: first.District ?? null,
      state: first.State ?? null,
      postOffices: offices
        .map((o) => o.Name)
        .filter((n): n is string => Boolean(n)),
    };
  }
}
