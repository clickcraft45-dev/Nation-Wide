"use client";

import { Globe2, Zap, PackageCheck, Briefcase, ArrowUpRight } from "lucide-react";
import { useAuthGate } from "@/lib/auth/use-auth-gate";
import { AssetImage } from "@/components/marketing/asset-image";
import { Reveal } from "@/components/marketing/reveal";
import { SectionHeading } from "@/components/marketing/section-heading";
import { SERVICE_IMAGES } from "@/lib/constants/assets";

// Each service owns an accent from the hero's aurora family (white through zinc-500) instead
// of every card repeating brand blue. Written out as whole class strings per card because Tailwind
// only sees literals — a computed `text-${colour}-300` compiles to nothing.
const SERVICES = [
  {
    icon: Globe2,
    image: SERVICE_IMAGES.international,
    title: "International Shipping",
    description:
      "Reliable international document and parcel shipping across supported destinations.",
    tile: "border-white/25 bg-white/15 text-white",
    glow: "bg-white",
    link: "text-white",
    hover: "hover:border-white/45",
    ring: "focus-visible:ring-white",
  },
  {
    icon: Zap,
    image: SERVICE_IMAGES.express,
    title: "Express Delivery",
    description: "Fast shipping options through our logistics and carrier network.",
    tile: "border-zinc-300/30 bg-zinc-300/15 text-zinc-200",
    glow: "bg-zinc-300",
    link: "text-zinc-200",
    hover: "hover:border-zinc-300/50",
    ring: "focus-visible:ring-zinc-300",
  },
  {
    icon: PackageCheck,
    image: SERVICE_IMAGES.pickup,
    title: "Pickup & Door-to-Door",
    description: "Convenient pickup coordination from the customer's location.",
    tile: "border-zinc-400/30 bg-zinc-400/15 text-zinc-300",
    glow: "bg-zinc-400",
    link: "text-zinc-300",
    hover: "hover:border-zinc-400/50",
    ring: "focus-visible:ring-zinc-400",
  },
  {
    icon: Briefcase,
    image: SERVICE_IMAGES.business,
    title: "Business Shipping",
    description: "Solutions for businesses with recurring or larger shipping requirements.",
    tile: "border-zinc-500/40 bg-zinc-500/15 text-zinc-400",
    glow: "bg-zinc-500",
    link: "text-zinc-400",
    hover: "hover:border-zinc-500/60",
    ring: "focus-visible:ring-zinc-500",
  },
];

// Pointer position drives a glow and a tilt through CSS custom properties. Set directly on the
// node rather than through state: this runs on every mousemove and must not re-render the list.
function trackPointer(event: React.PointerEvent<HTMLButtonElement>) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  card.style.setProperty("--x", `${x * 100}%`);
  card.style.setProperty("--y", `${y * 100}%`);
  card.style.setProperty("--rx", `${(0.5 - y) * 7}deg`);
  card.style.setProperty("--ry", `${(x - 0.5) * 7}deg`);
  card.style.setProperty("--ty", "-6px");
}

function releasePointer(event: React.PointerEvent<HTMLButtonElement>) {
  const card = event.currentTarget;
  card.style.setProperty("--rx", "0deg");
  card.style.setProperty("--ry", "0deg");
  card.style.setProperty("--ty", "0px");
}

export function MarketingServices() {
  const gate = useAuthGate();

  return (
    <section id="services" className="bg-background py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="What we do"
          title="Logistics solutions built around your shipment"
          description="Whatever you're sending, wherever it's going — we've got a service built for it."
        />

        {/* Below sm the cards are a swipeable snap rail rather than a stack of four full-width
            blocks — sideways is the natural gesture here and it keeps the section one screen tall.
            From sm up it's the ordinary grid. */}
        <div className="mt-12 -mx-6 flex snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {SERVICES.map((service, i) => (
            <Reveal
              key={service.title}
              from={i % 2 === 0 ? "left" : "right"}
              delay={i * 90}
              className="min-w-[78%] snap-start sm:min-w-0"
            >
              <button
                onClick={() => gate("/quote")}
                onPointerMove={trackPointer}
                onPointerLeave={releasePointer}
                className={`group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111113] p-5 text-left shadow-[0_20px_45px_-28px_rgba(0,0,0,0.95)] transition-transform duration-300 ease-out [transform:perspective(900px)_translateY(var(--ty,0px))_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] hover:shadow-[0_30px_60px_-28px_rgba(0,0,0,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-reduce:[transform:none] ${service.hover} ${service.ring}`}
              >
                {/* Placeholder art dimmed almost to texture — the card is type-led now, and the
                    image only supplies depth behind the accent wash. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.18] transition-opacity duration-500 group-hover:opacity-30"
                >
                  <AssetImage
                    src={service.image.src}
                    alt=""
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 80vw"
                    className="scale-105 grayscale transition-transform duration-700 group-hover:scale-110"
                  />
                </span>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111113] via-[#111113]/85 to-[#111113]/40"
                />
                {/* Glow that follows the cursor across the card. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(220px_circle_at_var(--x,50%)_var(--y,50%),rgba(255,255,255,0.12),transparent_65%)]"
                />
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full opacity-20 blur-3xl transition-opacity duration-500 group-hover:opacity-40 ${service.glow}`}
                />

                <span
                  className={`relative flex h-11 w-11 items-center justify-center rounded-xl border ${service.tile}`}
                >
                  <service.icon className="h-5 w-5" aria-hidden />
                </span>

                <h3 className="relative mt-5 text-base font-semibold text-white">
                  {service.title}
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-white/60">
                  {service.description}
                </p>

                <span
                  className={`relative mt-5 inline-flex items-center gap-1.5 text-sm font-medium ${service.link}`}
                >
                  Learn more
                  <ArrowUpRight
                    className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
