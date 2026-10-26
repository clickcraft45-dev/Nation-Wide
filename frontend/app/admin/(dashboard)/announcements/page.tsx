"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import type { AnnouncementDto, AnnouncementKind, SaveAnnouncementDto } from "@nationwide/shared-types";
import { isAnnouncementLive } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/page-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateField } from "@/components/ui/date-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { formatAnnouncementDates } from "@/lib/announcements";

const TEXTAREA =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const CHECKBOX = "h-4 w-4 rounded border-border";

type Form = {
  kind: AnnouncementKind;
  title: string;
  slug: string;
  summary: string;
  body: string;
  location: string;
  startsAt: string; // YYYY-MM-DD
  endsAt: string; // YYYY-MM-DD
  couponCode: string;
  isPublished: boolean;
  showBanner: boolean;
};

const EMPTY: Form = {
  kind: "OFFER",
  title: "",
  slug: "",
  summary: "",
  body: "",
  location: "",
  startsAt: "",
  endsAt: "",
  couponCode: "",
  isPublished: false,
  showBanner: false,
};

/** ISO -> YYYY-MM-DD in the admin's own timezone, for the date pickers. */
const dayOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");

function toForm(a: AnnouncementDto): Form {
  return {
    kind: a.kind,
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    body: a.body ?? "",
    location: a.location ?? "",
    startsAt: dayOf(a.startsAt),
    endsAt: dayOf(a.endsAt),
    couponCode: a.couponCode ?? "",
    isPublished: a.isPublished,
    showBanner: a.showBanner,
  };
}

function toBody(f: Form): SaveAnnouncementDto {
  return {
    kind: f.kind,
    title: f.title.trim(),
    slug: f.slug.trim() || undefined,
    summary: f.summary.trim(),
    body: f.body,
    location: f.kind === "EVENT" ? f.location : null,
    // A start date means the start of that day and an end date the end of it: an offer printed as
    // "until the 30th" should still work on the 30th.
    startsAt: f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : null,
    endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null,
    couponCode: f.kind === "OFFER" ? f.couponCode : null,
    isPublished: f.isPublished,
    showBanner: f.showBanner,
  };
}

function statusOf(a: AnnouncementDto): { label: string; variant: "success" | "warning" | "neutral" } {
  if (!a.isPublished) return { label: "Draft", variant: "neutral" };
  if (!isAnnouncementLive(a)) return { label: a.kind === "OFFER" ? "Ended" : "Past", variant: "neutral" };
  if (a.startsAt && new Date(a.startsAt) > new Date()) return { label: "Scheduled", variant: "warning" };
  return { label: "Live", variant: "success" };
}

/**
 * Events (/events) and sale offers (/offers) for the public site. "Published" is the page toggle,
 * "Site banner" puts it in the strip across the top of every marketing page while it is live.
 */
