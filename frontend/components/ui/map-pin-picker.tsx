"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadGoogleMaps, parseAddressComponents, type PickedAddress } from "@/lib/google-maps";

const INDIA = { lat: 20.5937, lng: 78.9629 };

/**
 * Pick a location by moving the map under a fixed pin — the ride-hailing pattern. Easier to aim
 * precisely with a thumb than dragging a marker, and it needs no marker API at all.
 *
 * The address under the pin is looked up as the map settles (Geocoding API) and shown before
 * confirming, so the customer sees what the partner will see.
 */
export function MapPinPicker({
  open,
  onClose,
  onPick,
  initial,
  title = "Pick the location",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (address: PickedAddress) => void;
  /** Where to start. Without one the map starts on India and asks for the phone's location. */
  initial?: { lat: number; lng: number } | null;
  title?: string;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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

  function close() {
    setPicked(null);
    setStatus("loading");
    onClose();
  }

  useEffect(() => {
    if (!open) return;
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
          center: initial ?? INDIA,
          zoom: initial ? 17 : 5,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        mapRef.current = map;
        const geocoder = new Geocoder();

        // Looked up once the map has stopped moving, debounced, so a drag is one lookup and not
        // fifty.
        idle = map.addListener("idle", () => {
          clearTimeout(lookup);
          lookup = setTimeout(async () => {
            const center = map.getCenter();
            if (!center) return;
            try {
              const { results } = await geocoder.geocode({ location: center });
              if (cancelled) return;
              const best = results[0];
              setPicked(
                best
                  ? {
                      ...parseAddressComponents(
                        best.address_components.map((c) => ({ long: c.long_name, short: c.short_name, types: c.types })),
                        best.formatted_address,
                      ),
                      latitude: center.lat(),
                      longitude: center.lng(),
                    }
                  : null,
              );
            } catch {
              if (!cancelled) setPicked(null);
            }
          }, 400);
        });

        setStatus("ready");
        if (!initial) locate();
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
    // `initial` is read once per opening on purpose: re-centring the map every time the parent
    // re-renders would yank it out from under the customer's thumb.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-card sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-semibold text-foreground">{title}</p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="relative h-[55vh] min-h-72">
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
              {status === "loading" ? "Loading map…" : "Couldn't load the map. Type the address instead."}
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

        <div className="space-y-3 p-4">
          <p className="min-h-10 text-sm text-foreground">
            {picked?.formatted || "Move the map so the pin sits on the exact spot."}
          </p>
          <Button
            className="w-full"
            disabled={!picked}
            onClick={() => {
              if (!picked) return;
              onPick(picked);
              close();
            }}
          >
            Use this location
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
