"use client";

import { Globe2, Zap, PackageCheck, Briefcase } from "lucide-react";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { AssetImage } from "@/components/marketing/asset-image";
import { SERVICE_IMAGES } from "@/lib/constants/assets";

const SERVICES = [
  {
    icon: Globe2,
    image: SERVICE_IMAGES.international,
    title: "International Shipping",
    description:
      "Reliable international document and parcel shipping across supported destinations.",
  },
  {
    icon: Zap,
    image: SERVICE_IMAGES.express,
    title: "Express Delivery",
    description: "Fast shipping options through our logistics and carrier network.",
  },
  {
    icon: PackageCheck,
    image: SERVICE_IMAGES.pickup,
    title: "Pickup & Door-to-Door",
    description: "Convenient pickup coordination from the customer's location.",
  },
  {
    icon: Briefcase,
    image: SERVICE_IMAGES.business,
    title: "Business Shipping",
    description: "Solutions for businesses with recurring or larger shipping requirements.",
  },
];

export function MarketingServices() {
  const gate = useAuthGate();

  return (
    <section id="services" className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-3xl font-semibold text-foreground">
            Logistics solutions built around your shipment
          </h2>
          <p className="mt-3 text-muted-foreground">
            Whatever you&apos;re sending, wherever it&apos;s going — we&apos;ve got a service
            built for it.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service) => (
            <div
              key={service.title}
              className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-[4/3]">
                <AssetImage src={service.image.src} alt={service.image.alt} />
                <div className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg bg-card text-primary shadow-sm">
                  <service.icon className="h-5 w-5" aria-hidden />
                </div>
              </div>
              <div className="p-5">
                <h3 className="text-base font-semibold text-foreground">{service.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{service.description}</p>
                <button
                  onClick={() => gate("/quote")}
                  className="mt-3 text-sm font-medium text-primary hover:underline"
                >
                  Learn more
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
