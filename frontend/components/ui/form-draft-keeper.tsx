"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { clearDraft, readDraft, writeDraft, pruneDrafts } from "@/lib/drafts";

/**
 * Every form in the app, once: what someone types survives a refresh.
 *
 * Each field they edit is saved under the page's path; when the page loads again (or the field
 * appears later, after its data arrives) the saved value is put back through the same `input` /
 * `change` events a keystroke makes, so React state and any lookups it triggers (PIN code to
 * city, a Maps link to a pin) update as if it had been typed. A submit forgets that form's fields.
 *
 * Never kept: passwords, one-time codes, card fields, file pickers, search boxes and comboboxes,
 * and anything inside `data-no-draft`. Pages whose state is more than their inputs (a picked
 * customer, a list of boxes) keep their own draft with useFormDraft and mark their root
 * `data-draft="managed"` so the two never fight.
 */

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type Saved = Record<string, string | boolean>;

const SKIP_TYPES = new Set(["password", "file", "hidden", "submit", "button", "reset", "image", "search"]);
// React's useId output (":r1:", "«r1»") and Radix's generated ids change from render to render.
const UNSTABLE_ID = /[:«»]|^radix-|^headlessui-/;

function isField(el: EventTarget | null): el is Field {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

function eligible(el: Field): boolean {
  if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return false;
  if (el.getAttribute("role") === "combobox") return false;
  const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  if (ac.includes("one-time-code") || ac.startsWith("cc-") || ac.includes("password")) return false;
  if (el.closest('[data-no-draft], [data-draft="managed"]')) return false;
  return true;
}

function signature(el: Field): string | null {
  const base =
    el.getAttribute("name") ||
    (el.id && !UNSTABLE_ID.test(el.id) ? `#${el.id}` : "") ||
    (el.labels?.[0]?.textContent?.trim() ? `label:${el.labels[0].textContent.trim().slice(0, 60)}` : "") ||
    (el.getAttribute("aria-label") ? `aria:${el.getAttribute("aria-label")}` : "") ||
    (el.getAttribute("placeholder") ? `ph:${el.getAttribute("placeholder")}` : "");
  if (!base) return null;
  return el instanceof HTMLInputElement && el.type === "radio" ? `${base}=${el.value}` : base;
}

/**
 * Every keepable field on the page with its key: its signature plus its position among fields
 * sharing that signature (the second "Description" row is "label:Description@1").
 */
function indexFields(root: ParentNode = document): Map<Field, string> {
  const keys = new Map<Field, string>();
  const counts = new Map<string, number>();
  for (const el of Array.from(document.querySelectorAll<Field>("input, textarea, select"))) {
    if (!eligible(el)) continue;
    const sig = signature(el);
    if (!sig) continue;
    const n = counts.get(sig) ?? 0;
    counts.set(sig, n + 1);
    keys.set(el, `${sig}@${n}`);
  }
  if (root === document) return keys;
  // Positions are page-wide; the caller only wants the fields inside `root`.
  return new Map(Array.from(keys).filter(([el]) => root.contains(el)));
}

const keyOf = (el: Field): string | null => indexFields().get(el) ?? null;

function valueOf(el: Field): string | boolean {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) return el.checked;
  return el.value;
}

/** Sets a value the way a keystroke would, so React's onChange runs. */
function applyValue(el: Field, value: string | boolean): void {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    if (el.checked !== value) el.click();
    return;
  }
  if (typeof value !== "string" || el.value === value) return;
  if (el instanceof HTMLSelectElement && !Array.from(el.options).some((o) => o.value === value)) return;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  if (!(el instanceof HTMLSelectElement)) el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function FormDraftKeeper() {
  const pathname = usePathname();

  useEffect(() => {
    pruneDrafts();
  }, []);

  useEffect(() => {
    const storeKey = `dom:${pathname}`;
    let saved: Saved = readDraft<Saved>(storeKey) ?? {};
    // Keys already restored or typed into on this visit: each is put back at most once.
    const settled = new Set<string>();
    let pendingSave: ReturnType<typeof setTimeout> | undefined;
    let restoring = false;

    const save = () => {
      clearTimeout(pendingSave);
      pendingSave = setTimeout(() => {
        if (Object.keys(saved).length === 0) clearDraft(storeKey);
        else writeDraft(storeKey, saved);
      }, 250);
    };

    const onEdit = (e: Event) => {
      // The app's own dropdown reports a pick with a scripted change event, so only this
      // component's restores are ignored, not every untrusted event.
      if (restoring || !isField(e.target) || !eligible(e.target)) return;
      const el = e.target;
      const key = keyOf(el);
      if (!key) return;
      settled.add(key);
      if (el instanceof HTMLInputElement && el.type === "radio") {
        // Picking one radio unpicks the rest of its group.
        for (const k of Object.keys(saved)) if (k.startsWith(`${el.name}=`)) delete saved[k];
      }
      saved = { ...saved, [key]: valueOf(el) };
      save();
    };

    const onSubmit = (e: Event) => {
      if (!(e.target instanceof HTMLFormElement)) return;
      let changed = false;
      for (const key of indexFields(e.target).values()) {
        if (key in saved) {
          delete saved[key];
          changed = true;
        }
      }
      if (changed) save();
    };

    let frame = 0;
    const restore = () => {
      frame = 0;
      // Nothing left to put back: the observer stays cheap for the rest of the visit.
      if (!Object.keys(saved).some((k) => !settled.has(k))) return;
      for (const [el, key] of indexFields()) {
        if (settled.has(key) || !(key in saved) || el.disabled || (el as HTMLInputElement).readOnly) continue;
        settled.add(key);
        restoring = true;
        try {
          applyValue(el, saved[key]);
        } finally {
          restoring = false;
        }
      }
    };
    const scheduleRestore = () => {
      if (!frame) frame = requestAnimationFrame(restore);
    };

    // After hydration has settled, then whenever new fields appear (data loaded, a step opened).
    const initial = setTimeout(scheduleRestore, 50);
    const observer = new MutationObserver(scheduleRestore);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      clearTimeout(initial);
      clearTimeout(pendingSave);
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("submit", onSubmit, true);
      // Flush: a navigation must not drop the last 250 ms of typing.
      if (Object.keys(saved).length > 0) writeDraft(storeKey, saved);
    };
  }, [pathname]);

  return null;
}
