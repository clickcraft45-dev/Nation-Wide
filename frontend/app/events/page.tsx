import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import type { AnnouncementDto } from "@nationwide/shared-types";
import { isAnnouncementLive } from "@nationwide/shared-types";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { fetchAnnouncements, formatAnnouncementDates } from "@/lib/announcements";

export const metadata: Metadata = {
  title: "Events and news",
  description:
    "Where NationWide Logistics will be, holiday schedules and service updates for international shipping from India.",
  alternates: { canonical: "/events" },
};

function EventRow({ event }: { event: AnnouncementDto }) {
  const dates = formatAnnouncementDates(event);
  return (
    <li>
      <Link
        href={`/events/${event.slug}`}
        className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground active:bg-muted"
      >
        <h3 className="text-lg font-semibold text-foreground group-hover:underline">{event.title}</h3>
        {(dates || event.location) && (
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{event.summary}</p>
      </Link>
    </li>
  );
}

export default async function EventsPage() {
  const events = await fetchAnnouncements("EVENT");
  const upcoming = events.filter((e) => isAnnouncementLive(e)).reverse();
  const past = events.filter((e) => !isAnnouncementLive(e));

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <MarketingNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Events and news
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Where to meet us, holiday schedules and changes to our services.
        </p>

        {events.length === 0 && (
          <p className="mt-12 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing to announce right now. Check back soon.
          </p>
        )}

        {upcoming.length > 0 && (
          <section className="mt-12">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Upcoming</h2>
            <ul className="mt-4 space-y-4">
              {upcoming.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section className="mt-12">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Past</h2>
            <ul className="mt-4 space-y-4">
              {past.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ul>
          </section>
        )}
      </main>
      <MarketingFooter />
    </div>
  );
}
