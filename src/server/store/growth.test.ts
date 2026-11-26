import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "../db/client";
import { DEMO_RESTAURANT } from "../seed";
import {
  addReview,
  applyCoupon,
  campaignResults,
  captureCustomer,
  growthSummary,
  guestView,
  joinTable,
  listAlerts,
  listCustomers,
  listOutbox,
  optOutByToken,
  payShare,
  placeOrder,
  prepareBill,
  resetDemo,
  sendCampaign,
  setOrderStatus,
  spinForVisit,
  StoreError,
  updateSettings,
  withdrawConsent,
} from ".";

const NOW = Date.UTC(2026, 10, 19, 8, 0);
const DAY = 86_400_000;
const RID = DEMO_RESTAURANT.id;
const APP = "https://dineloop.craftlayer.store";

async function status(p: Promise<unknown>): Promise<number | undefined> {
  return p.then(
    () => undefined,
    (e: unknown) => (e instanceof StoreError ? e.status : -1),
  );
}

/** Order, confirm, bill and pay a full visit at a table; returns the session id. */
async function paidVisit(tableId: string, at: number, opts: { phone?: string; marketing?: boolean; coupon?: string } = {}) {
  const { id: sessionId } = await joinTable(tableId, at);
  const order = await placeOrder(tableId, sessionId, [{ itemId: "butter-chicken", variantId: "full", qty: 2 }], at);
  await setOrderStatus(RID, order.id, "confirmed", at);
  if (opts.phone) {
    await captureCustomer(tableId, sessionId, { phone: opts.phone, name: "Meera Pillai", consentService: true, consentMarketing: !!opts.marketing }, at);
  }
  if (opts.coupon) await applyCoupon(tableId, sessionId, opts.coupon, at);
  const bill = await prepareBill(tableId, sessionId, { tipPercent: 0, splitCount: 1 }, at);
  await payShare(tableId, sessionId, { partIndex: 0, method: "upi" }, at + 1000);
  return { sessionId, bill };
}

