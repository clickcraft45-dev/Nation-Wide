import { MessageCircle, Phone } from "lucide-react";
import { CONTACT_PHONE, CONTACT_WHATSAPP, WHATSAPP_GREETING } from "@/lib/constants/contact";
import { cn } from "@/lib/utils/cn";

const digits = (n: string) => n.replace(/[^\d]/g, "");

/**
 * Call and WhatsApp, hanging from the bottom edge of the pinned navbar so they stay on screen
 * while the page scrolls. Rendered inside the fixed header, so it moves with the bar and never
 * covers the content a visitor is reading the way a floating bubble in the corner does.
 */
export function ContactTab({ className }: { className?: string }) {
  const whatsappHref = `https://wa.me/${digits(CONTACT_WHATSAPP)}?text=${encodeURIComponent(WHATSAPP_GREETING)}`;
  const button =
    "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-[transform,opacity] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none";

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 top-full flex justify-end sm:right-6",
        className,
      )}
    >
      <div
        role="group"
        aria-label="Talk to us"
        className="pointer-events-auto flex items-center gap-1.5 rounded-b-2xl border border-t-0 border-border/70 bg-card/90 px-1.5 pb-1.5 pt-1 shadow-[0_10px_24px_-14px_rgba(11,11,12,0.35)] backdrop-blur-xl"
      >
        <a
          href={`tel:${CONTACT_PHONE.replace(/\s+/g, "")}`}
          aria-label={`Call us on ${CONTACT_PHONE}`}
          className={cn(button, "bg-background text-foreground ring-1 ring-border hover:bg-muted")}
        >
          <Phone className="h-4 w-4" aria-hidden />
          Call us
        </a>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Message us on WhatsApp (opens WhatsApp)"
          className={cn(button, "bg-foreground text-background hover:opacity-90")}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          WhatsApp
        </a>
      </div>
    </div>
  );
}
