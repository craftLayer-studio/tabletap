/**
 * Row <-> domain mapping and small data-access helpers. Every function takes the restaurant id and filters by it.
 * Use cases live in the sibling modules; route handlers never import this file directly.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import type {
  Allergen,
  Bill,
  BillPart,
  Menu,
  MenuItem,
  Order,
  OrderStatus,
  PaymentMethod,
  Restaurant,
  ServiceRequest,
  ServiceRequestKind,
  SpiceLevel,
  Station,
  Table,
  TableSession,
} from "@/domain";
import { schema, type DbOrTx } from "../db/client";
import { StoreError } from "./errors";

const s = schema;

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Unguessable URL-safe token (128 bits), used for table QR codes. */
export const newToken = () => randomBytes(16).toString("base64url");

export const toMs = (d: Date) => d.getTime();
export const optMs = (d: Date | null) => (d ? d.getTime() : undefined);
export const toDate = (ms: number) => new Date(ms);

export type RestaurantRow = typeof s.restaurants.$inferSelect;

export function toRestaurant(row: RestaurantRow): Restaurant {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    taxPercent: row.taxPercent,
    upiVpa: row.upiVpa,
    isDemo: row.isDemo,
  };
}

export async function loadRestaurant(db: DbOrTx, restaurantId: string): Promise<Restaurant> {
  const [row] = await db.select().from(s.restaurants).where(eq(s.restaurants.id, restaurantId));
  if (!row) throw new StoreError(404, "Unknown restaurant");
  return toRestaurant(row);
}

export type TableRow = typeof s.tables.$inferSelect;

export function toTable(row: TableRow): Table {
  return { id: row.id, restaurantId: row.restaurantId, label: row.label, seats: row.seats };
}

export async function loadTables(db: DbOrTx, restaurantId: string): Promise<TableRow[]> {
  return db
    .select()
    .from(s.tables)
    .where(and(eq(s.tables.restaurantId, restaurantId), eq(s.tables.active, true)))
    .orderBy(asc(s.tables.sortOrder), asc(s.tables.label));
}

export async function loadTable(db: DbOrTx, tableId: string): Promise<TableRow> {
  const [row] = await db.select().from(s.tables).where(eq(s.tables.id, tableId));
  if (!row || !row.active) throw new StoreError(404, "Unknown table");
  return row;
}

type SessionRow = typeof s.tableSessions.$inferSelect;

export function toSession(row: SessionRow): TableSession {
  return { id: row.id, tableId: row.tableId, openedAt: toMs(row.openedAt), closedAt: optMs(row.closedAt) };
}

export async function openSessions(db: DbOrTx, restaurantId: string): Promise<SessionRow[]> {
  return db
    .select()
    .from(s.tableSessions)
    .where(and(eq(s.tableSessions.restaurantId, restaurantId), isNull(s.tableSessions.closedAt)));
}

/** Load the full menu of a restaurant, including sold-out items. */
export async function loadMenu(db: DbOrTx, restaurantId: string): Promise<Menu> {
  const [cats, items, variants] = await Promise.all([
    db
      .select()
      .from(s.menuCategories)
      .where(eq(s.menuCategories.restaurantId, restaurantId))
      .orderBy(asc(s.menuCategories.sortOrder), asc(s.menuCategories.name)),
    db
      .select()
      .from(s.menuItems)
      .where(eq(s.menuItems.restaurantId, restaurantId))
      .orderBy(asc(s.menuItems.sortOrder), asc(s.menuItems.name)),
    db
      .select()
      .from(s.itemVariants)
      .where(eq(s.itemVariants.restaurantId, restaurantId))
      .orderBy(asc(s.itemVariants.sortOrder)),
  ]);
  const itemIds = items.map((i) => i.id);
  const allergens = itemIds.length
    ? await db.select().from(s.itemAllergens).where(inArray(s.itemAllergens.itemId, itemIds))
    : [];
  return {
    categories: cats.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })),
    items: items.map(
      (i): MenuItem => ({
        id: i.id,
        categoryId: i.categoryId,
        name: i.name,
        description: i.description,
        veg: i.veg,
        spice: i.spice as SpiceLevel,
        allergens: allergens.filter((a) => a.itemId === i.id).map((a) => a.allergen as Allergen),
        variants: variants
          .filter((v) => v.itemId === i.id)
          .map((v) => ({ id: v.id, name: v.name, price: v.pricePaise })),
        station: i.station as Station,
        prepMinutes: i.prepMinutes,
        available: i.available,
        deal:
          i.dealLabel && i.dealPercentOff
            ? { label: i.dealLabel, percentOff: i.dealPercentOff }
            : undefined,
      }),
    ),
  };
}

