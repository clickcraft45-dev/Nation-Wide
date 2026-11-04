import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { PriceExplorer } from "@/components/marketing/price-explorer";

export const metadata: Metadata = {
  title: "Explore international courier prices",
  description:
    "See DHL, FedEx and UPS prices from India to over 240 countries in INR, no sign-in needed.",
  alternates: { canonical: "/prices" },
};

export default function PricesPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <main className="flex min-h-svh flex-1 flex-col items-center px-6 py-16">
        <PriceExplorer />
      </main>
      <MarketingFooter />
    </div>
  );
}
