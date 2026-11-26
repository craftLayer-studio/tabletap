import { beforeEach, describe, expect, it } from "vitest";
import { getDb, schema } from "../db/client";
import { DEMO_RESTAURANT } from "../seed";
import {
  addCategory,
  addMenuItem,
  addTable,
  deleteCategory,
  guestView,
  joinTable,
  listTablesWithTokens,
  ownerMenu,
  placeOrder,
  requestOtp,
  resetDemo,
  rotateTableToken,
  setItemAvailable,
  setOrderStatus,
  signSession,
  staffView,
  StoreError,
  tableForToken,
  updateMenuItem,
  verifyOtp,
  verifySession,
} from ".";
import { newToken } from "./repo";

const NOW = Date.UTC(2026, 10, 19, 8, 0);
const RID = DEMO_RESTAURANT.id;
const OTHER = "other-cafe";

async function status(p: Promise<unknown>): Promise<number | undefined> {
  return p.then(
    () => undefined,
    (e: unknown) => (e instanceof StoreError ? e.status : -1),
  );
}

async function seedOtherRestaurant() {
  const db = await getDb();
  await db.insert(schema.restaurants).values({ id: OTHER, name: "Other Cafe", slug: OTHER, city: "Indore", taxPercent: 5, upiVpa: "x@y" });
  await db.insert(schema.tables).values({ id: "o-t1", restaurantId: OTHER, label: "A1", seats: 2, qrToken: newToken() });
  await db.insert(schema.staffUsers).values({ id: "o-owner", restaurantId: OTHER, name: "Neha Gupta", phone: "+919811111111", role: "owner" });
}

const dish = {
  categoryId: "mains",
  name: "Paneer Butter Masala",
  description: "Cottage cheese in a tomato and butter gravy.",
  veg: true,
  spice: 1 as const,
  station: "curry" as const,
  prepMinutes: 12,
  allergens: ["dairy" as const],
  variants: [
    { name: "Half", price: 19000 },
    { name: "Full", price: 31000 },
  ],
  available: true,
};

describe("table QR tokens", () => {
  beforeEach(() => resetDemo(NOW));

  it("gives every table a random token and resolves it", async () => {
    const tables = await listTablesWithTokens(RID);
    expect(tables).toHaveLength(6);
    expect(new Set(tables.map((t) => t.qrToken)).size).toBe(6);
    for (const t of tables) expect(t.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await tableForToken(tables[0].qrToken)).tableId).toBe(tables[0].id);
    expect(await status(tableForToken("t1"))).toBe(404);
  });

  it("rotating a token invalidates the old QR code", async () => {
    const [t1] = await listTablesWithTokens(RID);
    const rotated = await rotateTableToken(RID, t1.id);
    expect(rotated.qrToken).not.toBe(t1.qrToken);
    expect(await status(tableForToken(t1.qrToken))).toBe(404);
    expect((await tableForToken(rotated.qrToken)).tableId).toBe(t1.id);
    expect(await status(rotateTableToken(OTHER, t1.id))).toBe(404);
  });

  it("adds tables with unique labels", async () => {
    const t = await addTable(RID, { label: "T7", seats: 4 });
    expect((await tableForToken(t.qrToken)).label).toBe("T7");
    expect(await status(addTable(RID, { label: "t7", seats: 2 }))).toBe(409);
    expect(await status(addTable(RID, { label: "T8", seats: 0 }))).toBe(400);
  });
});

