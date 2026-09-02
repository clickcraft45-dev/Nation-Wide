"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

export function DialogContent({
  children,
  className,
  title,
  description,
}: {
  children: ReactNode;
  className?: string;
  title: string;
  description?: string;
}) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=open]:fade-in" />
      <RadixDialog.Content
        className={cn(
          // `w-[calc(100%-2rem)]` rather than `w-full`: `position: fixed` sizes % against the
          // viewport, so a bare w-full runs flush to the screen edge on a phone. The 1rem gutter
          // holds until a consumer's max-w-* (max-w-md by default) takes over on wider screens.
          //
          // `max-h-[85vh]` + `overflow-y-auto`: a long form (company settings has 15+ fields and
          // five textareas) is taller than most viewports. Without these two, the overflow does
          // not scroll — position:fixed content that overflows its box is simply unreachable
          // past the viewport edge, with no scrollbar and no way to reach Save/Cancel.
          "glass-raised fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-6 focus:outline-none",
          className,
        )}
      >
        <RadixDialog.Title className="text-base font-semibold text-foreground">
          {title}
        </RadixDialog.Title>
        {description && (
          <RadixDialog.Description className="mt-1 text-sm text-muted-foreground">
            {description}
          </RadixDialog.Description>
        )}
        <div className="mt-4">{children}</div>
        <RadixDialog.Close
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <X className="h-4 w-4" aria-hidden />
        </RadixDialog.Close>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export const DialogClose = RadixDialog.Close;
