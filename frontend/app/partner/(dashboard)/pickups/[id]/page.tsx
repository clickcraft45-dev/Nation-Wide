"use client";

import { useParams } from "next/navigation";
import { PickupWorkflow } from "@/components/partner/pickup-workflow";

export default function PartnerPickupDetailPage() {
  const params = useParams<{ id: string }>();
  return <PickupWorkflow id={params.id} mode="partner" />;
}
