import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { TrackingLookupPanel } from "@/features/tracking/TrackingLookupPanel";

export const metadata: Metadata = {
  title: "Track your shipment",
  description:
    "Look up any NationWide Logistics shipment with your Order ID or carrier tracking number — " +
    "no sign-in needed.",
  alternates: { canonical: "/track" },
};

// The standalone tracking page — reached from notification links, the 404 page, and direct URLs.
// It carries the marketing navbar and footer because it is a public entry point: a visitor who
// lands here from an email needs a way into the rest of the site, not a dead end.
export default function TrackPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <main className="flex flex-1 flex-col items-center gap-8 px-6 py-24">
        <h1 className="text-2xl font-semibold">Track your shipment</h1>
        <TrackingLookupPanel className="w-full max-w-md" />
      </main>
      <MarketingFooter />
    </div>
  );
}
