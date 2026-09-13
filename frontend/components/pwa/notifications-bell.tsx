"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BellOff, BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  disablePush,
  enablePush,
  pushState,
  syncPush,
  type PushState,
} from "@/lib/push";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";

const ASK_DISMISSED_KEY = "nw.notifications-ask-dismissed";
// A "not now" is respected for a few days, then asked again: for a partner, missing push means
// missing new pickup requests.
const ASK_AGAIN_DAYS = 3;

function askedRecently(): boolean {
  try {
    const at = window.localStorage.getItem(ASK_DISMISSED_KEY);
    return at !== null && Date.now() - Number(at) < ASK_AGAIN_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * The header bell: turns phone notifications on and off for this device.
 *
 * Customers get their shipment updates (the same ones sent on WhatsApp); pickup partners get a
 * notification the moment a pickup is assigned to them.
 */
export function NotificationsBell({ className }: { className?: string }) {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  // The permission ask. Browsers only show their permission dialog from a tap (Safari refuses
  // outright otherwise, Chrome buries it), so this banner offers the tap instead of calling
  // requestPermission() on page load.
  const [asking, setAsking] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    pushState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        if (next === "disabled" && !askedRecently()) setAsking(true);
        // Keep this device's subscription pointed at whoever is signed in now.
        if (next === "enabled") void syncPush().catch(() => undefined);
      })
      .catch(() => {
        if (!cancelled) setState("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismissAsk() {
    setAsking(false);
    try {
      window.localStorage.setItem(ASK_DISMISSED_KEY, String(Date.now()));
    } catch {
      // Asked again next visit — the tolerable failure.
    }
  }

  async function toggle() {
    setAsking(false);
    if (state === "unsupported") {
      showToast({
        variant: "error",
        title: "This browser can't show notifications.",
        description:
          "On iPhone, add NationWide to your Home Screen first (Share → Add to Home Screen), then turn them on from the app.",
      });
      return;
    }
    if (state === "denied") {
      showToast({
        variant: "error",
        title: "Notifications are blocked for this site.",
        description:
          "Allow them in your browser's site settings, then tap the bell again.",
      });
      return;
    }

    setBusy(true);
    try {
      const next =
        state === "enabled" ? await disablePush() : await enablePush();
      setState(next);
      if (next === "enabled") {
        showToast({
          variant: "success",
          title: "Notifications are on for this device.",
        });
      } else if (state === "enabled") {
        showToast({
          variant: "success",
          title: "Notifications are off for this device.",
        });
      } else if (next === "denied") {
        showToast({
          variant: "error",
          title: "Notifications were blocked.",
          description:
            "Allow them in your browser's site settings to get updates.",
        });
      }
    } catch (err) {
      showToast({
        variant: "error",
        title: "Couldn't turn on notifications.",
        description: errorMessage(
          err,
          err instanceof Error ? err.message : "Please try again.",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  const Icon =
    state === "enabled" ? BellRing : state === "denied" ? BellOff : Bell;
  const label =
    state === "enabled"
      ? "Turn off notifications"
      : state === "denied"
        ? "Notifications blocked"
        : "Turn on notifications";

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || state === "loading"}
        aria-label={label}
        aria-pressed={state === "enabled"}
        title={label}
        className={cn(
          "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          state === "enabled" && "text-foreground",
          className,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
        {state === "enabled" && (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success"
            aria-hidden
          />
        )}
      </button>
      {asking &&
        createPortal(
          <div
            role="dialog"
            aria-label="Turn on notifications"
            className="glass-raised fixed inset-x-3 top-16 z-50 mx-auto max-w-md rounded-2xl p-4 sm:left-auto sm:right-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <BellRing className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Turn on notifications
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Get new pickup requests and shipment updates on this device
                  the moment they happen.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={toggle} isLoading={busy}>
                    Allow
                  </Button>
                  <Button size="sm" variant="ghost" onClick={dismissAsk}>
                    Not now
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissAsk}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
