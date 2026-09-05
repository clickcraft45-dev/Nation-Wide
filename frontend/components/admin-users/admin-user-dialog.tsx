"use client";

import { useState, type ReactNode } from "react";
import type { AdminUserDto } from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

// Create-only, mirroring PickupPartnerDialog: staff accounts are onboarded by an admin here and
// then signed into with the credentials that admin set. There is no self-service registration
// for staff — /auth/register only ever creates Customer accounts.
export function AdminUserDialog({
  trigger,
  onSaved,
}: {
  trigger: ReactNode;
  onSaved: (user: AdminUserDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"STAFF" | "ADMIN">("STAFF");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Mirrors the DTO's own @MinLength(10) so the common mistake is caught without a round trip.
    if (!email.trim() || password.length < 10) {
      setError("A valid email and a password of at least 10 characters are required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = await apiClient.post<AdminUserDto>("/admin/users", {
        email: email.trim(),
        password,
        role,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      showToast({ variant: "success", title: "Staff account created" });
      onSaved(saved);
      setOpen(false);
      setEmail("");
      setPassword("");
      setName("");
      setPhone("");
      setRole("STAFF");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "An account with that email already exists."
          : "Couldn't create the account. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent title="New Staff Account">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Name</Label>
              <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-phone">Phone</Label>
              <Input id="user-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Role</Label>
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "STAFF" | "ADMIN")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admin</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Admins can manage pricing, issue invoices and manage these accounts. Staff cannot.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">Password</Label>
              <PasswordInput
                id="user-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                Create Account
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
