import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { fetchBanner, formatAnnouncementDates } from "@/lib/announcements";

/**
 * The homepage's version of the site banner: whatever offer or event an admin switched
 * "Site banner" on for under Marketing -> Events & offers, given a full band under the hero.
 * Nothing live, nothing rendered, so the page needs no edit before or after a festival sale.
 */
export async function MarketingEventSpotlight() {
  const item = await fetchBanner();
  if (!item) return null;

  const isOffer = item.kind === "OFFER";
  const dates = formatAnnouncementDates(item);
  const href = isOffer ? "/offers" : `/events/${item.slug}`;

  return (
    <section aria-labelledby="spotlight-title" className="bg-background pt-16 sm:pt-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative isolate grid gap-8 overflow-hidden rounded-3xl bg-[#0b0b0c] p-7 text-white sm:p-10 md:grid-cols-[1fr_auto] md:items-center md:gap-12">
          {/* The one place the brand red shows as light: a glow behind the card's corner. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-brand-red/45 blur-[110px]"
          />

          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
              <span className="font-medium text-white">{isOffer ? "Offer" : "Event"}</span>
              {dates && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  {dates}
                </span>
              )}
              {item.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" aria-hidden />
                  {item.location}
                </span>
              )}
            </p>
            <h2
              id="spotlight-title"
              className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {item.title}
            </h2>
            <p className="mt-3 max-w-[60ch] text-pretty text-[15px] leading-relaxed text-white/70">
              {item.summary}
            </p>
            <Link
              href={href}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-[#0b0b0c] transition-[transform,background-color] hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
            >
              {isOffer ? "See the offer" : "Event details"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {item.couponCode && (
            <div className="rounded-2xl border border-dashed border-white/30 bg-white/5 px-7 py-6 text-center md:min-w-56">
              <p className="text-xs font-medium text-white/60">Quote this code when you pay</p>
              <p className="mt-2 select-all font-mono text-2xl font-semibold tracking-wider sm:text-3xl">
                {item.couponCode}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
