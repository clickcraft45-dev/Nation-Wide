"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarPlus, Check, MapPinned, Phone } from "lucide-react";
import {
  chargeableWeightKg,
  type PickupDocumentsDto,
  type PickupRequestDto,
  type RecalculatePreviewDto,
  type PaymentMethodCode,
  type ShipmentTypeCode,
} from "@nationwide/shared-types";
import { apiClient, ApiError, errorMessage } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { focusFirstInvalid } from "@/lib/utils/focus-first-invalid";
import { ErrorState } from "@/components/ui/page-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PickupRequestStatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Stepper } from "@/components/ui/stepper";
import { useDebouncedValue } from "@/lib/utils/use-debounced-value";
import { cn } from "@/lib/utils/cn";
import {
  RecipientFields,
  emptyRecipient,
  recipientFrom,
  toRecipientPayload,
  validateRecipient,
  type RecipientErrors,
  type RecipientForm,
} from "@/components/quote/recipient-fields";
import {
  googleCalendarUrl,
  isOpenRequest,
  mapsUrl,
  useClaimPickup,
} from "@/components/partner/pickup-card";
import {
  PackagesEditor,
  packagesFrom,
  toPackagesPayload,
  validatePackages,
  type PackageForm,
} from "@/components/shipment/packages-editor";
import {
  ItemsEditor,
  itemsFrom,
  toItemsPayload,
  validateItems,
  type ItemForm,
} from "@/components/shipment/items-editor";
import { PhotoCapture } from "@/components/shipment/photo-capture";
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

/**
 * The step-by-step handling of one pickup: arrive/receive -> verify weight & price -> collect
 * payment -> complete (creates the order) or reject.
 *
 * Shared by the partner app (their own pickups, plus accepting an open request) and the admin
 * Warehouse Drop-offs tab, where staff do the same steps at the warehouse counter. Only the API
 * base and a few labels differ; the server decides who may act on which pickup.
 */
