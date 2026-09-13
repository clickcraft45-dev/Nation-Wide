"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps";
import { cn } from "@/lib/utils/cn";

const INDIA = { lat: 20.5937, lng: 78.9629 };

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  /** Opened from the marker's popup. */
  href?: string;
  /** Marker fill, any CSS colour. */
  color?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Pickups as markers on a Google map, optionally with the viewer's own live position.
 *
 * The map fits every point (and the viewer) the first time they arrive, then leaves the camera
 * alone, so a background refresh never yanks the map out from under someone panning it.
 */
export function PickupsMap({
  points,
  trackMe = false,
  onMyLocation,
  className,
}: {
  points: MapPoint[];
  /** Follow the device's position with a blue dot (asks for location permission). */
  trackMe?: boolean;
  onMyLocation?: (position: LatLng) => void;
  className?: string;
}) {
  const router = useRouter();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const meRef = useRef<google.maps.Marker | null>(null);
  const myPosition = useRef<LatLng | null>(null);
  const fitted = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [locationDenied, setLocationDenied] = useState(false);
  // Refs, because the watchPosition callback is registered once and must see the latest values.
  const onMyLocationRef = useRef(onMyLocation);
  const pointsRef = useRef(points);
  useEffect(() => {
    onMyLocationRef.current = onMyLocation;
    pointsRef.current = points;
  });

  function fitAll() {
    const map = mapRef.current;
    if (!map) return;
    const all = [...pointsRef.current, ...(myPosition.current ? [myPosition.current] : [])];
    if (all.length === 0) return;
    if (all.length === 1) {
      map.setCenter(all[0]);
      map.setZoom(15);
    } else {
      const bounds = new google.maps.LatLngBounds();
      all.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 48);
    }
    // Only "done" once pickups were in frame — a fit on the viewer alone must not stop the pickups
    // that load a moment later from being fitted too.
    if (pointsRef.current.length > 0) fitted.current = true;
  }

  // Map + live location, once.
  useEffect(() => {
    let cancelled = false;
    let watchId: number | null = null;

    (async () => {
      try {
        await loadGoogleMaps();
        const { Map, InfoWindow } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;
        await google.maps.importLibrary("marker");
        if (cancelled || !mapEl.current) return;

        mapRef.current = new Map(mapEl.current, {
          center: INDIA,
          zoom: 5,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        infoRef.current = new InfoWindow();
        setStatus("ready");

        if (trackMe && "geolocation" in navigator) {
          watchId = navigator.geolocation.watchPosition(
            (pos) => {
              const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              const firstFix = myPosition.current === null;
              myPosition.current = here;
              onMyLocationRef.current?.(here);
              if (!meRef.current) {
                meRef.current = new google.maps.Marker({
                  map: mapRef.current,
                  position: here,
                  title: "You are here",
                  zIndex: 1000,
                  icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: "#2563eb",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 3,
                  },
                });
              } else {
                meRef.current.setPosition(here);
              }
              // Re-fit on the first fix so the viewer and the pickups are in one frame.
              if (firstFix) fitAll();
            },
            () => setLocationDenied(true),
            { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
          );
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      meRef.current?.setMap(null);
      meRef.current = null;
      mapRef.current = null;
    };
  }, [trackMe]);

  // Markers, whenever the points change.
  useEffect(() => {
    const map = mapRef.current;
    if (status !== "ready" || !map) return;

    pointsRef.current = points;
    markersRef.current.forEach((m) => m.setMap(null));
    // ponytail: legacy google.maps.Marker — AdvancedMarkerElement needs a Map ID from Cloud
    // Console. Switch once a Map ID is configured; Google keeps Marker working meanwhile.
    markersRef.current = points.map((point) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: point.lat, lng: point.lng },
        title: point.title,
        icon: {
          path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: point.color ?? "#dc2626",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => {
        // Built from DOM nodes, not an HTML string: titles are customer-typed names.
        const box = document.createElement("div");
        box.style.cssText = "font: 13px system-ui, sans-serif; color: #111; max-width: 220px";
        const title = document.createElement("strong");
        title.textContent = point.title;
        box.appendChild(title);
        if (point.subtitle) {
          const sub = document.createElement("div");
          sub.textContent = point.subtitle;
          sub.style.cssText = "color: #555; margin-top: 2px";
          box.appendChild(sub);
        }
        if (point.href) {
          const open = document.createElement("button");
          open.type = "button";
          open.textContent = "Open pickup →";
          open.style.cssText =
            "margin-top: 6px; color: #2563eb; font-weight: 600; background: none; border: 0; padding: 0; cursor: pointer";
          open.onclick = () => router.push(point.href!);
          box.appendChild(open);
        }
        infoRef.current?.setContent(box);
        infoRef.current?.open({ map, anchor: marker });
      });
      return marker;
    });

    if (!fitted.current) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, status]);

  return (
    <div className={cn("relative h-80 overflow-hidden rounded-2xl border border-border bg-muted", className)}>
      <div ref={mapEl} className="h-full w-full" />
      {status !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {status === "loading" ? "Loading map…" : "Couldn't load the map."}
        </div>
      )}
      {status === "ready" && (
        <button
          type="button"
          onClick={fitAll}
          aria-label="Show everything"
          className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground shadow-md"
        >
          <Crosshair className="h-5 w-5" aria-hidden />
        </button>
      )}
      {trackMe && locationDenied && (
        <p className="absolute left-3 top-3 rounded-md bg-card/95 px-2 py-1 text-xs text-muted-foreground shadow">
          Location is off — turn it on to see yourself on the map.
        </p>
      )}
    </div>
  );
}
