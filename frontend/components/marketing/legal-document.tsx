import type { ReactNode } from "react";

/**
 * Shell for the legal pages, replacing LegalPlaceholder's "coming soon".
 *
 * Deliberately plain: legal text is read, occasionally under stress, and sometimes printed. It
 * gets a narrow measure, real heading hierarchy and generous leading, and nothing else.
 */
export function LegalDocument({
  title,
  effectiveDate,
  intro,
  children,
}: {
  title: string;
  effectiveDate: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Effective {effectiveDate} · NationWide Courier Delivery Service
      </p>
      <div className="mt-8 text-[15px] leading-relaxed text-muted-foreground">{intro}</div>
      <div className="legal-body mt-12">{children}</div>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
