import { beforeEach, describe, expect, it } from "vitest";
import {
  addReview,
  createRequest,
  getState,
  guestView,
  joinTable,
  ownerView,
  payShare,
  placeOrder,
  prepareBill,
  resetState,
  resolveRequest,
  setOrderStatus,
  staffView,
  StoreError,
} from "./store";

const NOW = Date.UTC(2026, 10, 19, 8, 0); // 13:30 IST

function floorState(tableId: string) {
  return staffView(NOW).floor.find((f) => f.table.id === tableId)?.state;
}

describe("in-memory store", () => {
  beforeEach(() => {
    resetState(NOW);
  });

  it("seeds one demo restaurant with six tables", () => {
    const state = getState();
    expect(state.restaurant.name).toBe("Juniper Kitchen");
    expect(state.restaurant.isDemo).toBe(true);
    expect(state.tables).toHaveLength(6);
    expect(staffView(NOW).floor.map((f) => f.state)).toEqual(["free", "ordering", "free", "eating", "needs_help", "free"]);
  });

  it("runs a full table visit from scan to review", () => {
    const { id: sessionId } = joinTable("t6", NOW);
    expect(joinTable("t6", NOW + 1).id).toBe(sessionId);
    expect(floorState("t6")).toBe("ordering");

    const order = placeOrder("t6", sessionId, [
      { itemId: "paneer-tikka", variantId: "full", qty: 1 },
      { itemId: "butter-naan", variantId: "regular", qty: 2 },
    ], NOW + 1000);
    expect(order.status).toBe("placed");
    expect(() => prepareBill("t6", sessionId, { tipPercent: 0, splitCount: 1 })).toThrow(/waiting for staff/);

    for (const to of ["confirmed", "cooking", "ready", "served"] as const) setOrderStatus(order.id, to, NOW + 2000);
    expect(floorState("t6")).toBe("eating");

    const call = createRequest("t6", sessionId, "waiter", NOW + 3000);
    expect(createRequest("t6", sessionId, "waiter", NOW + 3001).id).toBe(call.id);
    expect(floorState("t6")).toBe("needs_help");
    resolveRequest(call.id, NOW + 4000);

    const bill = prepareBill("t6", sessionId, { tipPercent: 10, splitCount: 3 }, NOW + 5000);
    // 320 + 2 x 60 = 440; tax 5% = 22; tip 10% = 44; total 506.00
    expect(bill.summary.total).toBe(50600);
    expect(bill.parts.map((p) => p.amount)).toEqual([16867, 16867, 16866]);
    expect(floorState("t6")).toBe("bill_requested");

    expect(() => addReview("t6", sessionId, { rating: 5 })).toThrow(/after the bill is paid/);
    payShare("t6", sessionId, { partIndex: 0, method: "upi" }, NOW + 6000);
    expect(() => prepareBill("t6", sessionId, { tipPercent: 0, splitCount: 1 })).toThrow(/locked/);
    payShare("t6", sessionId, { partIndex: 1, method: "cash" }, NOW + 6001);
    payShare("t6", sessionId, { partIndex: 2, method: "card", receiptEmail: "guest@example.com" }, NOW + 6002);
    expect(floorState("t6")).toBe("free");

    const view = guestView("t6", sessionId, NOW + 7000);
    expect(view.session.closedAt).toBe(NOW + 6002);
    expect(view.bill?.receiptEmail).toBe("guest@example.com");

    addReview("t6", sessionId, { rating: 4, comment: "Great naan" }, NOW + 8000);
    expect(() => addReview("t6", sessionId, { rating: 5 })).toThrow(/already/);

    const owner = ownerView(NOW + 9000);
    expect(owner.summary.paidBills).toBe(3);
    expect(owner.summary.reviews).toBe(3);

    expect(joinTable("t6", NOW + 10_000).id).not.toBe(sessionId);
  });

  it("re-prices an unpaid bill when more food is ordered", () => {
    const { id: sessionId } = joinTable("t1", NOW);
    const o = placeOrder("t1", sessionId, [{ itemId: "masala-chai", variantId: "regular", qty: 1 }], NOW);
    setOrderStatus(o.id, "confirmed", NOW);
    prepareBill("t1", sessionId, { tipPercent: 0, splitCount: 1 }, NOW);
    placeOrder("t1", sessionId, [{ itemId: "gulab-jamun", variantId: "regular", qty: 1 }], NOW);
    expect(guestView("t1", sessionId, NOW).bill).toBeUndefined();
  });

  it("returns typed errors for bad input", () => {
    const { id: sessionId } = joinTable("t1", NOW);
    const expectStatus = (fn: () => unknown, status: number) => {
      try {
        fn();
        throw new Error("expected a StoreError");
      } catch (err) {
        expect(err).toBeInstanceOf(StoreError);
        expect((err as StoreError).status).toBe(status);
      }
    };
    expectStatus(() => joinTable("nope"), 404);
    expectStatus(() => guestView("t2", sessionId), 404);
    expectStatus(() => placeOrder("t1", sessionId, []), 400);
    expectStatus(() => placeOrder("t1", sessionId, [{ itemId: "fish-curry", variantId: "regular", qty: 1 }]), 400);
    expectStatus(() => setOrderStatus("nope", "confirmed"), 404);
    const served = staffView(NOW).activeOrders[0];
    expectStatus(() => setOrderStatus(served.id, "served"), 409);
    expectStatus(() => prepareBill("t1", sessionId, { tipPercent: 0, splitCount: 1 }), 400);
  });
});
