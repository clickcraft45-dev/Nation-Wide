import { describe, expect, it } from "vitest";
import { isUpiId, upiPayLink } from "./upi";

describe("upiPayLink", () => {
  it("fills in the payee, amount and note", () => {
    expect(
      upiPayLink({
        upiId: "yespay.mabs0488619ikit1322@yesbankltd",
        payeeName: "GLOBAL LOGISTICS SOLUTIONS",
        amount: 2450,
        note: "NationWide pickup 3f2a9c1d",
      }),
    ).toBe(
      "upi://pay?pa=yespay.mabs0488619ikit1322%40yesbankltd&pn=GLOBAL%20LOGISTICS%20SOLUTIONS" +
        "&am=2450.00&cu=INR&tn=NationWide%20pickup%203f2a9c1d",
    );
  });

  it("leaves the amount for the customer when none is given", () => {
    expect(upiPayLink({ upiId: "shop@okaxis" })).toBe("upi://pay?pa=shop%40okaxis&cu=INR");
  });

  it("sends paise to two places", () => {
    expect(upiPayLink({ upiId: "shop@okaxis", amount: 999.5 })).toContain("am=999.50");
  });
});

describe("isUpiId", () => {
  it("accepts handle@bank", () => {
    expect(isUpiId("yespay.mabs0488619ikit1322@yesbankltd")).toBe(true);
    expect(isUpiId("9876543210@ybl")).toBe(true);
  });

  it("refuses what is not one", () => {
    expect(isUpiId("yesbankltd")).toBe(false);
    expect(isUpiId("name@")).toBe(false);
    expect(isUpiId("name@bank pay")).toBe(false);
  });
});
