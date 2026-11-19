import { describe, expect, it } from "vitest";
import { deriveTableState, type TableSession } from "./table";
import { buildOrderItems } from "./cart";
import { createOrder, transitionOrder, type OrderStatus } from "./order";
import { computeBill, createBill, payPart } from "./bill";
import { hasOpenRequest, parseRating, type ServiceRequest } from "./service";
import { testMenu } from "./test-fixtures";

const session: TableSession = { id: "s1", tableId: "t1", openedAt: 0 };

function orderAt(status: OrderStatus) {
  const built = buildOrderItems(testMenu, [{ itemId: "dal", variantId: "regular", qty: 1 }]);
  if (!built.ok) throw new Error();
  let o = createOrder({ id: "o", restaurantId: "r", tableId: "t1", sessionId: "s1", items: built.items, at: 0 });
  const path: OrderStatus[] = ["confirmed", "cooking", "ready", "served"];
  for (const s of path) {
    if (o.status === status) break;
    o = transitionOrder(o, s, 1);
  }
  return o;
}

const waiter: ServiceRequest = { id: "r1", tableId: "t1", sessionId: "s1", kind: "waiter", createdAt: 0 };
const billReq: ServiceRequest = { id: "r2", tableId: "t1", sessionId: "s1", kind: "bill", createdAt: 0 };

describe("deriveTableState", () => {
  it("is free without an open session", () => {
    expect(deriveTableState({ orders: [], requests: [] })).toBe("free");
    expect(deriveTableState({ session: { ...session, closedAt: 5 }, orders: [], requests: [waiter] })).toBe("free");
  });

  it("is ordering until food is served, then eating", () => {
    expect(deriveTableState({ session, orders: [], requests: [] })).toBe("ordering");
    expect(deriveTableState({ session, orders: [orderAt("cooking")], requests: [] })).toBe("ordering");
    expect(deriveTableState({ session, orders: [orderAt("served")], requests: [] })).toBe("eating");
  });

  it("puts help before the bill, and the bill before eating", () => {
    const served = [orderAt("served")];
    expect(deriveTableState({ session, orders: served, requests: [billReq] })).toBe("bill_requested");
    expect(deriveTableState({ session, orders: served, requests: [billReq, waiter] })).toBe("needs_help");
    expect(deriveTableState({ session, orders: served, requests: [{ ...waiter, resolvedAt: 3 }] })).toBe("eating");
  });

  it("shows an unpaid bill as bill requested", () => {
    const served = [orderAt("served")];
    const summary = computeBill(served, { taxPercent: 5, tipPercent: 0 });
    const bill = createBill({ id: "b", sessionId: "s1", summary, splitCount: 2, at: 0 });
    expect(deriveTableState({ session, orders: served, requests: [], bill })).toBe("bill_requested");
    const paid = payPart(payPart(bill, 0, "cash", 1), 1, "upi", 1);
    expect(deriveTableState({ session, orders: served, requests: [], bill: paid })).toBe("eating");
  });

  it("ignores requests from other sessions", () => {
    expect(deriveTableState({ session, orders: [], requests: [{ ...waiter, sessionId: "old" }] })).toBe("ordering");
  });
});

describe("service requests and reviews", () => {
  it("detects duplicate open requests", () => {
    expect(hasOpenRequest([waiter], "s1", "waiter")).toBe(true);
    expect(hasOpenRequest([waiter], "s1", "bill")).toBe(false);
    expect(hasOpenRequest([{ ...waiter, resolvedAt: 1 }], "s1", "waiter")).toBe(false);
  });

  it("parses ratings 1 to 5 only", () => {
    expect(parseRating(5)).toBe(5);
    expect(parseRating(0)).toBeUndefined();
    expect(parseRating(4.5)).toBeUndefined();
    expect(parseRating("5")).toBeUndefined();
  });
});
