import { FullPageLoader } from "@/components/ui/prism-flux-loader";

/**
 * Next renders this while a route segment's server work is in flight. It is the framework's own
 * loading convention, so nothing has to thread an `isLoading` flag through the page tree — every
 * route under this segment gets the treatment for free.
 */
export default function Loading() {
  return <FullPageLoader />;
}