describe("menu editor", () => {
  beforeEach(() => resetDemo(NOW));

  it("adds, edits, prices and sells out a dish; guests see it and past orders keep their price", async () => {
    const item = await addMenuItem(RID, dish);
    const { id: sessionId } = await joinTable("t6", NOW);
    const order = await placeOrder("t6", sessionId, [{ itemId: item.id, variantId: item.variants[1].id, qty: 1 }], NOW);
    expect(order.items[0].unitPrice).toBe(31000);

    const edited = await updateMenuItem(RID, item.id, {
      ...dish,
      variants: [
        { id: item.variants[0].id, name: "Half", price: 20000 },
        { id: item.variants[1].id, name: "Full", price: 33000 },
      ],
    });
    expect(edited.variants.map((v) => v.id)).toEqual(item.variants.map((v) => v.id));
    const view = await guestView("t6", sessionId, NOW);
    expect(view.menu.items.find((i) => i.id === item.id)?.variants[1].price).toBe(33000);
    expect(view.orders[0].items[0].unitPrice).toBe(31000);

    await setItemAvailable(RID, item.id, false);
    expect(await status(placeOrder("t6", sessionId, [{ itemId: item.id, variantId: item.variants[0].id, qty: 1 }]))).toBe(400);
  });

  it("validates input and manages categories", async () => {
    expect(await status(addMenuItem(RID, { ...dish, variants: [] }))).toBe(400);
    expect(await status(addMenuItem(RID, { ...dish, categoryId: "nope" }))).toBe(400);
    expect(await status(deleteCategory(RID, "mains"))).toBe(409);
    const { id } = await addCategory(RID, "Chef's specials");
    expect((await ownerMenu(RID)).categories.some((c) => c.id === id)).toBe(true);
    await deleteCategory(RID, id);
    expect((await ownerMenu(RID)).categories.some((c) => c.id === id)).toBe(false);
  });
});

describe("tenancy", () => {
  beforeEach(async () => {
    await resetDemo(NOW);
    await seedOtherRestaurant();
  });

  it("never lets one restaurant read or change another's data", async () => {
    expect((await ownerMenu(OTHER)).items).toHaveLength(0);
    expect((await staffView(OTHER, NOW)).activeOrders).toHaveLength(0);
    const demoOrder = (await staffView(RID, NOW)).activeOrders[0];
    expect(await status(setOrderStatus(OTHER, demoOrder.id, "cancelled"))).toBe(404);
    expect(await status(setItemAvailable(OTHER, "paneer-tikka", false))).toBe(404);
    expect(await status(updateMenuItem(OTHER, "paneer-tikka", { ...dish, categoryId: "mains" }))).toBe(404);
    // A guest at the other restaurant cannot order the demo restaurant's dishes.
    const { id: sessionId } = await joinTable("o-t1", NOW);
    expect(await status(placeOrder("o-t1", sessionId, [{ itemId: "paneer-tikka", variantId: "half", qty: 1 }]))).toBe(400);
  });
});

describe("staff OTP login", () => {
  beforeEach(() => resetDemo(NOW));

  it("signs in a staff member with the demo code", async () => {
    const { demoCode } = await requestOtp("98000 00001", NOW);
    expect(demoCode).toMatch(/^\d{6}$/);
    const staff = await verifyOtp("+919800000001", demoCode!, NOW + 1000);
    expect(staff.role).toBe("owner");
    expect(staff.restaurantId).toBe(RID);
    // Codes are single use.
    expect(await status(verifyOtp("+919800000001", demoCode!, NOW + 2000))).toBe(401);
  });

  it("rejects wrong, expired and brute-forced codes and unknown numbers", async () => {
    expect((await requestOtp("9123456789", NOW)).demoCode).toBeUndefined();
    expect(await status(requestOtp("12345", NOW))).toBe(400);
    const { demoCode } = await requestOtp("9800000003", NOW);
    expect(await status(verifyOtp("9800000003", demoCode!, NOW + 6 * 60_000))).toBe(401);
    const second = (await requestOtp("9800000003", NOW)).demoCode!;
    const wrong = second === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await status(verifyOtp("9800000003", wrong, NOW))).toBe(401);
    expect(await status(verifyOtp("9800000003", second, NOW))).toBe(401);
  });

  it("signs and verifies session tokens", () => {
    const token = signSession("staff-owner", NOW, 1000);
    expect(verifySession(token, NOW + 10)).toBe("staff-owner");
    expect(verifySession(token, NOW + 2000)).toBeUndefined();
    expect(verifySession(`${token.split(".")[0]}.forged`, NOW)).toBeUndefined();
    expect(verifySession(undefined)).toBeUndefined();
  });
});
