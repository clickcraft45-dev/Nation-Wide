import { describe, expect, it } from "vitest";
import type { PickupRequestDto } from "@nationwide/shared-types";
import { pendingStep } from "./pickup-card";

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
