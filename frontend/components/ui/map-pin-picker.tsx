"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Crosshair, DoorOpen, Layers, MapPin, Move } from "lucide-react";
import type { PickupSpotDto, PickupSpotsDto } from "@nationwide/shared-types";
import {
  distanceKm,
  googleMapsEnabled,
  loadGoogleMaps,
  parseAddressComponents,
  type PickedAddress,
} from "@/lib/google-maps";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { cn } from "@/lib/utils/cn";

const INDIA = { lat: 20.5937, lng: 78.9629 };
/** Close enough to the building that the whole footprint and its gates fit on screen. */
const BUILDING_ZOOM = 19;
/** A spot this close to the pin counts as the one picked. */
const SAME_SPOT_KM = 0.004;
/** Snap a pasted pin to the building's main gate only when the gate is this close: same building. */
const SNAP_WITHIN_KM = 0.15;

const INK = "#0b0b0c";

type LatLng = { lat: number; lng: number };

const near = (a: LatLng, b: LatLng, km: number) => distanceKm(a, b) <= km;

/**
 * The pickup pin on a map.
 *
 * The map is locked while it shows a pin, so scrolling the page past it never moves the pin by
 * accident. "Adjust pin" unlocks it: the map then moves under a fixed pin (the ride-hailing
 * pattern) until "Done".
 *
 * With `fetchSpots`, the building under the pin is outlined and its entrances and stopping points
 * become markers to tap, as in a ride-hailing app. A pin set from outside (a pasted Maps link, a
 * search) snaps to the building's main entrance, since a shared link usually points at the middle
 * of the roof and the partner needs the gate.
 *
 * Coordinates are reported straight away; the street address follows when the reverse lookup
 * returns, and a failed lookup never loses the coordinates.
 */
