"use client";

import { useEffect, useRef } from "react";

// Rotating dotted globe with air/road freight moving along great-circle routes. Drag to spin it;
// hover a hub to name it.
//
// Deliberately plain 2D canvas rather than three.js/WebGL: this is an orthographic projection of
// points on a sphere, which is a dot product and a divide — a 3D engine (and ~150KB of JS on the
// landing page's critical path) would buy nothing here. Everything below is pure math + 2D paths.

type Vec = { x: number; y: number; z: number };

// Sampled over the whole sphere; only the ~29% on land are kept. High, because the hero draws
// this sphere wider than the viewport — at 4200 the continents thinned out to a scatter nobody
// could read as a map.
const DOT_COUNT = 15000;
const TILT = -0.42; // north pole leaning toward the viewer, radians
const SPIN = 0.05; // radians per second
const DRAG_FRICTION = 0.94; // per-frame decay of flick momentum
const HIT_RADIUS = 16; // px around a hub that counts as a hover

const LIGHT = "228, 228, 231";
const MID = "161, 161, 170";

const HUBS = [
  { name: "Mumbai", lat: 19.1, lon: 72.9 },
  { name: "Hyderabad", lat: 17.4, lon: 78.5 },
  { name: "Dubai", lat: 25.2, lon: 55.3 },
  { name: "London", lat: 51.5, lon: -0.1 },
  { name: "New York", lat: 40.7, lon: -74.0 },
  { name: "Singapore", lat: 1.35, lon: 103.8 },
  { name: "Sydney", lat: -33.9, lon: 151.2 },
];

// Every lane starts or ends in India — outbound freight to each hub and an inbound leg on the
// same arc, so the globe shows two-way traffic rather than a one-way fan-out.
// `air` arcs climb well off the surface and carry a plane; `road` arcs hug it and carry a truck.
const ROUTES = [
  { from: 0, to: 1, mode: "road" as const, speed: 0.13, phase: 0.0 },
  { from: 0, to: 2, mode: "air" as const, speed: 0.075, phase: 0.35 },
  { from: 0, to: 3, mode: "air" as const, speed: 0.06, phase: 0.1 },
  { from: 0, to: 4, mode: "air" as const, speed: 0.05, phase: 0.6 },
  { from: 1, to: 5, mode: "air" as const, speed: 0.07, phase: 0.8 },
  { from: 1, to: 6, mode: "air" as const, speed: 0.055, phase: 0.25 },
];


