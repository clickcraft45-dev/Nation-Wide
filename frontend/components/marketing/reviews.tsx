import { Star } from "lucide-react";
import { SectionHeading } from "@/components/marketing/section-heading";

/**
 * Customer reviews on the public homepage.
 *
 * THIS ARRAY IS EMPTY ON PURPOSE AND THE SECTION RENDERS NOTHING UNTIL IT IS FILLED.
 *
 * A review is a statement by a named customer about a real experience. Inventing one — or
 * shipping a realistic-looking placeholder that never gets replaced — publishes a false claim
 * about this business to everyone who visits the site, and in India a fabricated testimonial is
 * a misleading advertisement under the Consumer Protection Act. It is also the kind of thing
 * that is discovered later, by a customer, rather than caught in review. So the component ships
 * and the content does not: an empty array means no section, never a fake one.
 *
 * Same rule the FAQs already follow (see faqs.tsx: "no invented delivery windows, prices or
 * refund terms").
 *
 * TO ADD REAL REVIEWS, one of:
 *
 *  1. Paste them below, copied verbatim from a real source (Google Business Profile, an email a
 *     customer sent, a WhatsApp message they agreed you could quote). Keep the wording as
 *     written — tidying a review into marketing copy makes it yours, not theirs.
 *
 *  2. Pull them live from the Google Places API, which is the better answer for a courier with a
 *     Google Business Profile: the reviews stay current, and they are verifiably real because
 *     they link back to Google. That needs a Places API key and this business's Place ID, and
 *     should be fetched server-side in a Server Component so the key is never in the bundle.
 *
 *  3. Build a review-submission flow so delivered orders can be rated. That is a real feature —
 *     a Review model, an endpoint, moderation — not a content change.
 */
type Review = {
  /** As the customer wrote it. Not paraphrased, not shortened past the point of meaning. */
  quote: string;
  /** The reviewer's own name as they published it. Never invented, never "A. Customer". */
  author: string;
  /** Optional: city, or "Verified Google review" — anything that helps a reader place it. */
  context?: string;
  /** 1-5, as given. Omit rather than guess. */
  rating?: number;
};

const REVIEWS: Review[] = [];

export function MarketingReviews() {
  // No reviews, no section. The homepage simply flows from the section above to the one below.
  if (REVIEWS.length === 0) return null;

  return (
    <section id="reviews" className="relative isolate overflow-hidden bg-background py-20">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SectionHeading
          eyebrow="Reviews"
          title="What our customers say"
          description="Feedback from people who have shipped with us."
        />

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {REVIEWS.map((review) => (
            <li
              key={`${review.author}-${review.quote.slice(0, 24)}`}
              className="flex h-full flex-col rounded-2xl border border-border bg-card p-6"
            >
              {review.rating !== undefined && (
                // aria-hidden on the stars with a text label alongside: five identical icons
                // announce as nothing useful, so the rating is given to screen readers as words.
                <div className="mb-4 flex items-center gap-1">
                  <span className="sr-only">{review.rating} out of 5 stars</span>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      aria-hidden
                      className={
                        i < review.rating!
                          ? "h-4 w-4 fill-amber-400 text-amber-400"
                          : "h-4 w-4 text-muted-foreground/30"
                      }
                    />
                  ))}
                </div>
              )}

              <blockquote className="flex-1 text-sm leading-relaxed text-muted-foreground">
                &ldquo;{review.quote}&rdquo;
              </blockquote>

              <footer className="mt-5 border-t border-border pt-4">
                <cite className="text-sm font-medium not-italic text-foreground">
                  {review.author}
                </cite>
                {review.context && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{review.context}</p>
                )}
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
