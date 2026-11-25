"use client";

import { useEffect, useState } from "react";
import type { CompanySettingsDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { isUpiId } from "@/lib/upi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { UpiQr } from "@/components/payments/upi-qr";

/**
 * The UPI account customers pay into at the door and the warehouse counter. Saved on the active
 * company settings; partners' phones draw the payment QR from it with the amount filled in.
 * The preview is the same QR without an amount: scan it with a UPI app to check the name that
 * comes up before partners start using it.
 */
export function UpiSettingsCard() {
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [saved, setSaved] = useState<{ upiId: string; payeeName: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    apiClient
      .get<CompanySettingsDto>("/admin/company-settings")
      .then((s) => {
        const current = { upiId: s.upiId ?? "", payeeName: s.upiPayeeName ?? "" };
        setSaved(current);
        setUpiId(current.upiId);
        setPayeeName(current.payeeName);
      })
      .catch((err) => setLoadError(errorMessage(err, "Couldn't load the UPI settings.")));
  }, []);

  const trimmed = upiId.trim();
  const valid = isUpiId(trimmed);
  const changed = saved !== null && (trimmed !== saved.upiId || payeeName.trim() !== saved.payeeName);

  async function save() {
    if (!valid) {
      setError("Enter a UPI ID such as name@bank.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await apiClient.patch("/admin/company-settings", {
        upiId: trimmed,
        ...(payeeName.trim() ? { upiPayeeName: payeeName.trim() } : {}),
      });
      setSaved({ upiId: trimmed, payeeName: payeeName.trim() });
      showToast({
        variant: "success",
        title: "UPI account saved",
        description: "Partners' payment QR codes now pay into this account.",
      });
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the UPI account."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>UPI for collections</CardTitle>
        <p className="text-sm text-muted-foreground">
          Where customers pay by UPI. Partners and the warehouse counter show a QR for this account with
          the amount already filled in.
        </p>
      </CardHeader>
      <CardContent>
        {loadError ? (
          <p className="text-sm text-danger">{loadError}</p>
        ) : saved === null ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="upi-id">UPI ID</Label>
                <Input
                  id="upi-id"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="name@bank"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  error={Boolean(error)}
                  aria-describedby="upi-id-hint"
                />
                <p id="upi-id-hint" className="text-xs text-muted-foreground">
                  Printed under the QR on your bank&apos;s sticker. Check every character: payments go
                  exactly where this says.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="upi-payee">Name shown to the customer</Label>
                <Input
                  id="upi-payee"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="As registered with the bank"
                />
              </div>
              {error && <FieldError>{error}</FieldError>}
              <Button type="button" onClick={save} isLoading={isSaving} disabled={!changed || isSaving}>
                Save UPI account
              </Button>
            </div>
            {valid ? (
              <div className="space-y-1">
                <UpiQr upiId={trimmed} payeeName={payeeName.trim() || null} className="sm:w-64" />
                <p className="max-w-64 text-xs text-muted-foreground">
                  Scan with any UPI app and check the account name before saving. Don&apos;t pay.
                </p>
              </div>
            ) : (
              <p className="self-center text-sm text-muted-foreground sm:w-64">
                The QR preview appears once the UPI ID is complete.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
