import type { Bill } from "./bill";
import { isFullyPaid } from "./bill";
import type { Order } from "./order";
import { isOpen, type ServiceRequest } from "./service";

export interface Table {
  id: string;
  restaurantId: string;
  /** Label printed next to the QR code, e.g. "T3". */
  label: string;
  seats: number;
}

/** A dining session: from the first scan at a free table until the bill is fully paid. */
export interface TableSession {
  id: string;
  tableId: string;
  openedAt: number;
  closedAt?: number;
}

export type TableState = "free" | "ordering" | "eating" | "needs_help" | "bill_requested";

export const TABLE_STATE_LABELS: Record<TableState, string> = {
  free: "Free",
  ordering: "Ordering",
  eating: "Eating",
  needs_help: "Needs help",
  bill_requested: "Bill requested",
};

/**
 * Derive a table's state for the floor map. Order of precedence:
 * no open session = free; an open waiter call = needs help; a bill request or unpaid bill = bill requested;
 * any served order = eating; otherwise the guests are still ordering or waiting for their first food.
 */
export function deriveTableState(input: {
  session?: TableSession;
  orders: Order[];
  requests: ServiceRequest[];
  bill?: Bill;
}): TableState {
  const { session } = input;
  if (!session || session.closedAt !== undefined) return "free";
  const open = input.requests.filter((r) => r.sessionId === session.id && isOpen(r));
  if (open.some((r) => r.kind === "waiter")) return "needs_help";
  if (open.some((r) => r.kind === "bill") || (input.bill && !isFullyPaid(input.bill))) return "bill_requested";
  const orders = input.orders.filter((o) => o.sessionId === session.id);
  if (orders.some((o) => o.status === "served")) return "eating";
  return "ordering";
}
