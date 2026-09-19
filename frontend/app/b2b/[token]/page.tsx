"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { b2bClient } from "@/lib/b2b-client";
import { B2bPortal } from "@/components/b2b/portal";

/**
 * The portal reached by a standing link. The token in the path is the whole credential — it is
 * moved into a header by b2bClient, so it never reaches the API's access logs.
 */
export default function B2bLinkPortalPage() {
  const { token } = useParams<{ token: string }>();
  const client = useMemo(() => b2bClient(token), [token]);
  return <B2bPortal client={client} />;
}
