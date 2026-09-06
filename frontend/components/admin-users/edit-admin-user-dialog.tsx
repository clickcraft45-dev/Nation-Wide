"use client";

import { useState, type ReactNode } from "react";
import type { AdminUserDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * Edits the profile fields of an existing internal account. Role and active state are changed
 * from the table row itself, and the password is a separate request below — the backend keeps
 * those endpoints apart so a password can never ride along in a role change's audit snapshot.
 */
export function EditAdminUserDialog({
  trigger,
  user,
  onSaved,
}: {
  trigger: ReactNode;
  user: AdminUserDto;
  onSaved: (updated: AdminUserDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phone.trim() && !/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
      setError("Phone must be in E.164 format, e.g. +919876543210.");
      return;
    }
    if (password && password.length < 10) {
      setError("A new password must be at least 10 characters.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const updated = await apiClient.patch<AdminUserDto>(`/admin/users/${user.id}`, {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      // Only when one was typed. Sent separately on purpose — see the class doc above.
      if (password) {
        await apiClient.patch(`/admin/users/${user.id}/password`, { password });
      }

      showToast({
        variant: "success",
        title: password ? "Account updated and password reset" : "Account updated",
      });
      onSaved(updated);
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the changes. Please try again."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      {open && (
        <DialogContent
          title={`Edit ${user.name ?? user.email}`}
          description="Leave the password blank to keep the current one."
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                placeholder="+919876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-password">New password (optional)</Label>
              <PasswordInput
                id="edit-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Setting one signs this account out everywhere.
              </p>
            </div>

            {error && <FieldError>{error}</FieldError>}

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="secondary" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" isLoading={isSaving}>
                Save changes
              </Button>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
