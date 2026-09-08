import { Star } from "lucide-react";
import { API_BASE_URL } from "@/lib/api-client";
import { SectionHeading } from "@/components/marketing/section-heading";

/**
 * Customer reviews on the public homepage.
 *
 * Every review below is transcribed VERBATIM from this business's Google Business Profile
 * (docs/NationWide Reviews .pdf), including the typos and the odd grammar. That is deliberate:
 * tidying a review into marketing copy makes it the company's words rather than the customer's,
 * and a polished testimonial is exactly what reads as invented. In India a fabricated or
 * materially altered testimonial is a misleading advertisement under the Consumer Protection
 * Act, so the rule for this file stays what it was — real and unedited, or absent.
 *
 * Ratings are NOT listed. The source page shows each reviewer's name, review count and date, but
 * the per-review star count did not survive the export, and inventing "5" for every one of them
 * would be a fabricated claim even where it is probably true. The section renders without stars
 * rather than with guessed ones.
 */
type Review = {
  /** As the customer wrote it. Not paraphrased, not shortened past the point of meaning. */
  quote: string;
  /** The reviewer's own name as they published it. Never invented, never "A. Customer". */
  author: string;
  /** Their standing on Google — review count, Local Guide status — and when they wrote it. */
  context?: string;
  /** 1-5, as given. Omit rather than guess. */
  rating?: number;
};

const REVIEWS: Review[] = [
  {
    quote:
      "We recently used nationwide courier services to send 40kgs 2 x cartons to Australia. The services were excellent and they response were prompt. The courier delivered within 2 weeks without any damages. Sangamesh was very professional and easy to contact. The prices were reasonable when compared to the market. I would highly recommend nation wide again. Thank you.",
    author: "Ibrahim Shaik",
    context: "8 reviews · 7 months ago",
  },
  {
    quote:
      "I have been using Nationwide International courier to ship packages and have been extremely impressed with their service. But this time they were extraordinary, the delivery was faster than expected, and the tracking was accurate. They are honest, reliable, friendly, and helpful. I will use their services in the future and also strongly recommend them to others as well.",
    author: "Anitha Kesari",
    context: "Local Guide · 15 reviews · a year ago",
  },
  {
    quote:
      "Fast and Great service to Newzealand just within 5 working days all Clothes and food items delivered with a good condition Comparatively other agents here they are giving best price per KG 780 / rupees if we have 10 KG slab Thankyou !!",
    author: "Naveen Kumar",
    context: "9 reviews · a year ago",
  },
  {
    quote:
      "I'm so impressed with the speed and efficiency of this courier and my package arrived right on time. They also provide Door pickup service. On time pickup and my package is delivered in 4 days in us",
    author: "Rohit Reddy",
    context: "Local Guide · 7 reviews · a year ago",
  },
  {
    quote:
      "Best Courier Service Every Time On-Time Delivery Guaranty Even Rates Are Reasonable Staff Is Well Trained I Strongly Recommend It To Use Their Services Again",
    author: "Ramesh Arukala",
    context: "Local Guide · 2 reviews · a year ago",
  },
  {
    quote:
      "Exllent service's very agent's Also supportive to delivering and courier item's also very protective",
    author: "ParameshReddy Gadila",
    context: "6 reviews · a year ago",
  },
  {
    quote:
      "World wide service, excellent in packaging and print delivery with very reasonable cost",
    author: "Tukka Reddy",
    context: "2 reviews · a year ago",
  },
  {
    quote:
      "the service was smooth, and the person who assisted me was very kind and helpful",
    author: "sujith goud",
    context: "1 review · a year ago",
  },
  {
    quote: "Great service, very reliable",
    author: "Ramanav Vellemcheti",
    context: "5 reviews · 2 months ago",
  },
  {
    quote: "Good international service thanks for your support",
    author: "Gunti Rohith",
    context: "6 reviews · a year ago",
  },
];

function ReviewCard({ review }: { review: Review }) {
  return (
    <figure className="marquee-card flex w-[19rem] shrink-0 flex-col rounded-2xl border border-border bg-card p-6 sm:w-[22rem]">
      {review.rating !== undefined && (
        // aria-hidden on the stars with a text label alongside: five identical icons announce as
        // nothing useful, so the rating is given to screen readers as words.
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

      <figcaption className="mt-5 border-t border-border pt-4">
        <cite className="text-sm font-medium not-italic text-foreground">{review.author}</cite>
        {review.context && (
          <p className="mt-0.5 text-xs text-muted-foreground">{review.context}</p>
        )}
      </figcaption>
    </figure>
  );
}

interface PublishedReview {
  id: string;
  rating: number | null;
  comment: string;
  author: string;
  submittedAt: string | null;
}

/**
 * Reviews left by customers after delivery and approved by an admin. Fetched server-side so the
 * section is in the HTML for crawlers, and revalidated hourly rather than per request — a new
 * approval showing up within the hour is fine, and a marketing page should not hit the API on
 * every visit.
 *
 * A failure here returns nothing rather than throwing: the Google reviews below are already real
 * and sufficient, and the homepage must not 500 because the API is briefly unreachable.
 */
async function fetchPublishedReviews(): Promise<Review[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/reviews`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as PublishedReview[];
    return rows
      .filter((r) => r.comment?.trim())
      .map((r) => ({
        quote: r.comment,
        author: r.author,
        context: "Verified NationWide customer",
        ...(r.rating ? { rating: r.rating } : {}),
      }));
  } catch {
    return [];
  }
}

export async function MarketingReviews() {
  // Google reviews first: they are the older, larger body of feedback and they link back to a
  // verifiable public profile. Customer reviews from the app follow.
  const submitted = await fetchPublishedReviews();
  const all = [...REVIEWS, ...submitted];

  // The rule this file was written under: no reviews, no section — never a fabricated one.
  if (all.length === 0) return null;

  // Two lanes drifting in opposite directions, because a single belt of ten cards reads as a
  // loop you are watching rather than a body of feedback you are moving through. Split so the
  // longer reviews lead each lane and a reader meets substance first either way.
  const half = Math.ceil(all.length / 2);
  const lanes = [all.slice(0, half), all.slice(half)];

  return (
    <section id="reviews" className="relative isolate overflow-hidden bg-background py-20">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SectionHeading
          eyebrow="Reviews"
          title="What our customers say"
          description="Unedited, from our Google Business Profile and from customers who shipped with us."
        />
      </div>

      {/* Full-bleed and edge-masked, so cards dissolve at the margins instead of being chopped
          by the viewport — the belt reads as continuing past the screen rather than ending. */}
      <div className="marquee-viewport mt-12 space-y-6">
        {lanes.map((lane, laneIndex) => (
          <div key={laneIndex} className="flex overflow-hidden">
            <ul
              className={`animate-marquee flex shrink-0 gap-6 pr-6 ${
                laneIndex === 1 ? "marquee-reverse" : ""
              }`}
              // The lane is decorative motion around content that is already in the DOM twice;
              // the duplicate copy below is what makes the loop seamless, and a screen reader
              // must not read all ten reviews a second time.
            >
              {lane.map((review) => (
                <li key={review.author}>
                  <ReviewCard review={review} />
                </li>
              ))}
            </ul>
            <ul
              aria-hidden
              className={`animate-marquee flex shrink-0 gap-6 pr-6 ${
                laneIndex === 1 ? "marquee-reverse" : ""
              }`}
            >
              {lane.map((review) => (
                <li key={`${review.author}-dup`}>
                  <ReviewCard review={review} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
