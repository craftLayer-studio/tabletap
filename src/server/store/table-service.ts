/**
 * Table service use cases: guest visit (join, order, call, bill, pay, review) and the staff and owner views.
 * Every write that reads-then-writes a visit runs in a transaction that locks the session row.
 */
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import {
  buildOrderItems,
  canRevise,
  computeBill,
  createBill,
  createOrder,
  deriveTableState,
  InvalidTransitionError,
  isFullyPaid,
  isValidEmail,
  MAX_REVIEW_COMMENT,
  payPart,
  startOfDay,
  summarizeDay,
  transitionOrder,
  type Bill,
  type Cart,
  type Menu,
  type Order,
  type OrderStatus,
  type PaymentMethod,
  type Restaurant,
  type Review,
  type ServiceRequest,
  type ServiceRequestKind,
  type Table,
  type TableSession,
  type TableState,
} from "@/domain";
import { getDb, schema as s, type DbOrTx, type Tx } from "../db/client";
import { StoreError } from "./errors";
import {
  insertOrder,
  insertPayment,
  loadBill,
  loadBills,
  loadMenu,
  loadOpenRequests,
  loadOrders,
  loadRestaurant,
  loadTable,
  loadTables,
  newId,
  openSessions,
  saveBill,
  saveOrderStatus,
  toDate,
  toMs,
  toRequest,
  toSession,
  toTable,
  type TableRow,
} from "./repo";

export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  return loadRestaurant(await getDb(), restaurantId);
}

export async function listTables(restaurantId: string): Promise<Table[]> {
  return (await loadTables(await getDb(), restaurantId)).map(toTable);
}

/** The session a guest is acting in. It must belong to the table; it may be closed (for reviews). */
async function getSession(db: DbOrTx, table: TableRow, sessionId: string, lock = false): Promise<TableSession> {
  const q = db
    .select()
    .from(s.tableSessions)
    .where(
      and(
        eq(s.tableSessions.id, sessionId),
        eq(s.tableSessions.tableId, table.id),
        eq(s.tableSessions.restaurantId, table.restaurantId),
      ),
    );
  const [row] = lock ? await q.for("update") : await q;
  if (!row) throw new StoreError(404, "This table visit has ended. Scan the QR code again.");
  return toSession(row);
}

function requireOpen(session: TableSession): void {
  if (session.closedAt !== undefined) throw new StoreError(409, "This table visit is already closed.");
}

/** Run a guest write in a transaction with the visit locked. */
async function withVisit<T>(
  tableId: string,
  sessionId: string,
  fn: (tx: Tx, ctx: { table: TableRow; session: TableSession }) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const table = await loadTable(tx, tableId);
    const session = await getSession(tx, table, sessionId, true);
    return fn(tx, { table, session });
  });
}

/** Join the table's open session, or start one. Scanning the QR at a free table opens it. */
export async function joinTable(tableId: string, now = Date.now()): Promise<TableSession> {
  const db = await getDb();
  const table = await loadTable(db, tableId);
  // The partial unique index allows one open session per table, so concurrent scans share one visit.
  await db
    .insert(s.tableSessions)
    .values({ id: newId("ses"), restaurantId: table.restaurantId, tableId: table.id, openedAt: toDate(now) })
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(s.tableSessions)
    .where(and(eq(s.tableSessions.tableId, table.id), isNull(s.tableSessions.closedAt)));
  return toSession(row);
}

export interface GuestView {
  restaurant: Restaurant;
  table: Table;
  menu: Menu;
  session: TableSession;
  orders: Order[];
  openRequests: ServiceRequest[];
  bill?: Bill;
  review?: Review;
  now: number;
}

type ReviewRow = typeof s.reviews.$inferSelect;

const toReview = (r: ReviewRow): Review => ({
  id: r.id,
  sessionId: r.sessionId,
  tableId: r.tableId,
  rating: r.rating as Review["rating"],
  comment: r.comment ?? undefined,
  at: toMs(r.createdAt),
});

