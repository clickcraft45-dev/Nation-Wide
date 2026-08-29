"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * The element id a link points at *within the current page*, or null if the browser should just
 * follow it. Links to another route's anchor (/#faqs while on /terms) must navigate normally —
 * scrolling the current page to an id that happens to match would strand the visitor.
 */
export function sameDocumentHash(href: string | null, pathname: string): string | null {
  if (!href) return null;
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) return null;

  const path = href.slice(0, hashIndex);
  const id = href.slice(hashIndex + 1);
  if (id === "") return null;
  if (path === "") return id;
  return path === pathname ? id : null;
}

// Inertial scrolling for the marketing pages, plus smooth in-page anchor jumps.
//
// Mounted only on the public pages — the dashboards are dense, scannable tables where hijacking
// the scroll wheel would be an active annoyance. Renders nothing.
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    const lenis = new Lenis({ duration: 1.05, touchMultiplier: 1.6 });
    let frame = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });

    // Lenis owns the scroll position, so a native anchor jump would teleport past it. Hand same-page
    // hash links to lenis instead, offset to clear the sticky navbar.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      const id = sameDocumentHash(anchor.getAttribute("href"), window.location.pathname);
      if (!id) return;

      const target = document.getElementById(id);
      if (!target) return;

      event.preventDefault();
      lenis.scrollTo(target, { offset: -72 });
      history.pushState(null, "", `#${id}`);
    };

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
