"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

/**
 * A dashboard shortcut that shows it is working.
 *
 * These targets all fetch on mount, so a plain <Link> left the tile looking untouched for the
 * second or two before the next page painted — and the obvious response to that is to tap again.
 * router.push inside a transition gives us the pending flag a Link does not expose.
 */
export function ActionTile({
  href,
  icon: Icon,
  label,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.push(href))}
      disabled={isPending}
      aria-busy={isPending}
      className={cn(
        "glass glass-interactive glass-sheen flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {isPending ? (
        <Spinner className="text-primary" />
      ) : (
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      )}
      <span className="text-xs font-medium text-foreground">
        {isPending ? "Opening…" : label}
      </span>
    </button>
  );
}
