import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingServices } from "@/components/marketing/services";
import { MarketingHowItWorks } from "@/components/marketing/how-it-works";
import { MarketingAbout } from "@/components/marketing/about";
import { MarketingWhyChoose } from "@/components/marketing/why-choose";
import { MarketingGlobalReach } from "@/components/marketing/global-reach";
import { MarketingTrustedNetwork } from "@/components/marketing/trusted-network";
import { MarketingCapabilities } from "@/components/marketing/capabilities";
import { MarketingFinalCta } from "@/components/marketing/final-cta";
import { MarketingFooter } from "@/components/marketing/footer";

// The public homepage — Track Shipment is the one operational feature available without
// signing in (see MarketingHero). Every other CTA (Get a Quote, My Orders, Schedule Pickup, ...)
// routes through useAuthGate, which sends signed-out visitors to /login first. This page itself
// only renders static marketing content — no customer/order/quote/pricing data is fetched here.
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <MarketingHero />
      <MarketingServices />
      <MarketingHowItWorks />
      <MarketingAbout />
      <MarketingWhyChoose />
      <MarketingGlobalReach />
      <MarketingTrustedNetwork />
      <MarketingCapabilities />
      <MarketingFinalCta />
      <MarketingFooter />
    </div>
  );
}
