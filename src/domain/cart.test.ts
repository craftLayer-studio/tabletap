import { describe, expect, it } from "vitest";
import { addToCart, buildOrderItems, cartCount, cartTotal, itemsTotal, setLineQty, type Cart } from "./cart";
import { testMenu } from "./test-fixtures";

describe("cart", () => {
  it("merges identical lines and keeps lines with different notes apart", () => {
    let cart: Cart = [];
    cart = addToCart(cart, { itemId: "dal", variantId: "regular", qty: 1 });
    cart = addToCart(cart, { itemId: "dal", variantId: "regular", qty: 2 });
    cart = addToCart(cart, { itemId: "dal", variantId: "regular", qty: 1, note: "less oil" });
    expect(cart).toHaveLength(2);
    expect(cart[0].qty).toBe(3);
    expect(cartCount(cart)).toBe(4);
  });

  it("caps quantity and removes a line at zero", () => {
    let cart = addToCart([], { itemId: "dal", variantId: "regular", qty: 50 });
    expect(cart[0].qty).toBe(20);
    cart = setLineQty(cart, 0, 0);
    expect(cart).toEqual([]);
    expect(() => addToCart([], { itemId: "dal", variantId: "regular", qty: 0 })).toThrow();
  });

  it("totals with deal prices", () => {
    const cart: Cart = [
      { itemId: "paneer-tikka", variantId: "half", qty: 2 },
      { itemId: "dal", variantId: "regular", qty: 1 },
    ];
    expect(cartTotal(testMenu, cart)).toBe(2 * 18000 + 19800);
  });

  it("snapshots valid carts into order items", () => {
    const result = buildOrderItems(testMenu, [{ itemId: "paneer-tikka", variantId: "full", qty: 1, note: "  extra mint  " }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({
      name: "Paneer Tikka",
      variantName: "Full",
      unitPrice: 32000,
      note: "extra mint",
      station: "tandoor",
    });
    expect(itemsTotal(result.items)).toBe(32000);
  });

  it("rejects empty carts, unknown items, sold-out items and bad quantities", () => {
    expect(buildOrderItems(testMenu, [])).toEqual({ ok: false, errors: ["Cart is empty"] });
    const result = buildOrderItems(testMenu, [
      { itemId: "nope", variantId: "x", qty: 1 },
      { itemId: "fish", variantId: "regular", qty: 1 },
      { itemId: "dal", variantId: "large", qty: 1 },
      { itemId: "dal", variantId: "regular", qty: 1.5 },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(4);
    expect(result.errors[1]).toContain("sold out");
  });
});