/** Insert one menu item with its variants and allergens. */
export async function insertMenuItem(db: DbOrTx, restaurantId: string, item: MenuItem, sortOrder = 0): Promise<void> {
  await db.insert(s.menuItems).values({
    id: item.id,
    restaurantId,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    veg: item.veg,
    spice: item.spice,
    station: item.station,
    prepMinutes: item.prepMinutes,
    available: item.available,
    dealLabel: item.deal?.label ?? null,
    dealPercentOff: item.deal?.percentOff ?? null,
    sortOrder,
  });
  await db.insert(s.itemVariants).values(
    item.variants.map((v, i) => ({ itemId: item.id, id: v.id, restaurantId, name: v.name, pricePaise: v.price, sortOrder: i })),
  );
  if (item.allergens.length) {
    await db.insert(s.itemAllergens).values(item.allergens.map((allergen) => ({ itemId: item.id, allergen })));
  }
}

/** Orders matching the filter, with items and status history, oldest first. */
export async function loadOrders(
  db: DbOrTx,
  restaurantId: string,
  filter: { sessionIds?: string[]; statuses?: OrderStatus[]; orderId?: string; createdSince?: number } = {},
): Promise<Order[]> {
  if (filter.sessionIds && filter.sessionIds.length === 0) return [];
  const conds = [eq(s.orders.restaurantId, restaurantId)];
  if (filter.sessionIds) conds.push(inArray(s.orders.sessionId, filter.sessionIds));
  if (filter.statuses) conds.push(inArray(s.orders.status, filter.statuses));
  if (filter.orderId) conds.push(eq(s.orders.id, filter.orderId));
  if (filter.createdSince !== undefined) conds.push(gte(s.orders.createdAt, toDate(filter.createdSince)));
  const rows = await db
    .select()
    .from(s.orders)
    .where(and(...conds))
    .orderBy(asc(s.orders.createdAt), asc(s.orders.id));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [items, events] = await Promise.all([
    db.select().from(s.orderItems).where(inArray(s.orderItems.orderId, ids)).orderBy(asc(s.orderItems.lineNo)),
    db
      .select()
      .from(s.orderStatusEvents)
      .where(inArray(s.orderStatusEvents.orderId, ids))
      .orderBy(asc(s.orderStatusEvents.at), asc(s.orderStatusEvents.id)),
  ]);
  return rows.map(
    (r): Order => ({
      id: r.id,
      restaurantId: r.restaurantId,
      tableId: r.tableId,
      sessionId: r.sessionId,
      status: r.status as OrderStatus,
      createdAt: toMs(r.createdAt),
      items: items
        .filter((i) => i.orderId === r.id)
        .map((i) => ({
          itemId: i.itemId,
          variantId: i.variantId,
          name: i.nameSnapshot,
          variantName: i.variantSnapshot,
          unitPrice: i.unitPricePaise,
          qty: i.qty,
          note: i.note ?? undefined,
          station: i.station as Station,
          prepMinutes: i.prepMinutes,
        })),
      events: events
        .filter((e) => e.orderId === r.id)
        .map((e) => ({ status: e.status as OrderStatus, at: toMs(e.at) })),
    }),
  );
}

export async function insertOrder(db: DbOrTx, order: Order, actor: string): Promise<void> {
  await db.insert(s.orders).values({
    id: order.id,
    restaurantId: order.restaurantId,
    tableId: order.tableId,
    sessionId: order.sessionId,
    status: order.status,
    createdAt: toDate(order.createdAt),
  });
  await db.insert(s.orderItems).values(
    order.items.map((i, lineNo) => ({
      orderId: order.id,
      lineNo,
      itemId: i.itemId,
      variantId: i.variantId,
      nameSnapshot: i.name,
      variantSnapshot: i.variantName,
      unitPricePaise: i.unitPrice,
      qty: i.qty,
      note: i.note ?? null,
      station: i.station,
      prepMinutes: i.prepMinutes,
    })),
  );
  await db
    .insert(s.orderStatusEvents)
    .values(order.events.map((e) => ({ orderId: order.id, status: e.status, at: toDate(e.at), actor })));
}

/** Persist a status change made by `transitionOrder` (the last event is the new one). */
export async function saveOrderStatus(db: DbOrTx, order: Order, actor: string): Promise<void> {
  const last = order.events[order.events.length - 1];
  await db
    .update(s.orders)
    .set({ status: order.status })
    .where(and(eq(s.orders.id, order.id), eq(s.orders.restaurantId, order.restaurantId)));
  await db.insert(s.orderStatusEvents).values({ orderId: order.id, status: last.status, at: toDate(last.at), actor });
}

