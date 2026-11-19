"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Mail, ShieldOff, Building2 } from "lucide-react";
import type { B2bInviteResultDto, B2bLinkDto, CustomerDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Everything that puts a business on the B2B portal, in the order it happens.
 *
 * 1. Portal login: an invitation email turns the customer account into a business login; they
 *    set their own password from it.
 * 2. Ordering links: standing links for the business's teams or sites (a despatch desk that keeps
 *    no logins). A link is shown ONCE, when created, since only its hash is stored, and whoever
 *    holds it can place orders billed to this business, which is why revoking sits beside it.
 */
export function B2bLinksCard({
  customer,
  onCustomerChange,
}: {
  customer: CustomerDto;
  onCustomerChange: (next: CustomerDto) => void;
}) {
  const customerId = customer.id;
  const base = `/admin/customers/${customerId}/b2b-links`;
  const { showToast } = useToast();
  const [links, setLinks] = useState<B2bLinkDto[] | null>(null);
  const [label, setLabel] = useState("");
  const [contactName, setContactName] = useState("");
  const [created, setCreated] = useState<B2bLinkDto | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<B2bLinkDto[]>(base)
      .then(setLinks)
      // Only the top roles may manage links; an empty card is the right outcome there, not an
      // error banner.
      .catch(() => setLinks([]));
  }, [base]);

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
      setCreated(null);
      showToast({ variant: "success", title: "Portal access withdrawn" });
    } catch (err) {
      setError(errorMessage(err, "Couldn't withdraw access."));
    }
  }

  async function create(e: React.SubmitEvent) {
    e.preventDefault();
    if (!label.trim()) {
      setError("Name the link: the team or site it is for.");
      return;
    }
    setError(null);
    setIsCreating(true);
    try {
      const link = await apiClient.post<B2bLinkDto>(base, {
        label: label.trim(),
        contactName: contactName.trim() || undefined,
      });
      setCreated(link);
      setLinks((all) => [link, ...(all ?? [])]);
      setLabel("");
      setContactName("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the link."));
    } finally {
      setIsCreating(false);
    }
  }

  async function revoke(link: B2bLinkDto) {
    try {
      const revoked = await apiClient.patch<B2bLinkDto>(`${base}/${link.id}/revoke`, {});
      setLinks((all) => (all ?? []).map((l) => (l.id === revoked.id ? revoked : l)));
      if (created?.id === revoked.id) setCreated(null);
      showToast({ variant: "success", title: `"${link.label}" revoked` });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't revoke the link.") });
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast({ variant: "success", title: "Link copied" });
    } catch {
      showToast({ variant: "error", title: "Couldn't copy: select the link and copy it manually." });
    }
  }

  const live = (links ?? []).filter((l) => !l.revokedAt);
  const revoked = (links ?? []).filter((l) => l.revokedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4" aria-hidden />
          B2B access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: the business's own login. */}
        <section aria-labelledby={`portal-${customerId}`} className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 id={`portal-${customerId}`} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                Portal login
                {customer.isB2b ? <Badge variant="success">Invited</Badge> : <Badge variant="neutral">Not invited</Badge>}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground text-pretty">
                {customer.isB2b
                  ? `Invitation emailed to ${customer.email ?? "their address"}. They book from the B2B portal with many recipients per pickup and their saved addresses.`
                  : "Email them an invitation to the B2B portal. They set their own password from it."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={invite} isLoading={isInviting} disabled={!customer.email}>
                <Mail className="h-4 w-4" aria-hidden />
                {customer.isB2b ? "Resend invitation" : "Invite to B2B portal"}
              </Button>
              {customer.isB2b && (
                <ConfirmDialog
                  title="Withdraw portal access?"
                  description="They can no longer sign in to the B2B portal, and every ordering link for them is revoked. Their orders and history are untouched."
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
          </div>
          {!customer.email && (
            <p className="text-xs text-warning">Add an email address with Edit before inviting them.</p>
          )}
        </section>

        {/* Step 2: links for their teams, issued under this business. */}
        <section aria-labelledby={`links-${customerId}`} className="space-y-3 border-t border-border pt-5">
          <div>
            <h4 id={`links-${customerId}`} className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Ordering links
              <span className="text-xs font-normal tabular-nums text-muted-foreground">{live.length} live</span>
            </h4>
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              One per team or site that books without a login. Each is billed to {customer.name}. Treat it
              like a password: revoke one without cutting off the rest.
            </p>
          </div>

          <form onSubmit={create} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`b2b-label-${customerId}`}>Team or site</Label>
              <Input
                id={`b2b-label-${customerId}`}
                maxLength={80}
                placeholder="Bengaluru despatch desk"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`b2b-contact-${customerId}`}>Handed to (optional)</Label>
              <Input
                id={`b2b-contact-${customerId}`}
                maxLength={80}
                placeholder="Despatch manager"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <Button type="submit" isLoading={isCreating}>
              <Link2 className="h-4 w-4" aria-hidden />
              Create link
            </Button>
          </form>
          {error && <FieldError>{error}</FieldError>}

          {created?.url && (
            <div className="space-y-2 rounded-xl border border-success-border bg-success-bg p-3" role="status">
              <p className="text-sm font-medium text-success">
                Copy this link now. It cannot be shown again.
                {created.emailedTo ? ` It was also emailed to ${created.emailedTo}.` : ""}
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={created.url}
                  aria-label="New ordering link"
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" size="sm" variant="secondary" onClick={() => copy(created.url!)}>
                  <Copy className="h-4 w-4" aria-hidden /> Copy
                </Button>
              </div>
            </div>
          )}

          {links && links.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No links yet. Create one for each team that books for {customer.name}.
            </p>
          )}

          {links && links.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {[...live, ...revoked].map((link) => (
                <li key={link.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${link.revokedAt ? "bg-muted-foreground/40" : "bg-success"}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${link.revokedAt ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {link.label}
                      {link.contactName ? (
                        <span className="font-normal text-muted-foreground"> · {link.contactName}</span>
                      ) : null}
                    </span>
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
                    <ConfirmDialog
                      title={`Revoke "${link.label}"?`}
                      description="Anyone using it loses access immediately. It cannot be un-revoked; create a new one instead."
                      confirmLabel="Revoke"
                      variant="danger"
                      onConfirm={() => revoke(link)}
                      trigger={
                        <Button type="button" size="sm" variant="secondary">
                          <ShieldOff className="h-4 w-4" aria-hidden /> Revoke
                        </Button>
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
