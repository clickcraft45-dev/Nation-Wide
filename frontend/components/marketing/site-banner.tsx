"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { AnnouncementDto } from "@nationwide/shared-types";
import { API_BASE_URL } from "@/lib/api-client";

const BANNER_DISMISSED_KEY = "nw-banner-dismissed";

/**
 * The live sale or event an admin switched "Site banner" on for, if any. Fetched in the browser
 * so every surface gets it without each one threading it through; the API response is
 * publicly cacheable for five minutes. Dismissal lasts the browser session and is keyed by
 * version, so editing the banner shows it again.
 */
export function useSiteBanner() {
  const [banner, setBanner] = useState<AnnouncementDto | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/announcements/banner`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { banner: AnnouncementDto | null } | null) => {
        const b = data?.banner;
        if (cancelled || !b) return;
        try {
          if (sessionStorage.getItem(BANNER_DISMISSED_KEY) === `${b.id}:${b.updatedAt}`) return;
        } catch {
          // Storage blocked: show it, the dismiss button still works for this page view.
        }
        setBanner(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  function dismiss() {
    if (!banner) return;
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, `${banner.id}:${banner.updatedAt}`);
    } catch {}
    setBanner(null);
  }
  return { banner, dismiss };
}

/** Self-fetching strip, for surfaces that don't need to know whether it is showing. */
export function SiteBanner() {
  const { banner, dismiss } = useSiteBanner();
  return banner ? <SiteBannerStrip banner={banner} onDismiss={dismiss} /> : null;
}

/** The black announcement strip. Used by the marketing navbar and the customer portal. */
export function SiteBannerStrip({
  banner,
  onDismiss: dismiss,
}: {
  banner: AnnouncementDto;
  onDismiss: () => void;
}) {
  return (
    <div className="shrink-0 bg-[#0b0b0c] text-white">
      <div className="mx-auto flex h-11 max-w-6xl items-center gap-3 px-6 text-sm">
        <Link
          href={banner.kind === "OFFER" ? "/offers" : `/events/${banner.slug}`}
          className="flex min-w-0 flex-1 items-baseline gap-2 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {/* The title gives way first on a narrow phone; the code is the part people need. */}
          <span className="truncate font-medium">{banner.title}</span>
          {banner.couponCode && (
            <span className="shrink-0 font-mono font-semibold">{banner.couponCode}</span>
          )}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white active:bg-white/20"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
