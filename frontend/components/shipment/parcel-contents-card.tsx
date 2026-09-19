"use client";

import Link from "next/link";
import { chargeableWeightKg, type PickupDocumentsDto, type PickupRequestDto } from "@nationwide/shared-types";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * The boxes, declared contents and pickup photos — what staff need in front of them when booking
 * the shipment with DHL/FedEx/UPS/DPD. Shown on both the pickup request and the order it became.
 */
export function ParcelContentsCard({ pickup, showPickupLink = false }: { pickup: PickupRequestDto; showPickupLink?: boolean }) {
  const { showToast } = useToast();
  const boxes = pickup.verifiedPackages ?? pickup.packages;

  // Opened synchronously so the popup blocker treats it as the click; the link lives 5 minutes.
  async function openDocument(kind: keyof PickupDocumentsDto) {
    const tab = window.open("", "_blank");
    try {
      const docs = await apiClient.get<PickupDocumentsDto>(`/admin/pickup-requests/${pickup.id}/documents`);
      const url = docs[kind];
      if (tab && url) tab.location.href = url;
      else tab?.close();
    } catch {
      tab?.close();
      showToast({ variant: "error", title: "Couldn't open the photo." });
    }
  }

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
              {boxes.map((b, i) => (
                <li key={i}>
                  {boxes.length > 1 ? `Box ${i + 1}: ` : ""}
                  {b.weightKg} kg
                  {b.lengthCm && b.widthCm && b.heightCm ? ` · ${b.lengthCm} × ${b.widthCm} × ${b.heightCm} cm` : ""}
                </li>
              ))}
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
                    <th className="py-1 font-normal">Item</th>
                    <th className="py-1 font-normal">HS code</th>
                    <th className="py-1 text-right font-normal">Qty</th>
                    <th className="py-1 text-right font-normal">Value</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-foreground">
                  {pickup.items.map((item, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1">{item.description}</td>
                      <td className="py-1">{item.hsCode ?? "—"}</td>
                      <td className="py-1 text-right">{item.quantity}</td>
                      <td className="py-1 text-right">₹{(item.quantity * item.unitValue).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="font-medium text-foreground">Not declared yet — the partner records it at pickup.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={!pickup.aadhaarOnFile} onClick={() => openDocument("aadhaarUrl")}>
            {pickup.aadhaarOnFile ? "View Aadhaar" : "No Aadhaar on file"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!pickup.parcelPhotoOnFile}
            onClick={() => openDocument("parcelPhotoUrl")}
          >
            {pickup.parcelPhotoOnFile ? "View parcel photo" : "No parcel photo yet"}
          </Button>
          {showPickupLink && (
            <Link href={`/admin/pickup-requests/${pickup.id}`}>
              <Button variant="ghost" size="sm">
                Pickup details
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
