import { type ReactNode } from "react";

/**
 * The two-column body of an admin detail page: the work in a fluid main column, the facts and
 * secondary actions in a fixed rail on the right. Stacks to one column below `lg`, rail last.
 *
 * Exists because detail pages were a single `max-w-3xl` column, which left most of a desktop
 * screen empty and pushed everything below the fold.
 */
export function DetailLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="min-w-0 space-y-6">{children}</div>
      <aside className="min-w-0 space-y-6">{aside}</aside>
    </div>
  );
}
