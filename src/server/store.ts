import { randomUUID } from "node:crypto";
import {
  buildOrderItems,
  canRevise,
  computeBill,
  createBill,
  createOrder,
  deriveTableState,
  hasOpenRequest,
  InvalidTransitionError,
  isFullyPaid,
  isOpen,
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
  type Review,
  type ServiceRequest,
  type ServiceRequestKind,
  type Table,
  type TableSession,
  type TableState,
} from "@/domain";
import { DEMO_MENU, DEMO_RESTAURANT, DEMO_TABLES, type Restaurant } from "./seed";

/**
 * In-memory store for the prototype. One process, one restaurant, lost on restart.
 * M1 replaces this with Postgres (see PLAN.md); the function signatures here are the seam.
 */
export interface State {
  restaurant: Restaurant;
  menu: Menu;
  tables: Table[];
  sessions: TableSession[];
  orders: Order[];
  requests: ServiceRequest[];
  bills: Bill[];
  reviews: Review[];
}

export class StoreError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

const id = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

function seedState(now: number): State {
  const state: State = {
    restaurant: DEMO_RESTAURANT,
    menu: DEMO_MENU,
    tables: DEMO_TABLES,
    sessions: [],
    orders: [],
    requests: [],
    bills: [],
    reviews: [],
  };
  const min = 60_000;
  const dayStart = startOfDay(now);
  const earlier = (minutesAgo: number) => Math.max(dayStart + min, now - minutesAgo * min);

  const order = (tableId: string, sessionId: string, cart: Cart, at: number, path: OrderStatus[]) => {
    const built = buildOrderItems(state.menu, cart);
    if (!built.ok) throw new Error(`Bad seed order: ${built.errors.join(", ")}`);
    let o = createOrder({ id: id("ord"), restaurantId: state.restaurant.id, tableId, sessionId, items: built.items, at });
    path.forEach((status, i) => {
      o = transitionOrder(o, status, at + (i + 1) * 2 * min);
    });
    state.orders.push(o);
    return o;
  };

  // Two finished meals earlier today, so the owner view has something to show.
  for (const [tableId, minutesAgo, rating] of [
    ["t1", 150, 5],
    ["t3", 95, 4],
  ] as const) {
    const opened = earlier(minutesAgo);
    const session: TableSession = { id: id("ses"), tableId, openedAt: opened, closedAt: opened + 50 * min };
    state.sessions.push(session);
    const o = order(
      tableId,
      session.id,
      [
        { itemId: "paneer-tikka", variantId: "half", qty: 1 },
        { itemId: "dal-makhani", variantId: "full", qty: 1 },
        { itemId: "butter-naan", variantId: "regular", qty: 3 },
      ],
      opened + 3 * min,
      ["confirmed", "cooking", "ready", "served"],
    );
    const summary = computeBill([o], { taxPercent: state.restaurant.taxPercent, tipPercent: 5 });
    let bill = createBill({ id: id("bill"), sessionId: session.id, summary, splitCount: 2, at: opened + 45 * min });
    bill = payPart(bill, 0, "upi", opened + 46 * min);
    bill = payPart(bill, 1, "cash", opened + 47 * min);
    state.bills.push(bill);
    state.reviews.push({ id: id("rev"), sessionId: session.id, tableId, rating, at: opened + 48 * min });
  }

  // T2: food cooking.
  const s2: TableSession = { id: id("ses"), tableId: "t2", openedAt: now - 12 * min };
  state.sessions.push(s2);
  order(
    "t2",
    s2.id,
    [
      { itemId: "butter-chicken", variantId: "half", qty: 1 },
      { itemId: "tandoori-roti", variantId: "regular", qty: 2 },
      { itemId: "masala-chai", variantId: "regular", qty: 2 },
    ],
    now - 10 * min,
    ["confirmed", "cooking"],
  );

  // T4: eating.
  const s4: TableSession = { id: id("ses"), tableId: "t4", openedAt: now - 40 * min };
  state.sessions.push(s4);
  order(
    "t4",
    s4.id,
    [
      { itemId: "veg-biryani", variantId: "full", qty: 1 },
      { itemId: "fresh-lime-soda", variantId: "regular", qty: 2 },
    ],
    now - 38 * min,
    ["confirmed", "cooking", "ready", "served"],
  );

  // T5: just ordered and pressed "call waiter".
  const s5: TableSession = { id: id("ses"), tableId: "t5", openedAt: now - 6 * min };
  state.sessions.push(s5);
  order("t5", s5.id, [{ itemId: "chicken-65", variantId: "full", qty: 1 }], now - 2 * min, []);
  state.requests.push({ id: id("req"), tableId: "t5", sessionId: s5.id, kind: "waiter", createdAt: now - 1 * min });

  return state;
}

