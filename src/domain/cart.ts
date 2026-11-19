import { findItem, findVariant, unitPrice, type Menu, type Station } from "./menu";
import type { Paise } from "./money";

export interface CartLine {
  itemId: string;
  variantId: string;
  qty: number;
  note?: string;
}

export type Cart = CartLine[];

export const MAX_QTY_PER_LINE = 20;
export const MAX_NOTE_LENGTH = 140;

function sameLine(a: CartLine, itemId: string, variantId: string, note?: string): boolean {
  return a.itemId === itemId && a.variantId === variantId && (a.note ?? "") === (note ?? "");
}

/** Add qty of an item variant. Lines with the same item, variant and note are merged. */
export function addToCart(cart: Cart, line: CartLine): Cart {
  if (!Number.isInteger(line.qty) || line.qty < 1) throw new Error("qty must be a positive integer");
  const note = line.note?.trim() || undefined;
  const existing = cart.find((l) => sameLine(l, line.itemId, line.variantId, note));
  if (existing) {
    return cart.map((l) =>
      l === existing ? { ...l, qty: Math.min(MAX_QTY_PER_LINE, l.qty + line.qty) } : l,
    );
  }
  return [...cart, { itemId: line.itemId, variantId: line.variantId, qty: Math.min(MAX_QTY_PER_LINE, line.qty), note }];
}

/** Set the qty of the line at index; qty 0 removes it. */
export function setLineQty(cart: Cart, index: number, qty: number): Cart {
  if (index < 0 || index >= cart.length) return cart;
  if (qty <= 0) return cart.filter((_, i) => i !== index);
  return cart.map((l, i) => (i === index ? { ...l, qty: Math.min(MAX_QTY_PER_LINE, Math.floor(qty)) } : l));
}

export function cartCount(cart: Cart): number {
  return cart.reduce((n, l) => n + l.qty, 0);
}

/** An order line with name and price frozen at order time, so later menu edits do not change past orders. */
export interface OrderItem {
  itemId: string;
  variantId: string;
  name: string;
  variantName: string;
  unitPrice: Paise;
  qty: number;
  note?: string;
  station: Station;
  prepMinutes: number;
}

export type BuildResult =
  | { ok: true; items: OrderItem[] }
  | { ok: false; errors: string[] };

/** Validate a cart against the menu and snapshot it into order items. */
export function buildOrderItems(menu: Menu, cart: Cart): BuildResult {
  const errors: string[] = [];
  if (cart.length === 0) errors.push("Cart is empty");
  const items: OrderItem[] = [];
  cart.forEach((line, i) => {
    const item = findItem(menu, line.itemId);
    if (!item) {
      errors.push(`Line ${i + 1}: unknown item ${line.itemId}`);
      return;
    }
    if (!item.available) {
      errors.push(`${item.name} is sold out`);
      return;
    }
    const variant = findVariant(item, line.variantId);
    if (!variant) {
      errors.push(`${item.name}: unknown size ${line.variantId}`);
      return;
    }
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY_PER_LINE) {
      errors.push(`${item.name}: quantity must be 1 to ${MAX_QTY_PER_LINE}`);
      return;
    }
    const note = line.note?.trim().slice(0, MAX_NOTE_LENGTH) || undefined;
    items.push({
      itemId: item.id,
      variantId: variant.id,
      name: item.name,
      variantName: variant.name,
      unitPrice: unitPrice(item, variant),
      qty: line.qty,
      note,
      station: item.station,
      prepMinutes: item.prepMinutes,
    });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, items };
}

export function itemsTotal(items: Pick<OrderItem, "unitPrice" | "qty">[]): Paise {
  return items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
}

/** Cart total using current menu prices; invalid lines count as zero. */
export function cartTotal(menu: Menu, cart: Cart): Paise {
  return cart.reduce((sum, line) => {
    const item = findItem(menu, line.itemId);
    const variant = item && findVariant(item, line.variantId);
    return item && variant ? sum + unitPrice(item, variant) * line.qty : sum;
  }, 0);
}
