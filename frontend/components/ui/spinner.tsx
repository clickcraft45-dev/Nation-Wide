import { cn } from "@/lib/utils/cn";

const SIZES = {
  sm: "h-4 w-4 nw-spinner-sm",
  md: "h-5 w-5 nw-spinner-sm",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
} as const;

/**
 * The app's loading indicator.
 *
 * A swept conic gradient rather than lucide's dashed ring: the trailing fade reads as motion
 * even in the single frame a fast response leaves on screen, where a dashed circle just looks
 * like a static icon. Drawn in the brand red by default so a wait still looks like this product.
 *
 * Colour comes from `currentColor`, so it inherits inside buttons and muted text without a
 * variant for each case.
 */
export function Spinner({
  size = "md",
  className,
  label,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  /** Announced to screen readers. Omit inside a control that already says it is busy. */
  label?: string;
}) {
  return (
    <span
      className={cn("nw-spinner shrink-0", SIZES[size], className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/**
 * A centred wait for a whole page or panel. The label matters more than the animation: "Loading
 * your shipments" tells someone what is happening, where a bare spinner only says something is.
 */
export function PageLoader({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-1 flex-col items-center justify-center gap-3 py-16", className)}
      role="status"
    >
      <Spinner size="lg" className="text-[color:var(--brand-red)]" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
