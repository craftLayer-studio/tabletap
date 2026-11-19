import { isBillable, type Order } from "./order";
import { assertPaise, percentOf, type Paise } from "./money";

export type PaymentMethod = "upi" | "card" | "cash" | "bank_transfer";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  card: "Card",
  cash: "Cash",
  bank_transfer: "Bank transfer",
};

export const TIP_PRESETS = [0, 5, 10, 15] as const;
export const MAX_SPLIT = 20;
export const MAX_TIP_PERCENT = 50;

export interface BillLine {
  name: string;
  variantName: string;
  qty: number;
  unitPrice: Paise;
  total: Paise;
}

export interface BillSummary {
  lines: BillLine[];
  subtotal: Paise;
  taxPercent: number;
  tax: Paise;
  tipPercent: number;
  tip: Paise;
  total: Paise;
}

/**
 * Bill for a set of orders. Cancelled orders are excluded. Identical lines (same item, size and price)
 * across orders are merged. Tax and tip are both computed on the subtotal and rounded to the paisa.
 */
export function computeBill(
  orders: Order[],
  opts: { taxPercent: number; tipPercent: number },
): BillSummary {
  if (opts.tipPercent < 0 || opts.tipPercent > MAX_TIP_PERCENT) {
    throw new Error(`tip must be between 0 and ${MAX_TIP_PERCENT} percent`);
  }
  const merged = new Map<string, BillLine>();
  for (const order of orders.filter(isBillable)) {
    for (const item of order.items) {
      const key = `${item.itemId}|${item.variantId}|${item.unitPrice}`;
      const line = merged.get(key);
      if (line) {
        line.qty += item.qty;
        line.total += item.unitPrice * item.qty;
      } else {
        merged.set(key, {
          name: item.name,
          variantName: item.variantName,
          qty: item.qty,
          unitPrice: item.unitPrice,
          total: item.unitPrice * item.qty,
        });
      }
    }
  }
  const lines = [...merged.values()];
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const tax = percentOf(subtotal, opts.taxPercent);
  const tip = percentOf(subtotal, opts.tipPercent);
  return {
    lines,
    subtotal,
    taxPercent: opts.taxPercent,
    tax,
    tipPercent: opts.tipPercent,
    tip,
    total: subtotal + tax + tip,
  };
}

/**
 * Split an amount into `parts` shares that differ by at most one paisa and sum exactly to the amount.
 * The first shares carry the extra paise.
 */
export function splitEvenly(amount: Paise, parts: number): Paise[] {
  assertPaise(amount);
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_SPLIT) {
    throw new Error(`parts must be an integer from 1 to ${MAX_SPLIT}`);
  }
  const base = Math.floor(amount / parts);
  const remainder = amount - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

export interface PartPayment {
  method: PaymentMethod;
  at: number;
}

export interface BillPart {
  index: number;
  amount: Paise;
  payment?: PartPayment;
}

export interface Bill {
  id: string;
  sessionId: string;
  summary: BillSummary;
  parts: BillPart[];
  createdAt: number;
  receiptEmail?: string;
}

export function createBill(params: {
  id: string;
  sessionId: string;
  summary: BillSummary;
  splitCount: number;
  at: number;
}): Bill {
  if (params.summary.total === 0) throw new Error("Nothing to bill yet");
  return {
    id: params.id,
    sessionId: params.sessionId,
    summary: params.summary,
    parts: splitEvenly(params.summary.total, params.splitCount).map((amount, index) => ({ index, amount })),
    createdAt: params.at,
  };
}

/** A bill can be re-split or re-tipped only while no share has been paid. */
export function canRevise(bill: Bill): boolean {
  return bill.parts.every((p) => !p.payment);
}

export function payPart(bill: Bill, index: number, method: PaymentMethod, at: number): Bill {
  const part = bill.parts[index];
  if (!part) throw new Error(`No share ${index + 1} on this bill`);
  if (part.payment) throw new Error(`Share ${index + 1} is already paid`);
  return {
    ...bill,
    parts: bill.parts.map((p) => (p.index === index ? { ...p, payment: { method, at } } : p)),
  };
}

export function amountPaid(bill: Bill): Paise {
  return bill.parts.reduce((s, p) => s + (p.payment ? p.amount : 0), 0);
}

export function amountDue(bill: Bill): Paise {
  return bill.summary.total - amountPaid(bill);
}

export function isFullyPaid(bill: Bill): boolean {
  return bill.parts.every((p) => p.payment);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}
