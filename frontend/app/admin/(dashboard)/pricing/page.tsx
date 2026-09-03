"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPricingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/pricing/dashboard");
  }, [router]);

  return null;
}
