"use client";

import { useEffect, useRef } from "react";

/**
 * Unsaved form drafts, kept in this browser so a refresh, a dropped connection or iOS reloading a
 * backgrounded tab never throws away what someone typed.
 *
 * localStorage rather than cookies: cookies ride along on every request and cap out at 4 KB, and
 * nothing here is for the server. Drafts expire after DRAFT_TTL_MS and are wiped on sign-out, so a
 * shared counter computer does not hand one person's half-typed booking to the next.
 */
const PREFIX = "nw-draft:";
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

interface Stored<T> {
  savedAt: number;
  data: T;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Private mode or storage disabled: drafts are a convenience, never a requirement.
    return null;
  }
}

export function readDraft<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      store.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data } satisfies Stored<T>));
  } catch {
    // Quota full: drop expired drafts and give up on this one quietly.
    pruneDrafts();
  }
}

export function clearDraft(key: string): void {
  storage()?.removeItem(PREFIX + key);
}

/** Every draft this browser holds: on sign-out. */
export function clearAllDrafts(): void {
  const store = storage();
  if (!store) return;
  for (const key of Object.keys(store)) if (key.startsWith(PREFIX)) store.removeItem(key);
}

/** Expired drafts only. */
export function pruneDrafts(): void {
  const store = storage();
  if (!store) return;
  for (const key of Object.keys(store)) {
    if (key.startsWith(PREFIX)) readDraft(key.slice(PREFIX.length));
  }
}

/**
 * Keeps a page's own form state as a draft. `value` is the snapshot to save; `onRestore` gets the
 * saved one back once, after mount (never during render, so the server HTML still hydrates). Pass
 * `enabled: false` while the form is not in an editable state, e.g. after it was submitted.
 *
 * The returned `clear` forgets the draft: call it once the form is saved for real.
 */
export function useFormDraft<T>(
  key: string,
  value: T,
  onRestore: (saved: T) => void,
  { enabled = true }: { enabled?: boolean } = {},
): { clear: () => void } {
  // A ref, not state: the first debounced write is cancelled by the re-render a restore causes,
  // and when nothing was restored the value being written is the one already there.
  const readyRef = useRef(false);
  const restoreRef = useRef(onRestore);
  useEffect(() => {
    restoreRef.current = onRestore;
  });

  useEffect(() => {
    const saved = readDraft<T>(key);
    if (saved !== null) restoreRef.current(saved);
    readyRef.current = true;
  }, [key]);

  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!readyRef.current || !enabled) return;
    const timer = setTimeout(() => writeDraft(key, JSON.parse(serialized) as T), 300);
    return () => clearTimeout(timer);
  }, [key, serialized, enabled]);

  return { clear: () => clearDraft(key) };
}
