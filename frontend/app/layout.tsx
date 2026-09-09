import type { Metadata, Viewport } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/state/auth-context";
import { ToastProvider } from "@/components/ui/toast";
import { LiquidGlassFilter } from "@/components/ui/liquid-glass-button";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SITE_URL } from "@/lib/constants/site";
import { JsonLd } from "@/components/seo/json-ld";
import {
  organizationSchema,
  servicesSchema,
  websiteSchema,
} from "@/lib/seo/structured-data";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Leads with the city because that is what the searches this business competes for actually
// contain — "international courier Hyderabad", not "cross-border logistics". The old copy named
// no location at all, which left the strongest ranking signal the site had entirely unused.
// Written as a sentence rather than a keyword list: stuffing is a ranking penalty, and this is
// also the text a person reads in the results before deciding whether to click.
const DESCRIPTION =
  "International courier and cargo service in Hyderabad. Send documents, parcels and excess " +
  "baggage from India to 240+ countries with FedEx, UPS and DHL. Compare prices in minutes, " +
  "book a door pickup in Hyderabad or Secunderabad, and track every shipment end to end.";

const TITLE = "International Courier Service in Hyderabad | NationWide Logistics";

// iOS does not read `display: "standalone"` from the manifest — these two are what let an
// added-to-home-screen shortcut open without Safari's chrome. app/apple-icon.png already supplies
// the home-screen icon.
const APPLE_WEB_APP = {
  capable: true,
  title: "NationWide",
  statusBarStyle: "default",
} as const;

export const metadata: Metadata = {
  // Required for the relative openGraph/twitter image URLs below to resolve to absolute ones —
  // without it Next.js warns at build time and social crawlers get a broken image.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    // Every page that sets its own `title` string gets suffixed with the brand automatically,
    // so no page has to repeat it and none of them are left showing the bare default.
    template: "%s · NationWide Logistics",
  },
  description: DESCRIPTION,
  applicationName: "NationWide Logistics",
  openGraph: {
    type: "website",
    siteName: "NationWide Logistics",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  // Google reads these from the page, not from a meta tag, but they cost nothing and some
  // regional aggregators still use them.
  category: "Logistics",
  alternates: { canonical: "/" },
  appleWebApp: APPLE_WEB_APP,
  // Per-area overrides live in app/admin/layout.tsx and app/partner/layout.tsx; app/robots.ts is
  // the belt-and-braces copy for crawlers that never fetch the page at all.
  robots: {
    index: true,
    follow: true,
    // Let Google use full-length text and large image previews rather than truncating to its
    // conservative default — a courier result competes on the detail in its snippet.
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  // The app is a single light theme (see globals.css) — the browser chrome should match the page
  // it sits above, not the near-black brand panels inside it.
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
        {/* Site-wide structured data: who this business is, where it is, and what it sells.
            Emitted on every page so any entry point carries the identity, not just the home page. */}
        <JsonLd data={organizationSchema()} />
        <JsonLd data={websiteSchema()} />
        <JsonLd data={servicesSchema()} />
        {/* One shared SVG filter for every <LiquidButton> on the page. */}
        <LiquidGlassFilter />
        {/* Registers the service worker and offers the install, once, on a device that can. */}
        <InstallPrompt />
      </body>
    </html>
  );
}
