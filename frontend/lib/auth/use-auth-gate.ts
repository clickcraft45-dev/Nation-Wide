"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/state/auth-context";

// Shared "requires an account" gate for public-page CTAs (Get a Quote, Book Shipment,
// Schedule Pickup, My Orders, ...). A signed-in visitor goes straight to the destination;
// everyone else is sent to log in first, with `redirect` bringing them right back afterward.
export function useAuthGate() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  return function gate(destination: string) {
    if (isLoading) return;
    router.push(user ? destination : `/login?redirect=${encodeURIComponent(destination)}`);
  };
}
