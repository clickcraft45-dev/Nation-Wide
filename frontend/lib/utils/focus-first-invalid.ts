const INVALID = '[aria-invalid="true"]';
const ALERT = '[role="alert"]';

function inView(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
}

/**
 * Brings `target` into view (only if it is not already) and, when it is a field, puts the cursor
 * in it. An error message is scrolled to; the field it belongs to is focused if it is marked.
 */
export function goToError(target: HTMLElement): void {
  if (!inView(target)) {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }
  if (target.matches(INVALID)) target.focus({ preventScroll: true });
}

/**
 * Takes the user to the first field marked invalid (aria-invalid, which Input and the inputs built
 * on it set from their `error` prop), or failing that to the first error message. Waits a frame
 * so the errors the submit handler just set have rendered.
 */
export function focusFirstInvalid(scope: ParentNode = document): void {
  requestAnimationFrame(() => {
    const target = scope.querySelector<HTMLElement>(INVALID) ?? scope.querySelector<HTMLElement>(ALERT);
    if (target) goToError(target);
  });
}

/** The field with this id, after the render that marks it: for errors a toast also explains. */
export function focusField(id: string): void {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    goToError(el);
    el.focus({ preventScroll: true });
  });
}

export const ERROR_SELECTOR = `${INVALID}, ${ALERT}`;
