import { MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ManualReviewNotice({ onRequestQuote }: { onRequestQuote: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-6 text-center">
      <MessageCircleQuestion className="h-10 w-10 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-base font-medium text-foreground">
          We&apos;re unable to provide an instant quote for this shipment.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Our shipping team will review your request and contact you with a customized
          quotation.
        </p>
      </div>
      <Button size="lg" onClick={onRequestQuote}>
        Request Custom Quote
      </Button>
    </div>
  );
}
