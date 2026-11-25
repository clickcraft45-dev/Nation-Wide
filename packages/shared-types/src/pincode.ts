/**
 * Result of verifying an Indian PIN code. `valid: false` means the code is well-formed but no
 * post office answers to it; a malformed code is rejected as a 400 before this DTO is ever built.
 */
export interface PincodeLookupDto {
  pincode: string;
  valid: boolean;
  /** Post-office town/locality — the best "city" answer India Post gives for the code. */
  city: string | null;
  district: string | null;
  state: string | null;
  /** Every post office sharing the code, first one first. Empty when `valid` is false. */
  postOffices: string[];
}

/** One place a postal code belongs to. */
export interface PostalPlaceDto {
  postalCode: string;
  /** ISO 3166-1 alpha-2, e.g. "US". */
  countryCode: string;
  /** As in the countries list (GET /countries), so it can be selected directly. */
  countryName: string;
  city: string | null;
  district: string | null;
  state: string | null;
}

/**
 * A postal code looked up worldwide. FOUND: `places` holds where it is, one per country (several
 * when the same code exists in more than one). NOT_FOUND: no such code (in that country, when one
 * was given); `elsewhere` then lists the countries where it does exist. UNAVAILABLE: no lookup
 * service could be reached, so nothing is known either way.
 */
export interface PostalLookupDto {
  status: "FOUND" | "NOT_FOUND" | "UNAVAILABLE";
  places: PostalPlaceDto[];
  elsewhere: PostalPlaceDto[];
}

/** An address resolved to a point: what a picked place search suggestion fills in. */
export interface PlaceAddressDto {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, lowercase: "in". */
  countryCode: string;
  formatted: string;
  latitude: number | null;
  longitude: number | null;
}

/**
 * One place search suggestion from GET /places/suggest. Google suggestions carry only an id
 * (their address comes from GET /places/:id when picked); OpenStreetMap ones carry the address.
 */
export interface PlaceSuggestionDto {
  id: string;
  /** The place's name or first line. */
  primary: string;
  /** The rest: locality, city, state. */
  secondary: string;
  source: "google" | "osm";
  address: PlaceAddressDto | null;
}
