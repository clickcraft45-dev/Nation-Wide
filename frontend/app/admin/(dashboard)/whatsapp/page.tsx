"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, UsersRound } from "lucide-react";
import type {
  CustomerDto,
  WhatsAppSendResultDto,
  WhatsAppTemplateDto,
} from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";

/** Filled from each recipient's own name when left blank — mirrors the backend's rule. */
const AUTO_FILLED_PARAM = "customerName";

type Mode = "template" | "text";

/**
 * Send a WhatsApp message by hand — the WhatsApp counterpart of Send Email.
 *
 * Two modes, because WhatsApp has two kinds of message and they behave differently:
 *  - An approved TEMPLATE reaches a customer at any time, to one customer or many. The list is
 *    whatever GUPSHUP_TEMPLATES configures, so a new custom template approved in Gupshup shows up
 *    here with no code change.
 *  - FREE TEXT needs no approval but is only delivered if the customer messaged the business in
 *    the last 24 hours. Hence one customer at a time, and a warning saying so.
 *
 * Everything reports "queued", never "delivered" — the provider accepts or rejects later.
 */
export default function AdminWhatsAppPage() {
  const [mode, setMode] = useState<Mode>("template");
  const [templates, setTemplates] = useState<WhatsAppTemplateDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [templateName, setTemplateName] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const [textCustomerId, setTextCustomerId] = useState("");
  const [text, setText] = useState("");

  const [isSending, setIsSending] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get<WhatsAppTemplateDto[]>("/admin/whatsapp/templates"),
      apiClient.get<CustomerDto[]>("/customers"),
    ])
      .then(([templateList, customerList]) => {
        if (cancelled) return;
        setTemplates(templateList);
        setCustomers(customerList);
        setLoadError(null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err, "Failed to load WhatsApp templates."));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const template = templates.find((t) => t.name === templateName) ?? null;
  const nameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    );
  }, [customers, search]);

  const allShownSelected =
    filteredCustomers.length > 0 && filteredCustomers.every((c) => recipientIds.includes(c.id));

  function toggleAllShown() {
    const shown = new Set(filteredCustomers.map((c) => c.id));
    setRecipientIds((current) =>
      allShownSelected ? current.filter((id) => !shown.has(id)) : [...new Set([...current, ...shown])],
    );
  }

  // The approved wording with the admin's values substituted as they type. split/join rather
  // than replaceAll, which this project's TS lib target does not include.
  const preview = template?.body
    ? template.params.reduce((body, param, i) => {
        const typed = variables[param]?.trim();
        const shown =
          typed || (param === AUTO_FILLED_PARAM ? "‹each customer's name›" : `{{${i + 1}}}`);
        return body.split(`{{${i + 1}}}`).join(shown);
      }, template.body)
    : null;

  const missingParams =
    template?.params.filter((p) => p !== AUTO_FILLED_PARAM && !variables[p]?.trim()) ?? [];

  function chooseTemplate(name: string) {
    setTemplateName(name);
    // Values belong to one template's placeholders; carrying them into another's would put a
    // tracking number where a reason belongs.
    setVariables({});
  }

  function report(result: WhatsAppSendResultDto, what: string) {
    if (result.failed.length === 0) {
      showToast({
        variant: "success",
        title: `${what} queued for ${result.queued} customer${result.queued === 1 ? "" : "s"}`,
        description: "Delivery happens in the background; failures appear in the notification log.",
      });
      return;
    }
    showToast({
      variant: result.queued === 0 ? "error" : "success",
      title: `${result.queued} queued, ${result.failed.length} not sent`,
      description: result.failed
        .slice(0, 3)
        .map((f) => `${nameById.get(f.customerId) ?? f.customerId.slice(0, 8)}: ${f.reason}`)
        .join(" · "),
    });
  }

  async function sendTemplate() {
    if (!template || recipientIds.length === 0) return;
    // ponytail: native confirm for the one irreversible bulk action; swap for ConfirmDialog if
    // this page grows more of them.
    if (
      recipientIds.length > 1 &&
      !window.confirm(
        `Send "${template.name}" to ${recipientIds.length} customers? This cannot be undone.`,
      )
    ) {
      return;
    }
    setIsSending(true);
    try {
      const result = await apiClient.post<WhatsAppSendResultDto>("/admin/whatsapp/send-template", {
        customerIds: recipientIds,
        template: template.name,
        variables,
      });
      report(result, `"${template.name}"`);
      if (result.failed.length === 0) setRecipientIds([]);
    } catch (err) {
      showToast({
        variant: "error",
        title: "Couldn't send that template.",
        description: errorMessage(err, "Please try again."),
      });
    } finally {
      setIsSending(false);
    }
  }

  async function sendText() {
    if (!textCustomerId || !text.trim()) return;
    setIsSending(true);
    try {
      const result = await apiClient.post<WhatsAppSendResultDto>("/admin/whatsapp/send-text", {
        customerId: textCustomerId,
        text,
      });
      report(result, "Message");
      setText("");
    } catch (err) {
      showToast({
        variant: "error",
        title: "Couldn't send that message.",
        description: errorMessage(err, "Please try again."),
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <MessageCircle className="h-5 w-5" aria-hidden />
          Send WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Send an approved template to one customer or many, or a typed message to one customer.
        </p>
      </div>

      <div role="tablist" aria-label="Message type" className="glass inline-flex rounded-xl p-1">
        {(
          [
            { key: "template", label: "Template" },
            { key: "text", label: "Free text" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-72 w-full" />}

      {!isLoading && loadError && (
        <ErrorState
          message={loadError}
          onRetry={() => {
            setIsLoading(true);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {!isLoading && !loadError && mode === "template" && (
        <Card>
          <CardHeader>
            <CardTitle>Approved template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No templates are configured yet. Add each approved template&apos;s Gupshup ID to{" "}
                <code className="font-mono text-xs">GUPSHUP_TEMPLATES</code> in the backend
                environment (see docs/WHATSAPP_TEMPLATES.md). Free text still works meanwhile.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="template">Template</Label>
                  <NativeSelect
                    id="template"
                    value={templateName}
                    onChange={(e) => chooseTemplate(e.target.value)}
                  >
                    <option value="">Choose a template…</option>
                    {templates.map((t) => (
                      <option key={t.name} value={t.name} disabled={t.requiresDocument}>
                        {t.name}
                        {t.requiresDocument ? " — sent automatically with its PDF" : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                {template && template.params.length > 0 && (
                  <div className="space-y-3">
                    {template.params.map((param, i) => (
                      <div key={param} className="space-y-1.5">
                        <Label htmlFor={`param-${param}`}>
                          <span className="font-mono text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>{" "}
                          {param}
                        </Label>
                        <Input
                          id={`param-${param}`}
                          value={variables[param] ?? ""}
                          maxLength={1000}
                          placeholder={
                            param === AUTO_FILLED_PARAM
                              ? "Leave blank to use each customer's own name"
                              : undefined
                          }
                          onChange={(e) =>
                            setVariables((current) => ({ ...current, [param]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                {template && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Preview</p>
                    <div className="rounded-2xl bg-[#efeae2] p-4">
                      <p className="max-w-sm whitespace-pre-line rounded-xl bg-white px-4 py-3 text-sm text-[#111b21] shadow-sm">
                        {preview ??
                          "This is a custom template, so its approved wording lives in Gupshup. Your values fill its placeholders in the order shown above."}
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <UsersRound className="h-3.5 w-3.5" aria-hidden />
                      Recipients · {recipientIds.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={toggleAllShown}
                      disabled={filteredCustomers.length === 0}
                      className="text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {allShownSelected ? "Clear shown" : "Select all shown"}
                    </button>
                  </div>
                  <SearchInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customers by name or phone"
                    aria-label="Search customers"
                  />
                  <div className="glass-field max-h-56 overflow-y-auto rounded-xl p-1.5">
                    {filteredCustomers.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">No customers match.</p>
                    ) : (
                      filteredCustomers.map((c) => {
                        const checked = recipientIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                              checked && "bg-muted",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setRecipientIds((current) =>
                                  checked ? current.filter((id) => id !== c.id) : [...current, c.id],
                                )
                              }
                            />
                            <span className="font-medium text-foreground">{c.name}</span>
                            <span className="text-muted-foreground">{c.phone}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {recipientIds.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Each recipient is a separate paid message, and people who block or report it
                      lower your number&apos;s quality rating. Keep bulk sends to real operational
                      notices.
                    </p>
                  )}
                </div>

                <Button
                  onClick={sendTemplate}
                  disabled={
                    isSending || !template || recipientIds.length === 0 || missingParams.length > 0
                  }
                >
                  <Send className="mr-2 h-4 w-4" aria-hidden />
                  {recipientIds.length > 1 ? `Send to ${recipientIds.length} customers` : "Send"}
                </Button>
                {template && missingParams.length > 0 && (
                  <p className="text-xs text-muted-foreground">Fill in: {missingParams.join(", ")}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && !loadError && mode === "text" && (
        <Card>
          <CardHeader>
            <CardTitle>Free-text message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* The one rule that decides whether this arrives, stated before the admin types. */}
            <p className="rounded-xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning">
              Delivered only if this customer has messaged your WhatsApp number in the last 24
              hours. Otherwise WhatsApp refuses it and it shows as failed in the notification log —
              use a template to reach them instead.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="text-customer">Customer</Label>
              <NativeSelect
                id="text-customer"
                value={textCustomerId}
                onChange={(e) => setTextCustomerId(e.target.value)}
              >
                <option value="">Choose a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.phone}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="text-body">Message</Label>
              <textarea
                id="text-body"
                value={text}
                maxLength={4096}
                rows={6}
                onChange={(e) => setText(e.target.value)}
                className="glass-field w-full rounded-lg px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-right text-xs tabular-nums text-muted-foreground">
                {text.length} / 4096
              </p>
            </div>

            <Button onClick={sendText} disabled={isSending || !textCustomerId || !text.trim()}>
              <Send className="mr-2 h-4 w-4" aria-hidden />
              Send message
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
