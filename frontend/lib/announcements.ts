import type { AnnouncementDto, AnnouncementKind } from "@nationwide/shared-types";
import { API_BASE_URL } from "@/lib/api-client";

// Server-side reads for /events and /offers. A failure returns nothing rather than throwing: a
// marketing page must not 500 because the API is briefly unreachable. Five minutes matches the
// API's own Cache-Control, so an admin toggle reaches the site within about that long.
const REVALIDATE_SECONDS = 300;

export async function fetchAnnouncements(kind: AnnouncementKind): Promise<AnnouncementDto[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/announcements?kind=${kind}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    return res.ok ? ((await res.json()) as AnnouncementDto[]) : [];
  } catch {
    return [];
  }
}

export async function fetchAnnouncement(slug: string): Promise<AnnouncementDto | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/announcements/${encodeURIComponent(slug)}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    return res.ok ? ((await res.json()) as AnnouncementDto) : null;
  } catch {
    return null;
  }
}

const DAY = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

/** "12 Nov 2026", "12 Nov 2026 to 14 Nov 2026", "Until 14 Nov 2026", or null. */
export function formatAnnouncementDates(a: Pick<AnnouncementDto, "startsAt" | "endsAt">): string | null {
  const start = a.startsAt ? DAY.format(new Date(a.startsAt)) : null;
  const end = a.endsAt ? DAY.format(new Date(a.endsAt)) : null;
  if (start && end) return start === end ? start : `${start} to ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return null;
}

/** Blank lines separate paragraphs; that is the whole formatting language. */
export function paragraphs(body: string | null): string[] {
  return (body ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
