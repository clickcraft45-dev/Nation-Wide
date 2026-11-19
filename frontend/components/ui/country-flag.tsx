import { cn } from "@/lib/utils/cn";

/**
 * Flag for an ISO 3166-1 alpha-2 code, as a self-hosted SVG from public/flags (flag-icons, MIT,
 * see public/flags/LICENSE.txt). Not emoji: Windows has no flag emoji and draws "AF" in their
 * place, and not a CDN: the CSP allows images from our own origin only. Decorative, since the
 * country name always sits next to it. Renders nothing for a code that is not two letters.
 */
// Older or carrier-specific codes still on some country rows, mapped to today's ISO flag.
const LEGACY_CODES: Record<string, string> = {
  uk: "gb", // United Kingdom
  fx: "fr", // Metropolitan France
  dy: "bj", // Dahomey, now Benin
  hv: "bf", // Upper Volta, now Burkina Faso
  yu: "rs", // Yugoslavia, now Serbia
};

export function CountryFlag({ code, className }: { code: string | null | undefined; className?: string }) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  const lower = code.toLowerCase();
  const file = LEGACY_CODES[lower] ?? lower;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 4:3 SVG; next/image adds nothing here
    <img
      src={`/flags/${file}.svg`}
      alt=""
      aria-hidden
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
      className={cn(
        "inline-block h-[15px] w-5 shrink-0 rounded-[2px] object-cover align-[-2px] ring-1 ring-black/10",
        className,
      )}
      // No onError fallback: this also renders in server components, which cannot attach handlers.
      // public/flags covers every ISO 3166-1 alpha-2 code, and alt="" keeps a miss invisible.
    />
  );
}
