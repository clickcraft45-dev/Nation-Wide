import { HERO_IMAGE } from "@/lib/constants/assets";

// Art-directed hero image via <picture> — the browser evaluates the media query and fetches
// exactly one source for the current viewport, never both. next/image's `fill` mode can't express
// "swap to a differently-composed image at a breakpoint" without either component instance
// risking a fetch (one via `priority` forcing it regardless of display:none, the other via native
// lazy-load intersection), so this bypasses next/image for just this one responsive-swap case.
export function HeroPicture({ className }: { className?: string }) {
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={HERO_IMAGE.desktop.src} />
      <img
        src={HERO_IMAGE.mobile.src}
        alt={HERO_IMAGE.mobile.alt}
        fetchPriority="high"
        decoding="async"
        className={className}
      />
    </picture>
  );
}
