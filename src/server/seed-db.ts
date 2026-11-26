/**
 * Writes the demo restaurant into the database: restaurant, tables with random QR tokens, menu, and a few
 * visits in progress so the staff, kitchen and owner screens have something to show.
 */
import { eq, sql } from "drizzle-orm";
import {
  buildOrderItems,
  CAMPAIGN_TEMPLATES,
  CONSENT_NOTICE_VERSION,
  COUPON_VALID_DAYS,
  computeBill,
  createBill,
  createOrder,
  payPart,
  startOfDay,
  transitionOrder,
  type Cart,
  type Menu,
  type Order,
  type OrderStatus,
  type PaymentMethod,
} from "@/domain";
import { schema as s, type Db, type DbOrTx } from "./db/client";
import { insertMenuItem, insertOrder, insertPayment, newId, newToken, saveBill, toDate } from "./store/repo";
import { DEMO_CUSTOMERS, DEMO_GOOGLE_REVIEW_URL, DEMO_MENU, DEMO_RESTAURANT, DEMO_STAFF, DEMO_TABLES } from "./seed";

const MIN = 60_000;

/** Remove all data. Tests and the "reset demo" button use this before seeding again. */
export async function wipe(db: DbOrTx): Promise<void> {
  await db.execute(sql`truncate table restaurants, otp_challenges cascade`);
}

export async function seedIfEmpty(db: Db, now = Date.now()): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(s.restaurants);
  if (row.n > 0) return false;
  await db.transaction((tx) => seedDemo(tx, now));
  console.info("[db] Seeded the demo restaurant.");
  return true;
}

/** Insert a restaurant's menu. */
export async function insertMenu(db: DbOrTx, restaurantId: string, menu: Menu): Promise<void> {
  await db
    .insert(s.menuCategories)
    .values(menu.categories.map((c) => ({ id: c.id, restaurantId, name: c.name, sortOrder: c.sortOrder })));
  for (const [i, item] of menu.items.entries()) await insertMenuItem(db, restaurantId, item, i);
}

