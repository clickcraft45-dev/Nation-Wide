import { CONTACT_EMAIL } from "@/lib/constants/contact";

// Terms/Privacy/Shipping Guidelines content isn't finalized yet — this renders an honest
// "coming soon" placeholder rather than fabricated legal text, so the footer links work without
// implying real, binding policy exists.
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl flex-1 px-6 py-24">
      <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
      <p className="mt-4 text-muted-foreground">
        This page is being finalized. If you have questions in the meantime, reach out to our
        team directly and we&apos;ll help.
      </p>
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
      >
        {CONTACT_EMAIL}
      </a>
    </div>
  );
}
