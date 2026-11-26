import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_RESTAURANT } from "../seed";
import {
  addReview,
  createRequest,
  getRestaurant,
  guestView,
  joinTable,
  listTables,
  ownerView,
  payShare,
  placeOrder,
  prepareBill,
  resetDemo,
  resolveRequest,
  setOrderStatus,
  staffView,
  StoreError,
} from ".";

const NOW = Date.UTC(2026, 10, 19, 8, 0); // 13:30 IST
const RID = DEMO_RESTAURANT.id;

async function floorState(tableId: string) {
  return (await staffView(RID, NOW)).floor.find((f) => f.table.id === tableId)?.state;
}

async function expectStatus(fn: () => Promise<unknown>, status: number) {
  const err = await fn().then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(StoreError);
  expect((err as StoreError).status).toBe(status);
}

describe("store (Postgres via PGlite)", () => {
  beforeEach(async () => {
    await resetDemo(NOW);
  });

  it("seeds one demo restaurant with six tables", async () => {
    const restaurant = await getRestaurant(RID);
    expect(restaurant.name).toBe("Juniper Kitchen");
    expect(restaurant.isDemo).toBe(true);
    expect(await listTables(RID)).toHaveLength(6);
    expect((await staffView(RID, NOW)).floor.map((f) => f.state)).toEqual([
      "free",
      "ordering",
      "free",
      "eating",
      "needs_help",
      "free",
    ]);
  });

  it("runs a full table visit from scan to review", async () => {
    const { id: sessionId } = await joinTable("t6", NOW);
    expect((await joinTable("t6", NOW + 1)).id).toBe(sessionId);
    expect(await floorState("t6")).toBe("ordering");

    const order = await placeOrder(
      "t6",
      sessionId,
      [
        { itemId: "paneer-tikka", variantId: "full", qty: 1 },
        { itemId: "butter-naan", variantId: "regular", qty: 2 },
      ],
      NOW + 1000,
    );
    expect(order.status).toBe("placed");
    await expect(prepareBill("t6", sessionId, { tipPercent: 0, splitCount: 1 })).rejects.toThrow(/waiting for staff/);

    for (const to of ["confirmed", "cooking", "ready", "served"] as const) await setOrderStatus(RID, order.id, to, NOW + 2000);
    expect(await floorState("t6")).toBe("eating");

    const call = await createRequest("t6", sessionId, "waiter", NOW + 3000);
    expect((await createRequest("t6", sessionId, "waiter", NOW + 3001)).id).toBe(call.id);
    expect(await floorState("t6")).toBe("needs_help");
    await resolveRequest(RID, call.id, NOW + 4000);

    const bill = await prepareBill("t6", sessionId, { tipPercent: 10, splitCount: 3 }, NOW + 5000);
    // 320 + 2 x 60 = 440; tax 5% = 22; tip 10% = 44; total 506.00
    expect(bill.summary.total).toBe(50600);
    expect(bill.parts.map((p) => p.amount)).toEqual([16867, 16867, 16866]);
    expect(await floorState("t6")).toBe("bill_requested");

    await expect(addReview("t6", sessionId, { rating: 5 })).rejects.toThrow(/after the bill is paid/);
    await payShare("t6", sessionId, { partIndex: 0, method: "upi" }, NOW + 6000);
    await expect(prepareBill("t6", sessionId, { tipPercent: 0, splitCount: 1 })).rejects.toThrow(/locked/);
    await expectStatus(() => payShare("t6", sessionId, { partIndex: 0, method: "upi" }), 409);
    await payShare("t6", sessionId, { partIndex: 1, method: "cash" }, NOW + 6001);
    await payShare("t6", sessionId, { partIndex: 2, method: "card", receiptEmail: "guest@example.com" }, NOW + 6002);
    expect(await floorState("t6")).toBe("free");

    const view = await guestView("t6", sessionId, NOW + 7000);
    expect(view.session.closedAt).toBe(NOW + 6002);
    expect(view.bill?.receiptEmail).toBe("guest@example.com");
    expect(view.bill?.parts.every((p) => p.payment)).toBe(true);

    await addReview("t6", sessionId, { rating: 4, comment: "Great naan" }, NOW + 8000);
    await expect(addReview("t6", sessionId, { rating: 5 })).rejects.toThrow(/already/);

    const owner = await ownerView(RID, NOW + 9000);
    expect(owner.summary.paidBills).toBe(3);
    expect(owner.summary.reviews).toBe(3);

    expect((await joinTable("t6", NOW + 10_000)).id).not.toBe(sessionId);
  });

  it("re-prices an unpaid bill when more food is ordered", async () => {
    const { id: sessionId } = await joinTable("t1", NOW);
    const o = await placeOrder("t1", sessionId, [{ itemId: "masala-chai", variantId: "regular", qty: 1 }], NOW);
    await setOrderStatus(RID, o.id, "confirmed", NOW);
    await prepareBill("t1", sessionId, { tipPercent: 0, splitCount: 1 }, NOW);
    await placeOrder("t1", sessionId, [{ itemId: "gulab-jamun", variantId: "regular", qty: 1 }], NOW);
    expect((await guestView("t1", sessionId, NOW)).bill).toBeUndefined();
  });

  it("keeps one open session per table under concurrent scans", async () => {
    const sessions = await Promise.all([1, 2, 3, 4].map((i) => joinTable("t3", NOW + i)));
    expect(new Set(sessions.map((x) => x.id)).size).toBe(1);
  });

  it("returns typed errors for bad input", async () => {
    const { id: sessionId } = await joinTable("t1", NOW);
    await expectStatus(() => joinTable("nope"), 404);
    await expectStatus(() => guestView("t2", sessionId), 404);
    await expectStatus(() => placeOrder("t1", sessionId, []), 400);
    await expectStatus(() => placeOrder("t1", sessionId, [{ itemId: "fish-curry", variantId: "regular", qty: 1 }]), 400);
    await expectStatus(() => setOrderStatus(RID, "nope", "confirmed"), 404);
    const cooking = (await staffView(RID, NOW)).activeOrders[0];
    await expectStatus(() => setOrderStatus(RID, cooking.id, "served"), 409);
    await expectStatus(() => setOrderStatus("other-restaurant", cooking.id, "ready"), 404);
    await expectStatus(() => prepareBill("t1", sessionId, { tipPercent: 0, splitCount: 1 }), 400);
  });
});
