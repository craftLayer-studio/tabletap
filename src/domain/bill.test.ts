import { describe, expect, it } from "vitest";
import {
  amountDue,
  amountPaid,
  canRevise,
  computeBill,
  createBill,
  isFullyPaid,
  isValidEmail,
  payPart,
  splitEvenly,
} from "./bill";
import { buildOrderItems } from "./cart";
import { createOrder, transitionOrder } from "./order";
import { testMenu } from "./test-fixtures";

function order(id: string, lines: { itemId: string; variantId: string; qty: number }[]) {
  const built = buildOrderItems(testMenu, lines);
  if (!built.ok) throw new Error(built.errors.join());
  return createOrder({ id, restaurantId: "r", tableId: "t1", sessionId: "s1", items: built.items, at: 0 });
}

describe("computeBill", () => {
  const o1 = order("o1", [{ itemId: "paneer-tikka", variantId: "half", qty: 1 }]);
  const o2 = order("o2", [
    { itemId: "paneer-tikka", variantId: "half", qty: 1 },
    { itemId: "dal", variantId: "regular", qty: 1 },
  ]);
  const cancelled = transitionOrder(order("o3", [{ itemId: "dal", variantId: "regular", qty: 5 }]), "cancelled", 1);

  it("merges lines across orders and skips cancelled orders", () => {
    const bill = computeBill([o1, o2, cancelled], { taxPercent: 5, tipPercent: 0 });
    expect(bill.lines).toEqual([
      { name: "Paneer Tikka", variantName: "Half", qty: 2, unitPrice: 18000, total: 36000 },
      { name: "Dal Tadka", variantName: "Regular", qty: 1, unitPrice: 19800, total: 19800 },
    ]);
    expect(bill.subtotal).toBe(55800);
    expect(bill.tax).toBe(2790);
    expect(bill.tip).toBe(0);
    expect(bill.total).toBe(58590);
  });

  it("adds a tip on the subtotal, rounded to the paisa", () => {
    const bill = computeBill([o2], { taxPercent: 5, tipPercent: 10 });
    expect(bill.tip).toBe(3780);
    expect(bill.total).toBe(37800 + 1890 + 3780);
    const odd = computeBill([o2], { taxPercent: 0, tipPercent: 12.5 });
    expect(odd.tip).toBe(4725);
  });

  it("rejects out-of-range tips", () => {
    expect(() => computeBill([o1], { taxPercent: 5, tipPercent: -5 })).toThrow();
    expect(() => computeBill([o1], { taxPercent: 5, tipPercent: 80 })).toThrow();
  });
});

describe("splitEvenly", () => {
  it("splits with paise remainders that sum exactly", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(58590, 4)).toEqual([14648, 14648, 14647, 14647]);
    expect(splitEvenly(5, 7)).toEqual([1, 1, 1, 1, 1, 0, 0]);
    expect(splitEvenly(0, 2)).toEqual([0, 0]);
  });

  it("always sums to the total and differs by at most one paisa", () => {
    for (let total = 0; total < 3000; total += 7) {
      for (let n = 1; n <= 20; n++) {
        const parts = splitEvenly(total, n);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("rejects bad input", () => {
    expect(() => splitEvenly(100, 0)).toThrow();
    expect(() => splitEvenly(100, 21)).toThrow();
    expect(() => splitEvenly(100, 1.5)).toThrow();
    expect(() => splitEvenly(10.5, 2)).toThrow();
  });
});

describe("bill settlement", () => {
  const summary = computeBill([order("o1", [{ itemId: "dal", variantId: "regular", qty: 1 }])], {
    taxPercent: 5,
    tipPercent: 0,
  });

  it("pays shares one by one", () => {
    let bill = createBill({ id: "b", sessionId: "s1", summary, splitCount: 3, at: 0 });
    expect(bill.parts.map((p) => p.amount)).toEqual([6930, 6930, 6930]);
    expect(canRevise(bill)).toBe(true);
    bill = payPart(bill, 1, "upi", 10);
    expect(canRevise(bill)).toBe(false);
    expect(amountPaid(bill)).toBe(6930);
    expect(amountDue(bill)).toBe(13860);
    expect(isFullyPaid(bill)).toBe(false);
    bill = payPart(payPart(bill, 0, "cash", 11), 2, "card", 12);
    expect(isFullyPaid(bill)).toBe(true);
    expect(amountDue(bill)).toBe(0);
  });

  it("refuses double payment, unknown shares and empty bills", () => {
    const bill = payPart(createBill({ id: "b", sessionId: "s1", summary, splitCount: 2, at: 0 }), 0, "upi", 1);
    expect(() => payPart(bill, 0, "cash", 2)).toThrow(/already paid/);
    expect(() => payPart(bill, 5, "cash", 2)).toThrow();
    expect(() =>
      createBill({ id: "b", sessionId: "s", summary: { ...summary, total: 0 }, splitCount: 1, at: 0 }),
    ).toThrow();
  });

  it("validates receipt emails", () => {
    expect(isValidEmail("guest@example.com")).toBe(true);
    expect(isValidEmail("not an email")).toBe(false);
  });
});

describe("computeBill with a coupon", () => {
  it("takes the discount off before tax and tip", async () => {
    const { createOrder } = await import("./order");
    const order = createOrder({
      id: "o",
      restaurantId: "r",
      tableId: "t",
      sessionId: "s",
      at: 0,
      items: [{ itemId: "a", variantId: "v", name: "A", variantName: "Regular", unitPrice: 100000, qty: 1, station: "curry", prepMinutes: 5 }],
    });
    const bill = computeBill([order], { taxPercent: 5, tipPercent: 10, discount: { amount: (s) => s / 10, label: "10% off" } });
    expect(bill.discount).toBe(10000);
    expect(bill.discountLabel).toBe("10% off");
    expect(bill.tax).toBe(4500);
    expect(bill.tip).toBe(9000);
    expect(bill.total).toBe(90000 + 4500 + 9000);
    const capped = computeBill([order], { taxPercent: 5, tipPercent: 0, discount: { amount: () => 999999, label: "x" } });
    expect(capped.total).toBe(0);
  });
});
