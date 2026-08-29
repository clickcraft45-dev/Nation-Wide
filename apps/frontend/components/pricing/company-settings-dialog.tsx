"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CompanySettingsDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(
  /\/api\/v1$/,
  "",
);

const textareaClass =
  "glass-field w-full rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface FormState {
  companyName: string;
  tagline: string;
  primaryColor: string;
  website: string;
  supportEmail: string;
  supportPhone: string;
  address: string;
  termsAndConditions: string;
  footerNotes: string;
  insuranceDisclaimer: string;
  legalDisclaimer: string;
  restrictedItemsNotice: string;
}

function formFromSettings(settings: CompanySettingsDto): FormState {
  return {
    companyName: settings.companyName,
    tagline: settings.tagline ?? "",
    primaryColor: settings.primaryColor,
    website: settings.website ?? "",
    supportEmail: settings.supportEmail ?? "",
    supportPhone: settings.supportPhone ?? "",
    address: settings.address ?? "",
    termsAndConditions: settings.termsAndConditions ?? "",
    footerNotes: settings.footerNotes ?? "",
    insuranceDisclaimer: settings.insuranceDisclaimer ?? "",
    legalDisclaimer: settings.legalDisclaimer ?? "",
    restrictedItemsNotice: settings.restrictedItemsNotice ?? "",
  };
}

// These fields automatically populate every future generated Rate Card PDF (see
// RateCardDataService/classic-template.tsx on the backend) — there is nothing per-PDF to
// re-enter once set here.
export function CompanySettingsDialog({
  trigger,
  onSaved,
}: {
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<CompanySettingsDto | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    apiClient
      .get<CompanySettingsDto>("/admin/company-settings")
      .then((s) => {
        setSettings(s);
        setForm(formFromSettings(s));
      })
      .finally(() => setIsLoading(false));
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = await apiClient.patch<CompanySettingsDto>("/admin/company-settings", {
        companyName: form.companyName.trim(),
        tagline: form.tagline.trim() || undefined,
        primaryColor: form.primaryColor.trim(),
        website: form.website.trim() || undefined,
        supportEmail: form.supportEmail.trim() || undefined,
        supportPhone: form.supportPhone.trim() || undefined,
        address: form.address.trim() || undefined,
        termsAndConditions: form.termsAndConditions.trim() || undefined,
        footerNotes: form.footerNotes.trim() || undefined,
        insuranceDisclaimer: form.insuranceDisclaimer.trim() || undefined,
        legalDisclaimer: form.legalDisclaimer.trim() || undefined,
        restrictedItemsNotice: form.restrictedItemsNotice.trim() || undefined,
      });
      setSettings(saved);
      showToast({ variant: "success", title: "Rate card settings saved" });
      onSaved?.();
      setOpen(false);
    } catch {
      setError("Couldn't save settings. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const saved = await apiClient.postForm<CompanySettingsDto>(
        "/admin/company-settings/logo",
        formData,
      );
      setSettings(saved);
      showToast({ variant: "success", title: "Logo updated" });
    } catch {
      setError("Couldn't upload the logo. Use a PNG, JPEG, or WebP under 5MB.");
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!form && open && !isLoading) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title="Rate Card Settings">
          {isLoading || !form ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Applies to every future generated rate card automatically — logo, brand color, and
                contact/legal text never need to be re-entered per document.
              </p>

              <div className="space-y-1.5">
                <Label>Company Logo</Label>
                <div className="flex items-center gap-3">
                  {settings?.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${API_ORIGIN}${settings.logoUrl}`}
                      alt="Company logo"
                      className="h-12 w-12 rounded border border-border object-contain"
                    />
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoChange}
                    disabled={isUploadingLogo}
                    className="text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cs-name">Company Name</Label>
                  <Input
                    id="cs-name"
                    value={form.companyName}
                    onChange={(e) => setForm((f) => f && { ...f, companyName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-tagline">Tagline</Label>
                  <Input
                    id="cs-tagline"
                    placeholder="e.g. Delivering Trust Across Borders"
                    value={form.tagline}
                    onChange={(e) => setForm((f) => f && { ...f, tagline: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-color">Primary Brand Colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(form.primaryColor) ? form.primaryColor : "#1261A0"}
                      onChange={(e) => setForm((f) => f && { ...f, primaryColor: e.target.value })}
                      className={cn("glass-field h-9 w-9 shrink-0 rounded-lg")}
                    />
                    <Input
                      id="cs-color"
                      value={form.primaryColor}
                      onChange={(e) => setForm((f) => f && { ...f, primaryColor: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-website">Website</Label>
                  <Input
                    id="cs-website"
                    value={form.website}
                    onChange={(e) => setForm((f) => f && { ...f, website: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-email">Support Email</Label>
                  <Input
                    id="cs-email"
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => setForm((f) => f && { ...f, supportEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-phone">Support Number</Label>
                  <Input
                    id="cs-phone"
                    value={form.supportPhone}
                    onChange={(e) => setForm((f) => f && { ...f, supportPhone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-address">Company Address</Label>
                  <Input
                    id="cs-address"
                    value={form.address}
                    onChange={(e) => setForm((f) => f && { ...f, address: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cs-terms">Terms & Conditions</Label>
                <textarea
                  id="cs-terms"
                  rows={2}
                  className={textareaClass}
                  value={form.termsAndConditions}
                  onChange={(e) => setForm((f) => f && { ...f, termsAndConditions: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-insurance">Insurance Disclaimer</Label>
                <textarea
                  id="cs-insurance"
                  rows={2}
                  className={textareaClass}
                  value={form.insuranceDisclaimer}
                  onChange={(e) => setForm((f) => f && { ...f, insuranceDisclaimer: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-restricted">Restricted Items Notice</Label>
                <textarea
                  id="cs-restricted"
                  rows={2}
                  className={textareaClass}
                  value={form.restrictedItemsNotice}
                  onChange={(e) => setForm((f) => f && { ...f, restrictedItemsNotice: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-legal">Legal Disclaimer</Label>
                <textarea
                  id="cs-legal"
                  rows={2}
                  className={textareaClass}
                  value={form.legalDisclaimer}
                  onChange={(e) => setForm((f) => f && { ...f, legalDisclaimer: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-footer">Footer Notes</Label>
                <textarea
                  id="cs-footer"
                  rows={2}
                  className={textareaClass}
                  value={form.footerNotes}
                  onChange={(e) => setForm((f) => f && { ...f, footerNotes: e.target.value })}
                />
              </div>

              {error && <FieldError>{error}</FieldError>}

              <div className="flex justify-end gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" size="sm" isLoading={isSubmitting}>
                  Save Settings
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}
