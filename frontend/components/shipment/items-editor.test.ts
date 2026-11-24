import { describe, expect, it } from "vitest";
import { itemsFrom, toItemsPayload, validateItems, type ItemForm } from "./items-editor";

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
  it("records each item's box when there is more than one", () => {
    expect(toItemsPayload([row({ box: "2" }), row()], 2).map((i) => i.box)).toEqual([2, 1]);
  });

  it("says nothing about boxes for a one-box shipment", () => {
    expect(toItemsPayload([row({ box: "1" })], 1)[0]).not.toHaveProperty("box");
  });

  it("catches an item left in a box that was removed", () => {
    expect(validateItems([row(), row({ box: "3" })], 2)).toMatch(/Box 3 no longer exists/);
    expect(validateItems([row(), row({ box: "2" })], 2)).toBeNull();
  });

  it("reads the box back from saved contents", () => {
    expect(itemsFrom([{ description: "Saree", quantity: 1, unitValue: 5, box: 2 }])[0].box).toBe("2");
  });
});
