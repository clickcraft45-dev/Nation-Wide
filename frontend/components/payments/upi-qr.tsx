"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { upiPayLink } from "@/lib/upi";
import { cn } from "@/lib/utils/cn";

const formatInr = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * A UPI QR for the customer to scan, drawn here from the UPI ID rather than a printed sticker, so
 * it can carry the exact amount: the customer's app opens with it filled in and they only confirm.
 * The UPI ID is printed under it in full for anyone paying by typing it in.
 */
export function UpiQr({
  upiId,
  payeeName,
  amount,
  note,
  className,
}: {
  upiId: string;
  payeeName?: string | null;
  amount?: number;
  note?: string;
  className?: string;
}) {
  const link = upiPayLink({ upiId, payeeName, amount, note });
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Black on white with a quiet zone: what every UPI app's scanner reads first time, in daylight.
    QRCode.toString(link, { type: "svg", margin: 2, errorCorrectionLevel: "M" })
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (insecure context): the ID is on screen to read out.
    }
  }

  return (
    <figure className={cn("flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-4", className)}>
      {svg ? (
        // eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimise
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt={`UPI QR code to pay ${amount ? formatInr(amount) : ""} to ${upiId}`}
          className="h-56 w-56"
          width={224}
          height={224}
        />
      ) : (
        <div className="h-56 w-56 animate-pulse rounded-lg bg-muted" aria-hidden />
      )}
      <figcaption className="w-full space-y-1 text-center">
        {amount !== undefined && amount > 0 && (
          <p className="text-2xl font-semibold tabular-nums text-foreground">{formatInr(amount)}</p>
        )}
        {payeeName && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{payeeName}</p>}
        <button
          type="button"
          onClick={copy}
          className="mx-auto inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-md px-2 font-mono text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted"
          aria-label={`Copy UPI ID ${upiId}`}
        >
          <span className="break-all">{upiId}</span>
          {copied ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </figcaption>
    </figure>
  );
}
