"use client";

import { useEffect, useRef } from "react";
import { isLandAt } from "@/components/marketing/land-mask";

// The hero planet: a dotted world map in black glass, with freight lanes drawing themselves out of
// India to the hubs NationWide ships to. Drag to turn it; hover a hub to name it.
//
// Deliberately plain 2D canvas rather than three.js/WebGL: this is an orthographic projection of
// points on a sphere, which is a dot product and a divide. A 3D engine (and ~150KB of JS on the
// landing page's critical path) would buy nothing here.

type Vec = { x: number; y: number; z: number };

// Sampled over the whole sphere; only land is kept (~15k dots). Dense because the hero draws the
// sphere about a screen wide: at 15k samples the dots sat ~14px apart and the continents read as
// scatter rather than coastline.
const DOT_COUNT = 42000;
const TILT = -0.42; // radians; puts India (about 20°N) in the upper cap the hero shows
const HOME_LON = 78.5; // the globe faces Hyderabad at rest
const SWAY = 0.35; // radians either side of home; it never turns India out of view on its own
const SWAY_SPEED = 0.12; // radians of phase per second, so one sway takes about 50s
const DRAG_FRICTION = 0.94; // per-frame decay of a flick's momentum
const DRAG_RETURN = 0.992; // per-frame pull back to home once a drag has stopped
const HIT_RADIUS = 16; // px around a hub that counts as a hover
const LANE_PERIOD = 8; // seconds for one lane to draw, arrive and fade

const LIGHT = "228, 228, 231";

// Hyderabad is home: the warehouse every pickup goes back to. The rest are where the lanes land.
const ORIGIN = { name: "Hyderabad", lat: 17.4, lon: 78.5 };
const HUBS = [
  { name: "Dubai", lat: 25.2, lon: 55.3 },
  { name: "London", lat: 51.5, lon: -0.1 },
  { name: "Frankfurt", lat: 50.1, lon: 8.7 },
  { name: "New York", lat: 40.7, lon: -74.0 },
  { name: "Toronto", lat: 43.7, lon: -79.4 },
  { name: "Singapore", lat: 1.35, lon: 103.8 },
  { name: "Hong Kong", lat: 22.3, lon: 114.2 },
  { name: "Sydney", lat: -33.9, lon: 151.2 },
];

/** Whether a point is on land. Exported for the unit test. */
export function isLand(lat: number, lon: number): boolean {
  return isLandAt(lat, lon);
}

function fromLatLon(lat: number, lon: number): Vec {
  const a = (lat * Math.PI) / 180;
  const b = (lon * Math.PI) / 180;
  return { x: Math.cos(a) * Math.cos(b), y: Math.sin(a), z: Math.cos(a) * Math.sin(b) };
}

/**
 * Point at `f` (0..1) along the great circle from `a` to `b`, lifted by `altitude` at the midpoint.
 * Exported for the unit test: the endpoints and the apex are the only things worth pinning down.
 */
export function arcPoint(a: Vec, b: Vec, f: number, altitude: number): Vec {
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  const sin = Math.sin(omega);
  // Antipodal or identical points have no unique great circle, so fall back to a linear blend.
  const [wa, wb] =
    sin < 1e-6 ? [1 - f, f] : [Math.sin((1 - f) * omega) / sin, Math.sin(f * omega) / sin];
  const lift = 1 + altitude * Math.sin(Math.PI * f);
  return {
    x: (a.x * wa + b.x * wb) * lift,
    y: (a.y * wa + b.y * wb) * lift,
    z: (a.z * wa + b.z * wb) * lift,
  };
}

// Evenly-spaced points on a sphere. The golden-angle spiral gives a uniform scatter with no polar
// clumping, which is what makes the dot field read as a surface rather than a wireframe.
function fibonacciSphere(count: number): Vec[] {
  const points: Vec[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
  }
  return points;
}

function spin(p: Vec, angle: number): Vec {
  // Rotate about the globe's axis, then tilt that axis.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = p.x * cos + p.z * sin;
  const z = -p.x * sin + p.z * cos;
  const ct = Math.cos(TILT);
  const st = Math.sin(TILT);
  return { x, y: p.y * ct - z * st, z: p.y * st + z * ct };
}

const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

