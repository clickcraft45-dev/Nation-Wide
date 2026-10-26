export type AnnouncementKind = "EVENT" | "OFFER";

/** An event or sale offer shown on the public site (/events, /offers and the top banner). */
export interface AnnouncementDto {
  id: string;
  kind: AnnouncementKind;
  title: string;
  slug: string;
  summary: string;
  body: string | null;
  location: string | null;
  startsAt: string | null; // ISO 8601
  endsAt: string | null; // ISO 8601
  couponCode: string | null;
  isPublished: boolean;
  showBanner: boolean;
  updatedAt: string; // ISO 8601
}

export interface SaveAnnouncementDto {
  kind: AnnouncementKind;
  title: string;
  slug?: string;
  summary: string;
  body?: string | null;
  location?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  couponCode?: string | null;
  isPublished?: boolean;
  showBanner?: boolean;
}

/** Whether a published offer or event has not ended yet. */
export function isAnnouncementLive(a: Pick<AnnouncementDto, "endsAt">, now: Date = new Date()): boolean {
  return !a.endsAt || new Date(a.endsAt).getTime() >= now.getTime();
}
