"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Cloudflare Turnstile. Empty until the widget is created in the Cloudflare dashboard; while it
// is empty nothing renders and forms submit without a token (the backend check is likewise off
// until TURNSTILE_SECRET is set). Local testing: 1x00000000000000000000AA always passes.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Mirrors TURNSTILE_HEADER in the backend's turnstile.guard.ts. */
const TOKEN_HEADER = "cf-turnstile-response";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "interaction-only";
      size: "flexible";
      theme: "light";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

// One script tag for the whole app, however many forms mount.
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * The bot check for one form. `action` must match the backend route's @RequireTurnstile action.
 * Render `element` inside the form, keep submit disabled while `pending`, send `headers` with the
 * request, and call `reset()` after a failed attempt: a token is only accepted once.
 */
export function useTurnstile(action: string) {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // State, not a ref: forms often mount after a loading state, and the widget must render when
  // its container actually appears, not when the hook first runs.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY || !container) return;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return;
        widgetId.current = turnstile.render(container, {
          sitekey: SITE_KEY,
          action,
          // Invisible unless Cloudflare needs the visitor to click; most people never see it.
          appearance: "interaction-only",
          size: "flexible",
          theme: "light",
          callback: (value) => {
            setFailed(false);
            setToken(value);
          },
          "expired-callback": () => setToken(null),
          "error-callback": () => {
            setToken(null);
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action, container]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  const enabled = Boolean(SITE_KEY);
  return {
    pending: enabled && !token,
    failed,
    reset,
    headers: token ? { [TOKEN_HEADER]: token } : undefined,
    element: enabled ? (
      <div>
        <div ref={setContainer} />
        {failed && (
          <p role="alert" className="mt-1 text-sm text-danger">
            The security check could not load. Check your connection and refresh the page.
          </p>
        )}
      </div>
    ) : null,
  };
}