type RequestRow = typeof s.serviceRequests.$inferSelect;

export function toRequest(r: RequestRow): ServiceRequest {
  return {
    id: r.id,
    tableId: r.tableId,
    sessionId: r.sessionId,
    kind: r.kind as ServiceRequestKind,
    createdAt: toMs(r.createdAt),
    resolvedAt: optMs(r.resolvedAt),
  };
}

export async function loadOpenRequests(db: DbOrTx, restaurantId: string, sessionId?: string): Promise<ServiceRequest[]> {
  const conds = [eq(s.serviceRequests.restaurantId, restaurantId), isNull(s.serviceRequests.resolvedAt)];
  if (sessionId) conds.push(eq(s.serviceRequests.sessionId, sessionId));
  const rows = await db.select().from(s.serviceRequests).where(and(...conds)).orderBy(asc(s.serviceRequests.createdAt));
  return rows.map(toRequest);
}

/** Bills with their shares and successful payments. */
export async function loadBills(
  db: DbOrTx,
  restaurantId: string,
  filter: { sessionIds?: string[] } = {},
): Promise<Bill[]> {
  if (filter.sessionIds && filter.sessionIds.length === 0) return [];
  const conds = [eq(s.bills.restaurantId, restaurantId)];
  if (filter.sessionIds) conds.push(inArray(s.bills.sessionId, filter.sessionIds));
  const rows = await db.select().from(s.bills).where(and(...conds));
  if (rows.length === 0) return [];
  const shares = await db
    .select()
    .from(s.billShares)
    .where(inArray(s.billShares.billId, rows.map((r) => r.id)))
    .orderBy(asc(s.billShares.index));
  const pays = shares.length
    ? await db
        .select()
        .from(s.payments)
        .where(and(inArray(s.payments.billShareId, shares.map((x) => x.id)), eq(s.payments.status, "succeeded")))
    : [];
  return rows.map(
    (r): Bill => ({
      id: r.id,
      sessionId: r.sessionId,
      createdAt: toMs(r.createdAt),
      receiptEmail: r.receiptEmail ?? undefined,
      summary: {
        lines: r.lines,
        subtotal: r.subtotal,
        taxPercent: r.taxPercent,
        tax: r.tax,
        tipPercent: r.tipPercent,
        tip: r.tip,
        total: r.total,
      },
      parts: shares
        .filter((x) => x.billId === r.id)
        .map((x): BillPart => {
          const p = pays.find((p) => p.billShareId === x.id);
          return {
            index: x.index,
            amount: x.amount,
            payment: p ? { method: p.method as PaymentMethod, at: toMs(p.createdAt) } : undefined,
          };
        }),
    }),
  );
}

export async function loadBill(db: DbOrTx, restaurantId: string, sessionId: string): Promise<Bill | undefined> {
  return (await loadBills(db, restaurantId, { sessionIds: [sessionId] }))[0];
}

const shareId = (billId: string, index: number) => `${billId}_s${index}`;

/** Insert or replace an unpaid bill and its shares. */
export async function saveBill(db: DbOrTx, restaurantId: string, bill: Bill): Promise<void> {
  await db.delete(s.bills).where(and(eq(s.bills.id, bill.id), eq(s.bills.restaurantId, restaurantId)));
  await db.insert(s.bills).values({
    id: bill.id,
    restaurantId,
    sessionId: bill.sessionId,
    lines: bill.summary.lines,
    subtotal: bill.summary.subtotal,
    taxPercent: bill.summary.taxPercent,
    tax: bill.summary.tax,
    tipPercent: bill.summary.tipPercent,
    tip: bill.summary.tip,
    total: bill.summary.total,
    splitCount: bill.parts.length,
    receiptEmail: bill.receiptEmail ?? null,
    createdAt: toDate(bill.createdAt),
  });
  await db
    .insert(s.billShares)
    .values(bill.parts.map((p) => ({ id: shareId(bill.id, p.index), billId: bill.id, index: p.index, amount: p.amount })));
}

/** Record a successful (simulated) payment for one share. */
export async function insertPayment(
  db: DbOrTx,
  restaurantId: string,
  bill: Bill,
  index: number,
  method: PaymentMethod,
  at: number,
  confirmedBy?: string,
): Promise<void> {
  const part = bill.parts[index];
  await db.insert(s.payments).values({
    id: newId("pay"),
    restaurantId,
    billShareId: shareId(bill.id, index),
    method,
    amount: part.amount,
    status: "succeeded",
    gateway: "simulated",
    confirmedBy: confirmedBy ?? null,
    createdAt: toDate(at),
  });
}
