import { TrackingLookupPanel } from "@/features/tracking/TrackingLookupPanel";

export default async function TrackByIdPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-24">
      <h1 className="text-2xl font-semibold">Track your shipment</h1>
      <TrackingLookupPanel className="w-full max-w-md" initialTrackingId={decodeURIComponent(trackingId)} />
    </div>
  );
}
