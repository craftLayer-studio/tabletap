import { describe, expect, it } from "vitest";
import { parseRupees, slugify, validateMenuItem, type MenuItemInput } from "./menu-edit";

const valid: MenuItemInput = {
  categoryId: "mains",
  name: "Paneer Butter Masala",
  description: "Cottage cheese in tomato gravy.",
  veg: true,
  spice: 1,
  station: "curry",
  prepMinutes: 12,
  allergens: ["dairy"],
  variants: [
    { name: "Half", price: 19000 },
    { name: "Full", price: 31000 },
  ],
  available: true,
};

describe("menu editing", () => {
  it("parses rupee prices into paise", () => {
    expect(parseRupees("320")).toBe(32000);
    expect(parseRupees("320.5")).toBe(32050);
    expect(parseRupees("₹1,250.00")).toBe(125000);
    expect(parseRupees("12.345")).toBeUndefined();
    expect(parseRupees("-5")).toBeUndefined();
    expect(parseRupees("")).toBeUndefined();
  });

  it("accepts a valid item and reports each problem", () => {
    expect(validateMenuItem(valid, ["mains"])).toEqual([]);
    const errors = validateMenuItem(
      { ...valid, name: "x", categoryId: "nope", prepMinutes: 0, variants: [{ name: "Half", price: 0 }, { name: "half", price: 100 }] },
      ["mains"],
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "Name must be 2 to 80 characters",
        "Pick a category",
        "Prep time must be 1 to 120 minutes",
        'Size "half" is listed twice',
        'Price for "Half" is not valid',
      ]),
    );
    expect(validateMenuItem({ ...valid, variants: [] }, ["mains"])).toContain("Give 1 to 6 sizes with prices");
    expect(validateMenuItem({ ...valid, dealPercentOff: 20 }, ["mains"])).toContain("A deal needs a label guests can read");
  });

  it("slugifies names", () => {
    expect(slugify("Paneer Tikka (Half)")).toBe("paneer-tikka-half");
    expect(slugify("!!!")).toBe("item");
  });
});