export function MapPinField({
  value,
  onChange,
  fetchSpots,
  className,
}: {
  /** The pinned spot, if any. Set from outside (a link, a search), the map follows it. */
  value: LatLng | null;
  onChange: (picked: PickedAddress) => void;
  /** The building and its entrances at a point. Omitted: a plain pin. */
  fetchSpots?: (at: LatLng) => Promise<PickupSpotsDto>;
  className?: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const overlaysRef = useRef<(google.maps.Marker | google.maps.Polygon)[]>([]);
  const onChangeRef = useRef(onChange);
  const fetchSpotsRef = useRef(fetchSpots);
  // The last spot this component reported itself, to tell its own echo from a pin set outside.
  const reportedRef = useRef<LatLng | null>(value);
  const editingRef = useRef(false);
  const lookupSeq = useRef(0);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [address, setAddress] = useState("");
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [spots, setSpots] = useState<PickupSpotsDto | null>(null);
  const [spotsLoading, setSpotsLoading] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    fetchSpotsRef.current = fetchSpots;
  });

  /** Report a spot: coordinates now, the street address when the lookup answers. */
  const reportAt = useCallback(async (at: LatLng) => {
    reportedRef.current = at;
    const coords = { latitude: at.lat, longitude: at.lng };
    const blank = { addressLine1: "", city: "", state: "", postalCode: "", countryCode: "", formatted: "" };
    onChangeRef.current({ ...blank, ...coords });
    setAddress("");
    const geocoder = geocoderRef.current;
    if (!geocoder) return;
    const seq = ++lookupSeq.current;
    try {
      const { results } = await geocoder.geocode({ location: at });
      const best = results[0];
      if (!best || seq !== lookupSeq.current) return;
      const parsed = parseAddressComponents(
        best.address_components.map((c) => ({ long: c.long_name, short: c.short_name, types: c.types })),
        best.formatted_address,
      );
      setAddress(parsed.formatted);
      onChangeRef.current({ ...parsed, ...coords });
    } catch {
      // No address for this spot (or Geocoding not enabled): the coordinates above stand.
    }
  }, []);

  /** Put the pin on a spot without unlocking the map. */
  const pinAt = useCallback(
    (at: LatLng) => {
      mapRef.current?.panTo(at);
      void reportAt(at);
    },
    [reportAt],
  );

  /** Look up the building at a point; optionally move the pin to its main entrance. */
  const loadSpots = useCallback(
    async (at: LatLng, snap: boolean) => {
      const fetcher = fetchSpotsRef.current;
      if (!fetcher) return;
      setSpotsLoading(true);
      try {
        const found = await fetcher(at);
        // A newer pin was set while this one was being looked up.
        if (reportedRef.current && !near(reportedRef.current, at, SAME_SPOT_KM)) return;
        setSpots(found);
        const gate = found.spots.find((s) => s.kind === "ENTRANCE");
        const onASpot = found.spots.some((s) => near(at, spotLatLng(s), SAME_SPOT_KM));
        if (snap && gate && !onASpot && near(at, spotLatLng(gate), SNAP_WITHIN_KM)) {
          pinAt(spotLatLng(gate));
        }
      } catch {
        setSpots(null);
      } finally {
        setSpotsLoading(false);
      }
    },
    [pinAt],
  );

  function startEditing() {
    const map = mapRef.current;
    editingRef.current = true;
    setEditing(true);
    map?.setOptions({ gestureHandling: "greedy", zoomControl: true, keyboardShortcuts: true });
    // Already looking at a street (their location, or a pin): that view is a pin they can accept.
    const center = map?.getCenter();
    if (!value && center && (map?.getZoom() ?? 0) >= 15) {
      void reportAt({ lat: center.lat(), lng: center.lng() });
    }
  }

  function finishEditing() {
    const map = mapRef.current;
    editingRef.current = false;
    setEditing(false);
    map?.setOptions({ gestureHandling: "none", zoomControl: false, keyboardShortcuts: false });
    const center = map?.getCenter();
    // Aimed by hand: show the building's gates, but leave the pin where they put it.
    if (center) void loadSpots({ lat: center.lat(), lng: center.lng() }, false);
  }

  function locate() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.setCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
        mapRef.current?.setZoom(BUILDING_ZOOM);
      },
      // Refused or unavailable: they can still move the map by hand.
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  /**
   * Move the map to whatever was typed. Needs only Geocoding, so Enter works even where the
   * suggestion dropdown (Places API) never appears.
   */
  async function searchFor(text: string) {
    const query = text.trim();
    const geocoder = geocoderRef.current;
    if (!query || !geocoder) return;
    setSearchError(null);
    try {
      const { results } = await geocoder.geocode({ address: query, componentRestrictions: { country: "in" } });
      const best = results[0];
      if (!best) {
        setSearchError("No place found for that search. Try a nearby landmark.");
        return;
      }
      const location = best.geometry.location;
      const parsed = parseAddressComponents(
        best.address_components.map((c) => ({ long: c.long_name, short: c.short_name, types: c.types })),
        best.formatted_address,
      );
      onChange({ ...parsed, latitude: location.lat(), longitude: location.lng() });
    } catch {
      setSearchError("Couldn't search just now. Adjust the pin by hand instead.");
    }
  }

  // Follow a pin set from outside: centre on it, lock the map, and find the building's gates.
  // The component's own reports are recognised and skipped.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value || status !== "ready") return;
    if (reportedRef.current && near(reportedRef.current, value, SAME_SPOT_KM / 4)) return;
    reportedRef.current = value;
    map.setCenter(value);
    map.setZoom(BUILDING_ZOOM);
    if (editingRef.current) {
      editingRef.current = false;
      setEditing(false);
      map.setOptions({ gestureHandling: "none", zoomControl: false, keyboardShortcuts: false });
    }
    setSpots(null);
    void loadSpots(value, true);
  }, [value, status, loadSpots]);

  // Draw the building outline and the tappable entrances.
  useEffect(() => {
    const map = mapRef.current;
    for (const overlay of overlaysRef.current) overlay.setMap(null);
    overlaysRef.current = [];
    if (!map || !spots) return;
    if (spots.outline) {
      overlaysRef.current.push(
        new google.maps.Polygon({
          map,
          paths: spots.outline.map((p) => ({ lat: p.latitude, lng: p.longitude })),
          strokeColor: INK,
          strokeOpacity: 0.7,
          strokeWeight: 2,
          fillColor: INK,
          fillOpacity: 0.08,
          clickable: false,
        }),
      );
    }
    for (const spot of spots.spots) {
      // ponytail: legacy google.maps.Marker, like pickups-map.tsx. AdvancedMarkerElement needs a
      // Map ID from Cloud Console.
      const marker = new google.maps.Marker({
        map,
        position: spotLatLng(spot),
        title: spot.label,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: spot.kind === "ENTRANCE" ? 8 : 6,
          fillColor: spot.kind === "ENTRANCE" ? INK : "#ffffff",
          fillOpacity: 1,
          strokeColor: spot.kind === "ENTRANCE" ? "#ffffff" : INK,
          strokeWeight: 2.5,
        },
        zIndex: spot.preferred ? 3 : 2,
      });
      marker.addListener("click", () => pinAt(spotLatLng(spot)));
      overlaysRef.current.push(marker);
    }
  }, [spots, pinAt]);

  useEffect(() => {
    mapRef.current?.setMapTypeId(satellite ? "hybrid" : "roadmap");
  }, [satellite]);

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
          zoom: value ? BUILDING_ZOOM : 5,
          disableDefaultUI: true,
          // Locked until "Adjust pin": the page scrolls past it without moving the pin.
          gestureHandling: "none",
          zoomControl: false,
          keyboardShortcuts: false,
          clickableIcons: false,
          tilt: 0,
        });
        mapRef.current = map;
        geocoderRef.current = new Geocoder();
        editingRef.current = false;

        // Only while adjusting: the pin follows the map. Debounced, so a drag is one report.
        idle = map.addListener("idle", () => {
          if (!editingRef.current) return;
          clearTimeout(lookup);
          lookup = setTimeout(() => {
            const center = map.getCenter();
            if (center) void reportAt({ lat: center.lat(), lng: center.lng() });
          }, 400);
        });

        setStatus("ready");
        if (value) void loadSpots(value, false);
        else locate();
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(lookup);
      idle?.remove();
      for (const overlay of overlaysRef.current) overlay.setMap(null);
      overlaysRef.current = [];
      mapRef.current = null;
    };
    // Mount-only: `value` is followed by the effect above instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeSpot = value ? spots?.spots.find((s) => near(value, spotLatLng(s), SAME_SPOT_KM)) : undefined;

  return (
    <div className="space-y-2">
      {googleMapsEnabled() && (
        <div className="space-y-1">
          <AddressAutocomplete
            value={search}
            onChange={(next) => {
              setSearch(next);
              setSearchError(null);
            }}
            onSelect={(picked) => {
              setSearch(picked.formatted || picked.addressLine1);
              setSearchError(null);
              // The map follows `value` once the parent stores it, and snaps to the gate.
              onChange(picked);
            }}
            onEnter={(text) => void searchFor(text)}
            regionCodes={["in"]}
            placeholder="Search a place or landmark, then press Enter"
            aria-label="Search for a location"
          />
          {searchError && <p className="text-xs text-danger">{searchError}</p>}
        </div>
      )}

      <div
        className={cn(
          "relative h-80 overflow-hidden rounded-2xl border bg-muted transition-colors",
          editing ? "border-foreground" : "border-border",
          className,
        )}
      >
        <div ref={mapEl} className="h-full w-full" />
        {/* The pin stays put; the map moves under it. Its tip marks the exact spot. */}
        {(value || editing) && (
          <MapPin
            className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-full text-brand-red drop-shadow-md"
            fill="currentColor"
            stroke="white"
            aria-hidden
          />
        )}

        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 p-6 text-center text-sm text-muted-foreground">
            {status === "loading" ? "Loading map…" : "Couldn't load the map. Type the address below instead."}
          </div>
        )}

        {status === "ready" && (
          <>
            <MapButton
              onClick={() => setSatellite((s) => !s)}
              className="right-3 top-3"
              aria-pressed={satellite}
            >
              <Layers className="h-4 w-4" aria-hidden /> {satellite ? "Map" : "Satellite"}
            </MapButton>

            {editing ? (
              <>
                <MapButton onClick={locate} className="bottom-3 right-3 w-11 px-0" aria-label="Use my current location">
                  <Crosshair className="h-5 w-5" aria-hidden />
                </MapButton>
                {value && (
                  <MapButton onClick={finishEditing} className="bottom-3 left-3" variant="ink">
                    <Check className="h-4 w-4" aria-hidden /> Done
                  </MapButton>
                )}
              </>
            ) : (
              <MapButton onClick={startEditing} className="bottom-3 left-3">
                <Move className="h-4 w-4" aria-hidden /> {value ? "Adjust pin" : "Set pin on map"}
              </MapButton>
            )}
          </>
        )}
      </div>

      {spots && spots.spots.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {spots.buildingName ? `Ways into ${spots.buildingName}` : "Ways into this building"}: tap one to
            pin it
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Entrances and stopping points">
            {spots.spots.map((spot) => {
              const active = spot === activeSpot;
              return (
                <button
                  key={`${spot.latitude},${spot.longitude}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pinAt(spotLatLng(spot))}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:border-foreground/40",
                  )}
                >
                  {spot.kind === "ENTRANCE" ? (
                    <DoorOpen className="h-4 w-4" aria-hidden />
                  ) : (
                    <MapPin className="h-4 w-4" aria-hidden />
                  )}
                  {spot.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-sm text-foreground" aria-live="polite">
        {spotsLoading
          ? "Finding the building's entrances…"
          : editing
            ? "Move the map so the pin sits on the gate, then press Done."
            : value
              ? address || `Pinned at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
              : "Paste a Google Maps link, search a place, or set the pin on the map."}
      </p>
    </div>
  );
}

const spotLatLng = (s: PickupSpotDto): LatLng => ({ lat: s.latitude, lng: s.longitude });

function MapButton({
  className,
  variant = "card",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "card" | "ink" }) {
  return (
    <button
      type="button"
      className={cn(
        "absolute inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-md transition-[transform,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:opacity-50",
        variant === "ink" ? "bg-foreground text-background hover:opacity-90" : "bg-card text-foreground hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
