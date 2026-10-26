import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { buttonVariants } from "@/components/ui/button";
import { fetchAnnouncements, formatAnnouncementDates, paragraphs } from "@/lib/announcements";

export const metadata: Metadata = {
  title: "Offers",
  description: "Current discounts on international courier and cargo from NationWide Logistics.",
  alternates: { canonical: "/offers" },
};

/**
 * The sale page. Admins switch it on by publishing an offer under Marketing -> Events & offers;
 * the API only returns offers that are published and inside their dates, so an ended sale drops
 * off by itself.
 */
export default async function OffersPage() {
  const offers = await fetchAnnouncements("OFFER");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Offers</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Quote your shipment, then give the code to our team when you pay.
        </p>

        {offers.length === 0 ? (
          <div className="mt-12 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No offers are running right now.</p>
            <Link href="/quote" className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-4" })}>
              Get a quote
            </Link>
          </div>
        ) : (
          <ul className="mt-12 space-y-5">
            {offers.map((offer) => {
              const dates = formatAnnouncementDates(offer);
              return (
                <li key={offer.id} className="rounded-xl border border-border bg-card p-6">
                  <h2 className="text-xl font-semibold text-foreground">{offer.title}</h2>
                  {dates && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-4 w-4" aria-hidden />
                      {dates}
                    </p>
                  )}
                  <p className="mt-3 text-[15px] leading-relaxed text-foreground">{offer.summary}</p>
                  {paragraphs(offer.body).map((p, i) => (
                    <p key={i} className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {p}
                    </p>
                  ))}
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {offer.couponCode && (
                      <p className="rounded-lg border border-dashed border-foreground/40 px-3 py-2 text-sm">
                        Code <span className="ml-1 font-mono font-semibold tracking-wider">{offer.couponCode}</span>
                      </p>
                    )}
                    <Link href="/quote" className={buttonVariants({ size: "sm" })}>
                      Get a quote
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
