// No "use client" here on purpose: buttonVariants must stay callable from server components,
// while Button itself (it holds state) lives in a client file.
export { buttonVariants } from "@/components/ui/button-variants";
export { Button, type ButtonProps } from "@/components/ui/button-client";
