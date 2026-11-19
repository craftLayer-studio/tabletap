import type { OrderItem } from "./cart";

export type OrderStatus = "placed" | "confirmed" | "cooking" | "ready" | "served" | "cancelled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Waiting for staff",
  confirmed: "Sent to kitchen",
  cooking: "Cooking",
  ready: "Ready to serve",
  served: "Served",
  cancelled: "Cancelled",
};

/**
 * Allowed transitions. Guests place; staff confirm (send to kitchen); kitchen cooks and marks ready;
 * staff serve. Cancelling is allowed until the food is ready.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["cooking", "cancelled"],
  cooking: ["ready", "cancelled"],
  ready: ["served"],
  served: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  /** Epoch milliseconds. */
  at: number;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId: string;
  sessionId: string;
  items: OrderItem[];
  status: OrderStatus;
  events: OrderStatusEvent[];
  createdAt: number;
}

export function createOrder(params: {
  id: string;
  restaurantId: string;
  tableId: string;
  sessionId: string;
  items: OrderItem[];
  at: number;
}): Order {
  if (params.items.length === 0) throw new Error("An order needs at least one item");
  return {
    id: params.id,
    restaurantId: params.restaurantId,
    tableId: params.tableId,
    sessionId: params.sessionId,
    items: params.items,
    status: "placed",
    events: [{ status: "placed", at: params.at }],
    createdAt: params.at,
  };
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Cannot move an order from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Return a new order in status `to`, with the event appended. Throws InvalidTransitionError. */
export function transitionOrder(order: Order, to: OrderStatus, at: number): Order {
  if (!canTransition(order.status, to)) throw new InvalidTransitionError(order.status, to);
  return { ...order, status: to, events: [...order.events, { status: to, at }] };
}

/** When the order entered a status, if it ever did. */
export function enteredAt(order: Order, status: OrderStatus): number | undefined {
  return order.events.find((e) => e.status === status)?.at;
}

/** Billable orders: everything except cancelled. */
export function isBillable(order: Order): boolean {
  return order.status !== "cancelled";
}

/** Minutes the kitchen needs: the slowest item, since stations cook in parallel. */
export function kitchenMinutes(items: Pick<OrderItem, "prepMinutes">[]): number {
  return items.reduce((max, i) => Math.max(max, i.prepMinutes), 0);
}

/**
 * Estimated epoch ms when the order will be ready, or undefined once ready/served/cancelled.
 * Before confirmation we assume staff confirm within `confirmBufferMinutes`.
 */
export function estimatedReadyAt(order: Order, confirmBufferMinutes = 2): number | undefined {
  const prepMs = kitchenMinutes(order.items) * 60_000;
  switch (order.status) {
    case "placed":
      return order.createdAt + confirmBufferMinutes * 60_000 + prepMs;
    case "confirmed":
    case "cooking": {
      const start = enteredAt(order, "cooking") ?? enteredAt(order, "confirmed") ?? order.createdAt;
      return start + prepMs;
    }
    default:
      return undefined;
  }
}

/** Whole minutes remaining until `readyAt`, never negative. */
export function minutesRemaining(readyAt: number, now: number): number {
  return Math.max(0, Math.ceil((readyAt - now) / 60_000));
}

/** "mm:ss" elapsed since `since`, for kitchen timers. */
export function formatElapsed(since: number, now: number): string {
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
