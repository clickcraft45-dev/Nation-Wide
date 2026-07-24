"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/state/auth-context";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingServices } from "@/components/marketing/services";
import { MarketingStats } from "@/components/marketing/stats";
import { MarketingTestimonials } from "@/components/marketing/testimonials";
import { MarketingFooter } from "@/components/marketing/footer";

// The public homepage — Track is available to anyone without signing in, but Get a Quote
// requires an account: signed-out visitors are sent to log in first, then straight to the real
// /quote booking page on return. Authenticated visitors aren't redirected away from the page
// itself; the navbar just swaps "Sign in" for "Dashboard".
export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  function handleGetQuote() {
    if (isLoading) return;
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent("/quote")}`);
      return;
    }
    router.push("/quote");
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar onGetQuote={handleGetQuote} />
      <MarketingHero onGetQuote={handleGetQuote} />
      <MarketingServices />
      <MarketingStats />
      <MarketingTestimonials />

      <section id="quote" className="bg-primary py-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 text-center">
          <h2 className="text-3xl font-semibold text-primary-foreground">
            Ready to ship?
          </h2>
          <p className="max-w-md text-sm text-primary-foreground/80">
            Get a no-obligation quote in minutes — our team will follow up with pricing for
            your route.
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="mt-2"
            onClick={handleGetQuote}
          >
            Get a Quote
          </Button>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
