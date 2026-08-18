import type { Metadata } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/state/auth-context";
import { ToastProvider } from "@/components/ui/toast";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NationWide Logistics",
  description: "Delivering trust worldwide — shipment tracking and logistics operations",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading a per-request header opts this layout (and every route under it) out of static
  // prerendering. That's required, not incidental: middleware.ts issues a fresh CSP nonce on
  // every request, and Next.js can only stamp that same nonce onto its own inline
  // hydration/RSC-streaming scripts when the page is actually rendered per-request — a
  // statically-prerendered page has no per-request nonce to inject into. See middleware.ts.
  await headers();

  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
