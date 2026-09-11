/**
 * Google Maps for the address forms: loading the JavaScript API once, and turning Google's address
 * components into this app's address fields.
 *
 * The key is a browser key, public by design (it ships in every page). What protects it is the
 * website restriction on the key in Google Cloud, not secrecy.
 */
const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export function googleMapsEnabled(): boolean {
  return KEY.length > 0;
}

declare global {
  interface Window {
    __nwGoogleMapsReady?: () => void;
  }
}

let loading: Promise<void> | null = null;

/**
 * Loads the Maps JavaScript API on first use, never at page load: most pages never show a map,
 * and the script is heavy. Every later caller gets the same promise.
 */
export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Maps needs a browser"));
  // typeof, not a truthiness test: the Maps types declare `google` as always present, but at
  // runtime it only exists once the script has loaded.
  if (typeof window.google !== "undefined" && typeof window.google.maps?.importLibrary === "function") {
    return Promise.resolve();
  }
  if (!googleMapsEnabled()) return Promise.reject(new Error("Google Maps is not configured"));

  loading ??= new Promise<void>((resolve, reject) => {
    window.__nwGoogleMapsReady = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&libraries=places&callback=__nwGoogleMapsReady`;
    script.async = true;
    script.onerror = () => {
      // Forget the failure so the next attempt retries instead of inheriting a rejected promise.
      loading = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** One address component, normalised: Places (New) says longText, the Geocoder long_name. */
export interface AddressComponent {
  long: string;
  short: string;
  types: string[];
}

export interface ParsedAddress {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, lowercase — "in". */
  countryCode: string;
  formatted: string;
}

export interface PickedAddress extends ParsedAddress {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Maps Google's components onto the form's fields.
 *
 * Line 1 is built from the street-level parts, most specific first. Indian addresses often have
 * no street number or route at all — the building and the locality are the address — so the
 * premise and sublocalities count as street-level here. When Google knows a place only by its
 * town, the formatted address's first segment is the best line 1 there is.
 */
export function parseAddressComponents(components: AddressComponent[], formatted = ""): ParsedAddress {
  const get = (type: string, form: "long" | "short" = "long") =>
    components.find((c) => c.types.includes(type))?.[form] ?? "";

  const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
  const parts = [
    get("subpremise"),
    get("premise"),
    street,
    get("sublocality_level_2"),
    get("sublocality_level_1") || get("neighborhood"),
  ].filter((part, i, all) => part && all.indexOf(part) === i);

  const line1 = parts.length > 0 ? parts.join(", ") : (formatted.split(",")[0]?.trim() ?? "");

  return {
    addressLine1: line1.slice(0, 200),
    city:
      get("locality") ||
      get("postal_town") ||
      get("administrative_area_level_3") ||
      get("administrative_area_level_2"),
    state: get("administrative_area_level_1"),
    postalCode: get("postal_code"),
    countryCode: get("country", "short").toLowerCase(),
    formatted,
  };
}
