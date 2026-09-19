"use client";

import { useState } from "react";
import { Boxes, CheckCircle2, Link2, Repeat2, Users } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

const BENEFITS = [
  {
    icon: Link2,
    title: "Your own booking link",
    body: "One link for your despatch team — no logins to hand out or take back when someone leaves.",
  },
  {
    icon: Boxes,
    title: "Many shipments, one pickup",
    body: "Book a whole day's parcels in one go. We collect them all from your address in a single visit.",
  },
  {
    icon: Users,
    title: "Recipients saved",
    body: "Everyone you have shipped to before is one tap away, so repeat consignees are never retyped.",
  },
  {
    icon: Repeat2,
    title: "Contents remembered",
    body: "Your usual goods, values and HS codes are stored and reused on every customs declaration.",
  },
];

const VOLUMES = [
  "Under 20 parcels a month",
  "20–50 parcels a month",
  "50–200 parcels a month",
  "200+ parcels a month",
];

interface FormState {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  monthlyVolume: string;
  message: string;
}

const EMPTY: FormState = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  monthlyVolume: "",
  message: "",
};

/**
 * The business section: what a B2B account gives a company that ships regularly, and the form that
 * asks for one.
 *
 * Submitting creates nothing but a request — an admin reviews it and, on approval, the business is
 * sent their own ordering link (see B2bRequestsService). Deliberately not a sign-up: a link that
 * books shipments billed to an account is never self-served.
 */
export function MarketingBusiness() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.companyName.trim()) next.companyName = "Enter your company name.";
    if (!form.contactName.trim()) next.contactName = "Enter your name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (!/^\+[1-9]\d{7,14}$/.test(form.phone)) {
      next.phone = "Enter a valid phone number.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await apiClient.post("/b2b-requests", {
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone,
        monthlyVolume: form.monthlyVolume || undefined,
        message: form.message.trim() || undefined,
      });
      setSubmitted(true);
      setForm(EMPTY);
    } catch (err) {
      setSubmitError(
        errorMessage(err, "We couldn't send your request. Please try again in a moment."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section id="business" className="scroll-mt-24 bg-muted/30 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading
          eyebrow="For businesses"
          title="Shipping regularly? Open a business account."
          description="Exporters, e-commerce sellers and manufacturers book with us from their own link — many shipments per pickup, with addresses and contents saved for next time."
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <ul className="grid gap-4 sm:grid-cols-2 lg:content-start">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title}>
                <Card className="h-full">
                  <CardContent className="space-y-2 pt-5">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-red-tint text-brand-red">
                      <benefit.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <p className="font-medium text-foreground">{benefit.title}</p>
                    <p className="text-sm text-muted-foreground">{benefit.body}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <Card>
            <CardContent className="pt-5">
              {submitted ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
                  <p className="text-lg font-semibold text-foreground">Request received</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Our team will call you to set up your business account and send your ordering
                    link.
                  </p>
                  <Button type="button" variant="secondary" onClick={() => setSubmitted(false)}>
                    Send another request
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <p className="text-sm text-muted-foreground">
                    Tell us about your shipping and we&apos;ll be in touch.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="b2b-company">Company name</Label>
                      <Input
                        id="b2b-company"
                        value={form.companyName}
                        onChange={(e) => set("companyName")(e.target.value)}
                        error={Boolean(errors.companyName)}
                      />
                      {errors.companyName && <FieldError>{errors.companyName}</FieldError>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="b2b-contact">Your name</Label>
                      <Input
                        id="b2b-contact"
                        value={form.contactName}
                        onChange={(e) => set("contactName")(e.target.value)}
                        error={Boolean(errors.contactName)}
                      />
                      {errors.contactName && <FieldError>{errors.contactName}</FieldError>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="b2b-email">Work email</Label>
                      <Input
                        id="b2b-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => set("email")(e.target.value)}
                        error={Boolean(errors.email)}
                      />
                      {errors.email && <FieldError>{errors.email}</FieldError>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="b2b-phone">Phone</Label>
                      <PhoneInput
                        id="b2b-phone"
                        value={form.phone}
                        onChange={set("phone")}
                        error={Boolean(errors.phone)}
                      />
                      {errors.phone && <FieldError>{errors.phone}</FieldError>}
                    </div>
                  </div>

                  <fieldset className="space-y-1.5">
                    <legend className="mb-1.5 text-sm font-medium text-foreground">
                      Roughly how much do you ship? (optional)
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {VOLUMES.map((volume) => (
                        <button
                          key={volume}
                          type="button"
                          aria-pressed={form.monthlyVolume === volume}
                          onClick={() =>
                            set("monthlyVolume")(form.monthlyVolume === volume ? "" : volume)
                          }
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            form.monthlyVolume === volume
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {volume}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="space-y-1.5">
                    <Label htmlFor="b2b-message">Anything else? (optional)</Label>
                    <textarea
                      id="b2b-message"
                      rows={3}
                      placeholder="Where you ship to, what you send, when you need it collected…"
                      className="glass-field w-full rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={form.message}
                      onChange={(e) => set("message")(e.target.value)}
                    />
                  </div>

                  {submitError && <FieldError>{submitError}</FieldError>}

                  <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
                    Request a business account
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    No account is created until our team has spoken to you.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
