"use client";

import AutoScroll from "embla-carousel-auto-scroll";
import { useReducedMotion } from "motion/react";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { PARTNER_LOGOS } from "@/lib/constants/assets";

// Real partner marks aren't in yet (see PARTNER_LOGOS' own comment) — duplicating the same 4
// placeholders end-to-end just gives the auto-scroll enough content to loop smoothly instead of
// visibly snapping every couple of seconds. Swap this back to a single pass once there are enough
// real logos that one lap is already long — no other change needed, the carousel loops either way.
const SCROLL_LOGOS = [...PARTNER_LOGOS, ...PARTNER_LOGOS];

// Placeholder marks only — do not swap in real carrier/partner logos until they're authorized
// and supplied. Add/remove entries in lib/constants/assets.ts; this component just renders
// whatever's there.
export function MarketingTrustedNetwork() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="bg-background py-16">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Powered by trusted logistics networks
        </p>

        {/* One real, unique list for screen readers — the visual strip below repeats the same
            logos to loop smoothly and is marked decorative so it isn't announced twice. */}
        <ul className="sr-only">
          {PARTNER_LOGOS.map((partner) => (
            <li key={partner.name}>{partner.name}</li>
          ))}
        </ul>

        <div className="relative mt-8">
          <Carousel
            opts={{ loop: true, align: "start", dragFree: true }}
            plugins={
              prefersReducedMotion
                ? []
                : [AutoScroll({ speed: 1, startDelay: 500, stopOnMouseEnter: true, stopOnInteraction: false })]
            }
            aria-hidden
            className="fade-edges-x"
          >
            <CarouselContent className="ml-0 items-center">
              {SCROLL_LOGOS.map((partner, i) => (
                <CarouselItem
                  key={`${partner.name}-${i}`}
                  className="flex basis-1/2 justify-center pl-10 sm:basis-1/3 md:basis-1/4"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small static local SVG marks; no next/image sizing benefit.
                      No loading="lazy" — this is a horizontally-auto-scrolling carousel, so "off to
                      the side right now" means "about to scroll into view within seconds," not
                      "may never be seen." Native lazy-loading's viewport-proximity heuristic
                      doesn't know that, and was visibly deferring the second (duplicated) set of
                      logos until they'd almost scrolled on-screen — a pop-in/disappear glitch on
                      every pass, confirmed by sampling `img.complete` while the carousel ran. */}
                  <img
                    src={partner.src}
                    alt=""
                    className="h-8 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      </div>
    </section>
  );
}
