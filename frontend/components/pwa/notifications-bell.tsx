"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { disablePush, enablePush, pushState, syncPush, type PushState } from "@/lib/push";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";

/**
 * The header bell: turns phone notifications on and off for this device.
 *
 * Customers get their shipment updates (the same ones sent on WhatsApp); pickup partners get a
 * notification the moment a pickup is assigned to them.
 */
export function NotificationsBell({ className }: { className?: string }) {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    pushState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
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

  async function toggle() {
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
        description: "Allow them in your browser's site settings, then tap the bell again.",
      });
      return;
    }

    setBusy(true);
    try {
      const next = state === "enabled" ? await disablePush() : await enablePush();
      setState(next);
      if (next === "enabled") {
        showToast({ variant: "success", title: "Notifications are on for this device." });
      } else if (state === "enabled") {
        showToast({ variant: "success", title: "Notifications are off for this device." });
      } else if (next === "denied") {
        showToast({
          variant: "error",
          title: "Notifications were blocked.",
          description: "Allow them in your browser's site settings to get updates.",
        });
      }
    } catch (err) {
      showToast({
        variant: "error",
        title: "Couldn't turn on notifications.",
        description: errorMessage(err, err instanceof Error ? err.message : "Please try again."),
      });
    } finally {
      setBusy(false);
    }
  }

  const Icon = state === "enabled" ? BellRing : state === "denied" ? BellOff : Bell;
  const label =
    state === "enabled" ? "Turn off notifications" : state === "denied" ? "Notifications blocked" : "Turn on notifications";

  return (
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
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success" aria-hidden />
      )}
    </button>
  );
}
