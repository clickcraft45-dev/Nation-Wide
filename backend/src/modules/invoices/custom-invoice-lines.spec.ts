import {
  customInvoiceLineTotal,
  customInvoiceTotal,
  type CustomInvoiceLineDto,
} from "@nationwide/shared-types";

// The figures from a real freight schedule, including the two rows that carry a GMR charge.
const SCHEDULE: CustomInvoiceLineDto[] = [
  { awbNumber: "6003402616", amount: 1103.76, otherCharges: 0, pss: 15, fsc: 396.65 },
  { awbNumber: "6003413054", amount: 2380.32, otherCharges: 0, pss: 0, fsc: 848.54 },
  { awbNumber: "6003448626", amount: 13446.0, otherCharges: 3138.98, pss: 450, fsc: 5676 },
];

describe("customInvoiceLineTotal", () => {
  it("adds freight, GMR, PSS and fuel the way the schedule does", () => {
    expect(customInvoiceLineTotal(SCHEDULE[0])).toBe(1515.41);
    expect(customInvoiceLineTotal(SCHEDULE[1])).toBe(3228.86);
    expect(customInvoiceLineTotal(SCHEDULE[2])).toBe(22710.98);
  });

  it("treats every surcharge as optional — a correction has only an amount", () => {
    expect(customInvoiceLineTotal({ amount: 500 })).toBe(500);
  });

  it("rounds to paise, so a column of floats cannot drift a rupee", () => {
    expect(customInvoiceLineTotal({ amount: 0.1, pss: 0.2 })).toBe(0.3);
  });
});

describe("customInvoiceTotal", () => {
  it("sums the rows", () => {
    expect(customInvoiceTotal(SCHEDULE)).toBe(27455.25);
  });

  it("is zero for an empty schedule, which the server refuses to invoice", () => {
    expect(customInvoiceTotal([])).toBe(0);
  });
});
