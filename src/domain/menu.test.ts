import { describe, expect, it } from "vitest";
import { excludeAllergens, groupByCategory, unitPrice } from "./menu";
import { testMenu } from "./test-fixtures";

describe("menu", () => {
  it("groups items by category order and drops empty categories", () => {
    const groups = groupByCategory(testMenu);
    expect(groups.map((g) => g.category.id)).toEqual(["starters", "mains"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["dal", "fish"]);
  });

  it("applies deals to the unit price", () => {
    const dal = testMenu.items[1];
    expect(unitPrice(dal, dal.variants[0])).toBe(19800);
    const paneer = testMenu.items[0];
    expect(unitPrice(paneer, paneer.variants[1])).toBe(32000);
  });

  it("filters out items with allergens to avoid", () => {
    expect(excludeAllergens(testMenu.items, ["dairy", "fish"]).map((i) => i.id)).toEqual(["dal"]);
  });
});
