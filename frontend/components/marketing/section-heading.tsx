import { Reveal } from "@/components/marketing/reveal";
import { TypeReveal } from "@/components/ui/type-reveal";
import { cn } from "@/lib/utils/cn";

/**
 * Shared section header: optional eyebrow, title, description, and a rule that wipes in from the
 * left as the section arrives. The wipe is <Reveal from="left"> inside an overflow-hidden box —
 * the same scroll machinery as everything else, no second mechanism to maintain.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" ? "mx-auto max-w-xl text-center" : "max-w-xl text-left",
        className,
      )}
    >
      {eyebrow && (
        <p className="mb-4 inline-flex items-center rounded-full border border-border bg-muted px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
          {eyebrow}
        </p>
      )}

      <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h2>

      <div
        className={cn(
          "mt-5 overflow-hidden",
          align === "center" ? "mx-auto w-16" : "w-16",
        )}
      >
        <Reveal from="left">
          <span aria-hidden className="block h-0.5 rounded-full bg-primary" />
        </Reveal>
      </div>

      {description && (
        <TypeReveal text={description} className="mt-5 text-muted-foreground" />
      )}
    </div>
  );
}