// Coarse continent outlines as [lon, lat] rings — enough resolution for a dot map at this size,
// and small enough to keep inline rather than shipping a topojson + a projection library.
const LAND: [number, number][][] = [
  // North America
  [[-168, 66], [-155, 71], [-130, 70], [-110, 69], [-95, 70], [-80, 73], [-65, 66], [-55, 52],
   [-65, 45], [-70, 41], [-76, 35], [-80, 25], [-84, 30], [-90, 29], [-97, 26], [-95, 18],
   [-88, 16], [-83, 9], [-78, 8], [-83, 13], [-92, 16], [-105, 20], [-110, 24], [-114, 30],
   [-120, 34], [-124, 40], [-125, 48], [-133, 55], [-145, 60], [-160, 58]],
  // Greenland
  [[-45, 60], [-55, 70], [-45, 78], [-30, 82], [-20, 75], [-25, 68], [-35, 62]],
  // South America
  [[-81, 8], [-76, 10], [-70, 12], [-62, 10], [-52, 5], [-50, 0], [-44, -2], [-35, -6],
   [-38, -13], [-48, -25], [-56, -35], [-62, -40], [-65, -45], [-68, -53], [-73, -52],
   [-72, -45], [-71, -35], [-71, -25], [-70, -18], [-76, -14], [-81, -6], [-80, 0], [-78, 4]],
  // Europe
  [[-10, 36], [-9, 44], [-2, 49], [3, 52], [8, 54], [12, 57], [18, 60], [24, 63], [30, 65],
   [40, 67], [45, 58], [48, 50], [40, 46], [33, 44], [28, 41], [22, 40], [16, 40], [12, 45],
   [5, 43], [-3, 40]],
  // Britain and Ireland
  [[-10, 52], [-6, 55], [-3, 58], [0, 54], [1, 51], [-5, 50]],
  // Africa
  [[-17, 15], [-10, 20], [0, 25], [10, 32], [20, 33], [30, 31], [33, 27], [37, 20], [43, 12],
   [51, 12], [48, 4], [41, -2], [40, -12], [35, -20], [32, -26], [27, -34], [20, -35],
   [15, -28], [12, -18], [9, -2], [9, 4], [0, 5], [-8, 4], [-13, 9]],
  // Madagascar
  [[43, -12], [50, -16], [48, -25], [44, -22]],
  // Asia, including the Indian peninsula
  [[45, 42], [55, 50], [65, 58], [75, 65], [90, 72], [105, 76], [120, 73], [135, 71], [150, 70],
   [165, 68], [178, 66], [170, 60], [160, 58], [140, 55], [135, 48], [130, 42], [122, 37],
   [120, 30], [112, 22], [108, 15], [105, 10], [100, 6], [98, 12], [94, 16], [90, 22], [88, 21],
   [80, 8], [76, 15], [72, 20], [68, 24], [63, 25], [57, 22], [52, 15], [45, 13], [43, 20],
   [48, 28], [50, 35]],
  // Japan
  [[129, 32], [133, 34], [139, 36], [142, 42], [145, 44], [143, 40], [137, 34], [132, 31]],
  // Australia
  [[113, -22], [115, -34], [118, -35], [125, -33], [131, -32], [137, -35], [141, -38], [146, -39],
   [150, -37], [153, -32], [153.5, -27], [148, -20], [143, -14], [136, -12], [130, -12],
   [125, -14], [118, -18]],
  // New Zealand
  [[166, -46], [174, -41], [178, -38], [173, -35], [170, -42]],
];

