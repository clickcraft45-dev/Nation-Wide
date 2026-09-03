import type { Metadata, Viewport } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/state/auth-context";
import { ToastProvider } from "@/components/ui/toast";
import { LiquidGlassFilter } from "@/components/ui/liquid-glass-button";
import { SITE_URL } from "@/lib/constants/site";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Cross-border courier and freight from India to 240+ countries. Get a price in minutes, " +
  "book a door pickup, and track every parcel end to end.";

export const metadata: Metadata = {
  // Required for the relative openGraph/twitter image URLs below to resolve to absolute ones —
  // without it Next.js warns at build time and social crawlers get a broken image.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NationWide Logistics — Delivering trust worldwide",
    // Every page that sets its own `title` string gets suffixed with the brand automatically,
    // so no page has to repeat it and none of them are left showing the bare default.
    template: "%s · NationWide Logistics",
  },
  description: DESCRIPTION,
  applicationName: "NationWide Logistics",
  openGraph: {
    type: "website",
    siteName: "NationWide Logistics",
    title: "NationWide Logistics — Delivering trust worldwide",
    description: DESCRIPTION,
    url: "/",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "NationWide Logistics — Delivering trust worldwide",
    description: DESCRIPTION,
  },
  // Per-area overrides live in app/admin/layout.tsx and app/partner/layout.tsx; app/robots.ts is
  // the belt-and-braces copy for crawlers that never fetch the page at all.
  robots: { index: true, follow: true },
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
        {/* One shared SVG filter for every <LiquidButton> on the page. */}
        <LiquidGlassFilter />
      </body>
    </html>
  );
}
