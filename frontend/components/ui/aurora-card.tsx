"use client";

import type { ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { TEXT_LOGO } from "@/lib/constants/assets";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";

/**
 * Aurora glass card — dark base, white corner sheen, gradient hairline border. Purely
 * presentational: the caller owns the values and the copy action.
 */

export const AURORA_THEMES = {
  aurora: {
    name: "Aurora",
    background: "#110026",
    glow: "rgba(245,62,2,0.35)",
    border:
      "linear-gradient(90deg, rgba(140,68,36,0.5) 0%, rgba(245,62,2,0.4) 25%, rgba(255,182,0,0.3) 50%, rgba(255,255,255,0.6) 100%)",
  },
  noir: {
    name: "Noir",
    background: "#0A0A0A",
    glow: "rgba(255,255,255,0.08)",
    border:
      "linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.7) 100%)",
  },
  crimson: {
    name: "Crimson",
    background: "#3D0810",
    glow: "rgba(165,24,44,0.75)",
    border:
      "linear-gradient(90deg, rgba(127,16,32,0.6) 0%, rgba(214,31,53,0.45) 40%, rgba(255,255,255,0.65) 100%)",
  },
} as const;

export type AuroraTheme = keyof typeof AURORA_THEMES;

/** 7788123456 -> "7788 1234 56". Grouping only; the value itself is never altered. */
function groupForReading(value: string): string {
  return value.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50";

export function AuroraCard({
  theme = "crimson",
  carrier,
  reference,
  status,
  customerName,
  destination,
  awb,
  copied = false,
  onCopy,
  className,
}: {
  theme?: AuroraTheme;
  carrier: string;
  /** Our internal NW number. */
  reference: string;
  status?: ReactNode;
  customerName: string | null;
  destination: string | null;
  /** Carrier AWB; null renders the empty •••• slot. */
  awb: string | null;
  copied?: boolean;
  onCopy?: () => void;
  className?: string;
}) {
  const t = AURORA_THEMES[theme];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] p-6 text-[#F1F1F1] shadow-xl transition-colors duration-700 sm:p-8",
        className,
      )}
      style={{
        backgroundColor: t.background,
        backgroundImage: `radial-gradient(100% 100% at 100% 0%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 100%), radial-gradient(80% 90% at 0% 100%, ${t.glow} 0%, transparent 100%)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[28px] p-[2px] opacity-80"
        style={{
          background: t.border,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
        }}
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-4">
        {/* Text logo as a mask so it inks white on every theme. */}
        <span
          role="img"
          aria-label={TEXT_LOGO.alt}
          className="block h-7 w-[123px] shrink-0 bg-white sm:h-8 sm:w-[141px]"
          style={{
            maskImage: `url(${TEXT_LOGO.src})`,
            WebkitMaskImage: `url(${TEXT_LOGO.src})`,
            maskSize: "contain",
            WebkitMaskSize: "contain",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
          }}
        />
        <Logo variant="icon" tone="reverse" size="lg" className="shrink-0 opacity-90" />
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
          {carrier}
        </p>
        <p className="font-mono text-xs text-white/80">{reference}</p>
        {status}
      </div>

      <div className="relative mt-8 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className={LABEL}>Customer</p>
          <p className="truncate text-base font-semibold uppercase">{customerName ?? "—"}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className={LABEL}>Destination</p>
          <p className="truncate text-base font-semibold">{destination ?? "—"}</p>
        </div>
      </div>

      <div className="relative mt-4">
        <p className={LABEL}>AWB / tracking number</p>
        {awb ? (
          <button
            type="button"
            onClick={onCopy}
            className="group mt-1 flex max-w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label={copied ? "AWB copied" : `Copy AWB ${awb}`}
            title="Click to copy"
          >
            <span className="truncate text-2xl font-semibold tracking-[0.15em] sm:text-3xl">
              {groupForReading(awb)}
            </span>
            {copied ? (
              <Check className="h-5 w-5 shrink-0 text-[#FFB600]" aria-hidden />
            ) : (
              <Copy className="h-5 w-5 shrink-0 text-white/50 group-hover:text-white" aria-hidden />
            )}
          </button>
        ) : (
          <p className="mt-1 text-2xl tracking-[0.35em] text-white/30 sm:text-3xl">
            •••• •••• ••••
          </p>
        )}
      </div>
    </div>
  );
}
