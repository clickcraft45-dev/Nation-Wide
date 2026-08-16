"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuthGate } from "@/lib/auth/use-auth-gate";

export function MarketingFinalCta() {
  const gate = useAuthGate();

  return (
    <section className="bg-primary py-16">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 text-center">
        <h2 className="text-3xl font-semibold text-primary-foreground">
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
            className="inline-flex h-9 items-center justify-center rounded-md border border-primary-foreground/40 px-4 text-sm font-medium text-primary-foreground hover:bg-primary-foreground/10"
          >
            Track Shipment
          </Link>
        </div>
      </div>
    </section>
  );
}
