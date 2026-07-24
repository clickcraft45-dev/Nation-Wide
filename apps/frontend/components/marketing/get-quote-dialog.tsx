"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

interface FormState {
  name: string;
  contact: string;
  origin: string;
  destination: string;
  weightKg: string;
  message: string;
}

const EMPTY: FormState = {
  name: "",
  contact: "",
  origin: "",
  destination: "",
  weightKg: "",
  message: "",
};

// Quote requests aren't wired to a real backend yet — pricing/approval logic is coming in a
// later phase. For now this just collects the request and shows a confirmation.
export function GetQuoteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!form.contact.trim()) next.contact = "Phone or email is required.";
    if (!form.origin.trim()) next.origin = "Origin is required.";
    if (!form.destination.trim()) next.destination = "Destination is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitted(true);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // Reset after the close animation has room to finish.
      setTimeout(() => {
        setSubmitted(false);
        setForm(EMPTY);
        setErrors({});
      }, 200);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open && (
        <DialogContent
          title={submitted ? "Request received" : "Get a shipping quote"}
          description={
            submitted
              ? undefined
              : "Tell us about your shipment and our team will get back to you with pricing."
          }
        >
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
              <p className="text-sm text-muted-foreground">
                Thanks, {form.name.split(" ")[0]}! Our team will reach out shortly with a quote
                for your shipment from {form.origin} to {form.destination}.
              </p>
              <DialogClose asChild>
                <Button size="sm">Done</Button>
              </DialogClose>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="quote-name">Name</Label>
                <Input
                  id="quote-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  error={Boolean(errors.name)}
                />
                {errors.name && <FieldError>{errors.name}</FieldError>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quote-contact">Phone or email</Label>
                <Input
                  id="quote-contact"
                  value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  error={Boolean(errors.contact)}
                />
                {errors.contact && <FieldError>{errors.contact}</FieldError>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quote-origin">Origin</Label>
                  <Input
                    id="quote-origin"
                    value={form.origin}
                    onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
                    error={Boolean(errors.origin)}
                  />
                  {errors.origin && <FieldError>{errors.origin}</FieldError>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quote-destination">Destination</Label>
                  <Input
                    id="quote-destination"
                    value={form.destination}
                    onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                    error={Boolean(errors.destination)}
                  />
                  {errors.destination && <FieldError>{errors.destination}</FieldError>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quote-weight">Approximate weight (kg, optional)</Label>
                <Input
                  id="quote-weight"
                  type="number"
                  step="0.1"
                  value={form.weightKg}
                  onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quote-message">Anything else? (optional)</Label>
                <Input
                  id="quote-message"
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" size="sm">
                  Request quote
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