export async function seedDemo(db: DbOrTx, now = Date.now()): Promise<void> {
  const r = DEMO_RESTAURANT;
  await db.insert(s.restaurants).values({
    id: r.id,
    name: r.name,
    slug: r.id,
    city: r.city,
    taxPercent: r.taxPercent,
    upiVpa: r.upiVpa,
    isDemo: r.isDemo,
    // Placeholder: the owner sets the real Google review link on the Settings screen.
    googleReviewUrl: DEMO_GOOGLE_REVIEW_URL,
  });
  await db.insert(s.tables).values(
    DEMO_TABLES.map((t, i) => ({ id: t.id, restaurantId: r.id, label: t.label, seats: t.seats, qrToken: newToken(), sortOrder: i })),
  );
  await insertMenu(db, r.id, DEMO_MENU);
  await db.insert(s.staffUsers).values(DEMO_STAFF.map((u) => ({ ...u, restaurantId: r.id })));

  const dayStart = startOfDay(now);
  const earlier = (minutesAgo: number) => Math.max(dayStart + MIN, now - minutesAgo * MIN);

  const openSession = async (tableId: string, openedAt: number, closedAt?: number) => {
    const id = newId("ses");
    await db.insert(s.tableSessions).values({
      id,
      restaurantId: r.id,
      tableId,
      openedAt: toDate(openedAt),
      closedAt: closedAt === undefined ? null : toDate(closedAt),
    });
    return id;
  };

  const order = async (tableId: string, sessionId: string, cart: Cart, at: number, path: OrderStatus[]) => {
    const built = buildOrderItems(DEMO_MENU, cart);
    if (!built.ok) throw new Error(`Bad seed order: ${built.errors.join(", ")}`);
    let o = createOrder({ id: newId("ord"), restaurantId: r.id, tableId, sessionId, items: built.items, at });
    path.forEach((status, i) => {
      o = transitionOrder(o, status, at + (i + 1) * 2 * MIN);
    });
    await insertOrder(db, o, "system");
    return o;
  };

  await seedCustomers(db, now, order);

  // Two finished meals earlier today, so the owner view has something to show.
  for (const [tableId, minutesAgo, rating] of [
    ["t1", 150, 5],
    ["t3", 95, 4],
  ] as const) {
    const opened = earlier(minutesAgo);
    const sessionId = await openSession(tableId, opened, opened + 50 * MIN);
    const o = await order(
      tableId,
      sessionId,
      [
        { itemId: "paneer-tikka", variantId: "half", qty: 1 },
        { itemId: "dal-makhani", variantId: "full", qty: 1 },
        { itemId: "butter-naan", variantId: "regular", qty: 3 },
      ],
      opened + 3 * MIN,
      ["confirmed", "cooking", "ready", "served"],
    );
    const summary = computeBill([o], { taxPercent: r.taxPercent, tipPercent: 5 });
    let bill = createBill({ id: newId("bill"), sessionId, summary, splitCount: 2, at: opened + 45 * MIN });
    await saveBill(db, r.id, bill);
    const methods: PaymentMethod[] = ["upi", "cash"];
    for (const [i, method] of methods.entries()) {
      bill = payPart(bill, i, method, opened + (46 + i) * MIN);
      await insertPayment(db, r.id, bill, i, method, opened + (46 + i) * MIN);
    }
    await db.insert(s.reviews).values({
      id: newId("rev"),
      restaurantId: r.id,
      sessionId,
      tableId,
      rating,
      createdAt: toDate(opened + 48 * MIN),
    });
  }

  // T2: food cooking.
  const s2 = await openSession("t2", now - 12 * MIN);
  await order(
    "t2",
    s2,
    [
      { itemId: "butter-chicken", variantId: "half", qty: 1 },
      { itemId: "tandoori-roti", variantId: "regular", qty: 2 },
      { itemId: "masala-chai", variantId: "regular", qty: 2 },
    ],
    now - 10 * MIN,
    ["confirmed", "cooking"],
  );

  // T4: eating.
  const s4 = await openSession("t4", now - 40 * MIN);
  await order(
    "t4",
    s4,
    [
      { itemId: "veg-biryani", variantId: "full", qty: 1 },
      { itemId: "fresh-lime-soda", variantId: "regular", qty: 2 },
    ],
    now - 38 * MIN,
    ["confirmed", "cooking", "ready", "served"],
  );

  // T5: just ordered and pressed "call waiter".
  const s5 = await openSession("t5", now - 6 * MIN);
  await order("t5", s5, [{ itemId: "chicken-65", variantId: "full", qty: 1 }], now - 2 * MIN, []);
  await db.insert(s.serviceRequests).values({
    id: newId("req"),
    restaurantId: r.id,
    tableId: "t5",
    sessionId: s5,
    kind: "waiter",
    createdAt: toDate(now - MIN),
  });
}

type SeedOrder = (tableId: string, sessionId: string, cart: Cart, at: number, path: OrderStatus[]) => Promise<Order>;

const DAY = 86_400_000;