/** Ray-cast point-in-polygon over the outlines above. Exported for the unit test. */
export function isLand(lat: number, lon: number): boolean {
  for (const ring of LAND) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

function fromLatLon(lat: number, lon: number): Vec {
  const a = (lat * Math.PI) / 180;
  const b = (lon * Math.PI) / 180;
  return { x: Math.cos(a) * Math.cos(b), y: Math.sin(a), z: Math.cos(a) * Math.sin(b) };
}

/**
 * Point at `f` (0..1) along the great circle from `a` to `b`, lifted by `altitude` at the midpoint.
 * Exported for the unit test — the endpoints and the apex are the only things worth pinning down.
 */
export function arcPoint(a: Vec, b: Vec, f: number, altitude: number): Vec {
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  const sin = Math.sin(omega);
  // Antipodal or identical points have no unique great circle — fall back to a linear blend.
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
// clumping, which is what makes the dot field read as a solid surface rather than a wireframe.
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
  // Rotate about the globe's axis, then tilt that axis toward the viewer.
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = p.x * cos + p.z * sin;
  const z = -p.x * sin + p.z * cos;
  const ct = Math.cos(TILT);
  const st = Math.sin(TILT);
  return { x, y: p.y * ct - z * st, z: p.y * st + z * ct };
}

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
    const hubs = HUBS.map((h) => fromLatLon(h.lat, h.lon));
    const reduced = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

    let width = 0;
    let height = 0;
    let frameId = 0;
    let running = false;
    const started = performance.now();

    // Interaction state. A drag adds to the automatic spin; releasing mid-drag keeps the momentum
    // and lets friction bleed it off, so a flick feels like a flick.
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

      if (!dragging && dragVelocity !== 0) {
        dragAngle += dragVelocity;
        dragVelocity *= DRAG_FRICTION;
        if (Math.abs(dragVelocity) < 0.00005) dragVelocity = 0;
      }

      const angle = t * SPIN + dragAngle;
      const project = (p: Vec) => ({ sx: cx + p.x * radius, sy: cy - p.y * radius, z: p.z });

      ctx.clearRect(0, 0, width, height);

      // Contact shadow: the page behind this is white, so the planet needs a soft dark bleed
      // off the limb to sit on it rather than look like a sticker cut out of it.
      const shadow = ctx.createRadialGradient(cx, cy, radius * 0.98, cx, cy, radius * 1.14);
      shadow.addColorStop(0, "rgba(9, 9, 11, 0.30)");
      shadow.addColorStop(1, "rgba(9, 9, 11, 0)");
      ctx.fillStyle = shadow;
      ctx.fillRect(0, 0, width, height);

      // The planet body — black glass, and opaque, so the far side of the dot field is hidden
      // behind it the way a real horizon hides it rather than showing through as ghost
      // continents.
      const body = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.5,
        radius * 0.05,
        cx,
        cy,
        radius,
      );
      body.addColorStop(0, "#24242c");
      body.addColorStop(0.55, "#101014");
      body.addColorStop(1, "#050506");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Dot field — front hemisphere only now that the body is opaque. Depth drives alpha and
      // size, which is the whole 3D read. Bright enough that the continents read at a glance:
      // on the hero only the top cap of this sphere is on screen, and dots up there are close
      // to the limb, so a depth-only ramp would fade exactly the part people can see.
      // ponytail: squares, not arcs. At 1–2px a rect and a circle are the same pixels, and
      // fillRect is several times cheaper across ~4k dots a frame. Go back to arcs only if the
      // globe is ever drawn small enough for the shape to show.
      for (const dot of dots) {
        const { sx, sy, z } = project(spin(dot, angle));
        if (z <= 0) continue;
        const size = 1 + z * 0.9;
        ctx.fillStyle = `rgba(244, 244, 245, ${0.45 + z * 0.45})`;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }

      // Glass sheen: a light wash across the upper third, clipped to the sphere.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      const sheen = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius * 0.1);
      sheen.addColorStop(0, "rgba(255, 255, 255, 0.16)");
      sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      ctx.restore();

      for (const route of ROUTES) {
        const a = hubs[route.from];
        const b = hubs[route.to];
        const air = route.mode === "air";
        const altitude = air ? 0.22 : 0.03;
        const tone = air ? LIGHT : MID;

        // The arc itself, dropped segment by segment as it wraps behind the globe.
        ctx.lineWidth = air ? 1.3 : 1.1;
        ctx.lineCap = "round";
        let previous: { sx: number; sy: number; z: number } | null = null;
        for (let i = 0; i <= 60; i++) {
          const point = project(spin(arcPoint(a, b, i / 60, altitude), angle));
          // Front hemisphere only — anything further round is behind an opaque planet.
          if (previous && (previous.z > 0 || point.z > 0)) {
            const depth = Math.max(0, (previous.z + point.z) / 2);
            ctx.strokeStyle = `rgba(${tone}, ${0.1 + depth * 0.35})`;
            ctx.beginPath();
            ctx.moveTo(previous.sx, previous.sy);
            ctx.lineTo(point.sx, point.sy);
            ctx.stroke();
          }
          previous = point;
        }

        // The freight itself, plus a short comet trail behind it. `dir` is +1 for the outbound
        // leg and -1 for the one flying home, so trail and nose both point the right way.
        const drawMover = (progress: number, dir: 1 | -1) => {
          const here = project(spin(arcPoint(a, b, progress, altitude), angle));
          if (here.z <= 0) return;

          for (let i = 1; i <= 8; i++) {
            const behind = progress - i * 0.012 * dir;
            if (behind < 0 || behind > 1) break;
            const trail = project(spin(arcPoint(a, b, behind, altitude), angle));
            if (trail.z <= 0) continue;
            ctx.fillStyle = `rgba(${tone}, ${0.3 * (1 - i / 8)})`;
            ctx.beginPath();
            ctx.arc(trail.sx, trail.sy, 1.5 * (1 - i / 9), 0, Math.PI * 2);
            ctx.fill();
          }

          const ahead = project(
            spin(arcPoint(a, b, Math.min(1, Math.max(0, progress + 0.01 * dir)), altitude), angle),
          );
          const heading = Math.atan2(ahead.sy - here.sy, ahead.sx - here.sx);

          ctx.save();
          ctx.translate(here.sx, here.sy);
          ctx.rotate(heading);
          ctx.shadowBlur = 10;
          ctx.shadowColor = `rgba(${tone}, 0.9)`;
          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.beginPath();
          if (air) {
            // Swept-wing dart pointing along the heading.
            ctx.moveTo(5, 0);
            ctx.lineTo(-3, 3.2);
            ctx.lineTo(-1.2, 0);
            ctx.lineTo(-3, -3.2);
          } else {
            ctx.rect(-2.6, -2, 5.2, 4);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };

        const cycle = t * route.speed + route.phase;
        drawMover(cycle % 1, 1);
        drawMover(1 - ((cycle + 0.5) % 1), -1);
      }

      // Hubs last, so they sit on top of the routes leaving them. Hit-testing happens here too,
      // because this is where their projected screen positions are already known.
      ctx.shadowBlur = 0;
      let nearestIndex: number | null = null;
      let nearestX = 0;
      let nearestY = 0;
      let nearestDistance = HIT_RADIUS;

      hubs.forEach((hub, index) => {
        const { sx, sy, z } = project(spin(hub, angle));
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

        const active = hovered === index;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + sx);
        ctx.strokeStyle = `rgba(${LIGHT}, ${(active ? 0.85 : 0.35) * z})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, 4 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 255, 255, ${0.55 + z * 0.45})`;
        ctx.beginPath();
        ctx.arc(sx, sy, active ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // The limb, drawn last so it sits over everything: a glass edge caught by the light,
      // weighted to the top. Drawn just inside the radius so it reads as the inner wall of the
      // glass rather than a stroke sitting on the white page outside it.
      const rim = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
      rim.addColorStop(0, "rgba(255, 255, 255, 0.75)");
      rim.addColorStop(0.4, `rgba(${LIGHT}, 0.30)`);
      rim.addColorStop(1, `rgba(${MID}, 0.10)`);
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
      ctx.stroke();

      hovered = nearestIndex;

      if (nearestIndex !== null) {
        const label = HUBS[nearestIndex].name;
        ctx.font = "500 12px system-ui, sans-serif";
        const boxWidth = ctx.measureText(label).width + 18;
        const boxX = Math.min(Math.max(nearestX - boxWidth / 2, 4), Math.max(width - boxWidth - 4, 4));
        const boxY = Math.max(nearestY - 34, 4);

        ctx.fillStyle = "rgba(9, 9, 11, 0.88)";
        ctx.strokeStyle = `rgba(${LIGHT}, 0.25)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(boxX, boxY, boxWidth, 24);
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
      // The hero planet is wider than the viewport, so a retina backing store there would be a
      // ~90MB texture for a decorative dot field. Drop to 1x once the canvas is that big.
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

    // Reduced motion still gets to drag it — the objection is to unrequested movement, not to
    // movement the visitor asked for. Each interaction just repaints once.
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
        // A full canvas width ≈ half a turn, which makes the globe feel attached to the finger.
        const delta = ((event.clientX - lastPointerX) / Math.max(rect.width, 1)) * Math.PI;
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

    // Only animate while on screen — a hero that keeps burning a rAF loop after the visitor has
    // scrolled to the footer is a battery drain for nothing.
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
      // touch-pan-y: a horizontal drag spins the globe, a vertical one still scrolls the page —
      // the planet spans the foot of the hero, so swallowing vertical swipes would trap a
      // phone visitor there.
      className={`touch-pan-y ${className ?? ""}`}
      role="img"
      aria-label="Interactive dotted world map globe showing air and road freight moving between India and NationWide Logistics hubs worldwide. Drag to rotate."
    />
  );
}
