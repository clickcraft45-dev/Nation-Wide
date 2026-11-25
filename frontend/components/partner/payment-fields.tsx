"use client";

import { useState } from "react";
import { BadgePercent, X } from "lucide-react";
import type { PaymentSplitDto, PaymentUpiDto, PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils/cn";
import { UpiQr } from "@/components/payments/upi-qr";

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What the customer pays, and why it is less than the price: the original figure struck through
 * with each deduction beneath it, the coupon from booking and the discount given at the door.
 */
export function AmountToCollect({ pickup }: { pickup: PickupRequestDto }) {
  const price = pickup.verifiedPrice ?? pickup.estimatedPrice;
  const discounted = pickup.payableAmount < price;
  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground">Amount To Collect</p>
      {discounted && (
        <p className="text-base text-muted-foreground line-through" aria-label={`Was ${formatInr(price)}`}>
          {formatInr(price)}
        </p>
      )}
      <p className="text-3xl font-bold tabular-nums text-foreground">{formatInr(pickup.payableAmount)}</p>
      {discounted && (
        <ul className="mx-auto mt-2 max-w-xs space-y-0.5 text-left text-xs">
          {pickup.discountAmount ? (
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                Coupon{pickup.couponCode ? ` ${pickup.couponCode}` : ""}
              </span>
              <span className="font-medium text-success">−{formatInr(pickup.discountAmount)}</span>
            </li>
          ) : null}
          {pickup.doorDiscount && (
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                Discount at pickup
                {pickup.doorDiscount.approvedByAdminName ? ` (approved by ${pickup.doorDiscount.approvedByAdminName})` : ""}
              </span>
              <span className="font-medium text-success">−{formatInr(pickup.doorDiscount.amount)}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const SELECT_CLASS =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

/**
 * Taking money off at the door. The partner rings an admin first: the admin is named on the
 * record, with a reason, because a discount the partner could give alone is cash they could keep.
 */
export function DoorDiscount({
  pickup,
  apiBase,
  approvers,
  onChange,
}: {
  pickup: PickupRequestDto;
  apiBase: string;
  approvers: { id: string; name: string }[];
  onChange: (updated: PickupRequestDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [approverId, setApproverId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const idPrefix = `${pickup.id}-discount`;
  // The most it may take off: whatever the coupon left, less a rupee so something is paid.
  const afterCoupon = pickup.payableAmount + (pickup.doorDiscount?.amount ?? 0);
  const value = Number(amount);

  async function submit(next: number) {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(`${apiBase}/${pickup.id}/door-discount`, {
        amount: next,
        ...(next > 0 ? { reason: reason.trim(), approvedByAdminId: approverId } : {}),
      });
      onChange(updated);
      setOpen(false);
      setAmount("");
      setReason("");
      setApproverId("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the discount. Try again."));
    } finally {
      setIsSaving(false);
    }
  }

  function apply() {
    if (!(value > 0)) return setError("Enter the rupees to take off.");
    if (value >= afterCoupon) return setError(`The discount must be less than ${formatInr(afterCoupon)}.`);
    if (reason.trim().length < 3) return setError("Say why the discount was given.");
    if (!approverId) return setError("Pick the admin who approved the discount.");
    void submit(round2(value));
  }

  if (pickup.doorDiscount) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
        <div className="min-w-0">
          <p className="font-medium text-foreground">Discount {formatInr(pickup.doorDiscount.amount)} given</p>
          <p className="truncate text-xs text-muted-foreground">{pickup.doorDiscount.reason}</p>
        </div>
        <ConfirmDialog
          title="Remove the discount?"
          description={`The customer will pay ${formatInr(afterCoupon)} again.`}
          confirmLabel="Remove discount"
          onConfirm={() => submit(0)}
          trigger={
            <Button type="button" variant="ghost" size="lg" isLoading={isSaving} aria-label="Remove the discount">
              <X className="h-4 w-4" aria-hidden />
              Remove
            </Button>
          }
        />
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setOpen(true)}>
        <BadgePercent className="h-4 w-4" aria-hidden />
        Give a discount
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-foreground">Discount</p>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-amount`}>Rupees off (₹)</Label>
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-12 text-lg font-semibold"
          placeholder="0"
        />
        {value > 0 && value < afterCoupon && (
          <p className="text-xs text-muted-foreground">
            Customer pays {formatInr(round2(afterCoupon - value))} instead of {formatInr(afterCoupon)}.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-reason`}>Reason</Label>
        <Input
          id={`${idPrefix}-reason`}
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Regular customer, matched competitor price"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-approver`}>Approved by</Label>
        <select
          id={`${idPrefix}-approver`}
          value={approverId}
          onChange={(e) => setApproverId(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Select the admin who approved…</option>
          {approvers.map((admin) => (
            <option key={admin.id} value={admin.id}>
              {admin.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Ring an admin before giving a discount. Their name goes on the record.</p>
      </div>
      {error && <FieldError>{error}</FieldError>}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="button" size="lg" className="flex-1" onClick={apply} isLoading={isSaving}>
          Apply discount
        </Button>
      </div>
    </div>
  );
}

export type MethodChoice = "CASH" | "UPI" | "SPLIT";

/** The amounts as typed: strings, so a half-typed "2." is not coerced away. */
export interface SplitForm {
  cash: string;
  upi: string;
  upiReference: string;
}

export const emptySplit: SplitForm = { cash: "", upi: "", upiReference: "" };

/** What is sent to the server for `total` rupees taken by `choice`. */
export function toPayments(choice: MethodChoice, total: number, form: SplitForm): PaymentSplitDto[] {
  const reference = form.upiReference.trim() || undefined;
  if (choice === "CASH") return [{ method: "CASH", amount: total }];
  if (choice === "UPI") return [{ method: "UPI", amount: total, reference }];
  return [
    { method: "CASH", amount: round2(Number(form.cash)) },
    { method: "UPI", amount: round2(Number(form.upi)), reference },
  ];
}

/** Null when the split adds up to `total`; otherwise what is wrong. */
export function splitProblem(choice: MethodChoice, total: number, form: SplitForm): string | null {
  if (choice !== "SPLIT") return null;
  const cash = Number(form.cash);
  const upi = Number(form.upi);
  if (!(cash > 0) || !(upi > 0)) return "Enter both the cash and the UPI amount.";
  const gap = round2(total - cash - upi);
  if (gap !== 0) {
    return gap > 0
      ? `${formatInr(gap)} still to assign: cash and UPI must add up to ${formatInr(total)}.`
      : `${formatInr(-gap)} too much: cash and UPI must add up to ${formatInr(total)}.`;
  }
  return null;
}

/**
 * Cash, UPI, or some of each. With "Cash + UPI" the partner types one amount and the other is
 * filled with what is left, so the two always add up unless they change both.
 *
 * For any UPI part, the customer is shown a QR for exactly that amount (upi: the account admin set
 * on the Payments page); null while it loads, and a note when admin has not set one.
 */
export function PaymentMethodFields({
  idPrefix,
  total,
  choice,
  onChoice,
  form,
  onForm,
  upi,
  upiNote,
}: {
  idPrefix: string;
  total: number;
  choice: MethodChoice;
  onChoice: (choice: MethodChoice) => void;
  form: SplitForm;
  onForm: (form: SplitForm) => void;
  upi?: PaymentUpiDto | null;
  /** Shown in both bank statements, to match the payment to this pickup. */
  upiNote?: string;
}) {
  const problem = total > 0 ? splitProblem(choice, total, form) : null;
  const upiAmount = choice === "UPI" ? total : choice === "SPLIT" ? round2(Number(form.upi) || 0) : 0;

  function setAmount(key: "cash" | "upi", value: string) {
    const typed = Number(value);
    const rest = round2(total - typed);
    // Fill the other half with the remainder while it still makes sense.
    const fill = value.trim() !== "" && typed > 0 && rest > 0 ? String(rest) : null;
    onForm(
      key === "cash"
        ? { ...form, cash: value, upi: fill ?? form.upi }
        : { ...form, upi: value, cash: fill ?? form.cash },
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Payment Method</Label>
        <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
          {(
            [
              ["CASH", "Cash"],
              ["UPI", "UPI"],
              ["SPLIT", "Cash + UPI"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={choice === value}
              onClick={() => onChoice(value)}
              className={cn(
                "min-h-12 rounded-lg border-2 px-1 text-center text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                choice === value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground active:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {choice === "SPLIT" && (
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["cash", "Cash (₹)"],
              ["upi", "UPI (₹)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
              <Input
                id={`${idPrefix}-${key}`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form[key]}
                onChange={(e) => setAmount(key, e.target.value)}
                className="h-12 text-lg font-semibold tabular-nums"
                placeholder="0"
                error={Boolean(problem) && form.cash !== "" && form.upi !== ""}
              />
            </div>
          ))}
          <p className="col-span-2 text-xs text-muted-foreground">
            {problem && form.cash !== "" && form.upi !== "" ? (
              <span className="text-danger">{problem}</span>
            ) : (
              <>Type one amount; the other fills in. Total {formatInr(total)}.</>
            )}
          </p>
        </div>
      )}

      {choice !== "CASH" && upi !== undefined && (
        <div className="space-y-1.5">
          {upi === null ? null : upi.upiId ? (
            upiAmount > 0 && upiAmount <= total ? (
              <>
                <p className="text-sm font-medium text-foreground">Customer scans to pay</p>
                <UpiQr upiId={upi.upiId} payeeName={upi.payeeName} amount={upiAmount} note={upiNote} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Enter the UPI amount to show the payment QR.</p>
            )
          ) : (
            <p className="rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-warning">
              No UPI ID is set up yet, so there is no QR to show. An admin adds it under Payments.
            </p>
          )}
        </div>
      )}

      {choice !== "CASH" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-upi-ref`}>UPI Reference Number (optional)</Label>
          <Input
            id={`${idPrefix}-upi-ref`}
            value={form.upiReference}
            autoComplete="off"
            onChange={(e) => onForm({ ...form, upiReference: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

/** "Cash ₹2,000 + UPI ₹400", or the single method's label. */
export function describePayments(payments: PaymentSplitDto[]): string {
  const label = (m: string) => (m === "CASH" ? "Cash" : m === "UPI" ? "UPI" : m);
  if (payments.length === 1) return label(payments[0].method);
  return payments.map((p) => `${label(p.method)} ${formatInr(p.amount)}`).join(" + ");
}
