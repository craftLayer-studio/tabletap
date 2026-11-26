/**
 * Writes the demo restaurant into the database: restaurant, tables with random QR tokens, menu, and a few
 * visits in progress so the staff, kitchen and owner screens have something to show.
 */
import { sql } from "drizzle-orm";
import {
  buildOrderItems,
  computeBill,
  createBill,
  createOrder,
  payPart,
  startOfDay,
  transitionOrder,
  type Cart,
  type Menu,
  type OrderStatus,
  type PaymentMethod,
} from "@/domain";
import { schema as s, type Db, type DbOrTx } from "./db/client";
import { insertMenuItem, insertOrder, insertPayment, newId, newToken, saveBill, toDate } from "./store/repo";
import { DEMO_MENU, DEMO_RESTAURANT, DEMO_TABLES } from "./seed";

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
  });
  await db.insert(s.tables).values(
    DEMO_TABLES.map((t, i) => ({ id: t.id, restaurantId: r.id, label: t.label, seats: t.seats, qrToken: newToken(), sortOrder: i })),
  );
  await insertMenu(db, r.id, DEMO_MENU);

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
