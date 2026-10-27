"use client";

import { type ButtonHTMLAttributes, forwardRef, useState } from "react";
import { type VariantProps } from "class-variance-authority";
import { Spinner } from "@/components/ui/spinner";
import { buttonVariants } from "@/components/ui/button-variants";

import { cn } from "@/lib/utils/cn";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, isLoading, disabled, children, onClick, ...props },
    ref,
  ) => {
    // An async onClick spins the button until it settles, so no handler has to wire its own
    // isLoading just to stop a double tap. isLoading still wins for work started elsewhere.
    const [pending, setPending] = useState(false);
    const busy = isLoading || pending;
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={(e) => {
          const result: unknown = onClick?.(e);
          if (!(result instanceof Promise)) return;
          setPending(true);
          result.then(
            () => setPending(false),
            (err) => {
              setPending(false);
              throw err;
            },
          );
        }}
        {...props}
      >
        {busy && <Spinner size="sm" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