export function PickupWorkflow({ id, mode }: { id: string; mode: "partner" | "admin" }) {
  const api = mode === "admin" ? "/admin/pickup-requests" : "/partner/pickup-requests";
  const backHref = mode === "admin" ? "/admin/warehouse-dropoffs" : "/partner/pickups";
  const router = useRouter();
  const { showToast } = useToast();

  const [pickup, setPickup] = useState<PickupRequestDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isArriving, setIsArriving] = useState(false);
  const { claim, isClaiming } = useClaimPickup();

  // Verification form state. The boxes are weighed and measured one by one; the price follows
  // their chargeable weight (the greater of actual and volumetric, per box).
  const [boxes, setBoxes] = useState<PackageForm[]>(() => packagesFrom(null));
  const [items, setItems] = useState<ItemForm[]>(() => itemsFrom(null));
  const [verifiedShipmentType, setVerifiedShipmentType] = useState<ShipmentTypeCode>("PACKAGE");
  const [verificationNotes, setVerificationNotes] = useState("");
  // Only used when this pickup has no rate provider to compute from — see needsManualPrice.
  const [manualPrice, setManualPrice] = useState("");
  const [parcelPhysicallyChecked, setParcelPhysicallyChecked] = useState(false);
  const [preview, setPreview] = useState<RecalculatePreviewDto | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const requireDimensions = verifiedShipmentType !== "DOCUMENT";
  const packagesProblem = validatePackages(boxes, requireDimensions);
  const chargeableKg = packagesProblem ? 0 : chargeableWeightKg(toPackagesPayload(boxes));
  const debouncedWeight = useDebouncedValue(chargeableKg, 500);

  // Payment form state.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [isCollectingPayment, setIsCollectingPayment] = useState(false);
  // "Take the payment later": nobody pays at the door, and an admin has to be named as having
  // approved it. The list is fetched when the payment step is reached.
  // "partial" is money at the door AND a remainder owed, so it needs both halves of this form.
  const [payMode, setPayMode] = useState<"now" | "partial" | "later">("now");
  const [partialAmount, setPartialAmount] = useState("");
  const isDue = payMode === "later";
  const isPartial = payMode === "partial";
  const needsApprover = isDue || isPartial;
  const takesMoney = payMode !== "later";
  const [dueApprovedByAdminId, setDueApprovedByAdminId] = useState("");
  const [dueNote, setDueNote] = useState("");
  const [dueApprovers, setDueApprovers] = useState<{ id: string; name: string }[]>([]);

  // Acceptance checklist state.
  const [parcelPackedProperly, setParcelPackedProperly] = useState(false);
  const [restrictedItemsChecked, setRestrictedItemsChecked] = useState(false);
  const [documentsVerified, setDocumentsVerified] = useState(false);
  const [isFragile, setIsFragile] = useState(false);
  const [insuranceRequired, setInsuranceRequired] = useState(false);
  const [acceptanceRemarks, setAcceptanceRemarks] = useState("");
  const [isAccepting, setIsAccepting] = useState(false);

  // Recipient (delivery) address — confirmed with the customer at the door, or taken down here
  // if they skipped it when booking.
  const [recipient, setRecipient] = useState<RecipientForm>(emptyRecipient);
  const [recipientErrors, setRecipientErrors] = useState<RecipientErrors>({});
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);

  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // No rate card and no admin-set price: only older unpriced pickups (unpriced quotes now go to an
  // admin first — see QuotesService.create), so the partner names the price at the door. An
  // admin-quoted pickup already carries its price in estimatedPrice.
  const unpricedPickup =
    pickup !== null && pickup.rateProviderId === null && pickup.estimatedPrice <= 0;
  // The weighed parcel falls outside every slab this carrier publishes (a 9 kg box on a card that
  // stops at 8). Blocking here would strand the partner at the door, so they name the price —
  // the server accepts one only while no rate resolves.
  const noRateForThisParcel = preview !== null && preview.recalculatedPrice === null;
  const needsManualPrice = unpricedPickup || noRateForThisParcel;

  function load() {
    setIsLoading(true);
    setError(null);
    apiClient
      .get<PickupRequestDto>(`${api}/${id}`)
      .then((res) => {
        setPickup(res);
        setRecipient(recipientFrom(res.recipient));
        setBoxes(packagesFrom(res.verifiedPackages ?? res.packages, res.verifiedWeightKg ?? res.estimatedWeightKg));
        setItems(itemsFrom(res.items));
        setVerifiedShipmentType(res.verifiedShipmentType ?? res.shipmentType);
      })
      .catch((err) => {
        setError(errorMessage(err, "Couldn't load this pickup."));
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // One-shot lookup keyed off the route param, not a subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Who may approve a "pay later", fetched once the parcel is verified and payment is the next
  // thing to happen. Kept out of the initial load because most pickups are simply paid for.
  useEffect(() => {
    if (!pickup?.verifiedAt || dueApprovers.length > 0) return;
    apiClient
      .get<{ id: string; name: string }[]>(`${api}/due-approvers`)
      .then(setDueApprovers)
      .catch(() => setDueApprovers([]));
  }, [pickup?.verifiedAt, dueApprovers.length, api]);

  // Auto-recalculate whenever the weight settles (debounced) — the partner never has to
  // remember to tap a "Recalculate" button. Server-side is still the source of truth; this
  // is a preview only, nothing is persisted until "Confirm Verification".
  useEffect(() => {
    if (!pickup || pickup.arrivedAt === null || pickup.verifiedAt) return;
    const weightKg = debouncedWeight;
    if (!weightKg || weightKg <= 0) {
      // Dropping a now-stale preview when the inputs stop being valid — one render, not a loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }
    let cancelled = false;
    setIsRecalculating(true);
    apiClient
      .post<RecalculatePreviewDto>(`${api}/${id}/recalculate`, {
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

  async function uploadPhoto(kind: "aadhaar" | "parcel-photo", file: File) {
    const form = new FormData();
    form.append("file", file);
    const updated = await apiClient.postForm<PickupRequestDto>(`${api}/${id}/${kind}`, form);
    setPickup(updated);
    showToast({ variant: "success", title: kind === "aadhaar" ? "Aadhaar saved" : "Parcel photo saved" });
  }

  async function documentUrl(kind: keyof PickupDocumentsDto): Promise<string | null> {
    const docs = await apiClient.get<PickupDocumentsDto>(`${api}/${id}/documents`);
    return docs[kind];
  }

  async function handleArrive() {
    setIsArriving(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `${api}/${id}/arrive`,
        {},
      );
      setPickup(updated);
    } catch {
      showToast({ variant: "error", title: "Unable to connect. Please try again." });
    } finally {
      setIsArriving(false);
    }
  }

  async function handleClaim() {
    const updated = await claim(id);
    if (updated) setPickup(updated);
    else load();
  }

  async function handleVerify() {
    if (packagesProblem) {
      setVerifyError(packagesProblem);
      return;
    }
    const itemsProblem = validateItems(items);
    if (itemsProblem) {
      setVerifyError(itemsProblem);
      return;
    }
    const price = Number(manualPrice);
    if (needsManualPrice && (!price || price <= 0)) {
      setVerifyError("Enter the price you agreed with the customer.");
      document.getElementById("manual-price")?.focus();
      return;
    }
    const recipientProblems = validateRecipient(recipient);
    setRecipientErrors(recipientProblems);
    if (Object.keys(recipientProblems).length > 0) {
      setVerifyError("Fill in the recipient's delivery address.");
      focusFirstInvalid();
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `${api}/${id}/verify`,
        {
          packages: toPackagesPayload(boxes),
          items: toItemsPayload(items),
          verifiedShipmentType,
          // Sent only on the no-rate path — the server rejects it outright anywhere else rather
          // than letting the phone name the price on a rate-carded shipment.
          ...(needsManualPrice ? { verifiedPrice: price } : {}),
          recipient: toRecipientPayload(recipient),
          verificationNotes: verificationNotes.trim() || undefined,
        },
      );
      setPickup(updated);
      showToast({ variant: "success", title: "Parcel verified" });
    } catch (err) {
      // A 400 carries the server's own reason (no rate for this weight, a missing photo, …).
      setVerifyError(
        err instanceof ApiError && err.status === 400
          ? errorMessage(err, "This parcel couldn't be verified.")
          : "Unable to connect. Your verification was not saved. Please try again.",
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleCollectPayment() {
    if (!pickup?.verifiedPrice) return;
    if (needsApprover && !dueApprovedByAdminId) {
      showToast({ variant: "error", title: "Pick the admin who approved this due." });
      return;
    }
    const partPaid = Number(partialAmount);
    if (isPartial && (!(partPaid > 0) || partPaid >= pickup.payableAmount)) {
      showToast({
        variant: "error",
        title: `Enter an amount between 1 and ${pickup.payableAmount - 1}.`,
      });
      return;
    }
    setIsCollectingPayment(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `${api}/${id}/collect-payment`,
        isDue
          ? {
              deferred: true,
              dueApprovedByAdminId,
              dueNote: dueNote.trim() || undefined,
            }
          : {
              paymentMethod,
              collectedAmount: isPartial ? partPaid : pickup.payableAmount,
              paymentReference: paymentReference.trim() || undefined,
              ...(isPartial
                ? {
                    deferRemainder: true,
                    dueApprovedByAdminId,
                    dueNote: dueNote.trim() || undefined,
                  }
                : {}),
            },
      );
      setPickup(updated);
      showToast({
        variant: "success",
        title: isDue
          ? "Recorded as due: payment to follow"
          : isPartial
            ? `Collected ${formatMoney(partPaid, pickup.currency)}: remainder recorded as due`
            : "Payment collected",
      });
    } catch {
      showToast({
        variant: "error",
        title: "Unable to connect. Your payment update was not confirmed. Please try again.",
      });
    } finally {
      setIsCollectingPayment(false);
    }
  }

  async function handleAccept() {
    setIsAccepting(true);
    try {
      const updated = await apiClient.patch<PickupRequestDto>(
        `${api}/${id}/accept`,
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
      showToast({ variant: "success", title: "Pickup completed: order generated" });
    } catch {
      showToast({
        variant: "error",
        title: "Unable to connect. This pickup was not completed. Please try again.",
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
        `${api}/${id}/reject`,
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
  const isOpen = mode === "partner" && isOpenRequest(pickup);
  const atWarehouse = pickup.dropAtWarehouse;
  const canReject = !isTerminal && !isOpen;
  const calendarUrl = mode === "partner" ? googleCalendarUrl(pickup) : null;
  const step: Step = !pickup.arrivedAt
    ? "arrived"
    : // A due settles the payment step as surely as cash does — the parcel moves on either way.
      !pickup.paymentCollectedAt && !pickup.paymentDeferredAt
      ? "verify"
      : "complete";
  const showVerificationForm = step === "verify" && !pickup.verifiedAt;
  const showPaymentForm = step === "verify" && !!pickup.verifiedAt;

  return (
    <div className="space-y-5 pb-6">
      <button
        onClick={() => router.push(backHref)}
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

      {!isTerminal && !isOpen && (
        <Stepper
          steps={atWarehouse ? [{ label: "Received" }, ...STEPPER_STEPS.slice(1)] : STEPPER_STEPS} currentIndex={STEP_ORDER.indexOf(step)} />
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
                    <div className="mt-1 flex flex-wrap gap-x-5">
                      <a
                        href={mapsUrl(pickup)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                      >
                        <MapPinned className="h-3.5 w-3.5" aria-hidden />
                        Navigate
                      </a>
                      {calendarUrl && (
                        <a
                          href={calendarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                          Add to Google Calendar
                        </a>
                      )}
                    </div>
                    {pickup.pickupLatitude != null && pickup.pickupLongitude != null ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Customer&apos;s pin: {pickup.pickupLatitude.toFixed(6)}, {pickup.pickupLongitude.toFixed(6)}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-warning">
                        {pickup.pickupMapsUrl
                          ? "No map pin: navigating by the Google Maps link from the booking."
                          : "No map pin: navigating by the typed address."}
                      </p>
                    )}
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
              <div>
                <p className="text-xs text-muted-foreground">Deliver To</p>
                <p className="font-medium text-foreground">
                  {pickup.recipient
                    ? `${pickup.recipient.name} · ${[
                        pickup.recipient.addressLine1,
                        pickup.recipient.city,
                        pickup.destCountry,
                      ].join(", ")}`
                    : `${pickup.destCountry}: take the address down at pickup`}
                </p>
              </div>
              {pickup.items && pickup.items.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Contents</p>
                  <p className="font-medium text-foreground">
                    {pickup.items.map((i) => `${i.quantity} × ${i.description}`).join(", ")}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">Shipment Type</p>
                  <p className="font-medium text-foreground">{shipmentLabel(pickup.shipmentType)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Declared Weight</p>
                  <p className="font-medium text-foreground">
                    {pickup.estimatedWeightKg}kg
                    {pickup.packages && pickup.packages.length > 1 ? ` · ${pickup.packages.length} boxes` : ""}
                  </p>
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

          {isOpen ? (
            <Button size="lg" className="w-full" onClick={handleClaim} isLoading={isClaiming}>
              <Check className="h-5 w-5" aria-hidden />
              Accept Pickup
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={handleArrive} isLoading={isArriving}>
              <Check className="h-5 w-5" aria-hidden />
              {atWarehouse ? "Parcel Received at Warehouse" : "Arrived at Pickup"}
            </Button>
          )}
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
                    <Label>Weigh and measure each box</Label>
                    <div className="mt-1.5">
                      <PackagesEditor
                        value={boxes}
                        onChange={setBoxes}
                        requireDimensions={requireDimensions}
                        idPrefix="verified-box"
                      />
                    </div>
                  </div>

                  {needsManualPrice ? (
                    /* Nothing for the server to recalculate — either this shipment was never
                       rated, or the parcel as weighed falls outside every slab the carrier
                       publishes. Either way the partner is the one who has to name a number,
                       because the alternative is walking away from a packed parcel. */
                    <div className="space-y-1.5 rounded-lg border border-warning-border bg-warning-bg p-3">
                      {noRateForThisParcel && (
                        <p className="text-sm font-medium text-foreground">
                          Original quote{" "}
                          {formatMoney(pickup.estimatedPrice, pickup.currency)} · no rate covers
                          this parcel
                        </p>
                      )}
                      <Label htmlFor="manual-price">Price agreed with the customer (₹)</Label>
                      <Input
                        id="manual-price"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0.01"
                        value={manualPrice}
                        onChange={(e) => setManualPrice(e.target.value)}
                        className="h-12 text-lg font-semibold"
                        placeholder="0.00"
                      />
                      <p className="text-xs text-warning">
                        {noRateForThisParcel
                          ? `No rate card covers ${chargeableKg} kg as ${shipmentLabel(verifiedShipmentType)} on this carrier. Agree a price with the customer and enter it. This is what they will be charged.`
                          : "No rate card covers this route, so this parcel has no quoted price. Enter what the customer pays. This is the amount they will be charged."}
                      </p>
                    </div>
                  ) : (
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
                        {/* The customer WILL ask why it changed, and "the system says so" is not
                            an answer anyone can give at a doorstep. */}
                        {preview.changes.length > 0 && (
                          <div className="mt-2 space-y-1 border-t border-border pt-2">
                            <p className="text-xs font-medium text-foreground">
                              Why the price changed
                            </p>
                            {preview.changes.map((change) => (
                              <div
                                key={change.label}
                                className="flex items-center justify-between text-xs text-muted-foreground"
                              >
                                <span>{change.label}</span>
                                <span>
                                  {change.from} → <span className="text-foreground">{change.to}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {!isRecalculating && !preview && (
                      <p className="text-muted-foreground">Enter the verified weight to see the price.</p>
                    )}
                  </div>
                  )}

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
                    Parcel Verified: I have physically checked this parcel
                  </label>

                  {verifyError && <FieldError>{verifyError}</FieldError>}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 pt-5">
                  <div>
                    <p className="text-sm font-medium text-foreground">Contents</p>
                    <p className="text-xs text-muted-foreground">
                      Check against what is actually in the box. Carriers declare these to customs.
                    </p>
                  </div>
                  <ItemsEditor value={items} onChange={setItems} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3 pt-5">
                  <p className="text-sm font-medium text-foreground">Photos</p>
                  <PhotoCapture
                    title="Customer's Aadhaar card"
                    hint={
                      pickup.aadhaarOnFile
                        ? "Already on file from an earlier pickup. Replace it only if it has changed."
                        : "Photograph the front of the card. It is kept for the customer's future pickups."
                    }
                    onFileLabel="Take Aadhaar photo"
                    hasFile={pickup.aadhaarOnFile}
                    onFile={(file) => uploadPhoto("aadhaar", file)}
                    getViewUrl={() => documentUrl("aadhaarUrl")}
                  />
                  <PhotoCapture
                    title="Parcel photo"
                    hint="The packed box, with any labels visible."
                    onFileLabel="Take parcel photo"
                    hasFile={pickup.parcelPhotoOnFile}
                    onFile={(file) => uploadPhoto("parcel-photo", file)}
                    getViewUrl={() => documentUrl("parcelPhotoUrl")}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 pt-5">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Recipient (delivery address) · {pickup.destCountry}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pickup.recipient
                        ? "Entered by the customer. Check it with them and correct anything that's wrong."
                        : "The customer didn't add one: take it down now."}
                    </p>
                  </div>
                  <RecipientFields
                    value={recipient}
                    onChange={setRecipient}
                    errors={recipientErrors}
                    isIndia={pickup.destCountry === "India"}
                    country={pickup.destCountry}
                    idPrefix="recipient"
                  />
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={recipientConfirmed}
                      onChange={(e) => setRecipientConfirmed(e.target.checked)}
                    />
                    I have confirmed this address with the customer
                  </label>
                </CardContent>
              </Card>

              <Button
                size="lg"
                className="w-full"
                onClick={handleVerify}
                isLoading={isVerifying}
                disabled={
                  !parcelPhysicallyChecked ||
                  !recipientConfirmed ||
                  !pickup.aadhaarOnFile ||
                  !pickup.parcelPhotoOnFile
                }
              >
                Confirm Verification
              </Button>
              {(!pickup.aadhaarOnFile || !pickup.parcelPhotoOnFile) && (
                <p className="text-center text-xs text-muted-foreground">
                  Add the Aadhaar and parcel photos to continue.
                </p>
              )}
            </>
          )}

          {showPaymentForm && pickup.verifiedPrice !== null && (
            <>
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Amount To Collect</p>
                    <p className="text-3xl font-bold text-foreground">
                      {formatMoney(pickup.payableAmount, pickup.currency)}
                    </p>
                    {/* The customer will say "I used a code" — the figure has to show why it is
                        lower than the price, or the partner cannot confirm it. */}
                    {pickup.discountAmount ? (
                      <p className="mt-1 text-xs text-success">
                        {formatMoney(
                          pickup.verifiedPrice ?? pickup.estimatedPrice,
                          pickup.currency,
                        )}{" "}
                        less {formatMoney(pickup.discountAmount, pickup.currency)}
                        {pickup.couponCode ? ` (${pickup.couponCode})` : ""}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <Label>Payment</Label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {(
                        [
                          ["now", "Paying now"],
                          ["partial", "Part now"],
                          ["later", "Pay later"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setPayMode(mode)}
                          className={cn(
                            "rounded-lg border-2 px-1 py-3 text-center text-sm font-semibold",
                            payMode === mode
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isPartial && (
                    <div className="space-y-1.5">
                      <Label htmlFor="partial-amount">Collecting now (₹)</Label>
                      <Input
                        id="partial-amount"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="1"
                        max={pickup.payableAmount - 1}
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                        className="h-12 text-lg font-semibold"
                        placeholder="0.00"
                      />
                      <p className="text-xs text-muted-foreground">
                        {Number(partialAmount) > 0 &&
                        Number(partialAmount) < pickup.payableAmount
                          ? `${formatMoney(
                              pickup.payableAmount - Number(partialAmount),
                              pickup.currency,
                            )} will stay owing on the order.`
                          : "The rest becomes a due on the customer's order."}
                      </p>
                    </div>
                  )}

                  {needsApprover && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="due-approver">Approved by</Label>
                        <select
                          id="due-approver"
                          value={dueApprovedByAdminId}
                          onChange={(e) => setDueApprovedByAdminId(e.target.value)}
                          className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Select the admin who approved…</option>
                          {dueApprovers.map((admin) => (
                            <option key={admin.id} value={admin.id}>
                              {admin.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Ring an admin before taking a parcel without payment. Their name goes
                          on the record.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="due-note">Note (optional)</Label>
                        <Input
                          id="due-note"
                          placeholder="Regular customer, settling on Monday"
                          value={dueNote}
                          onChange={(e) => setDueNote(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {takesMoney && (
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
                  )}

                  {takesMoney && paymentMethod === "UPI" && (
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
                title={isDue ? "Confirm Due" : "Confirm Payment"}
                description={
                  isDue
                    ? `${formatMoney(pickup.payableAmount, pickup.currency)} will be left owing, approved by ${
                        dueApprovers.find((a) => a.id === dueApprovedByAdminId)?.name ?? "—"
                      }. The customer sees this as due in their portal.`
                    : isPartial
                      ? `Collecting ${formatMoney(Number(partialAmount) || 0, pickup.currency)} by ${
                          PARTNER_PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label
                        }, leaving ${formatMoney(
                          pickup.payableAmount - (Number(partialAmount) || 0),
                          pickup.currency,
                        )} owing, approved by ${
                          dueApprovers.find((a) => a.id === dueApprovedByAdminId)?.name ?? "—"
                        }.`
                      : `Amount: ${formatMoney(pickup.payableAmount, pickup.currency)} · Method: ${
                          PARTNER_PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label
                        }. Are you sure the payment has been received?`
                }
                confirmLabel={isDue ? "Confirm Due" : "Confirm Payment"}
                onConfirm={handleCollectPayment}
                trigger={
                  <Button size="lg" className="w-full" isLoading={isCollectingPayment}>
                    {isDue
                      ? "Record As Due"
                      : isPartial
                        ? "Collect Part Payment"
                        : "Mark Payment Collected"}
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
              <SummaryRow
                label="Payment Status"
                value={
                  pickup.paymentDeferredAt
                    ? `Due: approved by ${pickup.paymentDueApprovedByAdminName ?? "an admin"}`
                    : "Collected"
                }
              />
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