// Survive hot reloads in dev by keeping the state on globalThis.
const globalStore = globalThis as unknown as { __tabletapState?: State };

export function getState(): State {
  if (!globalStore.__tabletapState) globalStore.__tabletapState = seedState(Date.now());
  return globalStore.__tabletapState;
}

/** Replace the state with a fresh seed. Used by tests and the "reset demo" button. */
export function resetState(now = Date.now()): State {
  globalStore.__tabletapState = seedState(now);
  return globalStore.__tabletapState;
}

function getTable(state: State, tableId: string): Table {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table) throw new StoreError(404, "Unknown table");
  return table;
}

function openSessionFor(state: State, tableId: string): TableSession | undefined {
  return state.sessions.find((s) => s.tableId === tableId && s.closedAt === undefined);
}

/** The session a guest is acting in. It must belong to the table; it may be closed (for reviews). */
function getSession(state: State, tableId: string, sessionId: string): TableSession {
  const session = state.sessions.find((s) => s.id === sessionId && s.tableId === tableId);
  if (!session) throw new StoreError(404, "This table visit has ended. Scan the QR code again.");
  return session;
}

function requireOpen(session: TableSession): void {
  if (session.closedAt !== undefined) throw new StoreError(409, "This table visit is already closed.");
}

function billFor(state: State, sessionId: string): Bill | undefined {
  return state.bills.find((b) => b.sessionId === sessionId);
}

