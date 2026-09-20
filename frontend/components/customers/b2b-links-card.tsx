"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Mail, ShieldOff } from "lucide-react";
import type { B2bInviteResultDto, B2bLinkDto, CustomerDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/**
 * Everything that puts a business on the B2B portal.
 *
 * Two ways in, both issued here and neither self-served: an invitation email that turns their
 * customer account into a business login, and standing links for a despatch desk that keeps no
 * logins. A link is shown ONCE, when created — only its hash is stored — and whoever holds it can
 * place orders billed to this customer, which is why revoking sits right next to it.
 */
export function B2bLinksCard({
  customer,
  onCustomerChange,
}: {
  customer: CustomerDto;
  onCustomerChange: (next: CustomerDto) => void;
}) {
  const customerId = customer.id;
  const { showToast } = useToast();
  const [links, setLinks] = useState<B2bLinkDto[] | null>(null);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<B2bLinkDto | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setError(null);
    setIsInviting(true);
    try {
      const result = await apiClient.post<B2bInviteResultDto>(`${base}/invite`, {});
      onCustomerChange({ ...customer, isB2b: true });
      showToast({
        variant: "success",
        title: `Invitation sent to ${result.email}`,
        description: "They set a password from the email, then sign in at the normal login.",
      });
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the invitation."));
    } finally {
      setIsInviting(false);
    }
  }

  async function revokeAccess() {
    setError(null);
    try {
      await apiClient.delete(`${base}/access`);
      onCustomerChange({ ...customer, isB2b: false });
      setLinks((all) => (all ?? []).map((l) => ({ ...l, revokedAt: l.revokedAt ?? new Date().toISOString() })));
      showToast({ variant: "success", title: "Portal access withdrawn" });
    } catch (err) {
      setError(errorMessage(err, "Couldn't withdraw access."));
    }
  }

  const base = `/admin/customers/${customerId}/b2b-links`;

  useEffect(() => {
    apiClient
      .get<B2bLinkDto[]>(base)
      .then(setLinks)
      // Only the top roles may manage links; an empty card is the
      // right outcome there, not an error banner.
      .catch(() => setLinks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function create() {
    if (!label.trim()) {
      setError("Name the link, e.g. the team or site it is for.");
      return;
    }
    setError(null);
    setIsCreating(true);
    try {
      const link = await apiClient.post<B2bLinkDto>(base, { label: label.trim() });
      setCreated(link);
      setLinks((all) => [link, ...(all ?? [])]);
      setLabel("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the link."));
    } finally {
      setIsCreating(false);
    }
  }

  async function revoke(link: B2bLinkDto) {
    if (!window.confirm(`Revoke "${link.label}"? Anyone using it will lose access immediately.`)) {
      return;
    }
    try {
      const revoked = await apiClient.patch<B2bLinkDto>(`${base}/${link.id}/revoke`, {});
      setLinks((all) => (all ?? []).map((l) => (l.id === revoked.id ? revoked : l)));
      if (created?.id === revoked.id) setCreated(null);
      showToast({ variant: "success", title: "Link revoked" });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't revoke the link.") });
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ variant: "success", title: "Link copied" });
    } catch {
      showToast({ variant: "error", title: "Couldn't copy — select the link and copy it manually." });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4" aria-hidden />
          B2B order link
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Business account {customer.isB2b && <span className="text-success">· active</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              Invite them to sign in and book from the B2B portal: many recipients per pickup,
              reusing their saved addresses and items. They set their own password from the email.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={invite}
              isLoading={isInviting}
              disabled={!customer.email}
            >
              <Mail className="h-4 w-4" aria-hidden />
              {customer.isB2b ? "Resend invitation" : "Invite to B2B portal"}
            </Button>
            {customer.isB2b && (
              <ConfirmDialog
                title="Withdraw portal access?"
                description="They can no longer sign in to the B2B portal, and every standing link for them is revoked. Their orders and history are untouched."
                confirmLabel="Withdraw access"
                variant="danger"
                onConfirm={revokeAccess}
                trigger={
                  <Button type="button" size="sm" variant="secondary">
                    Withdraw access
                  </Button>
                }
              />
            )}
          </div>
          {!customer.email && (
            <p className="text-xs text-warning">
              Add an email address to this customer before inviting them.
            </p>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Or hand a despatch desk a standing link — booking with no login at all. Treat it like a
          password and revoke it if it leaks.
        </p>

        {created?.url && (
          <div className="space-y-2 rounded-lg border border-success-border bg-success-bg p-3">
            <p className="text-sm font-medium text-success">
              Copy this link now — it cannot be shown again.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" size="sm" variant="secondary" onClick={() => copy(created.url!)}>
                <Copy className="h-4 w-4" aria-hidden /> Copy
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="b2b-label">New link for</Label>
            <Input
              id="b2b-label"
              placeholder="e.g. Bengaluru despatch desk"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button type="button" onClick={create} isLoading={isCreating}>
            Create link
          </Button>
        </div>
        {error && <FieldError>{error}</FieldError>}

        {links && links.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {links.map((link) => (
              <li key={link.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{link.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    Created {when(link.createdAt)} ·{" "}
                    {link.revokedAt
                      ? `revoked ${when(link.revokedAt)}`
                      : link.lastUsedAt
                        ? `last used ${when(link.lastUsedAt)}`
                        : "never used"}
                  </span>
                </span>
                {!link.revokedAt && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => revoke(link)}>
                    <ShieldOff className="h-4 w-4" aria-hidden /> Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
