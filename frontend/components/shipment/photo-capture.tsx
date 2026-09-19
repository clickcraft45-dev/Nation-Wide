"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

/**
 * One photo taken at the door. On a phone `capture` opens the rear camera straight away; on a
 * desktop it is an ordinary file picker. Once one is on file it can be viewed (through a
 * short-lived link fetched only when asked) or replaced.
 */
export function PhotoCapture({
  title,
  hint,
  onFile,
  onFileLabel,
  hasFile,
  getViewUrl,
  disabled,
}: {
  title: string;
  hint: string;
  onFile: (file: File) => Promise<void>;
  onFileLabel: string;
  hasFile: boolean;
  getViewUrl: () => Promise<string | null>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again must still fire
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("That photo is over 10 MB — retake it at a lower resolution.");
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      await onFile(file);
    } catch {
      setError("The photo didn't upload. Check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function view() {
    // Opened synchronously so a popup blocker treats it as the user's own click.
    const tab = window.open("", "_blank");
    const url = await getViewUrl().catch(() => null);
    if (tab && url) tab.location.href = url;
    else {
      tab?.close();
      setError("Couldn't open the photo right now.");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {hasFile && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> On file
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={hasFile ? "secondary" : "primary"}
          className="flex-1"
          isLoading={isUploading}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="h-4 w-4" aria-hidden />
          {hasFile ? "Replace" : onFileLabel}
        </Button>
        {hasFile && (
          <Button type="button" size="sm" variant="secondary" onClick={view}>
            <Eye className="h-4 w-4" aria-hidden /> View
          </Button>
        )}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
