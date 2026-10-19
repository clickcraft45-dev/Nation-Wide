import { describe, expect, it } from "vitest";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { googleCalendarUrl, pendingStep } from "./pickup-card";

function pickup(over: Partial<PickupRequestDto>): PickupRequestDto {
  return {
    status: "OUT_FOR_PICKUP",
    arrivedAt: "2026-09-16T09:00:00Z",
    verifiedAt: null,
    paymentCollectedAt: null,
    ...over,
  } as PickupRequestDto;
}

describe("pendingStep", () => {
  it("is null before the partner arrives", () => {
    expect(pendingStep(pickup({ arrivedAt: null, status: "ASSIGNED" }))).toBeNull();
  });

  it("names the step left when the partner walked away mid-flow", () => {
    expect(pendingStep(pickup({}))).toBe("Verification pending");
    expect(pendingStep(pickup({ verifiedAt: "2026-09-16T09:05:00Z" }))).toBe("Payment pending");
    expect(
      pendingStep(pickup({ verifiedAt: "2026-09-16T09:05:00Z", paymentCollectedAt: "2026-09-16T09:07:00Z" })),
    ).toBe("Acceptance pending");
  });

  it("is null once the pickup is finished or dead", () => {
    for (const status of ["COMPLETED", "CANCELLED", "REJECTED"] as const) {
      expect(pendingStep(pickup({ status }))).toBeNull();
    }
  });
});

describe("googleCalendarUrl", () => {
  const booked = pickup({
    id: "pk1",
    status: "ASSIGNED",
    dropAtWarehouse: false,
    pickupDate: "2026-10-20",
    pickupTimeSlot: "09:00-12:00",
    pickupContactName: "Ravi Teja",
    pickupContactPhone: "+919876543210",
    pickupAddressLine1: "12 MG Road",
    pickupAddressLine2: null,
    pickupCity: "Hyderabad",
    pickupState: "Telangana",
    pickupPostalCode: "500016",
    pickupInstructions: null,
  });

  it("books the slot in IST with the address and the contact", () => {
    const params = new URL(googleCalendarUrl(booked)!).searchParams;
    expect(params.get("dates")).toBe("20261020T090000/20261020T120000");
    expect(params.get("ctz")).toBe("Asia/Kolkata");
    expect(params.get("location")).toBe("12 MG Road, Hyderabad, Telangana, 500016");
    expect(params.get("details")).toContain("+919876543210");
    expect(params.get("details")).toContain("/partner/pickups/pk1");
  });

  it("is null when there is nothing to schedule", () => {
    expect(googleCalendarUrl({ ...booked, status: "PENDING_ASSIGNMENT" })).toBeNull();
    expect(googleCalendarUrl({ ...booked, status: "COMPLETED" })).toBeNull();
    expect(googleCalendarUrl({ ...booked, dropAtWarehouse: true })).toBeNull();
    expect(googleCalendarUrl({ ...booked, pickupTimeSlot: null })).toBeNull();
  });
});
