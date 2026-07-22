"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CustomerDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export default function CustomerProfilePage() {
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    apiClient
      .get<CustomerDto>("/customers/me")
      .then((data) => {
        setCustomer(data);
        setName(data.name);
        setEmail(data.email ?? "");
        setAddress(data.address ?? "");
      })
      .catch(() => setError("Failed to load your profile."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await apiClient.patch<CustomerDto>("/customers/me", {
        name: name.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });
      setCustomer(updated);
      showToast({ variant: "success", title: "Profile updated" });
    } catch {
      showToast({ variant: "error", title: "Failed to update profile" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account details.</p>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && customer && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Personal information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="max-w-sm space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={customer.phone} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <Button type="submit" isLoading={isSaving}>
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
