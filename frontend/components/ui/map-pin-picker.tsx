"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { loadGoogleMaps, parseAddressComponents, type PickedAddress } from "@/lib/google-maps";
import { cn } from "@/lib/utils/cn";

const INDIA = { lat: 20.5937, lng: 78.9629 };

/**
 * An inline map for choosing a location: the map moves under a fixed pin — the ride-hailing
 * pattern, easier to aim with a thumb than dragging a marker.
 *
 * Every time the map settles, the pin's coordinates are reported straight away. The street
 * address is looked up afterwards (Geocoding API) and reported when it arrives; a failed lookup
 * never loses the coordinates — they are what the partner navigates to, the address is a
 * convenience. (It used to wait for the lookup, so a key without the Geocoding API enabled left the
 * location un-pickable.)
 */
export function MapPinField({
  value,
  onChange,
  className,
}: {
  /** The pinned spot, if any. Set from outside (a searched address), the map follows it. */
  value: { lat: number; lng: number } | null;
  onChange: (picked: PickedAddress) => void;
  className?: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [address, setAddress] = useState("");

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Follow a pin set from outside, e.g. an address picked from search. A pin the map itself just
  // reported is already its centre, so this is a no-op for the customer's own dragging.
  useEffect(() => {
    const map = mapRef.current;
    const center = map?.getCenter();
    if (!map || !center || !value) return;
    if (Math.abs(center.lat() - value.lat) > 1e-5 || Math.abs(center.lng() - value.lng) > 1e-5) {
      map.setCenter(value);
      map.setZoom(17);
    }
  }, [value, status]);

  function locate() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
        mapRef.current?.setZoom(17);
      },
      // Refused or unavailable: they can still move the map by hand.
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  useEffect(() => {
    let cancelled = false;
    let idle: google.maps.MapsEventListener | null = null;
    let lookup: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        await loadGoogleMaps();
        const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;
        const { Geocoder } = (await google.maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary;
        if (cancelled || !mapEl.current) return;

        const map = new Map(mapEl.current, {
          center: value ?? INDIA,
          zoom: value ? 17 : 5,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        mapRef.current = map;
        const geocoder = new Geocoder();
        let first = true;

        // Debounced, so a drag is one report and one lookup, not fifty.
        idle = map.addListener("idle", () => {
          // The very first idle is the starting view — the middle of India when nothing is pinned
          // yet, which is not a location anybody chose.
          if (first) {
            first = false;
            if (!value) return;
          }
          clearTimeout(lookup);
          lookup = setTimeout(async () => {
            const center = map.getCenter();
            if (!center) return;
            const coords = { latitude: center.lat(), longitude: center.lng() };
            const blank = { addressLine1: "", city: "", state: "", postalCode: "", countryCode: "", formatted: "" };
            onChangeRef.current({ ...blank, ...coords });
            setAddress("");
            try {
              const { results } = await geocoder.geocode({ location: center });
              const best = results[0];
              if (cancelled || !best) return;
              const parsed = parseAddressComponents(
                best.address_components.map((c) => ({ long: c.long_name, short: c.short_name, types: c.types })),
                best.formatted_address,
              );
              setAddress(parsed.formatted);
              onChangeRef.current({ ...parsed, ...coords });
            } catch {
              // No address for this spot (or Geocoding not enabled) — the coordinates above stand.
            }
          }, 400);
        });

        setStatus("ready");
        if (!value) locate();
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(lookup);
      idle?.remove();
      mapRef.current = null;
    };
    // Mount-only: `value` is followed by the effect above instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className={cn("relative h-72 overflow-hidden rounded-2xl border border-border bg-muted", className)}>
        <div ref={mapEl} className="h-full w-full" />
        {/* The pin stays put; the map moves under it. Its tip marks the exact spot. */}
        <MapPin
          className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-full text-brand-red drop-shadow-md"
          fill="currentColor"
          stroke="white"
          aria-hidden
        />
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 p-6 text-center text-sm text-muted-foreground">
            {status === "loading" ? "Loading map…" : "Couldn't load the map. Type the address below instead."}
          </div>
        )}
        <button
          type="button"
          onClick={locate}
          aria-label="Use my current location"
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-md"
        >
          <Crosshair className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <p className="text-sm text-foreground">
        {value
          ? address || `Pinned at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
          : "Move the map so the pin sits exactly on your pickup spot."}
      </p>
    </div>
  );
}
