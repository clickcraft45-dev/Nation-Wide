import type { MetadataRoute } from "next";

/**
 * The web app manifest, which is what makes this installable to a phone's home screen.
 *
 * Next's own metadata route rather than a static public/manifest.json or a PWA plugin: this is
 * typed, so a wrong `display` or a missing icon size is a build error instead of a silently
 * uninstallable app, and it needs no dependency.
 *
 * `display: "standalone"` is what drops the browser chrome — an installed shipment tracker that
 * still shows an address bar has no reason to be installed.
 *
 * APP IMAGES — replace the files, keep the names and sizes:
 *  - public/assets/icons/icon-192.png, icon-512.png   Android/desktop icon + the install banner
 *  - public/assets/icons/icon-maskable-512.png        Android adaptive icon; keep the logo inside
 *                                                     the centre 80% and the background opaque
 *  - app/apple-icon.png (180×180)                     iPhone/iPad Home Screen icon. MUST have an
 *                                                     opaque background — iOS paints transparency
 *                                                     black, which hid the black NW mark entirely
 *  - app/icon.png (512×512), app/favicon.ico          browser tab icon
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NationWide Logistics",
    // What actually fits under a home-screen icon; the full name is used in the install dialog.
    short_name: "NationWide",
    description:
      "Book international courier pickups, compare prices and track every shipment end to end.",
    start_url: "/",
    // Where an install lands. The marketing home page is the right entry: a signed-in customer
    // is redirected on to their dashboard from there, and a signed-out one needs the pitch.
    id: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    // Matches the viewport themeColor in layout.tsx — the two disagreeing gives an installed app
    // a splash screen in one colour and a status bar in another.
    theme_color: "#ffffff",
    categories: ["business", "travel", "utilities"],
    lang: "en-IN",
    icons: [
      { src: "/assets/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separate entry, not `purpose: "any maskable"`. A single icon claiming both gets cropped
      // to the maskable safe zone everywhere, which shrinks the mark in contexts that never
      // needed the inset.
      {
        src: "/assets/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the installed icon. Tracking is the one thing people open this app to do.
    shortcuts: [
      { name: "Track a shipment", short_name: "Track", url: "/track" },
      { name: "Get a quote", short_name: "Quote", url: "/quote" },
    ],
  };
}