describe("growth: CRM, consent, loyalty, wheel, reviews, campaigns", () => {
  beforeEach(() => resetDemo(NOW));

  it("seeds a CRM with segments, a repeat rate and a past campaign", async () => {
    const customers = await listCustomers(RID, NOW);
    const seg = Object.fromEntries(customers.map((c) => [c.name, c.segment]));
    expect(seg).toMatchObject({ "Priya Sharma": "regular", "Rahul Verma": "lapsed", "Sneha Iyer": "new", "Arjun Mehta": "regular" });
    const summary = await growthSummary(RID, NOW);
    expect(summary.customers).toBe(5);
    expect(summary.repeatRate).toBeCloseTo(3 / 5);
    expect(summary.campaigns[0].redeemed).toBe(1);
    expect(summary.campaigns[0].revenue).toBeGreaterThan(0);
    expect(summary.openAlerts).toHaveLength(1);
  });

  it("captures a phone with separate consents and records changes in a ledger", async () => {
    const { id: sessionId } = await joinTable("t6", NOW);
    await expect(captureCustomer("t6", sessionId, { phone: "12345", consentService: false, consentMarketing: false })).rejects.toThrow(/10-digit/);
    await captureCustomer("t6", sessionId, { phone: "98111 22233", name: "Meera Pillai", consentService: true, consentMarketing: false }, NOW);
    let c = (await listCustomers(RID, NOW)).find((x) => x.phone === "+919811122233")!;
    expect(c.consent).toEqual({ service: true, marketing: false });
    // Same phone again with marketing ticked: one customer, consent updated.
    await captureCustomer("t6", sessionId, { phone: "+91 98111-22233", consentService: true, consentMarketing: true }, NOW + 1);
    c = (await listCustomers(RID, NOW)).find((x) => x.phone === "+919811122233")!;
    expect(c.consent.marketing).toBe(true);
    const db = await getDb();
    const records = (await db.select().from(schema.consentRecords)).filter((r) => r.customerId === c.id);
    expect(records.map((r) => [r.purpose, r.granted, r.noticeVersion])).toEqual([
      ["service", true, "2026-11-v1"],
      ["marketing", true, "2026-11-v1"],
    ]);
    // One-tap opt-out from a message link.
    await optOutByToken(c.optOutToken, NOW + 2);
    c = (await listCustomers(RID, NOW)).find((x) => x.phone === "+919811122233")!;
    expect(c.consent.marketing).toBe(false);
    expect(await status(optOutByToken("not-a-real-token-123456"))).toBe(404);
    expect((await guestView("t6", sessionId, NOW)).growth.customer?.phoneMasked).toBe("+91 ●●●●● ●2233");
  });

  it("gives one stamp per paid visit, a bill message to service-consented guests, and one spin per paid visit", async () => {
    const { sessionId } = await paidVisit("t6", NOW, { phone: "9811122233" });
    const view = await guestView("t6", sessionId, NOW + 2000);
    expect(view.growth.customer?.stamps).toBe(1);
    const outbox = await listOutbox(RID);
    expect(outbox[0]).toMatchObject({ category: "utility", status: "simulated_sent" });

    const won = await spinForVisit("t6", sessionId, NOW + 3000, () => 0);
    expect(won.label).toBe("10% off");
    expect(won.code).toMatch(/^JK-[A-Z2-9]{6}$/);
    expect(await status(spinForVisit("t6", sessionId, NOW + 3001))).toBe(409);
    // The coupon cannot be used on the visit where it was won (that visit is closed anyway) ...
    const { id: next } = await joinTable("t6", NOW + DAY);
    // ... but works on the next one, once.
    await placeOrder("t6", next, [{ itemId: "butter-chicken", variantId: "full", qty: 2 }], NOW + DAY);
    await applyCoupon("t6", next, won.code, NOW + DAY);
    expect(await status(applyCoupon("t2", (await joinTable("t2", NOW)).id, won.code, NOW + DAY))).toBe(409);
  });

  it("does not open the wheel before payment", async () => {
    const { id: sessionId } = await joinTable("t6", NOW);
    expect(await status(spinForVisit("t6", sessionId, NOW))).toBe(409);
  });

  it("applies a next-visit coupon to the bill, with the discount before tax", async () => {
    const first = await paidVisit("t6", NOW, { phone: "9811122233" });
    const won = await spinForVisit("t6", first.sessionId, NOW + 2000, () => 0); // 10% off, min ₹500, max ₹200
    const second = await paidVisit("t6", NOW + DAY, { phone: "9811122233", coupon: won.code });
    // 2 x ₹420 = ₹840; 10% = ₹84 off; taxable ₹756; GST 5% = ₹37.80; total ₹793.80
    expect(second.bill.summary.discount).toBe(8400);
    expect(second.bill.summary.total).toBe(79380);
    const c = (await listCustomers(RID, NOW + DAY)).find((x) => x.phone === "+919811122233")!;
    expect(c.stats.visits).toBe(2);
    expect(c.segment).toBe("regular");
    expect(await status(applyCoupon("t6", (await joinTable("t6", NOW + 2 * DAY)).id, won.code, NOW + 2 * DAY))).toBe(409);
  });

  it("routes 4-5 stars to Google and 1-3 stars to a private owner alert", async () => {
    await updateSettings(RID, { googleReviewUrl: "https://g.page/r/demo/review" });
    const a = await paidVisit("t6", NOW);
    const good = await addReview("t6", a.sessionId, { rating: 5 }, NOW + 5000);
    expect(good.routedTo).toBe("google");
    expect(good.googleReviewUrl).toBe("https://g.page/r/demo/review");
    const before = (await listAlerts(RID)).length;
    const b = await paidVisit("t3", NOW);
    const bad = await addReview("t3", b.sessionId, { rating: 2, comment: "Too salty" }, NOW + 5000);
    expect(bad.routedTo).toBe("owner");
    expect(bad.googleReviewUrl).toBeUndefined();
    const alerts = await listAlerts(RID);
    expect(alerts).toHaveLength(before + 1);
    expect(alerts[0].message).toContain("Too salty");
    expect(await status(updateSettings(RID, { googleReviewUrl: "http://insecure.example" }))).toBe(400);
  });

  it("sends campaigns only to marketing-consented customers in the audience, through the simulated outbox", async () => {
    const arjun = (await listCustomers(RID, NOW)).find((c) => c.name === "Arjun Mehta")!;
    await withdrawConsent(RID, arjun.id, "marketing", "whatsapp", NOW);
    const before = (await listOutbox(RID, 500)).length;
    const res = await sendCampaign(RID, "staff-owner", { template: "winback", audience: "all", offerKind: "flat", offerValue: 10000 }, APP, NOW);
    // Opted in: Priya, Rahul, Kavya (Arjun withdrew, Sneha never opted in).
    expect(res).toMatchObject({ recipients: 3, skipped: 2 });
    const out = await listOutbox(RID, 500);
    expect(out.length - before).toBe(3);
    const sent = out.filter((m) => m.category === "marketing").slice(0, 3);
    expect(sent.every((m) => m.body.includes(`${APP}/u/`) && m.body.includes("₹100 off"))).toBe(true);
    const lapsed = await sendCampaign(RID, "staff-owner", { template: "winback", audience: "lapsed", offerKind: "percent", offerValue: 15 }, APP, NOW);
    expect(lapsed.recipients).toBe(2); // Rahul and Kavya
    expect((await campaignResults(RID)).length).toBe(3);
    expect(await status(sendCampaign(RID, "x", { template: "winback", audience: "all", offerKind: "percent", offerValue: 90 }, APP, NOW))).toBe(400);
  });
});
