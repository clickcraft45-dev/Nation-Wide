import { cva } from "class-variance-authority";

// Kept out of the "use client" Button file: server components (the marketing pages) call this to
// style a <Link> as a button, and a function exported from a client module can't run on the server.
export const buttonVariants = cva(
  "glass-interactive inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_8px_20px_-10px_rgba(9,9,11,0.7)] hover:!bg-primary-hover",
        secondary: "glass text-foreground",
        tertiary: "text-primary hover:!bg-white/70",
        ghost: "text-foreground hover:!bg-white/60",
        danger:
          "bg-danger text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_8px_20px_-10px_rgba(185,28,28,0.7)] hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9 rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);
