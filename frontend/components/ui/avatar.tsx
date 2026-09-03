"use client";

import * as RadixAvatar from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils/cn";

export function Avatar({ label, className }: { label: string; className?: string }) {
  const initials = label
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <RadixAvatar.Root
      className={cn(
        "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground",
        className,
      )}
    >
      <RadixAvatar.Fallback delayMs={0}>{initials || "?"}</RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
