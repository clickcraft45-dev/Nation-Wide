"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/state/auth-context";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingServices } from "@/components/marketing/services";
import { MarketingStats } from "@/components/marketing/stats";
import { MarketingTestimonials } from "@/components/marketing/testimonials";
import { MarketingFooter } from "@/components/marketing/footer";
import { GetQuoteDialog } from "@/components/marketing/get-quote-dialog";

// A signed-out visitor who clicks "Get a Quote" is sent to /login?redirect=<this>, so a
// successful login sends them straight back here with the dialog reopened.
const QUOTE_REDIRECT_TARGET = "/?quote=1";

// The public homepage — Track is available to anyone without signing in, but Get a Quote
// requires an account: signed-out visitors are sent to log in first, then returned here with
// the dialog open. Authenticated visitors aren't redirected away from the page itself; the
// navbar just swaps "Sign in" for "Dashboard".
function HomePageInner() {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const wantsQuote = searchParams.get("quote") === "1";

  function handleGetQuote() {
    if (isLoading) return;
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(QUOTE_REDIRECT_TARGET)}`);
      return;
    }
    setQuoteOpen(true);
  }

  useEffect(() => {
    // Returning here via QUOTE_REDIRECT_TARGET after a login prompted by "Get a Quote":
    // reopen the dialog and drop the one-shot ?quote= param so a refresh doesn't reopen it.
    if (!wantsQuote || isLoading || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuoteOpen(true);
    router.replace("/", { scroll: false });
  }, [wantsQuote, isLoading, user, router]);

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

      <GetQuoteDialog open={quoteOpen} onOpenChange={setQuoteOpen} />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}
