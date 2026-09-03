"use client";

import { useEffect, useState } from "react";

// Typewriter for the hero headline's last line. One timer, one pure transition — every step goes
// through `next()`, so there is no setState-in-effect cascade and the whole behaviour is testable
// without rendering.
const TYPE_MS = 75;
const DELETE_MS = 35;
const HOLD_MS = 1800;

type State = { index: number; len: number; deleting: boolean };

function next(state: State, words: string[], reduced: boolean): State {
  const word = words[state.index % words.length] ?? "";
  // Reduced motion: type nothing, just show the word. Returning `state` unchanged once it's full
  // makes React bail out, which stops the effect (and the timer) rescheduling itself.
  if (reduced) {
    return state.len === word.length ? state : { ...state, len: word.length };
  }
  if (!state.deleting && state.len === word.length) return { ...state, deleting: true };
  if (state.deleting && state.len === 0) {
    return { index: (state.index + 1) % words.length, len: 0, deleting: false };
  }
  return { ...state, len: state.len + (state.deleting ? -1 : 1) };
}

export function TypingText({ words, className }: { words: string[]; className?: string }) {
  const [state, setState] = useState<State>({ index: 0, len: 0, deleting: false });
  const word = words[state.index % words.length] ?? "";
  const holding = !state.deleting && state.len === word.length;

  useEffect(() => {
    // Optional-chained: jsdom has no matchMedia. Read per tick so a mid-session OS change applies.
    const reduced = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const delay = reduced ? 0 : holding ? HOLD_MS : state.deleting ? DELETE_MS : TYPE_MS;
    const timer = setTimeout(() => setState((s) => next(s, words, reduced)), delay);
    return () => clearTimeout(timer);
  }, [state, holding, words]);

  return (
    <span className={className}>
      {/* Screen readers get the full list once; the animated slice is decorative. */}
      <span className="sr-only">{words.join(", ")}</span>
      <span aria-hidden>{word.slice(0, state.len)}</span>
      <span
        aria-hidden
        className="ml-1 inline-block h-[0.8em] w-[3px] translate-y-[0.05em] animate-pulse rounded-full bg-current align-middle motion-reduce:hidden"
      />
    </span>
  );
}
