"use client";

import { useParams } from "next/navigation";
import { PickupWorkflow } from "@/components/partner/pickup-workflow";

// Same workflow a partner runs at the door, run by staff at the warehouse counter.
export default function WarehouseDropoffDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-2xl">
      <PickupWorkflow id={params.id} mode="admin" />
    </div>
  );
}
