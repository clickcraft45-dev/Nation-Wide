import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const CHECKLIST = [
  "Checking available providers",
  "Calculating shipping rates",
  "Comparing available options",
] as const;

export function QuoteLoading() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-10 text-center">
      <Spinner size="lg" className="text-[color:var(--brand-red)]" />
      <div>
        <p className="text-base font-medium text-foreground">
          Finding the best shipping options for you…
        </p>
      </div>
      <ul className="space-y-2 text-left text-sm text-muted-foreground">
        {CHECKLIST.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
