"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, EllipsisVertical, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The "install this app" invitation, plus the service-worker registration that makes an install
 * possible at all.
 *
 * Two different platforms, because there is no one way to do this:
 *  - Chrome/Edge/Android fire `beforeinstallprompt`. That event is the ONLY handle on the real
 *    install dialog, it fires once, and it cannot be summoned later — so it is captured on mount
 *    and held until the user acts on it.
 *  - iOS Safari fires nothing and has no programmatic install. The only route is Share → Add to
 *    Home Screen, so iOS gets instructions instead of a button that could not work.
 *
 * It offers itself once (a dismissal is remembered), and can be reopened any time from an
 * <InstallAppButton> — a one-time banner alone left no way back after "Not now". Never shown
 * automatically to someone already running the installed app.
 */

export const DISMISSED_KEY = "nw.install-prompt-dismissed";
// Long enough that a "not now" is respected, short enough that someone who kept using the site
// for a month is asked again.
export const DISMISS_DAYS = 30;

// Fired by <InstallAppButton>; the one mounted <InstallPrompt> listens for it.
const OPEN_EVENT = "nw:open-install-prompt";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function wasRecentlyDismissed(): boolean {
  try {
    const at = window.localStorage.getItem(DISMISSED_KEY);
    if (!at) return false;
    return Date.now() - Number(at) < DISMISS_DAYS * 86_400_000;
  } catch {
    // Private mode or blocked storage. Showing the prompt is the safer failure.
    return false;
  }
}

/** True when the page is already running as an installed app, where an install offer is noise. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, non-standard flag — the media query above is false in an installed iOS app.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac; a touch screen is what gives it away.
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
  );
}

/**
 * One-shot environment reads, routed through useSyncExternalStore rather than an effect so the
 * first client render already has the answer. `subscribe` registers nothing, and the server
 * snapshot (`false`) is what stops the markup disagreeing at hydration — the server has no
 * userAgent or localStorage.
 */
const subscribeNever = () => () => {};

function useNeedsIosInstructions(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => isIos() && !isStandalone() && !wasRecentlyDismissed(),
    () => false,
  );
}

function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribeNever, isStandalone, () => false);
}

/** Opens the install instructions on demand, whatever was dismissed before. */
export function openInstallPrompt() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** A permanent "Add to Home Screen" entry point. Renders nothing inside the installed app. */
export function InstallAppButton({ className }: { className?: string }) {
  const installed = useIsStandalone();
  if (installed) return null;
  return (
    <button type="button" onClick={openInstallPrompt} className={className}>
      <Smartphone className="h-4 w-4" aria-hidden />
      Add to Home Screen
    </button>
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Opened from an <InstallAppButton>: shown regardless of the earlier dismissal.
  const [openedManually, setOpenedManually] = useState(false);
  const autoIosHint = useNeedsIosInstructions() && !dismissed;

  useEffect(() => {
    // Registered from the client after mount, so it never blocks first paint. Failure is fine:
    // without a service worker the site still works, it just is not installable.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onOpen = () => setOpenedManually(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    // iOS never fires this event; that path is handled by the instructions below.
    if (isStandalone() || isIos()) return;

    const onBeforeInstall = (event: Event) => {
      // Without this Chrome shows its own mini-infobar and this banner would be the second ask.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Fires when the install completes by any route, including the browser's own menu.
    const onInstalled = () => {
      setDeferred(null);
      setOpenedManually(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function close() {
    // Only an automatic offer records "not now" — closing one you opened yourself shouldn't
    // silence the next automatic ask.
    if (!openedManually) {
      try {
        window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
      } catch {
        // Nothing to do — it will ask again next visit, which is the tolerable failure.
      }
      setDismissed(true);
    }
    setOpenedManually(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    // The event is single-use whatever the answer, so it is dropped either way. If they declined,
    // the browser will offer its own install affordance later.
    await deferred.userChoice;
    setDeferred(null);
    setOpenedManually(false);
  }

  // The automatic Chrome offer respects an earlier "not now"; a manual open always shows.
  const autoChromeOffer = deferred !== null && !dismissed && !wasRecentlyDismissedSafe();
  if (!openedManually && !autoChromeOffer && !autoIosHint) return null;

  const mode = isStandalone()
    ? "installed"
    : deferred
      ? "button"
      : isIos()
        ? "ios"
        : "menu";

  return (
    <div
      role="dialog"
      aria-label="Install the NationWide app"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:right-4"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 40px icon from /public needs
            no optimisation pipeline, and next/image here would add a request to render it. */}
        <img
          src="/assets/icons/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {mode === "installed" ? "You're using the app" : "Add NationWide to your Home Screen"}
          </p>
          {mode === "installed" && (
            <p className="mt-1 text-sm text-muted-foreground">
              NationWide is already installed on this device.
            </p>
          )}
          {mode === "ios" && (
            <ol className="mt-1 space-y-1 text-sm text-muted-foreground">
              <li>
                1. Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" />{" "}
                Share in the browser bar.
              </li>
              <li>
                2. Scroll and tap{" "}
                <span className="whitespace-nowrap font-medium text-foreground">
                  <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden /> Add to
                  Home Screen
                </span>
                .
              </li>
              <li>3. Tap Add — the NW icon appears on your Home Screen.</li>
            </ol>
          )}
          {mode === "menu" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Open your browser menu{" "}
              <EllipsisVertical className="inline h-4 w-4 align-text-bottom" aria-label="menu" />{" "}
              and choose <span className="font-medium text-foreground">Install app</span> or{" "}
              <span className="font-medium text-foreground">Add to Home screen</span>.
            </p>
          )}
          {mode === "button" && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Book pickups and track shipments in one tap.
              </p>
              <Button size="sm" className="mt-3" onClick={install}>
                <Download className="h-4 w-4" aria-hidden />
                Install
              </Button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="-m-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// Render-time read of the dismissal; safe here because the banner only ever renders client-side
// after an event (beforeinstallprompt / a manual open), never in the server pass.
function wasRecentlyDismissedSafe(): boolean {
  return typeof window !== "undefined" && wasRecentlyDismissed();
}
