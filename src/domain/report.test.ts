import { describe, expect, it } from "vitest";
import { summarizeDay } from "./report";
import { buildOrderItems } from "./cart";
import { createOrder, transitionOrder } from "./order";
import { computeBill, createBill, payPart } from "./bill";
import { testMenu } from "./test-fixtures";

function order(id: string, at: number, qty: number) {
  const built = buildOrderItems(testMenu, [{ itemId: "paneer-tikka", variantId: "half", qty }]);
  if (!built.ok) throw new Error();
  return createOrder({ id, restaurantId: "r", tableId: "t", sessionId: id, items: built.items, at });
}

describe("summarizeDay", () => {
  it("counts today's orders, items, money, tips and ratings", () => {
    const since = 1000;
    const yesterday = order("y", 10, 4);
    const a = order("a", 2000, 2);
    const b = transitionOrder(order("b", 3000, 1), "cancelled", 3001);
    const summary = computeBill([a], { taxPercent: 0, tipPercent: 10 });
    let bill = createBill({ id: "bill", sessionId: "a", summary, splitCount: 2, at: 4000 });
    bill = payPart(payPart(bill, 0, "upi", 4001), 1, "cash", 4002);
    const half = payPart(createBill({ id: "b2", sessionId: "x", summary, splitCount: 2, at: 4000 }), 0, "card", 4003);

    const day = summarizeDay({
      orders: [yesterday, a, b],
      bills: [bill, half],
      reviews: [
        { id: "r1", sessionId: "a", tableId: "t", rating: 5, at: 5000 },
        { id: "r2", sessionId: "a", tableId: "t", rating: 4, at: 5000 },
        { id: "r0", sessionId: "y", tableId: "t", rating: 1, at: 10 },
      ],
      since,
    });

    expect(day.orders).toBe(1);
    expect(day.cancelledOrders).toBe(1);
    expect(day.itemsSold).toBe(2);
    expect(day.collected).toBe(39600 + 19800);
    expect(day.tips).toBe(3600);
    expect(day.paidBills).toBe(1);
    expect(day.averageRating).toBe(4.5);
    expect(day.reviews).toBe(2);
    expect(day.topItems).toEqual([{ name: "Paneer Tikka", qty: 2 }]);
  });

  it("handles an empty day", () => {
    const day = summarizeDay({ orders: [], bills: [], reviews: [], since: 0 });
    expect(day).toMatchObject({ orders: 0, collected: 0, averageRating: undefined, topItems: [] });
  });
});
