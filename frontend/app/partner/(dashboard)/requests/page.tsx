import { redirect } from "next/navigation";

// Partners used to pick up open requests here. Staff now assign every pickup (Admin > Pickup
// Assignments), so there is nothing to choose from: old links and notifications land on the
// dashboard, which lists what has been assigned.
export default function PartnerRequestsPage() {
  redirect("/partner/dashboard");
}
