import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingServices } from "@/components/marketing/services";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = {
  title: "Services",
  description:
    "International courier, cargo and excess baggage services from Hyderabad and Secunderabad to 240+ countries with DHL, FedEx and UPS.",
  alternates: { canonical: "/services" },
};

// Its own URL so search results can list it as a separate link; the same section also sits on the
// home page.
export default function Page() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <h1 className="sr-only">Our courier services</h1>
      <main className="flex-1">
        <MarketingServices />
      </main>
      <MarketingFooter />
      <JsonLd data={breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }])} />
    </div>
  );
}