export async function guestView(tableId: string, sessionId: string, now = Date.now()): Promise<GuestView> {
  const db = await getDb();
  const table = await loadTable(db, tableId);
  const session = await getSession(db, table, sessionId);
  const rid = table.restaurantId;
  const [restaurant, menu, orders, openRequests, bill, reviewRows] = await Promise.all([
    loadRestaurant(db, rid),
    loadMenu(db, rid),
    loadOrders(db, rid, { sessionIds: [session.id] }),
    loadOpenRequests(db, rid, session.id),
    loadBill(db, rid, session.id),
    db
      .select()
      .from(s.reviews)
      .where(and(eq(s.reviews.restaurantId, rid), eq(s.reviews.sessionId, session.id))),
  ]);
  return {
    restaurant,
    table: toTable(table),
    menu,
    session,
    orders,
    openRequests,
    bill,
    review: reviewRows[0] ? toReview(reviewRows[0]) : undefined,
    now,
  };
}

async function deleteBill(tx: Tx, restaurantId: string, billId: string) {
  await tx.delete(s.bills).where(and(eq(s.bills.id, billId), eq(s.bills.restaurantId, restaurantId)));
}

export async function placeOrder(tableId: string, sessionId: string, cart: Cart, now = Date.now()): Promise<Order> {
  return withVisit(tableId, sessionId, async (tx, { table, session }) => {
    requireOpen(session);
    const rid = table.restaurantId;
    const bill = await loadBill(tx, rid, session.id);
    if (bill && !canRevise(bill)) throw new StoreError(409, "Payment has started; ask staff to add items.");
    const built = buildOrderItems(await loadMenu(tx, rid), cart);
    if (!built.ok) throw new StoreError(400, built.errors.join("; "));
    const order = createOrder({ id: newId("ord"), restaurantId: rid, tableId: table.id, sessionId: session.id, items: built.items, at: now });
    await insertOrder(tx, order, "guest");
    // New items invalidate a bill that nobody has paid yet.
    if (bill) await deleteBill(tx, rid, bill.id);
    return order;
  });
}

export async function setOrderStatus(
  restaurantId: string,
  orderId: string,
  to: OrderStatus,
  now = Date.now(),
  actor = "staff",
): Promise<Order> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(s.orders)
      .where(and(eq(s.orders.id, orderId), eq(s.orders.restaurantId, restaurantId)))
      .for("update");
    if (!row) throw new StoreError(404, "Unknown order");
    const [current] = await loadOrders(tx, restaurantId, { orderId });
    if (to === "cancelled" && (await loadBill(tx, restaurantId, current.sessionId))) {
      throw new StoreError(409, "A bill exists for this table; cancel before billing.");
    }
    let next: Order;
    try {
      next = transitionOrder(current, to, now);
    } catch (err) {
      if (err instanceof InvalidTransitionError) throw new StoreError(409, err.message);
      throw err;
    }
    await saveOrderStatus(tx, next, actor);
    return next;
  });
}

export async function createRequest(
  tableId: string,
  sessionId: string,
  kind: ServiceRequestKind,
  now = Date.now(),
): Promise<ServiceRequest> {
  return withVisit(tableId, sessionId, async (tx, { table, session }) => {
    requireOpen(session);
    // One open request per kind per visit: tapping "call waiter" twice does not page staff twice.
    const open = (await loadOpenRequests(tx, table.restaurantId, session.id)).find((r) => r.kind === kind);
    if (open) return open;
    const request: ServiceRequest = { id: newId("req"), tableId: table.id, sessionId: session.id, kind, createdAt: now };
    await tx.insert(s.serviceRequests).values({
      id: request.id,
      restaurantId: table.restaurantId,
      tableId: table.id,
      sessionId: session.id,
      kind,
      createdAt: toDate(now),
    });
    return request;
  });
}

export async function resolveRequest(
  restaurantId: string,
  requestId: string,
  now = Date.now(),
  actor = "staff",
): Promise<ServiceRequest> {
  const db = await getDb();
  const where = and(eq(s.serviceRequests.id, requestId), eq(s.serviceRequests.restaurantId, restaurantId));
  const [row] = await db.select().from(s.serviceRequests).where(where);
  if (!row) throw new StoreError(404, "Unknown request");
  if (row.resolvedAt) return toRequest(row);
  const [updated] = await db
    .update(s.serviceRequests)
    .set({ resolvedAt: toDate(now), resolvedBy: actor })
    .where(and(where, isNull(s.serviceRequests.resolvedAt)))
    .returning();
  return toRequest(updated ?? row);
}

