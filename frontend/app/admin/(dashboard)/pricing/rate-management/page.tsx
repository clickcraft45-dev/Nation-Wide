"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// "Rate Management" used to render the Providers page a second time, with cancellation charges
// tucked underneath. Rates now live under Providers & rates and the charges under Charges &
// margins; this keeps old bookmarks working.
export default function RateManagementRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/pricing/providers");
  }, [router]);

  return null;
}
