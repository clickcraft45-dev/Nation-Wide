"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MapPin, Phone } from "lucide-react";
import {
  chargeableWeightKg,
  type B2bRequestSummaryDto,
  type ParcelPackageDto,
  type PickupRequestDto,
} from "@nationwide/shared-types";
import { errorMessage } from "@/lib/api-client";
import type { B2bClient } from "@/lib/b2b-client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/page-state";
import { TrackingStatusBadge } from "@/components/ui/status-badge";

const SLOT_LABEL: Record<string, string> = {
  "09:00-12:00": "9 AM – 12 PM",
  "12:00-15:00": "12 – 3 PM",
  "15:00-18:00": "3 – 6 PM",
};

const money = (value: number, currency = "INR") =>
  `${currency === "INR" ? "₹" : `${currency} `}${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const sentence = (code: string) => {
  const words = code.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const day = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const box = (p: ParcelPackageDto) =>
  `${p.weightKg} kg${p.lengthCm && p.widthCm && p.heightCm ? ` · ${p.lengthCm} × ${p.widthCm} × ${p.heightCm} cm` : ""}`;

/**
 * One order in full, opened from the Orders tab. The row already carries status, price and the
 * tracking number, so the dialog shows those at once and fills in the rest from GET /orders/:id.
 */
export function OrderDetailsDialog({
  client,
  row,
  onClose,
  onTrack,
}: {
  client: B2bClient;
  row: B2bRequestSummaryDto | null;
  onClose: () => void;
  onTrack: (trackingNumber: string) => void;
}) {
  const [detail, setDetail] = useState<PickupRequestDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = row?.id;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Clearing the previous order's details when another is opened — one render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetail(null);
    setError(null);
    client
      .get<PickupRequestDto>(`/orders/${id}`)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => !cancelled && setError(errorMessage(err, "Couldn't load this order.")));
    return () => {
      cancelled = true;
    };
  }, [client, id]);

  if (!row) return null;
  const packages = detail?.verifiedPackages ?? detail?.packages ?? null;
  const items = detail?.items ?? [];
  const declared = items.reduce((sum, i) => sum + i.quantity * i.unitValue, 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl"
        title={`${row.recipientName ?? "Recipient at pickup"} · ${row.destinationCountry}`}
        description={`Booked ${day(row.createdAt)}`}
      >
        <div className="divide-y divide-[color:var(--glass-edge)]">
          {/* At a glance: always from the row, so it shows before the details arrive. */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{sentence(row.status)}</span>
              {row.carrier && <span className="text-sm text-muted-foreground">· {row.carrier}</span>}
            </div>
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {money(Math.round(row.price), row.currency)}
            </span>
          </div>

          {row.trackingNumber && (
            <div className="flex flex-wrap items-center gap-2 py-4">
              <button
                type="button"
                onClick={() => onTrack(row.trackingNumber!)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MapPin className="h-4 w-4" aria-hidden />
                Track {row.trackingNumber}
              </button>
              <TrackingStatusBadge status={row.shipmentStatus ?? undefined} />
            </div>
          )}

          {error && (
            <div className="py-4">
              <ErrorState message={error} />
            </div>
          )}
          {!detail && !error && (
            <div className="space-y-3 py-5" aria-busy="true" aria-label="Loading order details">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {detail && (
            <>
              <div className="grid gap-6 py-5 sm:grid-cols-2">
                <Block title="Pickup">
                  <p className="font-medium text-foreground">
                    {detail.dropAtWarehouse
                      ? "Dropped at the warehouse"
                      : detail.pickupDate
                        ? `${day(detail.pickupDate)}${detail.pickupTimeSlot ? ` · ${SLOT_LABEL[detail.pickupTimeSlot] ?? detail.pickupTimeSlot}` : ""}`
                        : "Date to be confirmed"}
                  </p>
                  <Address
                    lines={[
                      detail.pickupContactName,
                      detail.pickupAddressLine1,
                      detail.pickupAddressLine2,
                      `${detail.pickupCity}, ${detail.pickupState} ${detail.pickupPostalCode}`,
                    ]}
                  />
                  <PhoneLink phone={detail.pickupContactPhone} />
                  {detail.pickupInstructions && (
                    <p className="text-muted-foreground">“{detail.pickupInstructions}”</p>
                  )}
                  {detail.assignedPartnerName && (
                    <p className="pt-1 text-muted-foreground">
                      Partner: <span className="text-foreground">{detail.assignedPartnerName}</span>
                      {detail.assignedPartnerPhone && (
                        <>
                          {" · "}
                          <PhoneLink phone={detail.assignedPartnerPhone} inline />
                        </>
                      )}
                    </p>
                  )}
                </Block>

                <Block title="Deliver to">
                  {detail.recipient ? (
                    <>
                      <Address
                        lines={[
                          detail.recipient.name,
                          detail.recipient.addressLine1,
                          detail.recipient.addressLine2,
                          `${detail.recipient.city}, ${detail.recipient.state} ${detail.recipient.postalCode}`,
                          detail.destCountry,
                        ]}
                      />
                      <PhoneLink phone={detail.recipient.phone} />
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      {detail.destCountry}. The address is taken down at pickup.
                    </p>
                  )}
                </Block>
              </div>

              <div className="py-5">
                <Block title={detail.verifiedPackages ? "Parcel (as measured at pickup)" : "Parcel"}>
                  <p className="text-foreground">
                    {sentence(detail.verifiedShipmentType ?? detail.shipmentType)}
                    {packages?.length
                      ? ` · ${packages.length} box${packages.length === 1 ? "" : "es"} · ${chargeableWeightKg(packages)} kg chargeable`
                      : ` · ${detail.verifiedWeightKg ?? detail.estimatedWeightKg} kg`}
                  </p>
                  {packages && packages.length > 1 && (
                    <ul className="text-muted-foreground">
                      {packages.map((p, i) => (
                        <li key={i}>
                          Box {i + 1}: {box(p)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {packages?.length === 1 && <p className="text-muted-foreground">{box(packages[0])}</p>}
                </Block>
              </div>

              {items.length > 0 && (
                <div className="py-5">
                  <Block title="Contents">
                    <table className="w-full text-left">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="pb-2 font-medium">Item</th>
                          <th className="pb-2 text-right font-medium">Qty</th>
                          <th className="pb-2 text-right font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((item, i) => (
                          <tr key={i}>
                            <td className="py-2 pr-3 text-foreground">
                              {item.description}
                              {(item.category || item.hsCode) && (
                                <span className="block text-xs text-muted-foreground">
                                  {[item.category, item.hsCode && `HS ${item.hsCode}`].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right tabular-nums text-foreground">{item.quantity}</td>
                            <td className="py-2 text-right tabular-nums text-foreground">
                              {money(item.quantity * item.unitValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border">
                          <td colSpan={2} className="pt-2 text-muted-foreground">Declared value</td>
                          <td className="pt-2 text-right font-medium tabular-nums text-foreground">{money(declared)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </Block>
                </div>
              )}

              <div className="py-5">
                <Block title="Price">
                  <dl className="space-y-1.5">
                    <Line label="Quoted" value={money(detail.estimatedPrice, detail.currency)} />
                    {detail.verifiedPrice !== null && detail.verifiedPrice !== detail.estimatedPrice && (
                      <Line label="After weighing at pickup" value={money(detail.verifiedPrice, detail.currency)} />
                    )}
                    {detail.discountAmount ? (
                      <Line
                        label={`Discount${detail.couponCode ? ` (${detail.couponCode})` : ""}`}
                        value={`− ${money(detail.discountAmount, detail.currency)}`}
                      />
                    ) : null}
                    <Line strong label="Payable" value={money(detail.payableAmount, detail.currency)} />
                  </dl>
                  {detail.paymentCollectedAt && (
                    <p className="pt-1 text-success">
                      Paid {detail.collectedAmount !== null ? money(detail.collectedAmount, detail.currency) : ""}
                      {detail.paymentMethod ? ` by ${sentence(detail.paymentMethod)}` : ""} on {day(detail.paymentCollectedAt)}
                    </p>
                  )}
                  {!detail.paymentCollectedAt && detail.paymentDeferredAt && (
                    <p className="pt-1 text-warning">Pay later, approved {day(detail.paymentDeferredAt)}</p>
                  )}
                </Block>
              </div>

              {(detail.rejectionReason || detail.verificationNotes) && (
                <div className="py-5">
                  <Block title="Notes">
                    {detail.rejectionReason && <p className="text-danger">{detail.rejectionReason}</p>}
                    {detail.verificationNotes && <p className="text-muted-foreground">{detail.verificationNotes}</p>}
                  </Block>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5 text-sm">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function Address({ lines }: { lines: (string | null | undefined)[] }) {
  return (
    <address className="not-italic text-foreground">
      {lines.filter(Boolean).map((line, i) => (
        <span key={i} className={i === 0 ? "block font-medium" : "block text-muted-foreground"}>
          {line}
        </span>
      ))}
    </address>
  );
}

function PhoneLink({ phone, inline }: { phone: string; inline?: boolean }) {
  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      className={`${inline ? "" : "flex w-fit "}items-center gap-1.5 text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      {!inline && <Phone className="inline h-3.5 w-3.5 text-muted-foreground" aria-hidden />} {phone}
    </a>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-border pt-1.5 font-semibold text-foreground" : "text-muted-foreground"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