/** Join the table's open session, or start one. Scanning the QR at a free table opens it. */
export function joinTable(tableId: string, now = Date.now()): TableSession {
  const state = getState();
  getTable(state, tableId);
  const existing = openSessionFor(state, tableId);
  if (existing) return existing;
  const session: TableSession = { id: id("ses"), tableId, openedAt: now };
  state.sessions.push(session);
  return session;
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

export function guestView(tableId: string, sessionId: string, now = Date.now()): GuestView {
  const state = getState();
  const table = getTable(state, tableId);
  const session = getSession(state, tableId, sessionId);
  return {
    restaurant: state.restaurant,
    table,
    menu: state.menu,
    session,
    orders: state.orders.filter((o) => o.sessionId === session.id),
    openRequests: state.requests.filter((r) => r.sessionId === session.id && isOpen(r)),
    bill: billFor(state, session.id),
    review: state.reviews.find((r) => r.sessionId === session.id),
    now,
  };
}

export function placeOrder(tableId: string, sessionId: string, cart: Cart, now = Date.now()): Order {
  const state = getState();
  const session = getSession(state, tableId, sessionId);
  requireOpen(session);
  const bill = billFor(state, session.id);
  if (bill && !canRevise(bill)) throw new StoreError(409, "Payment has started; ask staff to add items.");
  const built = buildOrderItems(state.menu, cart);
  if (!built.ok) throw new StoreError(400, built.errors.join("; "));
  const order = createOrder({
    id: id("ord"),
    restaurantId: state.restaurant.id,
    tableId,
    sessionId: session.id,
    items: built.items,
    at: now,
  });
  state.orders.push(order);
  // New items invalidate a bill that nobody has paid yet.
  if (bill) state.bills = state.bills.filter((b) => b !== bill);
  return order;
}

export function setOrderStatus(orderId: string, to: OrderStatus, now = Date.now()): Order {
  const state = getState();
  const index = state.orders.findIndex((o) => o.id === orderId);
  if (index === -1) throw new StoreError(404, "Unknown order");
  const current = state.orders[index];
  if (to === "cancelled" && billFor(state, current.sessionId)) {
    throw new StoreError(409, "A bill exists for this table; cancel before billing.");
  }
  try {
    state.orders[index] = transitionOrder(current, to, now);
  } catch (err) {
    if (err instanceof InvalidTransitionError) throw new StoreError(409, err.message);
    throw err;
  }
  return state.orders[index];
}

export function createRequest(
  tableId: string,
  sessionId: string,
  kind: ServiceRequestKind,
  now = Date.now(),
): ServiceRequest {
  const state = getState();
  const session = getSession(state, tableId, sessionId);
  requireOpen(session);
  if (hasOpenRequest(state.requests, session.id, kind)) {
    return state.requests.find((r) => r.sessionId === session.id && r.kind === kind && isOpen(r))!;
  }
  const request: ServiceRequest = { id: id("req"), tableId, sessionId: session.id, kind, createdAt: now };
  state.requests.push(request);
  return request;
}

export function resolveRequest(requestId: string, now = Date.now()): ServiceRequest {
  const state = getState();
  const index = state.requests.findIndex((r) => r.id === requestId);
  if (index === -1) throw new StoreError(404, "Unknown request");
  if (isOpen(state.requests[index])) state.requests[index] = { ...state.requests[index], resolvedAt: now };
  return state.requests[index];
}

/** Create or revise the bill for a session with a tip and an even split. */
export function prepareBill(
  tableId: string,
  sessionId: string,
  opts: { tipPercent: number; splitCount: number },
  now = Date.now(),
): Bill {
  const state = getState();
  const session = getSession(state, tableId, sessionId);
  requireOpen(session);
  const existing = billFor(state, session.id);
  if (existing && !canRevise(existing)) throw new StoreError(409, "Payment has started; the split is locked.");
  const orders = state.orders.filter((o) => o.sessionId === session.id);
  if (orders.some((o) => o.status === "placed")) {
    throw new StoreError(409, "An order is still waiting for staff to confirm it.");
  }
  let bill: Bill;
  try {
    const summary = computeBill(orders, { taxPercent: state.restaurant.taxPercent, tipPercent: opts.tipPercent });
    bill = createBill({ id: existing?.id ?? id("bill"), sessionId: session.id, summary, splitCount: opts.splitCount, at: now });
  } catch (err) {
    throw new StoreError(400, err instanceof Error ? err.message : "Invalid bill");
  }
  state.bills = [...state.bills.filter((b) => b !== existing), bill];
  return bill;
}

/**
 * Record payment of one share. In the prototype this trusts the guest's tap; in M2 a share is marked paid
 * only by a gateway webhook, or by staff for cash.
 */
export function payShare(
  tableId: string,
  sessionId: string,
  opts: { partIndex: number; method: PaymentMethod; receiptEmail?: string },
  now = Date.now(),
): Bill {
  const state = getState();
  const session = getSession(state, tableId, sessionId);
  requireOpen(session);
  const existing = billFor(state, session.id);
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
  if (opts.receiptEmail) bill = { ...bill, receiptEmail: opts.receiptEmail };
  state.bills = state.bills.map((b) => (b === existing ? bill : b));
  if (isFullyPaid(bill)) {
    const index = state.sessions.findIndex((s) => s.id === session.id);
    state.sessions[index] = { ...session, closedAt: now };
    state.requests = state.requests.map((r) => (r.sessionId === session.id && isOpen(r) ? { ...r, resolvedAt: now } : r));
  }
  return bill;
}

export function addReview(
  tableId: string,
  sessionId: string,
  input: { rating: Review["rating"]; comment?: string },
  now = Date.now(),
): Review {
  const state = getState();
  const session = getSession(state, tableId, sessionId);
  const bill = billFor(state, session.id);
  if (!bill || !isFullyPaid(bill)) throw new StoreError(409, "Reviews open after the bill is paid.");
  if (state.reviews.some((r) => r.sessionId === session.id)) throw new StoreError(409, "Thanks, we already have your review.");
  const review: Review = {
    id: id("rev"),
    sessionId: session.id,
    tableId,
    rating: input.rating,
    comment: input.comment?.trim().slice(0, MAX_REVIEW_COMMENT) || undefined,
    at: now,
  };
  state.reviews.push(review);
  return review;
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

export function staffView(now = Date.now()): StaffView {
  const state = getState();
  const floor = state.tables.map((table): FloorTable => {
    const session = openSessionFor(state, table.id);
    const bill = session && billFor(state, session.id);
    const orders = session ? state.orders.filter((o) => o.sessionId === session.id) : [];
    return {
      table,
      state: deriveTableState({ session, orders, requests: state.requests, bill }),
      sessionId: session?.id,
      openedAt: session?.openedAt,
      activeOrders: orders.filter((o) => o.status !== "served" && o.status !== "cancelled").length,
      billDue: bill ? bill.parts.reduce((s, p) => s + (p.payment ? 0 : p.amount), 0) : undefined,
    };
  });
  return {
    restaurant: state.restaurant,
    floor,
    activeOrders: state.orders
      .filter((o) => o.status !== "served" && o.status !== "cancelled")
      .sort((a, b) => a.createdAt - b.createdAt),
    openRequests: state.requests.filter(isOpen).sort((a, b) => a.createdAt - b.createdAt),
    now,
  };
}

export function ownerView(now = Date.now()) {
  const state = getState();
  const since = startOfDay(now);
  const staff = staffView(now);
  return {
    restaurant: state.restaurant,
    since,
    now,
    summary: summarizeDay({ orders: state.orders, bills: state.bills, reviews: state.reviews, since }),
    tablesInUse: staff.floor.filter((f) => f.state !== "free").length,
    tableCount: state.tables.length,
    floor: staff.floor,
    recentReviews: state.reviews
      .filter((r) => r.at >= since)
      .sort((a, b) => b.at - a.at)
      .slice(0, 5),
  };
}

export type OwnerView = ReturnType<typeof ownerView>;
