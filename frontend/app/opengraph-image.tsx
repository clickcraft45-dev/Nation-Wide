import { ImageResponse } from "next/og";

// The social card every link to the site unfurls into. Generated at build time by next/og rather
// than committed as a binary, so the mark and the wording can never drift out of sync with the
// app the way a hand-exported PNG does. Nested routes inherit this unless they ship their own.
//
// Satori (what next/og renders with) supports a flexbox subset of CSS and inline styles only —
// no Tailwind classes, no CSS variables — hence the literal brand hexes below.
export const alt = "NationWide Logistics — Delivering trust worldwide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0b0b0c";
const MUTED = "#a1a1aa";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* The same two paths as components/brand/logo.tsx, in reverse (white) tone. */}
          <svg width="120" height="120" viewBox="0 0 40 40">
            <g
              fill="none"
              stroke="#ffffff"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.5 30V14L25.5 30V10" />
              <path d="M21.9 13.6L25.5 10L29.1 13.6" />
            </g>
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, fontWeight: 600, color: "#ffffff", letterSpacing: -1.5 }}>
              NationWide
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: MUTED,
                letterSpacing: 8,
                marginTop: 6,
              }}
            >
              LOGISTICS
            </div>
          </div>
        </div>

        <div style={{ display: "flex", height: 1, background: "#27272a", margin: "56px 0" }} />

        <div style={{ fontSize: 44, color: "#ffffff", lineHeight: 1.25, letterSpacing: -1 }}>
          Your shipments. Our network.
        </div>
        <div style={{ fontSize: 44, color: MUTED, lineHeight: 1.25, letterSpacing: -1 }}>
          Delivered worldwide.
        </div>
        <div style={{ fontSize: 26, color: MUTED, marginTop: 40 }}>
          India → 240+ countries · Door pickup · End-to-end tracking
        </div>
      </div>
    ),
    size,
  );
}
