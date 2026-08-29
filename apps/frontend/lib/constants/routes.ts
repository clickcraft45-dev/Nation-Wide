import type { MapRoute } from "@/components/ui/world-map";

// Lanes drawn on the dotted world map — the Delhi hub out to the corridors the network quotes on,
// plus the onward legs. Decorative: nothing but the map reads these, and the map is aria-hidden.
// Shared by the About panel and the footer so the two never drift apart.
export const SHIPPING_ROUTES: MapRoute[] = [
  { start: { lat: 28.6139, lng: 77.209 }, end: { lat: 25.2048, lng: 55.2708 } }, // Delhi → Dubai
  { start: { lat: 28.6139, lng: 77.209 }, end: { lat: 51.5074, lng: -0.1278 } }, // Delhi → London
  { start: { lat: 28.6139, lng: 77.209 }, end: { lat: 1.3521, lng: 103.8198 } }, // Delhi → Singapore
  { start: { lat: 51.5074, lng: -0.1278 }, end: { lat: 40.7128, lng: -74.006 } }, // London → New York
  { start: { lat: 1.3521, lng: 103.8198 }, end: { lat: -33.8688, lng: 151.2093 } }, // Singapore → Sydney
  { start: { lat: 25.2048, lng: 55.2708 }, end: { lat: -1.2921, lng: 36.8219 } }, // Dubai → Nairobi
];
