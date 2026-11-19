"use client";

import { useEffect, useState, type FormEvent } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Phone } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Label, FieldError } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

/**
 * Google sign-up gives us a name and an email but no phone, so those accounts are created with a
 * "google:<id>" placeholder that WhatsApp updates and pickup partners cannot use. This asks for a
 * real number the first time such a customer opens the portal, and keeps asking until they give
 * one: a booking without a reachable phone is a pickup the partner cannot call ahead for.
 */
export function PhoneRequiredDialog() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ phone: string | null }>("/customers/me")
      .then((me) => {
        if (!cancelled && (!me.phone || !me.phone.startsWith("+"))) setOpen(true);
      })
      // If the profile can't be read, don't block the portal over it.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setError("Enter your full mobile number.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await apiClient.patch("/customers/me", { phone });
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your number. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[3px]" />
        <RadixDialog.Content
          // Required: Escape and clicks outside do not dismiss it.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="glass-raised fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 focus:outline-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Phone className="h-5 w-5" aria-hidden />
          </div>
          <RadixDialog.Title className="mt-4 text-base font-semibold text-foreground">
            Add your mobile number
          </RadixDialog.Title>
          <RadixDialog.Description className="mt-1 text-sm text-muted-foreground">
            Our pickup partner calls this number before collecting your parcel, and we send
            booking and tracking updates to it on WhatsApp.
          </RadixDialog.Description>

          <form onSubmit={save} className="mt-5 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="required-phone">Mobile number</Label>
              <PhoneInput
                id="required-phone"
                value={phone}
                onChange={(v) => {
                  setPhone(v);
                  if (error) setError(null);
                }}
                error={Boolean(error)}
                disabled={isSaving}
              />
              {error && <FieldError>{error}</FieldError>}
            </div>
            <Button type="submit" className="w-full" isLoading={isSaving} disabled={isSaving}>
              Save and continue
            </Button>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
