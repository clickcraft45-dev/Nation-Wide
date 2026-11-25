import { describe, expect, it } from "vitest";
import { duplicateOf, itemsFrom, toItemsPayload, validateItems, type ItemForm } from "./items-editor";

const row = (over: Partial<ItemForm> = {}): ItemForm => ({
  category: "",
  description: "Saree",
  quantity: "2",
  unitValue: "500",
  hsCode: "",
  box: "",
  ...over,
});

describe("items and boxes", () => {
  it("records each item's box, listed box by box", () => {
    expect(toItemsPayload([row({ box: "2" }), row(), row({ box: "2", description: "Shawl" })], 2).map((i) => i.box)).toEqual([1, 2, 2]);
  });

  it("keeps the typed order within a box", () => {
    const payload = toItemsPayload([row({ box: "2", description: "A" }), row({ description: "B" }), row({ box: "2", description: "C" })], 2);
    expect(payload.map((i) => i.description)).toEqual(["B", "A", "C"]);
  });

  it("says nothing about boxes for a one-box shipment", () => {
    expect(toItemsPayload([row({ box: "1" })], 1)[0]).not.toHaveProperty("box");
  });

  it("catches an item left in a box that was removed", () => {
    expect(validateItems([row(), row({ box: "3" })], 2)).toMatch(/Box 3 no longer exists/);
    expect(validateItems([row(), row({ box: "2" })], 2)).toBeNull();
  });

  it("names the row by its box in errors", () => {
    expect(validateItems([row(), row({ box: "2" }), row({ box: "2", description: "" })], 2)).toBe(
      "Box 2, item 2: describe what it is.",
    );
  });

  it("reads the box back from saved contents", () => {
    expect(itemsFrom([{ description: "Saree", quantity: 1, unitValue: 5, box: 2 }])[0].box).toBe("2");
  });
});

describe("duplicate items", () => {
  it("points a repeat in the same box at the first one, ignoring case and spacing", () => {
    expect(duplicateOf([row(), row({ description: "Shawl" }), row({ description: "  saree " })])).toEqual([-1, -1, 0]);
  });

  it("allows the same item in different boxes", () => {
    expect(duplicateOf([row({ box: "1" }), row({ box: "2" })])).toEqual([-1, -1]);
  });

  it("treats no box as Box 1 and ignores blank rows", () => {
    expect(duplicateOf([row({ box: "" }), row({ box: "1" }), row({ description: "" }), row({ description: "" })])).toEqual([-1, 0, -1, -1]);
  });
});
