"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Star } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Logo } from "@/components/brand/logo";
import { Spinner } from "@/components/ui/spinner";

interface Invitation {
  trackingNumber: string;
  customerName: string;
  alreadySubmitted: boolean;
}

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

export default function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiClient
      .get<Invitation>(`/feedback/${token}`)
      .then(setInvitation)
      .catch((err) => {
        // An expired or already-used link says exactly that — it is the whole reason someone
        // would be stuck here, and a generic message would leave them retrying a dead link.
        setLoadError(errorMessage(err, "Could not open this feedback link."));
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setFormError("Choose a rating from one to five stars.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post(`/feedback/${token}`, {
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setDone(true);
    } catch (err) {
      setFormError(errorMessage(err, "Could not send your feedback. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <Logo variant="horizontal" size="md" />
        {children}
      </div>
    </div>
  );

  if (isLoading) {
    return shell(
      <div className="flex justify-center py-10">
        <Spinner size="lg" className="text-[color:var(--brand-red)]" />
      </div>,
    );
  }

  if (loadError || !invitation) {
    return shell(
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground">Link unavailable</h1>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Link href="/" className="inline-block text-sm font-medium text-primary hover:underline">
          Back to home
        </Link>
      </div>,
    );
  }

  if (done || invitation.alreadySubmitted) {
    return shell(
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />
        <h1 className="text-2xl font-semibold text-foreground">
          {done ? "Thank you" : "Already received"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {done
            ? "Your feedback has been recorded. It genuinely shapes how we run the service."
            : "We have already received your feedback for this shipment. Thank you."}
        </p>
        <Link href="/" className="inline-block text-sm font-medium text-primary hover:underline">
          Back to home
        </Link>
      </div>,
    );
  }

  return shell(
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">How did we do?</h1>
        <p className="text-sm text-muted-foreground">
          Shipment{" "}
          <span className="font-medium text-foreground">{invitation.trackingNumber}</span> was
          delivered. Your feedback takes about thirty seconds.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Your rating</legend>
          {/* Radio semantics, not buttons: this is one choice out of five, and a screen reader
              should hear it that way rather than as five separate actions. */}
          <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label="Rating out of five"
            onMouseLeave={() => setHovered(0)}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} ${value === 1 ? "star" : "stars"} — ${RATING_LABELS[value]}`}
                onClick={() => {
                  setRating(value);
                  setFormError(null);
                }}
                onMouseEnter={() => setHovered(value)}
                className="rounded-sm p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Star
                  aria-hidden
                  className={
                    value <= (hovered || rating)
                      ? "h-8 w-8 fill-amber-400 text-amber-400"
                      : "h-8 w-8 text-muted-foreground/30"
                  }
                />
              </button>
            ))}
            <span className="ml-3 text-sm text-muted-foreground">
              {RATING_LABELS[hovered || rating]}
            </span>
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="comment">Anything you would like to add? (optional)</Label>
          <textarea
            id="comment"
            rows={5}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            placeholder="What went well, or what we could do better."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <p className="text-xs text-muted-foreground">
            We may publish this on our website with your first name. Nothing is published until
            we have read it.
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
          >
            {formError}
          </div>
        )}

        <Button type="submit" className="w-full" size="lg" isLoading={isSubmitting}>
          {isSubmitting ? "Sending…" : "Send feedback"}
        </Button>
      </form>
    </>,
  );
}