/** Create or revise the bill for a session with a tip and an even split. */
export async function prepareBill(
  tableId: string,
  sessionId: string,
  opts: { tipPercent: number; splitCount: number },
  now = Date.now(),
): Promise<Bill> {
  return withVisit(tableId, sessionId, async (tx, { table, session }) => {
    requireOpen(session);
    const rid = table.restaurantId;
    const existing = await loadBill(tx, rid, session.id);
    if (existing && !canRevise(existing)) throw new StoreError(409, "Payment has started; the split is locked.");
    const orders = await loadOrders(tx, rid, { sessionIds: [session.id] });
    if (orders.some((o) => o.status === "placed")) {
      throw new StoreError(409, "An order is still waiting for staff to confirm it.");
    }
    const restaurant = await loadRestaurant(tx, rid);
    let bill: Bill;
    try {
      const summary = computeBill(orders, { taxPercent: restaurant.taxPercent, tipPercent: opts.tipPercent });
      bill = createBill({ id: existing?.id ?? newId("bill"), sessionId: session.id, summary, splitCount: opts.splitCount, at: now });
    } catch (err) {
      throw new StoreError(400, err instanceof Error ? err.message : "Invalid bill");
    }
    await saveBill(tx, rid, bill);
    return bill;
  });
}

/**
 * Record payment of one share. This trusts the guest's tap (simulated payments); in M2 a share is marked paid
 * only by a gateway webhook, or by staff for cash.
 */
export async function payShare(
  tableId: string,
  sessionId: string,
  opts: { partIndex: number; method: PaymentMethod; receiptEmail?: string },
  now = Date.now(),
): Promise<Bill> {
  return withVisit(tableId, sessionId, async (tx, { table, session }) => {
    requireOpen(session);
    const rid = table.restaurantId;
    const existing = await loadBill(tx, rid, session.id);
    if (!existing) throw new StoreError(409, "Prepare the bill first.");
    if (opts.receiptEmail !== undefined && !isValidEmail(opts.receiptEmail)) {
      throw new StoreError(400, "That email address does not look right.");
    }
    let bill: Bill;
    try {
      bill = payPart(existing, opts.partIndex, opts.method, now);
    } catch (err) {
      throw new StoreError(409, err instanceof Error ? err.message : "Payment failed");
    }
    await insertPayment(tx, rid, bill, opts.partIndex, opts.method, now);
    if (opts.receiptEmail) {
      bill = { ...bill, receiptEmail: opts.receiptEmail };
      await tx.update(s.bills).set({ receiptEmail: opts.receiptEmail }).where(eq(s.bills.id, bill.id));
    }
    if (isFullyPaid(bill)) {
      await tx.update(s.tableSessions).set({ closedAt: toDate(now) }).where(eq(s.tableSessions.id, session.id));
      await tx
        .update(s.serviceRequests)
        .set({ resolvedAt: toDate(now), resolvedBy: "system" })
        .where(and(eq(s.serviceRequests.sessionId, session.id), isNull(s.serviceRequests.resolvedAt)));
    }
    return bill;
  });
}

export async function addReview(
  tableId: string,
  sessionId: string,
  input: { rating: Review["rating"]; comment?: string },
  now = Date.now(),
): Promise<Review> {
  return withVisit(tableId, sessionId, async (tx, { table, session }) => {
    const rid = table.restaurantId;
    const bill = await loadBill(tx, rid, session.id);
    if (!bill || !isFullyPaid(bill)) throw new StoreError(409, "Reviews open after the bill is paid.");
    const [dupe] = await tx.select({ id: s.reviews.id }).from(s.reviews).where(eq(s.reviews.sessionId, session.id));
    if (dupe) throw new StoreError(409, "Thanks, we already have your review.");
    const review: Review = {
      id: newId("rev"),
      sessionId: session.id,
      tableId: table.id,
      rating: input.rating,
      comment: input.comment?.trim().slice(0, MAX_REVIEW_COMMENT) || undefined,
      at: now,
    };
    await tx.insert(s.reviews).values({
      id: review.id,
      restaurantId: rid,
      sessionId: session.id,
      tableId: table.id,
      rating: review.rating,
      comment: review.comment ?? null,
      createdAt: toDate(now),
    });
    return review;
  });
}