export default function AdminAnnouncementsPage() {
  const [rows, setRows] = useState<AnnouncementDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<AnnouncementDto[]>("/admin/announcements")
      .then(setRows)
      .catch((err) => setError(errorMessage(err, "Failed to load events and offers.")))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // One-shot fetch on mount, not a subscription to external state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function reset() {
    setForm(EMPTY);
    setEditingId(null);
  }

  async function save() {
    setIsSaving(true);
    try {
      if (editingId) await apiClient.put(`/admin/announcements/${editingId}`, toBody(form));
      else await apiClient.post("/admin/announcements", toBody(form));
      showToast({ variant: "success", title: editingId ? "Saved" : `${form.title.trim()} created` });
      reset();
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't save that.") });
    } finally {
      setIsSaving(false);
    }
  }

  async function setFlag(a: AnnouncementDto, flag: "isPublished" | "showBanner", value: boolean) {
    try {
      await apiClient.patch(`/admin/announcements/${a.id}/flags`, { [flag]: value });
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't update that.") });
    }
  }

  async function remove(a: AnnouncementDto) {
    try {
      await apiClient.delete(`/admin/announcements/${a.id}`);
      showToast({ variant: "success", title: `${a.title} deleted` });
      if (editingId === a.id) reset();
      load();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't delete that.") });
    }
  }

  const canSave = form.title.trim().length >= 3 && form.summary.trim().length >= 3;
  const isOffer = form.kind === "OFFER";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Events and offers</h1>
        <p className="text-sm text-muted-foreground">
          Offers appear on /offers while their dates run; events on /events. Turn on Site banner to
          show one in the strip at the top of the public site. Changes reach the site within about
          five minutes.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? `Editing: ${form.title || "untitled"}` : "New event or offer"}
            </h2>
            <SegmentedControl
              ariaLabel="Type"
              value={form.kind}
              onChange={(kind) => set("kind", kind)}
              options={[
                { value: "OFFER", label: "Offer" },
                { value: "EVENT", label: "Event" },
              ]}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                maxLength={120}
                placeholder={isOffer ? "Diwali sale: ₹500 off to the USA" : "Closed for Diwali, 1 to 3 November"}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-slug">Link (optional)</Label>
              <Input
                id="ann-slug"
                maxLength={80}
                placeholder="Made from the title"
                value={form.slug}
                onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ann-summary">Summary</Label>
            <Input
              id="ann-summary"
              maxLength={280}
              placeholder="One sentence shown in the list and the banner page"
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ann-body">{isOffer ? "Terms (optional)" : "Details (optional)"}</Label>
            <textarea
              id="ann-body"
              rows={5}
              maxLength={10_000}
              className={TEXTAREA}
              placeholder="Blank lines become paragraphs."
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ann-start">Starts (optional)</Label>
              <DateField
                id="ann-start"
                title="Start date"
                placeholder="Straight away"
                value={form.startsAt}
                clearable
                onChange={(v) => set("startsAt", v)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-end">Ends (optional)</Label>
              <DateField
                id="ann-end"
                title="End date"
                placeholder="No end date"
                value={form.endsAt}
                clearable
                onChange={(v) => set("endsAt", v)}
              />
            </div>
            {isOffer ? (
              <div className="space-y-1.5">
                <Label htmlFor="ann-code">Coupon code (optional)</Label>
                <Input
                  id="ann-code"
                  maxLength={32}
                  placeholder="Create it under Coupons"
                  className="font-mono"
                  value={form.couponCode}
                  onChange={(e) => set("couponCode", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="ann-location">Location (optional)</Label>
                <Input
                  id="ann-location"
                  maxLength={160}
                  placeholder="Hall 4, HITEX, Hyderabad"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={form.isPublished}
                onChange={(e) => set("isPublished", e.target.checked)}
              />
              Published
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className={CHECKBOX}
                checked={form.showBanner}
                onChange={(e) => set("showBanner", e.target.checked)}
              />
              Site banner
            </label>
            <div className="ml-auto flex gap-2">
              {editingId && (
                <Button variant="secondary" onClick={reset} disabled={isSaving}>
                  Cancel
                </Button>
              )}
              <Button onClick={save} disabled={!canSave} isLoading={isSaving}>
                {editingId ? "Save changes" : "Create"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <TableSkeleton columns={6} />}
      {error && <ErrorState message={error} onRetry={load} />}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" aria-hidden />}
          title="Nothing published yet"
          description="Create an offer or event above. It stays a draft until you tick Published."
        />
      )}

      {!isLoading && !error && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Banner</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const status = statusOf(a);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium text-foreground">
                    {a.title}
                    {a.couponCode && <span className="ml-2 font-mono text-xs text-muted-foreground">{a.couponCode}</span>}
                  </TableCell>
                  <TableCell>{a.kind === "OFFER" ? "Offer" : "Event"}</TableCell>
                  <TableCell>{formatAnnouncementDates(a) ?? "Always"}</TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      aria-label={`Published: ${a.title}`}
                      checked={a.isPublished}
                      onChange={(e) => setFlag(a, "isPublished", e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      aria-label={`Site banner: ${a.title}`}
                      checked={a.showBanner}
                      onChange={(e) => setFlag(a, "showBanner", e.target.checked)}
                    />
                  </TableCell>
                  <TableCell className="space-x-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditingId(a.id);
                        setForm(toForm(a));
                        window.scrollTo({ top: 0 });
                      }}
                    >
                      Edit
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="secondary">
                          Delete
                        </Button>
                      }
                      title={`Delete ${a.title}?`}
                      description="It comes off the public site straight away. This cannot be undone."
                      confirmLabel="Delete"
                      variant="danger"
                      onConfirm={() => remove(a)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
