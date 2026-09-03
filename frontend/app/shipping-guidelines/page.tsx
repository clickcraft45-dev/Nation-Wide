import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { LegalPlaceholder } from "@/components/marketing/legal-placeholder";

export const metadata: Metadata = {
  title: "Shipping Guidelines",
  description:
    "Packing standards, prohibited and restricted items, documentation and customs requirements " +
    "for international shipments from India.",
  alternates: { canonical: "/shipping-guidelines" },
};

export default function ShippingGuidelinesPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <LegalPlaceholder title="Shipping Guidelines" />
      <MarketingFooter />
    </div>
  );
}
