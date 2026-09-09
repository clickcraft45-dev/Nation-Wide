"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
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
 * A dismissal is remembered, so this asks once rather than becoming a permanent banner. It is
 * also never shown to someone already running the installed app.
 */

export const DISMISSED_KEY = "nw.install-prompt-dismissed";
// Long enough that a "not now" is respected, short enough that someone who kept using the site
// for a month is asked again.
export const DISMISS_DAYS = 30;

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
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Whether this device needs the manual iOS instructions, read through useSyncExternalStore.
 *
 * It is a one-shot environment read, not a subscription, so `subscribe` registers nothing — but
 * routing it through this hook is what keeps it out of an effect. Deriving it in an effect would
 * render once without the banner and once with, and the server snapshot (`false`) is what stops
 * the markup disagreeing at hydration, since the server has no userAgent or localStorage.
 */
const subscribeNever = () => () => {};

function useNeedsIosInstructions(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => isIos() && !isStandalone() && !wasRecentlyDismissed(),
    () => false,
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const showIosHint = useNeedsIosInstructions() && !dismissed;

  useEffect(() => {
    // Registered from the client after mount, so it never blocks first paint. Failure is fine:
    // without a service worker the site still works, it just is not installable.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    // iOS never fires this event; that path is handled by useNeedsIosInstructions above.
    if (isStandalone() || wasRecentlyDismissed() || isIos()) return;

    const onBeforeInstall = (event: Event) => {
      // Without this Chrome shows its own mini-infobar and this banner would be the second ask.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Fires when the install completes by any route, including the browser's own menu.
    const onInstalled = () => setDeferred(null);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Nothing to do — it will ask again next visit, which is the tolerable failure.
    }
    setDeferred(null);
    setDismissed(true);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    // The event is single-use whatever the answer, so it is dropped either way. If they declined,
    // the browser will offer its own install affordance later.
    await deferred.userChoice;
    setDeferred(null);
  }

  if (!deferred && !showIosHint) return null;

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
          <p className="text-sm font-semibold text-foreground">Install NationWide</p>
          {showIosHint ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> then{" "}
              <span className="whitespace-nowrap">
                <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden /> Add to Home
                Screen
              </span>{" "}
              to track shipments straight from your home screen.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Add it to your home screen to book pickups and track shipments in one tap.
            </p>
          )}
          {!showIosHint && (
            <Button size="sm" className="mt-3" onClick={install}>
              <Download className="h-4 w-4" aria-hidden />
              Install
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="-m-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
