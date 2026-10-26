import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { BackLink } from "@/components/ui/back-link";
import { fetchAnnouncement, formatAnnouncementDates, paragraphs } from "@/lib/announcements";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await fetchAnnouncement((await params).slug);
  if (!event) return { title: "Event not found", robots: { index: false } };
  return {
    title: event.title,
    description: event.summary,
    alternates: { canonical: `/events/${event.slug}` },
  };
}

export default async function EventPage({ params }: Props) {
  const event = await fetchAnnouncement((await params).slug);
  // Offers live on /offers; an offer slug here is a hand-typed URL, not a link the site made.
  if (!event || event.kind !== "EVENT") notFound();
  const dates = formatAnnouncementDates(event);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-24">
        <BackLink href="/events">All events</BackLink>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {event.title}
        </h1>
        {(dates || event.location) && (
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {dates && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden />
                {dates}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" aria-hidden />
                {event.location}
              </span>
            )}
          </p>
        )}
        <p className="mt-8 text-lg leading-relaxed text-foreground">{event.summary}</p>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
          {paragraphs(event.body).map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
