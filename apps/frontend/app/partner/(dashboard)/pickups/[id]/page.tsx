"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, MapPinned, Minus, Phone, Plus } from "lucide-react";
import type {
  PickupRequestDto,
  RecalculatePreviewDto,
  PaymentMethodCode,
  ShipmentTypeCode,
} from "@nationwide/shared-types";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Stepper } from "@/components/ui/stepper";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
import { cn } from "@/lib/utils/cn";

function mapsUrl(pickup: PickupRequestDto): string {
  const address = [
    pickup.pickupAddressLine1,
    pickup.pickupAddressLine2,
    pickup.pickupCity,
    pickup.pickupState,
    pickup.pickupPostalCode,
  ]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

const WEIGHT_STEP_KG = 0.5;
const PARTNER_PAYMENT_METHODS: { value: PaymentMethodCode; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
];

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString("en-IN")}`;
}

function shipmentLabel(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

type Step = "arrived" | "verify" | "complete";

const STEP_ORDER: Step[] = ["arrived", "verify", "complete"];
const STEPPER_STEPS = [{ label: "Arrived" }, { label: "Payment" }, { label: "Complete" }];

export default function PartnerPickupDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [pickup, setPickup] = useState<PickupRequestDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isArriving, setIsArriving] = useState(false);

  // Verification form state.
  const [verifiedWeightKg, setVerifiedWeightKg] = useState("");
  const [verifiedShipmentType, setVerifiedShipmentType] = useState<ShipmentTypeCode>("PACKAGE");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [parcelPhysicallyChecked, setParcelPhysicallyChecked] = useState(false);
  const [preview, setPreview] = useState<RecalculatePreviewDto | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const debouncedWeight = useDebouncedValue(verifiedWeightKg, 500);

  // Payment form state.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [isCollectingPayment, setIsCollectingPayment] = useState(false);

  // Acceptance checklist state.
  const [parcelPackedProperly, setParcelPackedProperly] = useState(false);
  const [restrictedItemsChecked, setRestrictedItemsChecked] = useState(false);
  const [documentsVerified, setDocumentsVerified] = useState(false);
  const [isFragile, setIsFragile] = useState(false);
  const [insuranceRequired, setInsuranceRequired] = useState(false);
  const [acceptanceRemarks, setAcceptanceRemarks] = useState("");
  const [isAccepting, setIsAccepting] = useState(false);

  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PickupRequestDto>(`/partner/pickup-requests/${params.id}`)
      .then((res) => {
        setPickup(res);
        setVerifiedWeightKg(String(res.verifiedWeightKg ?? res.estimatedWeightKg));
        setVerifiedShipmentType(res.verifiedShipmentType ?? res.shipmentType);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? "Couldn't load this pickup." : "Something went wrong.");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // One-shot lookup keyed off the route param, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Auto-recalculate whenever the weight settles (debounced) — the partner never has to
  // remember to tap a "Recalculate" button. Server-side is still the source of truth; this
  // is a preview only, nothing is persisted until "Confirm Verification".
  useEffect(() => {
    if (!pickup || pickup.arrivedAt === null || pickup.verifiedAt) return;
    const weightKg = Number(debouncedWeight);
    if (!weightKg || weightKg <= 0) {
      // Dropping a now-stale preview when the inputs stop being valid — one render, not a loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }
    let cancelled = false;
    setIsRecalculating(true);
    apiClient
      .post<RecalculatePreviewDto>(`/partner/pickup-requests/${params.id}/recalculate`, {
        weightKg,
        shipmentType: verifiedShipmentType,
      })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setIsRecalculating(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedWeight, verifiedShipmentType, pickup?.id]);

  function adjustWeight(delta: number) {
    setVerifiedWeightKg((prev) => {
      const next = Math.max(0.01, Math.round(((Number(prev) || 0) + delta) * 100) / 100);
      return String(next);
    });
  }

  async function handleArrive() {
    setIsArriving(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `/partner/pickup-requests/${params.id}/arrive`,
        {},
      );
      setPickup(updated);
    } catch {
      showToast({ variant: "error", title: "Unable to connect. Please try again." });
    } finally {
      setIsArriving(false);
    }
  }

  async function handleVerify() {
    const weightKg = Number(verifiedWeightKg);
    if (!weightKg || weightKg <= 0) {
      setVerifyError("Enter a valid weight.");
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `/partner/pickup-requests/${params.id}/verify`,
        {
          verifiedWeightKg: weightKg,
          verifiedShipmentType,
          verificationNotes: verificationNotes.trim() || undefined,
        },
      );
      setPickup(updated);
      showToast({ variant: "success", title: "Parcel verified" });
    } catch (err) {
      setVerifyError(
        err instanceof ApiError && err.status === 400
          ? "No rate is available for this weight/type — this needs manual review."
          : "Unable to connect. Your verification was not saved — please try again.",
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleCollectPayment() {
    if (!pickup?.verifiedPrice) return;
    setIsCollectingPayment(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `/partner/pickup-requests/${params.id}/collect-payment`,
        {
          paymentMethod,
          collectedAmount: pickup.verifiedPrice,
          paymentReference: paymentReference.trim() || undefined,
        },
      );
      setPickup(updated);
      showToast({ variant: "success", title: "Payment collected" });
    } catch {
      showToast({
        variant: "error",
        title: "Unable to connect. Your payment update was not confirmed — please try again.",
      });
    } finally {
      setIsCollectingPayment(false);
    }
  }

  async function handleAccept() {
    setIsAccepting(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `/partner/pickup-requests/${params.id}/accept`,
        {
          parcelPackedProperly,
          weightVerifiedFlag: true,
          restrictedItemsChecked,
          documentsVerified,
          isFragile,
          insuranceRequired,
          acceptanceRemarks: acceptanceRemarks.trim() || undefined,
        },
      );
      setPickup(updated);
      showToast({ variant: "success", title: "Pickup completed — order generated" });
    } catch {
      showToast({
        variant: "error",
        title: "Unable to connect. This pickup was not completed — please try again.",
      });
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setIsRejecting(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `/partner/pickup-requests/${params.id}/reject`,
        { reason: rejectReason.trim() },
      );
      setPickup(updated);
      showToast({ variant: "success", title: "Pickup rejected" });
    } catch {
      showToast({ variant: "error", title: "Couldn't reject the pickup. Please try again." });
    } finally {
      setIsRejecting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !pickup) {
    return <ErrorState message={error ?? "Pickup not found."} onRetry={load} />;
  }

  const isTerminal = ["COMPLETED", "CANCELLED", "REJECTED"].includes(pickup.status);
  const canReject = !isTerminal;
  const step: Step = !pickup.arrivedAt ? "arrived" : !pickup.paymentCollectedAt ? "verify" : "complete";
  const showVerificationForm = step === "verify" && !pickup.verifiedAt;
  const showPaymentForm = step === "verify" && !!pickup.verifiedAt;

  return (
    <div className="space-y-5 pb-6">
      <button
        onClick={() => router.push("/partner/pickups")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to pickups
      </button>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">{pickup.pickupContactName}</h1>
          <p className="text-xs text-muted-foreground">Pickup {pickup.id.slice(0, 8)}</p>
        </div>
        <PickupRequestStatusBadge status={pickup.status} />
      </div>

      {!isTerminal && (
        <Stepper steps={STEPPER_STEPS} currentIndex={STEP_ORDER.indexOf(step)} />
      )}

      {/* Step 1 — Arrived */}
      {step === "arrived" && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-5 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="font-medium text-foreground">{pickup.pickupContactName}</p>
                <a
                  href={`tel:${pickup.pickupContactPhone}`}
                  className="mt-0.5 inline-flex items-center gap-1.5 text-primary"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {pickup.pickupContactPhone}
                </a>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pickup Address</p>
                {pickup.dropAtWarehouse ? (
                  <p className="font-medium text-foreground">Customer will drop off at the warehouse.</p>
                ) : (
                  <>
                    <p className="font-medium text-foreground">
                      {pickup.pickupAddressLine1}
                      {pickup.pickupAddressLine2 ? `, ${pickup.pickupAddressLine2}` : ""}, {pickup.pickupCity},{" "}
                      {pickup.pickupState} {pickup.pickupPostalCode}
                    </p>
                    <a
                      href={mapsUrl(pickup)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                    >
                      <MapPinned className="h-3.5 w-3.5" aria-hidden />
                      View on Map
                    </a>
                  </>
                )}
              </div>
              {!pickup.dropAtWarehouse && (
                <div>
                  <p className="text-xs text-muted-foreground">Scheduled</p>
                  <p className="font-medium text-foreground">
                    {pickup.pickupDate ?? "—"} · {pickup.pickupTimeSlot ?? "—"}
                  </p>
                </div>
              )}
              {pickup.pickupInstructions && (
                <div>
                  <p className="text-xs text-muted-foreground">Instructions</p>
                  <p className="font-medium text-foreground">{pickup.pickupInstructions}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">Shipment Type</p>
                  <p className="font-medium text-foreground">{shipmentLabel(pickup.shipmentType)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Declared Weight</p>
                  <p className="font-medium text-foreground">{pickup.estimatedWeightKg}kg</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Carrier</p>
                  <p className="font-medium text-foreground">{pickup.rateProviderName ?? "Manually quoted"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Quoted Amount</p>
                  <p className="font-medium text-foreground">
                    {formatMoney(pickup.estimatedPrice, pickup.currency)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button size="lg" className="w-full" onClick={handleArrive} isLoading={isArriving}>
            <Check className="h-5 w-5" aria-hidden />
            Arrived at Pickup
          </Button>
        </div>
      )}

      {/* Step 2 — Verify weight & Collect payment */}
      {step === "verify" && (
        <div className="space-y-4">
          {showVerificationForm && (
            <>
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <p className="text-sm font-medium text-foreground">Parcel Weight</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Customer Declared</p>
                      <p className="font-medium text-foreground">{pickup.estimatedWeightKg}kg</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Shipment Type</p>
                      <div className="mt-1 flex gap-1.5">
                        {(["DOCUMENT", "PARCEL", "PACKAGE"] as ShipmentTypeCode[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setVerifiedShipmentType(t)}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium",
                              verifiedShipmentType === t
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {shipmentLabel(t)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Verified Weight (kg)</Label>
                    <div className="mt-1.5 flex items-center gap-3">
                      <button
                        type="button"
                        aria-label="Decrease weight"
                        onClick={() => adjustWeight(-WEIGHT_STEP_KG)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-foreground active:bg-muted"
                      >
                        <Minus className="h-5 w-5" aria-hidden />
                      </button>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={verifiedWeightKg}
                        onChange={(e) => setVerifiedWeightKg(e.target.value)}
                        className="h-12 flex-1 text-center text-lg font-semibold"
                        aria-label="Verified weight in kg"
                      />
                      <button
                        type="button"
                        aria-label="Increase weight"
                        onClick={() => adjustWeight(WEIGHT_STEP_KG)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-foreground active:bg-muted"
                      >
                        <Plus className="h-5 w-5" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    {isRecalculating && <p className="text-muted-foreground">Recalculating…</p>}
                    {!isRecalculating && preview && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Original Quote</span>
                          <span>{formatMoney(preview.estimatedPrice, preview.currency)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Updated Amount</span>
                          <span className="text-base font-semibold text-foreground">
                            {preview.recalculatedPrice === null
                              ? "No rate available"
                              : formatMoney(preview.recalculatedPrice, preview.currency)}
                          </span>
                        </div>
                        {preview.difference !== null && preview.difference !== 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Difference</span>
                            <span className={preview.difference > 0 ? "font-medium text-danger" : "font-medium text-success"}>
                              {preview.difference > 0 ? "+" : ""}
                              {formatMoney(preview.difference, preview.currency)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {!isRecalculating && !preview && (
                      <p className="text-muted-foreground">Enter the verified weight to see the price.</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="verification-notes">Pickup Notes (optional)</Label>
                    <Input
                      id="verification-notes"
                      value={verificationNotes}
                      onChange={(e) => setVerificationNotes(e.target.value)}
                      placeholder="e.g. Packaging condition, customer instructions"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={parcelPhysicallyChecked}
                      onChange={(e) => setParcelPhysicallyChecked(e.target.checked)}
                    />
                    Parcel Verified — I have physically checked this parcel
                  </label>

                  {verifyError && <FieldError>{verifyError}</FieldError>}
                </CardContent>
              </Card>

              <Button
                size="lg"
                className="w-full"
                onClick={handleVerify}
                isLoading={isVerifying}
                disabled={!parcelPhysicallyChecked}
              >
                Confirm Verification
              </Button>
            </>
          )}

          {showPaymentForm && pickup.verifiedPrice !== null && (
            <>
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Amount To Collect</p>
                    <p className="text-3xl font-bold text-foreground">
                      {formatMoney(pickup.verifiedPrice, pickup.currency)}
                    </p>
                  </div>

                  <div>
                    <Label>Payment Method</Label>
                    <div className="mt-1.5 grid grid-cols-2 gap-3">
                      {PARTNER_PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setPaymentMethod(m.value)}
                          className={cn(
                            "rounded-lg border-2 py-4 text-center text-sm font-semibold",
                            paymentMethod === m.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {paymentMethod === "UPI" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="payment-reference">UPI Reference Number (optional)</Label>
                      <Input
                        id="payment-reference"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <ConfirmDialog
                title="Confirm Payment"
                description={`Amount: ${formatMoney(pickup.verifiedPrice, pickup.currency)} · Method: ${
                  PARTNER_PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label
                }. Are you sure the payment has been received?`}
                confirmLabel="Confirm Payment"
                onConfirm={handleCollectPayment}
                trigger={
                  <Button size="lg" className="w-full" isLoading={isCollectingPayment}>
                    Mark Payment Collected
                  </Button>
                }
              />
            </>
          )}
        </div>
      )}

      {/* Step 3 — Complete */}
      {step === "complete" && !isTerminal && (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-5 text-sm">
              <p className="text-sm font-semibold text-foreground">Pickup Summary</p>
              <SummaryRow label="Customer" value={pickup.pickupContactName} />
              <SummaryRow
                label="Verified Weight"
                value={`${pickup.verifiedWeightKg ?? pickup.estimatedWeightKg}kg`}
              />
              <SummaryRow
                label="Service"
                value={shipmentLabel(pickup.verifiedShipmentType ?? pickup.shipmentType)}
              />
              <SummaryRow
                label="Final Amount"
                value={formatMoney(pickup.verifiedPrice ?? pickup.estimatedPrice, pickup.currency)}
                emphasize
              />
              <SummaryRow
                label="Payment"
                value={PARTNER_PAYMENT_METHODS.find((m) => m.value === pickup.paymentMethod)?.label ?? pickup.paymentMethod ?? "—"}
              />
              <SummaryRow label="Payment Status" value="Collected" />
              <SummaryRow
                label="Pickup Address"
                value={
                  pickup.dropAtWarehouse
                    ? "Warehouse drop-off"
                    : `${pickup.pickupAddressLine1}, ${pickup.pickupCity}`
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm font-medium text-foreground">Final Checklist</p>
              <div className="space-y-2 text-sm">
                {(
                  [
                    ["Parcel packed properly", parcelPackedProperly, setParcelPackedProperly],
                    ["Restricted items checked", restrictedItemsChecked, setRestrictedItemsChecked],
                    ["Documents verified", documentsVerified, setDocumentsVerified],
                    ["Fragile", isFragile, setIsFragile],
                    ["Insurance required", insuranceRequired, setInsuranceRequired],
                  ] as [string, boolean, (v: boolean) => void][]
                ).map(([label, checked, setChecked]) => (
                  <label key={label} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={checked}
                      onChange={(e) => setChecked(e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acceptance-remarks">Remarks (optional)</Label>
                <Input
                  id="acceptance-remarks"
                  value={acceptanceRemarks}
                  onChange={(e) => setAcceptanceRemarks(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <ConfirmDialog
            title="Complete Pickup?"
            description="This will mark the pickup as completed and submit the verified shipment details to NationWide."
            confirmLabel="Complete Pickup"
            onConfirm={handleAccept}
            trigger={
              <Button size="lg" className="w-full" isLoading={isAccepting}>
                <Check className="h-5 w-5" aria-hidden />
                Complete Pickup
              </Button>
            }
          />
        </div>
      )}

      {pickup.status === "COMPLETED" && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-success">
              Pickup completed. Order has been generated and is ready for AWB mapping.
            </p>
          </CardContent>
        </Card>
      )}

      {pickup.status === "REJECTED" && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-danger">Rejected: {pickup.rejectionReason}</p>
          </CardContent>
        </Card>
      )}

      {canReject && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-medium text-foreground">Reject Pickup</p>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejecting this parcel"
            />
            <ConfirmDialog
              title="Reject this pickup?"
              description="The customer will be notified and no order will be created."
              confirmLabel="Reject Pickup"
              variant="danger"
              onConfirm={handleReject}
              trigger={
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={!rejectReason.trim() || isRejecting}
                >
                  Reject Pickup
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryRow({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasize ? "text-base font-semibold text-foreground" : "font-medium text-foreground"}>
        {value}
      </span>
    </div>
  );
}
