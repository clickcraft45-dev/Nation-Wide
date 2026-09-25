"use client";

// "Rate Management" is the task-framed entry point to the same Provider -> Country -> Weight
// Category -> Rate drill-down as the Providers grid, so it renders that exact page rather than a
// second, divergent provider picker. What it adds is the money that is not per rate: the charges
// a cancellation carries, which admins come looking for here.
import PricingProvidersPage from "../providers/page";
import { CancellationChargesCard } from "@/components/pricing/cancellation-charges-card";

export default function RateManagementPage() {
  return (
    <div className="space-y-6">
      <PricingProvidersPage />
      <CancellationChargesCard />
    </div>
  );
}