export interface FloorTable {
  table: Table;
  state: TableState;
  sessionId?: string;
  openedAt?: number;
  activeOrders: number;
  billDue?: number;
}

export interface StaffView {
  restaurant: Restaurant;
  floor: FloorTable[];
  /** Orders that are not served or cancelled, oldest first. */
  activeOrders: Order[];
  openRequests: ServiceRequest[];
  now: number;
}

const ACTIVE: OrderStatus[] = ["placed", "confirmed", "cooking", "ready"];

export async function staffView(restaurantId: string, now = Date.now()): Promise<StaffView> {
  const db = await getDb();
  const [restaurant, tables, sessions, requests] = await Promise.all([
    loadRestaurant(db, restaurantId),
    loadTables(db, restaurantId),
    openSessions(db, restaurantId),
    loadOpenRequests(db, restaurantId),
  ]);
  const sessionIds = sessions.map((x) => x.id);
  const [sessionOrders, bills, activeOrders] = await Promise.all([
    loadOrders(db, restaurantId, { sessionIds }),
    loadBills(db, restaurantId, { sessionIds }),
    loadOrders(db, restaurantId, { statuses: ACTIVE }),
  ]);
  const floor = tables.map((row): FloorTable => {
    const sessionRow = sessions.find((x) => x.tableId === row.id);
    const session = sessionRow ? toSession(sessionRow) : undefined;
    const bill = session && bills.find((b) => b.sessionId === session.id);
    const orders = session ? sessionOrders.filter((o) => o.sessionId === session.id) : [];
    return {
      table: toTable(row),
      state: deriveTableState({ session, orders, requests, bill }),
      sessionId: session?.id,
      openedAt: session?.openedAt,
      activeOrders: orders.filter((o) => ACTIVE.includes(o.status)).length,
      billDue: bill ? bill.parts.reduce((sum, p) => sum + (p.payment ? 0 : p.amount), 0) : undefined,
    };
  });
  return { restaurant, floor, activeOrders, openRequests: requests, now };
}

export async function ownerView(restaurantId: string, now = Date.now()) {
  const db = await getDb();
  const since = startOfDay(now);
  const staff = await staffView(restaurantId, now);
  const [todaysOrders, billRows, reviewRows] = await Promise.all([
    loadOrders(db, restaurantId, { createdSince: since }),
    // Bills paid today may belong to visits that opened before midnight, so load every bill with a payment today.
    db
      .selectDistinct({ sessionId: s.bills.sessionId })
      .from(s.bills)
      .innerJoin(s.billShares, eq(s.billShares.billId, s.bills.id))
      .innerJoin(s.payments, eq(s.payments.billShareId, s.billShares.id))
      .where(and(eq(s.bills.restaurantId, restaurantId), gte(s.payments.createdAt, toDate(since)))),
    db
      .select()
      .from(s.reviews)
      .where(and(eq(s.reviews.restaurantId, restaurantId), gte(s.reviews.createdAt, toDate(since))))
      .orderBy(desc(s.reviews.createdAt)),
  ]);
  const bills = await loadBills(db, restaurantId, { sessionIds: billRows.map((b) => b.sessionId) });
  const reviews = reviewRows.map(toReview);
  return {
    restaurant: staff.restaurant,
    since,
    now,
    summary: summarizeDay({ orders: todaysOrders, bills, reviews, since }),
    tablesInUse: staff.floor.filter((f) => f.state !== "free").length,
    tableCount: staff.floor.length,
    floor: staff.floor,
    recentReviews: reviews.slice(0, 5),
  };
}

export type OwnerView = Awaited<ReturnType<typeof ownerView>>;

/** Sessions of a restaurant, newest first (used by seeds and tests). */
export async function listSessions(restaurantId: string): Promise<TableSession[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.tableSessions)
    .where(eq(s.tableSessions.restaurantId, restaurantId))
    .orderBy(asc(s.tableSessions.openedAt));
  return rows.map(toSession);
}
