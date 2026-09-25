"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { chargeableWeightKg, type PickupDocumentsDto, type PickupRequestDto } from "@nationwide/shared-types";
import { apiClient, errorMessage } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * The boxes, declared contents and pickup photos — what staff need in front of them when booking
 * the shipment with DHL/FedEx/UPS/DPD. Shown on both the pickup request and the order it became.
 */
export function ParcelContentsCard({
  pickup,
  showPickupLink = false,
  onDocumentUploaded,
}: {
  pickup: PickupRequestDto;
  showPickupLink?: boolean;
  /** Called after a document is attached, so the page can refetch and flip the chip. */
  onDocumentUploaded?: () => void;
}) {
  const { showToast } = useToast();
  const boxes = pickup.verifiedPackages ?? pickup.packages;
  const aadhaarInput = useRef<HTMLInputElement>(null);
  const parcelInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"aadhaar" | "parcel-photo" | null>(null);

  /**
   * Attach a document a partner never captured. Staff can do this after the fact — by the time
   * an order exists the pickup is closed to its partner, which is exactly when the gap is noticed.
   */
  async function upload(kind: "aadhaar" | "parcel-photo", file: File) {
    setUploading(kind);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiClient.postForm(`/admin/pickup-requests/${pickup.id}/${kind}`, form);
      showToast({
        variant: "success",
        title: kind === "aadhaar" ? "Aadhaar attached" : "Parcel photo attached",
      });
      onDocumentUploaded?.();
    } catch (err) {
      showToast({ variant: "error", title: errorMessage(err, "That upload didn't go through.") });
    } finally {
      setUploading(null);
    }
  }

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
          {/* One hidden input per document: a shared one would need its handler swapped on every
              click, and a mis-timed swap files the photo under the wrong document. */}
          <input
            ref={aadhaarInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload("aadhaar", file);
            }}
          />
          <input
            ref={parcelInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload("parcel-photo", file);
            }}
          />

          {pickup.aadhaarOnFile ? (
            <Button variant="secondary" size="sm" onClick={() => openDocument("aadhaarUrl")}>
              View Aadhaar
            </Button>
          ) : (
            // A missing document used to be a dead, disabled button. It is the one place staff
            // notice the gap, so it is also where they can close it.
            <Button
              variant="secondary"
              size="sm"
              isLoading={uploading === "aadhaar"}
              onClick={() => aadhaarInput.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Add Aadhaar
            </Button>
          )}

          {pickup.parcelPhotoOnFile ? (
            <Button variant="secondary" size="sm" onClick={() => openDocument("parcelPhotoUrl")}>
              View parcel photo
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              isLoading={uploading === "parcel-photo"}
              onClick={() => parcelInput.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Add parcel photo
            </Button>
          )}
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