/** Past visits by demo customers, with consent records, stamps, one campaign and one private low-rating alert. */
async function seedCustomers(db: DbOrTx, now: number, order: SeedOrder): Promise<void> {
  const r = DEMO_RESTAURANT;
  const meal: Cart = [
    { itemId: "butter-chicken", variantId: "full", qty: 1 },
    { itemId: "butter-naan", variantId: "regular", qty: 3 },
    { itemId: "fresh-lime-soda", variantId: "regular", qty: 2 },
  ];
  const ids = new Map<string, string>();
  for (const c of DEMO_CUSTOMERS) {
    const id = newId("cus");
    ids.set(c.phone, id);
    const firstAt = now - Math.max(...c.visitsDaysAgo) * DAY - 2 * 3600_000;
    await db.insert(s.customers).values({ id, restaurantId: r.id, phone: c.phone, name: c.name, optOutToken: newToken(), createdAt: toDate(firstAt) });
    for (const [purpose, granted] of [
      ["service", c.service],
      ["marketing", c.marketing],
    ] as const) {
      if (!granted) continue;
      await db.insert(s.consentRecords).values({
        id: newId("con"),
        restaurantId: r.id,
        customerId: id,
        purpose,
        granted: true,
        noticeVersion: CONSENT_NOTICE_VERSION,
        channel: "qr_web",
        createdAt: toDate(firstAt),
      });
    }
  }

  // A win-back campaign 14 days ago to everyone opted in to marketing at the time.
  const campaignAt = now - 14 * DAY;
  const campaignId = newId("cmp");
  const recipients = DEMO_CUSTOMERS.filter((c) => c.marketing);
  await db.insert(s.campaigns).values({
    id: campaignId,
    restaurantId: r.id,
    name: CAMPAIGN_TEMPLATES.weekday.label,
    template: "weekday",
    audience: "all",
    offerKind: "percent",
    offerValue: 10,
    recipients: recipients.length,
    skipped: 0,
    createdBy: "staff-owner",
    createdAt: toDate(campaignAt),
  });
  const campaignCoupons = new Map<string, string>();
  for (const [i, c] of recipients.entries()) {
    const couponId = newId("cpn");
    const code = `JK-WKD${String.fromCharCode(65 + i)}${String.fromCharCode(80 + i)}${i + 2}`;
    campaignCoupons.set(c.phone, couponId);
    await db.insert(s.coupons).values({
      id: couponId,
      restaurantId: r.id,
      code,
      kind: "percent",
      value: 10,
      label: `${CAMPAIGN_TEMPLATES.weekday.label}: 10% off`,
      minBill: 0,
      maxDiscount: 50000,
      validFrom: toDate(campaignAt),
      validTo: toDate(campaignAt + COUPON_VALID_DAYS * DAY),
      source: "campaign",
      customerId: ids.get(c.phone)!,
      campaignId,
      createdAt: toDate(campaignAt),
    });
    await db.insert(s.outbox).values({
      id: newId("msg"),
      restaurantId: r.id,
      channel: "whatsapp",
      category: "marketing",
      toPhone: c.phone,
      customerId: ids.get(c.phone)!,
      campaignId,
      body: `Hi ${c.name.split(" ")[0]}, quiet weekday? Enjoy 10% off at ${r.name}, Monday to Thursday. Show code ${code} when you order. Reply STOP to stop offers.`,
      status: "simulated_sent",
      adapter: "simulated-whatsapp",
      createdAt: toDate(campaignAt),
    });
  }

  for (const c of DEMO_CUSTOMERS) {
    const customerId = ids.get(c.phone)!;
    for (const daysAgo of [...c.visitsDaysAgo].sort((a, b) => b - a)) {
      const opened = now - daysAgo * DAY - 3 * 3600_000;
      const sessionId = newId("ses");
      const redeem = c.redeemsCampaignDaysAgo === daysAgo ? campaignCoupons.get(c.phone) : undefined;
      await db.insert(s.tableSessions).values({
        id: sessionId,
        restaurantId: r.id,
        tableId: "t4",
        openedAt: toDate(opened),
        closedAt: toDate(opened + 55 * MIN),
        couponId: redeem ?? null,
      });
      const o = await order("t4", sessionId, meal, opened + 3 * MIN, ["confirmed", "cooking", "ready", "served"]);
      const discount = redeem ? { amount: (sub: number) => Math.min(50000, Math.round(sub / 10)), label: "Weekday offer: 10% off" } : undefined;
      const summary = computeBill([o], { taxPercent: r.taxPercent, tipPercent: 5, discount });
      let bill = createBill({ id: newId("bill"), sessionId, summary, splitCount: 1, at: opened + 45 * MIN });
      await saveBill(db, r.id, bill);
      bill = payPart(bill, 0, "upi", opened + 50 * MIN);
      await insertPayment(db, r.id, bill, 0, "upi", opened + 50 * MIN);
      if (redeem) {
        await db.update(s.coupons).set({ redeemedSessionId: sessionId, redeemedAt: toDate(opened + 50 * MIN) }).where(eq(s.coupons.id, redeem));
      }
      await db.insert(s.customerVisits).values({ restaurantId: r.id, customerId, sessionId, linkedAt: toDate(opened + 10 * MIN) });
      await db.insert(s.loyaltyLedger).values({
        id: newId("loy"),
        restaurantId: r.id,
        customerId,
        sessionId,
        delta: 1,
        reason: "earn",
        createdAt: toDate(opened + 50 * MIN),
      });
      if (c.lowRatingDaysAgo === daysAgo) {
        const reviewId = newId("rev");
        await db.insert(s.reviews).values({
          id: reviewId,
          restaurantId: r.id,
          sessionId,
          tableId: "t4",
          rating: 2,
          comment: "Dal was cold and we waited long for the bill.",
          routedTo: "owner",
          createdAt: toDate(opened + 52 * MIN),
        });
        await db.insert(s.ownerAlerts).values({
          id: newId("alr"),
          restaurantId: r.id,
          kind: "low_rating",
          reviewId,
          sessionId,
          message: "2★ from table T4: “Dal was cold and we waited long for the bill.”",
          createdAt: toDate(opened + 52 * MIN),
        });
      }
    }
  }
}
