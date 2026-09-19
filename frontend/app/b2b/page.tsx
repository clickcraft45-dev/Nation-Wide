"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { sessionB2bClient } from "@/lib/b2b-client";
import { useAuth } from "@/state/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { B2bPortal } from "@/components/b2b/portal";

/**
 * The portal for a signed-in business account — the ordinary session, no token. Everyone else is
 * sent to log in: the server scopes every call to the account anyway (see B2bAccessGuard), so this
 * is routing, not the access check.
 */
export default function B2bPortalPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace(`/login?redirect=${encodeURIComponent("/b2b")}`);
    else if (user.role !== "CUSTOMER" || !user.isB2b) router.replace("/dashboard");
  }, [isLoading, user, router]);

  if (isLoading || !user?.isB2b) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="md" className="text-muted-foreground" />
      </div>
    );
  }

  return <B2bPortal client={sessionB2bClient} />;
}
