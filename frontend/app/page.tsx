import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingServices } from "@/components/marketing/services";
import { MarketingHowItWorks } from "@/components/marketing/how-it-works";
import { MarketingAbout } from "@/components/marketing/about";
import { MarketingTrustedNetwork } from "@/components/marketing/trusted-network";
import { MarketingCapabilities } from "@/components/marketing/capabilities";
import { MarketingReviews } from "@/components/marketing/reviews";
import { MarketingFaqs } from "@/components/marketing/faqs";
import { MarketingFinalCta } from "@/components/marketing/final-cta";
import { MarketingFooter } from "@/components/marketing/footer";
import { Reveal } from "@/components/marketing/reveal";
import { SmoothScroll } from "@/components/marketing/smooth-scroll";

export const metadata: Metadata = {
  // The root layout already supplies the homepage title, description and OG card — this only
  // pins the canonical so /?utm_source=... and /#track never split the page's ranking.
  alternates: { canonical: "/" },
};

// The public homepage — Track Shipment is the one operational feature available without
// signing in (see MarketingHero). Every other CTA (Get a Quote, My Orders, Schedule Pickup, ...)
// routes through useAuthGate, which sends signed-out visitors to /login first. This page itself
// only renders static marketing content — no customer/order/quote/pricing data is fetched here.
//
// Each section below the fold fades in as it's scrolled to. <Reveal> is applied here, once per
// section, rather than threaded through every section component — and it fails open, so the page
// is fully readable whether or not the client bundle ever runs. The hero is deliberately NOT
// wrapped: it's above the fold and animates itself in pure CSS.
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <SmoothScroll />
      <MarketingNavbar />
      <MarketingHero />
      <Reveal from="fade">
        <MarketingServices />
      </Reveal>
      <Reveal from="fade">
        <MarketingHowItWorks />
      </Reveal>
      <Reveal from="fade">
        <MarketingAbout />
      </Reveal>
      <Reveal from="fade">
        <MarketingTrustedNetwork />
      </Reveal>
      <Reveal from="fade">
        <MarketingCapabilities />
      </Reveal>
      <Reveal from="fade">
        <MarketingReviews />
      </Reveal>
      <Reveal from="fade">
        <MarketingFaqs />
      </Reveal>
      <Reveal from="fade">
        <MarketingFinalCta />
      </Reveal>
      <MarketingFooter />
    </div>
  );
}
