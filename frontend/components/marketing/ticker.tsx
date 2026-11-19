"use client";

import { useEffect, useState } from "react";
import type { AnnouncementDto } from "@nationwide/shared-types";
import { API_BASE_URL } from "@/lib/api-client";

/**
 * The rolling text strip on the homepage: every live "Rolling text" line an admin published under
 * Events and offers, joined and scrolled right to left. Fetched in the browser, like the site
 * banner, so the homepage stays static. Renders nothing until there is something to say.
 */
export function MarketingTicker() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/announcements?kind=TICKER`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: AnnouncementDto[]) => {
        if (!cancelled) setLines(rows.map((r) => r.title.trim()).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (lines.length === 0) return null;

  // Repeat short content so one copy is always wider than the screen; the second copy (hidden
  // from screen readers) is what makes the -50% loop seamless.
  const totalChars = lines.join("").length;
  const repeat = Math.max(1, Math.ceil(160 / Math.max(totalChars, 1)));
  const run = Array.from({ length: repeat }, () => lines).flat();
  // Roughly constant reading speed whatever the length: about 7 characters a second.
  const seconds = Math.min(120, Math.max(18, (totalChars * repeat) / 7));

  const track = (hidden: boolean) => (
    <ul
      key={hidden ? "copy" : "main"}
      aria-hidden={hidden || undefined}
      className="ticker-track animate-marquee flex shrink-0 items-center"
      style={{ animationDuration: `${seconds}s` }}
    >
      {run.map((line, i) => (
        <li key={i} className="flex shrink-0 items-center whitespace-nowrap">
          <span className="px-6">{line}</span>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white/40" />
        </li>
      ))}
    </ul>
  );

  return (
    <section
      aria-label="Announcements"
      className="ticker relative overflow-hidden border-y border-white/10 bg-[#0b0b0c] text-white"
    >
      <div className="ticker-viewport flex h-11 items-center text-sm font-medium">
        {track(false)}
        {track(true)}
      </div>
    </section>
  );
}
