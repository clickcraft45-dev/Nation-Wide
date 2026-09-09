import { afterEach, describe, expect, it } from "vitest";
import {
  DISMISSED_KEY,
  DISMISS_DAYS,
  wasRecentlyDismissed,
} from "./install-prompt";

const DAY_MS = 86_400_000;

afterEach(() => {
  window.localStorage.clear();
});

describe("wasRecentlyDismissed", () => {
  it("is false for someone who has never dismissed it", () => {
    expect(wasRecentlyDismissed()).toBe(false);
  });

  it("suppresses the banner inside the dismissal window", () => {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now() - DAY_MS));
    expect(wasRecentlyDismissed()).toBe(true);
  });

  it("asks again once the window has passed", () => {
    // A "not now" should not silence the prompt forever for someone still using the site.
    window.localStorage.setItem(
      DISMISSED_KEY,
      String(Date.now() - (DISMISS_DAYS + 1) * DAY_MS),
    );
    expect(wasRecentlyDismissed()).toBe(false);
  });

  it("shows the prompt rather than hiding it when the stored value is junk", () => {
    // Number("banana") is NaN and every comparison with it is false, which happens to be the
    // safe answer here — pinned so a refactor cannot silently invert it.
    window.localStorage.setItem(DISMISSED_KEY, "banana");
    expect(wasRecentlyDismissed()).toBe(false);
  });
});
