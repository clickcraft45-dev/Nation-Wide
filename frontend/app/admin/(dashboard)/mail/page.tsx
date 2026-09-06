"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

interface FormState {
  to: string;
  subject: string;
  body: string;
  replyTo: string;
}

const EMPTY: FormState = { to: "", subject: "", body: "", replyTo: "" };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * One-off email from the operations team. The body is plain text, rendered into the same
 * branded shell as every automated message, so a manual note does not arrive looking like a
 * different company wrote it.
 */
export default function AdminMailPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [isSending, setIsSending] = useState(false);
  const { showToast } = useToast();

  function validate(): boolean {
    const next: Partial<FormState> = {};
    if (!isValidEmail(form.to)) next.to = "Enter a valid recipient address.";
    if (!form.subject.trim()) next.subject = "Subject is required.";
    if (!form.body.trim()) next.body = "Write something to send.";
    if (form.replyTo.trim() && !isValidEmail(form.replyTo)) {
      next.replyTo = "Enter a valid reply-to address, or leave it blank.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSending(true);
    try {
      await apiClient.post("/admin/mail/send", {
        to: form.to.trim(),
        subject: form.subject.trim(),
        body: form.body,
        ...(form.replyTo.trim() ? { replyTo: form.replyTo.trim() } : {}),
      });
      showToast({ variant: "success", title: `Email sent to ${form.to.trim()}` });
      // Clear only after a confirmed send — a failure must not lose what was typed.
      setForm(EMPTY);
    } catch (err) {
      showToast({
        variant: "error",
        title: errorMessage(err, "Couldn't send the email."),
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Send an email</h1>
        <p className="text-sm text-muted-foreground">
          Goes out from the NationWide address in the standard branded template. Sending cannot
          be undone.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="email"
            placeholder="customer@example.com"
            value={form.to}
            onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
            error={Boolean(errors.to)}
          />
          {errors.to && <FieldError>{errors.to}</FieldError>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            error={Boolean(errors.subject)}
          />
          {errors.subject && <FieldError>{errors.subject}</FieldError>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="body">Message</Label>
          <textarea
            id="body"
            rows={10}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              errors.body ? "border-danger-border" : "border-border"
            }`}
            placeholder={"Hello,\n\nBlank lines become paragraphs."}
          />
          {errors.body && <FieldError>{errors.body}</FieldError>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="replyTo">Reply-to (optional)</Label>
          <Input
            id="replyTo"
            type="email"
            placeholder="Leave blank to use the default no-reply address"
            value={form.replyTo}
            onChange={(e) => setForm((f) => ({ ...f, replyTo: e.target.value }))}
            error={Boolean(errors.replyTo)}
          />
          {errors.replyTo && <FieldError>{errors.replyTo}</FieldError>}
        </div>

        <Button type="submit" size="lg" isLoading={isSending}>
          <Send className="mr-2 h-4 w-4" aria-hidden />
          {isSending ? "Sending…" : "Send email"}
        </Button>
      </form>
    </div>
  );
}
