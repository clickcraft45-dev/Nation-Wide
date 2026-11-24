"use client";

import Link from "next/link";
import {
  boxChargeableWeightKg,
  chargeableWeightKg,
  volumetricWeightKg,
  type PickupRequestDto,
} from "@nationwide/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PickupPhotos } from "@/components/shipment/photo-capture";
import { KycDocumentFields } from "@/components/shipment/kyc-document-fields";

const API = "/admin/pickup-requests";
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The boxes, declared contents, the shipper's ID and the pickup photos: what staff need in front
 * of them when booking the shipment with DHL/FedEx/UPS/DPD. Shown on both the pickup request and
 * the order it became.
 *
 * Staff can attach what a partner never captured. By the time an order exists the pickup is
 * closed to its partner, which is exactly when the gap is noticed.
 */
export function ParcelContentsCard({
  pickup,
  showPickupLink = false,
  onPickupChange,
}: {
  pickup: PickupRequestDto;
  showPickupLink?: boolean;
  /** Called with the updated pickup after the ID or a photo changes. */
  onPickupChange?: (updated: PickupRequestDto) => void;
}) {
  const boxes = pickup.verifiedPackages ?? pickup.packages;
  const changed = (updated: PickupRequestDto) => onPickupChange?.(updated);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parcel &amp; Contents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {boxes?.length ? (
          <div>
            <p className="text-muted-foreground">
              {pickup.verifiedPackages ? "Boxes as measured at pickup" : "Boxes as booked"} ·{" "}
              {boxes.length > 1 ? `bulk, ${boxes.length} boxes` : "1 box"} · chargeable {chargeableWeightKg(boxes)} kg
            </p>
            <ul className="mt-1 space-y-0.5 font-medium text-foreground">
              {boxes.map((b, i) => {
                const volumetric = round2(volumetricWeightKg(b));
                return (
                  <li key={i}>
                    {boxes.length > 1 ? `Box ${i + 1}: ` : ""}
                    {b.weightKg} kg
                    {b.lengthCm && b.widthCm && b.heightCm ? ` · ${b.lengthCm} × ${b.widthCm} × ${b.heightCm} cm` : ""}
                    {volumetric > 0 && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · volumetric {volumetric} kg · charged {round2(boxChargeableWeightKg(b))} kg
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">No box dimensions recorded.</p>
        )}

        <div>
          <p className="text-muted-foreground">Contents</p>
          {pickup.items?.length ? (
            <div className="overflow-x-auto">
              <table className="mt-1 w-full text-left">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    {pickup.items.some((item) => item.box) && <th className="py-1 font-normal">Box</th>}
                    <th className="py-1 font-normal">Item</th>
                    <th className="py-1 font-normal">HS code</th>
                    <th className="py-1 text-right font-normal">Qty</th>
                    <th className="py-1 text-right font-normal">Value</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-foreground">
                  {pickup.items.map((item, i) => (
                    <tr key={i} className="border-t border-border">
                      {pickup.items!.some((it) => it.box) && (
                        <td className="py-1 whitespace-nowrap">{item.box ? `Box ${item.box}` : "—"}</td>
                      )}
                      <td className="py-1">
                        {item.description}
                        {item.category && (
                          <span className="block text-xs font-normal text-muted-foreground">{item.category}</span>
                        )}
                      </td>
                      <td className="py-1">{item.hsCode ?? "—"}</td>
                      <td className="py-1 text-right">{item.quantity}</td>
                      <td className="py-1 text-right">₹{(item.quantity * item.unitValue).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="font-medium text-foreground">Not declared yet: the partner records it at pickup.</p>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-muted-foreground">Shipper&apos;s ID document</p>
          <KycDocumentFields
            pickupId={pickup.id}
            apiBase={API}
            value={pickup.kycDocument}
            onChange={changed}
            compact
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <PickupPhotos
            pickupId={pickup.id}
            apiBase={API}
            kind="KYC"
            title="ID document photos"
            photos={pickup.kycPhotos}
            onChange={changed}
            compact
          />
          <PickupPhotos
            pickupId={pickup.id}
            apiBase={API}
            kind="PARCEL"
            title="Parcel photos"
            photos={pickup.parcelPhotos}
            onChange={changed}
            compact
          />
          {pickup.paymentPhotos.length > 0 && (
            <PickupPhotos
              pickupId={pickup.id}
              apiBase={API}
              kind="PAYMENT"
              title="Payment proof"
              photos={pickup.paymentPhotos}
              onChange={changed}
              compact
            />
          )}
        </div>

        {showPickupLink && (
          <Link href={`/admin/pickup-requests/${pickup.id}`}>
            <Button variant="ghost" size="sm">
              Pickup details
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
