"use client";

import { useEffect } from "react";
import { ERROR_SELECTOR, focusFirstInvalid, goToError } from "@/lib/utils/focus-first-invalid";

/** How long after a submit or tap an error may still arrive: a slow server reply at the door. */
const WATCH_MS = 15_000;

/**
 * Every form in the app, once: after a submit, or a tap on an action button outside a form (the
 * partner's "Confirm verification", "Collect payment"), take the user to the error.
 *
 * - On submit, the first invalid field in that form straight away (client-side checks).
 * - Then, for either, the first error that appears afterwards, however late: the server's
 *   "no rate for this weight" arrives a few seconds after the tap.
 *
 * The forms use noValidate and their own error state, so the browser's own jump never happens.
 * The watch ends at the first error, after WATCH_MS, or as soon as the user types or taps
 * something else, so live validation while typing never yanks the page away.
 */
export function FormFocus() {
  useEffect(() => {
    let stop: (() => void) | null = null;

    function watch(scope: ParentNode) {
      stop?.();
      const before = new Set(document.querySelectorAll(ERROR_SELECTOR));
      const observer = new MutationObserver(() => {
        const fresh = Array.from(scope.querySelectorAll<HTMLElement>(ERROR_SELECTOR)).find(
          (el) => !before.has(el) && el.getClientRects().length > 0,
        );
        if (!fresh) return;
        done();
        // The field the error is about, if one is marked; else the message itself.
        requestAnimationFrame(() => {
          const field = scope.querySelector<HTMLElement>('[aria-invalid="true"]');
          goToError(field && field.getClientRects().length > 0 ? field : fresh);
        });
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-invalid", "role"],
      });
      const timer = window.setTimeout(done, WATCH_MS);
      function done() {
        observer.disconnect();
        window.clearTimeout(timer);
        stop = null;
      }
      stop = done;
    }

    const onSubmit = (e: Event) => {
      if (!(e.target instanceof HTMLFormElement)) return;
      focusFirstInvalid(e.target);
      watch(e.target);
    };

    const onClick = (e: MouseEvent) => {
      const button = e.target instanceof Element ? e.target.closest("button") : null;
      if (!button) {
        stop?.();
        return;
      }
      // A submit button is covered by onSubmit; a button opting out (add a row, open a menu) or
      // one that only toggles something is not an attempt to save.
      if (button.type === "submit" && button.form) return;
      if (button.closest("[data-no-error-jump]") || button.hasAttribute("aria-expanded")) return;
      watch(document);
    };

    const onType = () => stop?.();

    document.addEventListener("submit", onSubmit);
    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onType, true);
    return () => {
      stop?.();
      document.removeEventListener("submit", onSubmit);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onType, true);
    };
  }, []);
  return null;
}
