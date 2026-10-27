"use client";

import { useEffect } from "react";
import { focusFirstInvalid } from "@/lib/utils/focus-first-invalid";

/**
 * Every form in the app, once: after a submit, jump to the first field that failed validation.
 * The forms use noValidate and their own error state, so the browser's own jump never happens.
 */
export function FormFocus() {
  useEffect(() => {
    const onSubmit = (e: Event) => {
      if (e.target instanceof HTMLFormElement) focusFirstInvalid(e.target);
    };
    document.addEventListener("submit", onSubmit);
    return () => document.removeEventListener("submit", onSubmit);
  }, []);
  return null;
}
