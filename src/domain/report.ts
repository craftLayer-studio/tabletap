import { amountPaid, type Bill } from "./bill";
import type { Paise } from "./money";
import type { Order } from "./order";
import type { Review } from "./service";

export interface DaySummary {
  orders: number;
  cancelledOrders: number;
  itemsSold: number;
  /** Money received today, tips included. */
  collected: Paise;
  tips: Paise;
  paidBills: number;
  averageRating?: number;
  reviews: number;
  topItems: { name: string; qty: number }[];
}

/** Totals for everything that happened at or after `since` (epoch ms, usually local midnight). */
export function summarizeDay(input: { orders: Order[]; bills: Bill[]; reviews: Review[]; since: number }): DaySummary {
  const orders = input.orders.filter((o) => o.createdAt >= input.since);
  const live = orders.filter((o) => o.status !== "cancelled");
  const qtyByName = new Map<string, number>();
  for (const o of live) for (const i of o.items) qtyByName.set(i.name, (qtyByName.get(i.name) ?? 0) + i.qty);

  let collected = 0;
  let tips = 0;
  let paidBills = 0;
  for (const bill of input.bills) {
    const paidToday = bill.parts.filter((p) => p.payment && p.payment.at >= input.since);
    if (paidToday.length === 0) continue;
    collected += paidToday.reduce((s, p) => s + p.amount, 0);
    if (amountPaid(bill) === bill.summary.total) {
      paidBills += 1;
      tips += bill.summary.tip;
    }
  }
  const reviews = input.reviews.filter((r) => r.at >= input.since);
  const averageRating =
    reviews.length > 0 ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : undefined;

  return {
    orders: live.length,
    cancelledOrders: orders.length - live.length,
    itemsSold: [...qtyByName.values()].reduce((a, b) => a + b, 0),
    collected,
    tips,
    paidBills,
    averageRating,
    reviews: reviews.length,
    topItems: [...qtyByName.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
      .slice(0, 5),
  };
}
