/**
 * Takes the user to the first field marked invalid (aria-invalid, which Input and the inputs built
 * on it set from their `error` prop), or failing that to the first error message. Waits a frame
 * so the errors the submit handler just set have rendered.
 */
export function focusFirstInvalid(scope: ParentNode = document): void {
  requestAnimationFrame(() => {
    const field = scope.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target = field ?? scope.querySelector<HTMLElement>('[role="alert"]');
    if (!target) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    field?.focus({ preventScroll: true });
  });
}
