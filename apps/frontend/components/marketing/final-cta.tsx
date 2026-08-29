"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuthGate } from "@/lib/auth/use-auth-gate";

export function MarketingFinalCta() {
  const gate = useAuthGate();

  return (
    // The closing band is the page's secondary surface: white everywhere above, black glass here
    // and in the footer, so the page ends on the same material the hero planet is made of.
    <section className="relative isolate overflow-hidden bg-[#09090b] py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-white/10 blur-[130px] animate-aurora-slow" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-zinc-400/15 blur-[130px] animate-aurora-slower" />
      </div>

      <div className="glass-panel-dark mx-auto flex max-w-4xl flex-col items-center gap-4 rounded-3xl px-6 py-12 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-primary-foreground sm:text-4xl">
          Ready to send your shipment?
        </h2>
        <p className="max-w-md text-sm text-primary-foreground/80">
          Get your shipment moving with a simple, transparent and reliable logistics
          experience.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => gate("/quote")}>
            Get a Quote
          </Button>
          <Link
            href="/#track"
            className="inline-flex h-9 items-center justify-center rounded-md border border-white/25 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
          >
            Track Shipment
          </Link>
        </div>
      </div>
    </section>
  );
}
