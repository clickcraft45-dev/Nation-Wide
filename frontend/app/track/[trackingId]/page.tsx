import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { TrackingLookupPanel } from "@/features/tracking/TrackingLookupPanel";

// noindex, not just a robots.txt Disallow: the URL contains a real tracking number, and a page
// that leaks into an index would publish one customer's shipment status. The title deliberately
// does NOT echo the tracking number back — it ends up in browser history and window titles.
export const metadata: Metadata = {
  title: "Track your shipment",
  robots: { index: false, follow: false },
};

export default async function TrackByIdPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <main className="flex flex-1 flex-col items-center gap-8 px-6 py-24">
        <h1 className="text-2xl font-semibold">Track your shipment</h1>
        <TrackingLookupPanel
          className="w-full max-w-md"
          initialTrackingId={decodeURIComponent(trackingId)}
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