export function HeroGlobe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Ocean points are dropped, so the dot field reads as a world map rather than a bare sphere.
    const dots = fibonacciSphere(DOT_COUNT).filter((p) =>
      isLand((Math.asin(p.y) * 180) / Math.PI, (Math.atan2(p.z, p.x) * 180) / Math.PI),
    );
    const origin = fromLatLon(ORIGIN.lat, ORIGIN.lon);
    const hubs = HUBS.map((h) => fromLatLon(h.lat, h.lon));
    // Longer lanes climb higher, so a short hop to Dubai stays low and London clears the curve.
    const altitudes = hubs.map((h) => {
      const dot = Math.min(1, Math.max(-1, origin.x * h.x + origin.y * h.y + origin.z * h.z));
      return 0.06 + 0.2 * (Math.acos(dot) / Math.PI);
    });
    // In spin(), a point at longitude L faces the viewer when angle = L - 90°.
    const home = ((HOME_LON - 90) * Math.PI) / 180;
    const reduced = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

    let width = 0;
    let height = 0;
    let frameId = 0;
    let running = false;
    const started = performance.now();

    // A drag adds to the sway; releasing mid-drag keeps the momentum and lets friction bleed it
    // off, then the globe drifts back so India is in view again.
    let dragAngle = 0;
    let dragVelocity = 0;
    let dragging = false;
    let lastPointerX = 0;
    let pointer: { x: number; y: number } | null = null;
    let hovered: number | null = null;

    const draw = (t: number) => {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.4;

      if (!dragging) {
        if (dragVelocity !== 0) {
          dragAngle += dragVelocity;
          dragVelocity *= DRAG_FRICTION;
          if (Math.abs(dragVelocity) < 0.00005) dragVelocity = 0;
        } else if (!reduced) {
          dragAngle *= DRAG_RETURN;
        }
      }

      const angle = home + (reduced ? 0 : SWAY * Math.sin(t * SWAY_SPEED)) + dragAngle;
      // x is negated: with the viewer on +z, fromLatLon's longitude runs east to the left, which
      // drew the world mirrored (India to the right of Australia). Flipping it on screen puts east
      // on the right without touching the sphere maths the arcs and tests rely on.
      const project = (p: Vec) => {
        const s = spin(p, angle);
        return { sx: cx - s.x * radius, sy: cy - s.y * radius, z: s.z };
      };

      ctx.clearRect(0, 0, width, height);

      // Contact shadow: the page behind is white, so the planet needs a soft dark bleed off the
      // limb to sit on it rather than look cut out of it.
      const shadow = ctx.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius * 1.12);
      shadow.addColorStop(0, "rgba(9, 9, 11, 0.26)");
      shadow.addColorStop(1, "rgba(9, 9, 11, 0)");
      ctx.fillStyle = shadow;
      ctx.fillRect(0, 0, width, height);

      // The body: black glass, opaque, so the far side of the map is hidden behind a horizon.
      const body = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.5,
        radius * 0.05,
        cx,
        cy,
        radius,
      );
      body.addColorStop(0, "#26262e");
      body.addColorStop(0.55, "#111115");
      body.addColorStop(1, "#050506");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // The map. Dot size follows the globe's size so the pitch reads the same on a phone and a
      // wide screen; depth drives brightness, which is the whole 3D read.
      // ponytail: squares, not arcs. At 1-3px a rect and a circle are the same pixels, and
      // fillRect is several times cheaper across ~7k visible dots a frame.
      const unit = Math.max(1, radius / 360);
      for (const dot of dots) {
        const { sx, sy, z } = project(dot);
        if (z <= 0) continue;
        const size = unit * (0.9 + z * 0.7);
        ctx.fillStyle = `rgba(244, 244, 245, ${0.28 + z * 0.6})`;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }

      // Glass sheen: a light wash across the upper third, clipped to the sphere.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      const sheen = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius * 0.1);
      sheen.addColorStop(0, "rgba(255, 255, 255, 0.14)");
      sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.restore();

      // Lanes. Each one in turn draws out from Hyderabad, its hub pings on arrival, then it fades,
      // staggered so one or two are always in flight. Reduced motion gets every lane drawn, still.
      ctx.lineCap = "round";
      hubs.forEach((hub, i) => {
        const altitude = altitudes[i];
        const u = reduced ? 1 : (((t + (i * LANE_PERIOD) / hubs.length) % LANE_PERIOD) / LANE_PERIOD);
        const reach = reduced ? 1 : easeOut(Math.min(1, u / 0.45));
        const fade = reduced ? 0.55 : u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.45);
        if (fade <= 0) return;

        const steps = 48;
        let previous: { sx: number; sy: number; z: number } | null = null;
        for (let s = 0; s <= steps; s++) {
          const f = (s / steps) * reach;
          const point = project(arcPoint(origin, hub, f, altitude));
          if (previous && (previous.z > 0 || point.z > 0)) {
            const depth = Math.max(0, (previous.z + point.z) / 2);
            ctx.strokeStyle = `rgba(${LIGHT}, ${(0.18 + depth * 0.55) * fade})`;
            ctx.lineWidth = 1.1 * unit;
            ctx.beginPath();
            ctx.moveTo(previous.sx, previous.sy);
            ctx.lineTo(point.sx, point.sy);
            ctx.stroke();
          }
          previous = point;
        }

        if (reduced) return;
        // The parcel: a bright head on the leading edge while the lane is still drawing.
        if (u < 0.45 && previous && previous.z > 0) {
          ctx.save();
          ctx.shadowBlur = 12;
          ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
          ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
          ctx.beginPath();
          ctx.arc(previous.sx, previous.sy, 2.2 * unit, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // Arrival: one ring opening out from the hub, once per delivery rather than a loop.
        if (u >= 0.45 && u < 0.7) {
          const { sx, sy, z } = project(hub);
          if (z > 0) {
            const p = (u - 0.45) / 0.25;
            ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - p) * 0.8 * z})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(sx, sy, (3 + p * 14) * unit, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      });

      // Hubs last, so they sit on top of the lanes. Hit-testing happens here too, because this is
      // where their projected screen positions are already known.
      let nearestIndex: number | null = null;
      let nearestX = 0;
      let nearestY = 0;
      let nearestDistance = HIT_RADIUS;
      const places = [origin, ...hubs];
      places.forEach((place, index) => {
        const { sx, sy, z } = project(place);
        if (z <= 0) return;
        if (pointer) {
          const distance = Math.hypot(pointer.x - sx, pointer.y - sy);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
            nearestX = sx;
            nearestY = sy;
          }
        }
        const isOrigin = index === 0;
        const active = hovered === index;
        if (isOrigin) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * z})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(sx, sy, 6 * unit, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + z * 0.4})`;
        ctx.beginPath();
        ctx.arc(sx, sy, (active || isOrigin ? 3 : 2) * unit, 0, Math.PI * 2);
        ctx.fill();
      });

      // The limb, drawn last: a glass edge caught by the light, weighted to the top, just inside
      // the radius so it reads as the inner wall of the glass rather than a stroke on the page.
      const rim = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
      rim.addColorStop(0, "rgba(255, 255, 255, 0.7)");
      rim.addColorStop(0.4, `rgba(${LIGHT}, 0.28)`);
      rim.addColorStop(1, "rgba(161, 161, 170, 0.1)");
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
      ctx.stroke();

      hovered = nearestIndex;
      if (nearestIndex !== null) {
        const label = nearestIndex === 0 ? `${ORIGIN.name} (home)` : HUBS[nearestIndex - 1].name;
        ctx.font = "500 12px Poppins, system-ui, sans-serif";
        const boxWidth = ctx.measureText(label).width + 18;
        const boxX = Math.min(Math.max(nearestX - boxWidth / 2, 4), Math.max(width - boxWidth - 4, 4));
        const boxY = Math.max(nearestY - 34, 4);
        ctx.fillStyle = "rgba(9, 9, 11, 0.9)";
        ctx.strokeStyle = `rgba(${LIGHT}, 0.25)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, 24, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.textBaseline = "middle";
        ctx.fillText(label, boxX + 9, boxY + 13);
      }

      canvas.style.cursor = dragging ? "grabbing" : hovered !== null ? "pointer" : "grab";
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // The hero planet is about a screen wide, so a retina backing store there would be a ~90MB
      // texture for a decorative dot field. Drop to 1x once the canvas is that big.
      const dpr = Math.min(window.devicePixelRatio || 1, rect.width > 1400 ? 1 : 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) draw(reduced ? 0 : (performance.now() - started) / 1000);
    };

    const frame = (now: number) => {
      draw((now - started) / 1000);
      frameId = requestAnimationFrame(frame);
    };

    // Reduced motion can still drag it: the objection is to unrequested movement, not movement the
    // visitor asked for. Each interaction repaints once.
    const repaintIfIdle = () => {
      if (!running) draw(reduced ? 0 : (performance.now() - started) / 1000);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      dragVelocity = 0;
      lastPointerX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (dragging) {
        // A full canvas width is about half a turn, which makes the globe feel held. Negative,
        // because the screen x is mirrored (see project): dragging right turns the surface right.
        const delta = -((event.clientX - lastPointerX) / Math.max(rect.width, 1)) * Math.PI;
        dragAngle += delta;
        dragVelocity = delta * 0.35;
        lastPointerX = event.clientX;
      }
      repaintIfIdle();
    };

    const endDrag = (event: PointerEvent) => {
      if (dragging && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      dragging = false;
    };

    const onPointerLeave = () => {
      pointer = null;
      hovered = null;
      repaintIfIdle();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", onPointerLeave);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    // Only animate while on screen: a hero that keeps a rAF loop going after the visitor has
    // scrolled to the footer drains the battery for nothing.
    let intersectionObserver: IntersectionObserver | null = null;
    if (!reduced && typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting === running) return;
        running = entry.isIntersecting;
        if (running) frameId = requestAnimationFrame(frame);
        else cancelAnimationFrame(frameId);
      });
      intersectionObserver.observe(canvas);
    }

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      // touch-pan-y: a horizontal drag turns the globe, a vertical one still scrolls the page. The
      // planet spans the foot of the hero, so swallowing vertical swipes would trap a phone visitor.
      className={`touch-pan-y ${className ?? ""}`}
      role="img"
      aria-label="Dotted world map globe showing freight lanes from Hyderabad to NationWide's hubs in Dubai, London, Frankfurt, New York, Toronto, Singapore, Hong Kong and Sydney. Drag to rotate."
    />
  );
}
