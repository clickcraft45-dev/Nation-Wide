"use client";

import type { ReactNode } from "react";

/**
 * Pricing used to be the one section STAFF could not reach. That role is gone — everyone who can
 * reach the admin panel at all is now an ADMIN or a SUPER_ADMIN, both of which may price — so this
 * layout has nothing left to decide and simply renders its children. Kept as a file rather than
 * deleted because the route group's nesting depends on it.
 */
export default function PricingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
