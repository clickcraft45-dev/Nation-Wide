"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { PartnerApplicationForm } from "@/components/auth/partner-application-form";

/**
 * Deep link to the partner half of /register, for linking to directly from recruitment posts.
 * The form itself is shared, so the two entry points cannot drift apart.
 */
export default function PartnerApplicationPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <Logo variant="horizontal" size="md" />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Become a pickup partner</h1>
          <p className="text-sm text-muted-foreground">
            Collect parcels in your area and get paid per pickup.
          </p>
        </div>

        <PartnerApplicationForm />

        <p className="text-center text-sm text-muted-foreground">
          Want to ship instead?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create a customer account
          </Link>
        </p>
      </div>
    </div>
  );
}
