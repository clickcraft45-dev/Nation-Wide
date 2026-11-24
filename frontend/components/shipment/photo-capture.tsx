"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Eye, ImagePlus, Trash2 } from "lucide-react";
import {
  MAX_PHOTOS_PER_KIND,
  MAX_PHOTOS_PER_UPLOAD,
  type PickupDocumentsDto,
  type PickupPhotoDto,
  type PickupPhotoKind,
  type PickupRequestDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { compressImage, MAX_UPLOAD_BYTES } from "@/lib/utils/compress-image";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils/cn";

/** Labels offered as one tap; "Other" lets the partner type their own. */
const SUGGESTED_LABELS: Record<PickupPhotoKind, string[]> = {
  KYC: ["Front", "Back"],
  PARCEL: ["Full parcel", "Shipping label", "Contents"],
  PAYMENT: ["UPI screenshot", "Bank transfer"],
};

const OTHER = "__other__";

/** Opens a photo through a five-minute link, fetched only when asked. */
export async function openPickupPhoto(apiBase: string, pickupId: string, photoId: string): Promise<boolean> {
  // Opened synchronously so a popup blocker treats it as the user's own click.
  const tab = window.open("", "_blank");
  try {
    const docs = await apiClient.get<PickupDocumentsDto>(`${apiBase}/${pickupId}/documents`);
    const url = docs.photos.find((p) => p.id === photoId)?.url;
    if (tab && url) {
      tab.location.href = url;
      return true;
    }
  } catch {
    // Falls through to closing the blank tab.
  }
  tab?.close();
  return false;
}

/**
 * The photos of one thing at pickup: the customer's ID document, or the parcel. Several of each,
 * every one labelled ("Front", "Back", "Shipping label"), so whoever opens them later knows what
 * they are looking at.
 *
 * On a phone, "Take photo" opens the rear camera straight away; "Choose photos" picks several
 * from the gallery. Each is shrunk on the phone before it is sent (a 15 MB camera shot uploads
 * as a few hundred KB) and compressed again on the server.
 */
export function PickupPhotos({
  pickupId,
  apiBase,
  kind,
  title,
  hint,
  photos,
  onChange,
  disabled,
  compact = false,
}: {
  pickupId: string;
  /** "/partner/pickup-requests" or "/admin/pickup-requests". */
  apiBase: string;
  kind: PickupPhotoKind;
  title: string;
  hint?: string;
  photos: PickupPhotoDto[];
  onChange: (updated: PickupRequestDto) => void;
  disabled?: boolean;
  /** Smaller controls for the admin console; the partner app keeps 44px targets. */
  compact?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const suggestions = SUGGESTED_LABELS[kind];
  const [choice, setChoice] = useState(suggestions[0]);
  const [customLabel, setCustomLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = choice === OTHER ? customLabel.trim() : choice;
  const room = MAX_PHOTOS_PER_KIND - photos.length;
  const size = compact ? "sm" : "lg";
  const labelGroupId = `${pickupId}-${kind}-label`;

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // picking the same file again must still fire
    if (picked.length === 0) return;
    if (choice === OTHER && !label) {
      setError("Type what the photo shows first.");
      return;
    }
    if (picked.length > Math.min(room, MAX_PHOTOS_PER_UPLOAD)) {
      setError(
        room <= 0
          ? `This already has ${MAX_PHOTOS_PER_KIND} photos. Remove one to add another.`
          : `Add up to ${Math.min(room, MAX_PHOTOS_PER_UPLOAD)} photos at a time.`,
      );
      return;
    }
    setError(null);
    try {
      setBusy(picked.length > 1 ? `Preparing ${picked.length} photos…` : "Preparing photo…");
      const files = await Promise.all(picked.map(compressImage));
      if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) {
        setError("That photo is too large to send. Retake it at a lower resolution.");
        return;
      }
      setBusy(files.length > 1 ? `Uploading ${files.length} photos…` : "Uploading…");
      const form = new FormData();
      form.append("kind", kind);
      form.append("labels", label || suggestions[0]);
      for (const file of files) form.append("files", file);
      const updated = await apiClient.postForm<PickupRequestDto>(`${apiBase}/${pickupId}/photos`, form);
      onChange(updated);
      // Front done: the next photo is most likely the back.
      const next = suggestions.indexOf(choice) + 1;
      if (next > 0 && next < suggestions.length) setChoice(suggestions[next]);
    } catch (err) {
      setError(errorMessage(err, "The photo didn't upload. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  }

  async function remove(photoId: string) {
    setRemovingId(photoId);
    setError(null);
    try {
      onChange(await apiClient.delete<PickupRequestDto>(`${apiBase}/${pickupId}/photos/${photoId}`));
    } catch (err) {
      setError(errorMessage(err, "Couldn't remove that photo. Try again."));
    } finally {
      setRemovingId(null);
    }
  }

  async function view(photoId: string) {
    if (!(await openPickupPhoto(apiBase, pickupId, photoId))) setError("Couldn't open the photo right now.");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {photos.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {photos.length} on file
          </span>
        )}
      </div>

      {photos.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {photos.map((photo) => (
            <li key={photo.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{photo.label}</span>
              <Button
                type="button"
                variant="ghost"
                size={size}
                onClick={() => view(photo.id)}
                aria-label={`View ${photo.label}`}
              >
                <Eye className="h-4 w-4" aria-hidden />
                <span className={compact ? "sr-only" : undefined}>View</span>
              </Button>
              <ConfirmDialog
                title={`Remove "${photo.label}"?`}
                description="The photo is deleted for good."
                confirmLabel="Remove photo"
                variant="danger"
                onConfirm={() => remove(photo.id)}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size={size}
                    isLoading={removingId === photo.id}
                    disabled={disabled || removingId !== null}
                    aria-label={`Remove ${photo.label}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <fieldset className="space-y-1.5" disabled={disabled || busy !== null}>
        <legend id={labelGroupId} className="text-xs text-muted-foreground">
          What the next photo shows
        </legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={labelGroupId}>
          {[...suggestions, OTHER].map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={choice === option}
              onClick={() => setChoice(option)}
              className={cn(
                "rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                compact ? "min-h-8" : "min-h-11",
                choice === option
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted active:bg-muted",
              )}
            >
              {option === OTHER ? "Other" : option}
            </button>
          ))}
        </div>
        {choice === OTHER && (
          <div className="space-y-1">
            <Label htmlFor={`${labelGroupId}-custom`}>Photo label</Label>
            <Input
              id={`${labelGroupId}-custom`}
              value={customLabel}
              maxLength={60}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder={
                kind === "KYC" ? "e.g. Address page" : kind === "PAYMENT" ? "e.g. Second UPI payment" : "e.g. Box 2, damaged corner"
              }
            />
          </div>
        )}
      </fieldset>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFiles}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size={size}
          variant={photos.length > 0 ? "secondary" : "primary"}
          className="flex-1"
          isLoading={busy !== null}
          disabled={disabled || room <= 0}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="h-4 w-4" aria-hidden />
          Take photo
        </Button>
        <Button
          type="button"
          size={size}
          variant="secondary"
          className="flex-1"
          disabled={disabled || busy !== null || room <= 0}
          onClick={() => galleryRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          Choose photos
        </Button>
      </div>
      {busy && (
        <p className="text-xs text-muted-foreground" role="status">
          {busy}
        </p>
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
