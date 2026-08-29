// Regenerates public/assets/images/world-map-dotted.svg — the dotted world map behind the
// footer wordmark. Run with: node scripts/generate-dotted-map.mjs
//
// Generated at build time on purpose: dotted-map pulls in world geojson + turf + proj4 (~750KB)
// and none of it is needed at runtime for a background that never changes, so it stays a
// devDependency and the browser only ever downloads the finished SVG.
//
// The equirectangular projection is required — components/ui/world-map.tsx places its arc
// endpoints with plain linear lat/lng math, so any other projection would misplace them.
import { writeFileSync } from "node:fs";
import DottedMap from "dotted-map";

const map = new DottedMap({
  height: 100,
  grid: "diagonal",
  projection: { name: "equirectangular" },
});

// The four numbers world-map.tsx projects against. dotted-map derives the viewBox from the
// landmass extents, so a settings change can silently shift them and slide every arc off the
// coastline it points at — fail loudly here instead, and copy the printed values across.
const EXPECTED = { viewBox: "0 0 265 100", lngMin: -168, lngSpan: 336, latMax: 71, latSpan: 127 };
const METRES_PER_DEGREE = 111319.49079327358;
const actual = {
  viewBox: `0 0 ${map.width} ${map.height}`,
  lngMin: Math.round(map.X_MIN / METRES_PER_DEGREE),
  lngSpan: Math.round(map.X_RANGE / METRES_PER_DEGREE),
  latMax: Math.round(map.Y_MAX / METRES_PER_DEGREE),
  latSpan: Math.round(map.Y_RANGE / METRES_PER_DEGREE),
};
for (const [key, want] of Object.entries(EXPECTED)) {
  if (actual[key] !== want) {
    throw new Error(
      `Map bounds changed (${key}: ${want} -> ${actual[key]}). Update EXPECTED here and the ` +
        `matching constants in components/ui/world-map.tsx, then re-run.\n${JSON.stringify(actual)}`,
    );
  }
}

writeFileSync(
  new URL("../public/assets/images/world-map-dotted.svg", import.meta.url),
  map.getSVG({ radius: 0.22, color: "#FFFFFF", shape: "circle" }),
);
console.log(`Wrote world-map-dotted.svg (${actual.viewBox})`);
