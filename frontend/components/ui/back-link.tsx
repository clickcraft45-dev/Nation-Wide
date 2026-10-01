"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * The one back link every nested page had inlined by hand.
 *
 * A plain click goes BACK through history rather than navigating to `href`, so returning from a
 * detail page lands on the list exactly as it was left — same tab, same filter, same scroll
 * position. Navigating to the href instead remounted the list at its defaults, which meant
 * re-picking the tab after every single record you opened.
 *
 * It stays a real anchor so right-click, middle-click and ctrl/cmd-click still open the list in
 * a new tab, and `href` remains the destination when there is no history to go back to — a
 * pasted link, or a page opened directly in a fresh tab.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        // Let the browser handle anything that is asking for a new tab/window.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}
