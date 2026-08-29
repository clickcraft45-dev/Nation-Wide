import { afterEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { TypingText } from "./typing-text";

// Each tick has to be advanced on its own: the next timeout is only scheduled once React has
// committed the previous character, which act() flushes at the end of the callback.
async function tick(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function typed(container: HTMLElement) {
  return container.querySelectorAll('[aria-hidden="true"]')[0]?.textContent;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TypingText", () => {
  it("types a word, holds, deletes it, then starts the next one", async () => {
    vi.useFakeTimers();
    const { container } = render(<TypingText words={["Hi", "Yo"]} />);

    expect(typed(container)).toBe("");
    await tick(75);
    expect(typed(container)).toBe("H");
    await tick(75);
    expect(typed(container)).toBe("Hi");

    // Holds on the finished word before deleting.
    await tick(75);
    expect(typed(container)).toBe("Hi");
    await tick(1800);
    await tick(35);
    expect(typed(container)).toBe("H");
    await tick(35);
    expect(typed(container)).toBe("");

    // Empty + deleting flips to the next word, which then types out.
    await tick(35);
    await tick(75);
    expect(typed(container)).toBe("Y");
  });

  it("exposes every word to screen readers", () => {
    const { container } = render(<TypingText words={["Worldwide.", "On Time."]} />);
    expect(container.querySelector(".sr-only")?.textContent).toBe("Worldwide., On Time.");
  });
});
