"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Plus, Upload, Pencil } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { downloadBlob } from "@/lib/utils/download-blob";
import { cn } from "@/lib/utils/cn";

interface ImportRowChange {
  field: string;
  from: string | null;
  to: string;
}

interface ImportRow {
  line: number;
  label: string;
  action: "create" | "update" | "error";
  message?: string;
  changes: ImportRowChange[];
}

interface ImportPlan {
  committed: boolean;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: string[];
  rows: ImportRow[];
  rowsTruncated: boolean;
}

/**
 * Export / sample / import for one kind of pricing data.
 *
 * An upload never writes straight away: the file is checked against what is live and the exact
 * rows that would change are shown first, so a wrong column or a stale sheet is caught before it
 * reaches real prices. The preview comes from the importer itself, not a second implementation.
 *
 * The sample is a real workbook with the export's own columns and a "How to use" sheet.
 */
export function SpreadsheetActions({
  resource,
  label,
  onImported,
}: {
  /** The admin/pricing sub-path. */
  resource: "countries" | "rate-cards";
  label: string;
  onImported: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "template" | "preview" | "apply" | null>(null);
  const [pending, setPending] = useState<{ file: File; plan: ImportPlan } | null>(null);
  const { showToast } = useToast();

  async function download(kind: "export" | "template") {
    setBusy(kind);
    try {
      const { blob, headers } = await apiClient.getBlob(`/admin/pricing/${resource}/${kind}`);
      // The filename the server chose, so the download matches what it contains.
      const name =
        /filename="([^"]+)"/.exec(headers.get("Content-Disposition") ?? "")?.[1] ??
        `${resource}-${kind}.xlsx`;
      // The shared helper: an anchor that is actually in the document (Firefox ignores a
      // detached one) and an object URL that outlives the click.
      downloadBlob(blob, name);
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "Couldn't build that spreadsheet.") });
    } finally {
      setBusy(null);
    }
  }

  function formData(file: File): FormData {
    const form = new FormData();
    form.append("file", file);
    return form;
  }

  async function preview(file: File) {
    setBusy("preview");
    try {
      const plan = await apiClient.postForm<ImportPlan>(
        `/admin/pricing/${resource}/preview`,
        formData(file),
      );
      setPending({ file, plan });
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "That file couldn't be read.") });
    } finally {
      setBusy(null);
      // Cleared so re-picking the same file after an edit still fires a change event.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function apply() {
    if (!pending) return;
    setBusy("apply");
    try {
      const plan = await apiClient.postForm<ImportPlan>(
        `/admin/pricing/${resource}/import`,
        formData(pending.file),
      );
      showToast({
        variant: "success",
        title: `${label} imported — ${plan.created} added, ${plan.updated} updated`,
      });
      setPending(null);
      onImported();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "That file couldn't be imported.") });
    } finally {
      setBusy(null);
    }
  }

  const plan = pending?.plan;
  const willChange = (plan?.created ?? 0) + (plan?.updated ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => download("export")} isLoading={busy === "export"}>
        <Download className="h-4 w-4" aria-hidden />
        Export Excel
      </Button>
      <Button size="sm" variant="ghost" onClick={() => download("template")} isLoading={busy === "template"}>
        <FileSpreadsheet className="h-4 w-4" aria-hidden />
        Sample sheet
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => fileInput.current?.click()}
        isLoading={busy === "preview"}
      >
        <Upload className="h-4 w-4" aria-hidden />
        Import Excel
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx"
        className="hidden"
        aria-label={`Import ${label} from a spreadsheet`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void preview(file);
        }}
      />

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent
          title={`Review this import — ${label}`}
          description={pending ? `${pending.file.name} · nothing has been saved yet.` : undefined}
          className="max-w-3xl"
        >
          {plan && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="success">{plan.created} to add</Badge>
                <Badge variant="info">{plan.updated} to update</Badge>
                <Badge variant="neutral">{plan.unchanged} unchanged</Badge>
                {plan.errors.length > 0 && <Badge variant="danger">{plan.errors.length} rejected</Badge>}
              </div>

              {plan.errors.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  Rejected rows are listed below and will be skipped. Everything else still imports.
                </p>
              )}

              <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
                {plan.rows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nothing in this file differs from what is already saved.
                  </p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {plan.rows.map((row) => (
                      <li key={`${row.line}-${row.label}`} className="flex items-start gap-3 p-3">
                        <span
                          className={cn(
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                            row.action === "create" && "bg-success-bg text-success",
                            row.action === "update" && "bg-info-bg text-info",
                            row.action === "error" && "bg-danger-bg text-danger",
                          )}
                          aria-hidden
                        >
                          {row.action === "create" ? (
                            <Plus className="h-3.5 w-3.5" />
                          ) : row.action === "update" ? (
                            <Pencil className="h-3.5 w-3.5" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">
                            {row.label}{" "}
                            <span className="font-normal text-muted-foreground">· row {row.line}</span>
                          </p>
                          {row.message ? (
                            <p className="text-xs text-danger">{row.message}</p>
                          ) : (
                            <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                              {row.changes.map((change) => (
                                <li key={change.field}>
                                  {change.field}:{" "}
                                  {change.from !== null && (
                                    <span className="line-through">{change.from}</span>
                                  )}{" "}
                                  <span className="font-medium text-foreground">{change.to}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {plan.rowsTruncated && (
                <p className="text-xs text-muted-foreground">
                  Only the first {plan.rows.length} changes are listed; the counts above cover the whole file.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPending(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={apply} isLoading={busy === "apply"} disabled={willChange === 0}>
                  Apply {willChange} change{willChange === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
