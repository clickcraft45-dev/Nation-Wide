"use client";

import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface Option {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** The <option>s a caller wrote, in order — through arrays, fragments and <optgroup>s. */
function readOptions(children: ReactNode): Option[] {
  const out: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === Fragment || el.type === "optgroup") {
      out.push(...readOptions(el.props.children));
    } else if (el.type === "option") {
      const text = textOf(el.props.children);
      out.push({
        value: el.props.value !== undefined ? String(el.props.value) : text,
        label: el.props.children,
        text,
        disabled: Boolean(el.props.disabled),
      });
    }
  });
  return out;
}

/**
 * The app's dropdown, in the liquid-glass material. A browser's native <select> popup can't be
 * styled at all, so the list is drawn here.
 *
 * Drop-in for a <select>: same props, same `<option>` children, and onChange still receives a
 * real change event whose `e.target.value` is the picked value. That works because a real
 * <select> stays in the DOM, hidden — picking sets its value and dispatches `change` on it — so
 * forms, `name`, `required` and refs keep behaving exactly as they did.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, id, disabled, value, defaultValue, style, ...props }, ref) => {
    const options = readOptions(children);
    const selectRef = useRef<HTMLSelectElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    useImperativeHandle(ref, () => selectRef.current!);

    const controlled = value !== undefined;
    const [inner, setInner] = useState(() =>
      defaultValue !== undefined ? String(defaultValue) : (options[0]?.value ?? ""),
    );
    const current = controlled ? String(value) : inner;
    const selected = options.find((o) => o.value === current);

    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number }>();
    const listId = useId();
    const typed = useRef({ text: "", at: 0 });

    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      // Opens upward only when there is clearly more room there — a field near the bottom of a
      // phone screen or a dialog.
      const up = below < 220 && above > below;
      setPos({
        left: rect.left,
        width: Math.max(rect.width, 160),
        maxHeight: Math.min(320, up ? above : below),
        ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    }

    function openList() {
      if (disabled) return;
      place();
      setActive(Math.max(0, options.findIndex((o) => o.value === current)));
      setOpen(true);
    }

    function close(refocus = true) {
      setOpen(false);
      if (refocus) triggerRef.current?.focus();
    }

    function pick(option: Option) {
      if (option.disabled) return;
      close();
      if (option.value === current) return;
      if (!controlled) setInner(option.value);
      const select = selectRef.current;
      if (!select) return;
      // The native setter, so React's value tracking sees a real change and fires onChange.
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function move(from: number, step: 1 | -1) {
      for (let i = 1; i <= options.length; i++) {
        const next = (from + step * i + options.length) % options.length;
        if (!options[next].disabled) return next;
      }
      return from;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!open) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
          e.preventDefault();
          openList();
        }
        return;
      }
      if (e.key === "Escape" || e.key === "Tab") {
        if (e.key === "Escape") e.preventDefault();
        close(e.key === "Escape");
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => move(i, e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        setActive(e.key === "Home" ? move(-1, 1) : move(options.length, -1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (options[active]) pick(options[active]);
      } else if (e.key.length === 1) {
        // Type-ahead: letters typed in quick succession jump to the first matching option.
        const now = Date.now();
        typed.current = {
          text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(),
          at: now,
        };
        const hit = options.findIndex((o) => !o.disabled && o.text.toLowerCase().trim().startsWith(typed.current.text));
        if (hit >= 0) setActive(hit);
      }
    }

    // Close on a click anywhere else; follow the trigger if the page or a dialog scrolls.
    useEffect(() => {
      if (!open) return;
      function onPointerDown(e: PointerEvent) {
        const target = e.target as Node;
        if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) close(false);
      }
      function onScroll(e: Event) {
        if (listRef.current?.contains(e.target as Node)) return;
        place();
      }
      document.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", place);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", place);
      };
    }, [open]);

    // Keep the highlighted option in view while arrowing through a long list (dial codes).
    useLayoutEffect(() => {
      if (!open || active < 0) return;
      listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }, [open, active]);

    return (
      <div className="relative">
        <select
          ref={selectRef}
          value={current}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          // Changes arrive from pick() above; React requires a handler on a controlled select.
          onChange={() => undefined}
          {...props}
        >
          {options.map((o, i) => (
            <option key={`${o.value}-${i}`} value={o.value} disabled={o.disabled}>
              {o.text}
            </option>
          ))}
        </select>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={props["aria-label"]}
          aria-invalid={props["aria-invalid"]}
          aria-describedby={props["aria-describedby"]}
          disabled={disabled}
          onClick={() => (open ? close() : openList())}
          onKeyDown={onKeyDown}
          onBlur={props.onBlur as never}
          style={style}
          className={cn(
            "glass-field flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-60",
            props["aria-invalid"] === true || props["aria-invalid"] === "true" ? "border-destructive" : "",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !selected?.value && "text-muted-foreground")}>
            {selected?.label ?? " "}
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {open &&
          pos &&
          createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={props["aria-label"]}
              // pointerEvents: a modal Radix dialog sets pointer-events:none on <body>, and this list
              // is portalled there. Clicks and wheel still count as "inside" the dialog, because
              // Radix follows the React tree, which this portal is part of.
              style={{ pointerEvents: "auto", position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxHeight: pos.maxHeight }}
              // Above dialogs (z-50) and the map sheet (z-60).
              className="glass-raised z-70 overflow-y-auto overscroll-contain rounded-xl p-1 text-sm animate-in fade-in-0 zoom-in-95"
            >
              {options.map((o, i) => {
                const isSelected = o.value === current;
                return (
                  <li
                    key={`${o.value}-${i}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    // pointerdown, not click, so the trigger never blurs first and flickers.
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pick(o);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-foreground transition-colors",
                      i === active && "bg-white/70",
                      isSelected && "font-medium",
                      o.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )}
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";
