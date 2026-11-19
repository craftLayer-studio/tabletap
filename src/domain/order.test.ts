import { describe, expect, it } from "vitest";
import {
  canTransition,
  createOrder,
  estimatedReadyAt,
  formatElapsed,
  InvalidTransitionError,
  isTerminal,
  kitchenMinutes,
  minutesRemaining,
  ORDER_TRANSITIONS,
  transitionOrder,
  type OrderStatus,
} from "./order";
import { buildOrderItems } from "./cart";
import { testMenu } from "./test-fixtures";

function makeOrder(at = 0) {
  const built = buildOrderItems(testMenu, [
    { itemId: "paneer-tikka", variantId: "half", qty: 1 },
    { itemId: "dal", variantId: "regular", qty: 1 },
  ]);
  if (!built.ok) throw new Error("fixture");
  return createOrder({ id: "o1", restaurantId: "r", tableId: "t1", sessionId: "s1", items: built.items, at });
}

const ALL: OrderStatus[] = ["placed", "confirmed", "cooking", "ready", "served", "cancelled"];

describe("order state machine", () => {
  it("walks the happy path and records events", () => {
    let o = makeOrder(0);
    o = transitionOrder(o, "confirmed", 1);
    o = transitionOrder(o, "cooking", 2);
    o = transitionOrder(o, "ready", 3);
    o = transitionOrder(o, "served", 4);
    expect(o.status).toBe("served");
    expect(o.events.map((e) => e.status)).toEqual(["placed", "confirmed", "cooking", "ready", "served"]);
  });

  it("allows exactly the documented transitions", () => {
    const allowed = ALL.flatMap((from) => ALL.filter((to) => canTransition(from, to)).map((to) => `${from}>${to}`));
    expect(allowed).toEqual([
      "placed>confirmed",
      "placed>cancelled",
      "confirmed>cooking",
      "confirmed>cancelled",
      "cooking>ready",
      "cooking>cancelled",
      "ready>served",
    ]);
  });

  it("rejects skipping steps and leaving terminal states", () => {
    const o = makeOrder();
    expect(() => transitionOrder(o, "ready", 1)).toThrow(InvalidTransitionError);
    const served = ["confirmed", "cooking", "ready", "served"].reduce(
      (acc, s, i) => transitionOrder(acc, s as OrderStatus, i + 1),
      o,
    );
    expect(() => transitionOrder(served, "cancelled", 9)).toThrow(/served to cancelled/);
    expect(isTerminal("served")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(ORDER_TRANSITIONS.ready).not.toContain("cancelled");
  });

  it("does not mutate the original order", () => {
    const o = makeOrder();
    transitionOrder(o, "confirmed", 5);
    expect(o.status).toBe("placed");
    expect(o.events).toHaveLength(1);
  });

  it("refuses empty orders", () => {
    expect(() => createOrder({ id: "x", restaurantId: "r", tableId: "t", sessionId: "s", items: [], at: 0 })).toThrow();
  });
});

describe("timing", () => {
  it("uses the slowest item as kitchen time", () => {
    expect(kitchenMinutes(makeOrder().items)).toBe(15);
    expect(kitchenMinutes([])).toBe(0);
  });

  it("estimates ready time per status", () => {
    const min = 60_000;
    const placed = makeOrder(0);
    expect(estimatedReadyAt(placed)).toBe(17 * min);
    const confirmed = transitionOrder(placed, "confirmed", 1 * min);
    expect(estimatedReadyAt(confirmed)).toBe(16 * min);
    const cooking = transitionOrder(confirmed, "cooking", 3 * min);
    expect(estimatedReadyAt(cooking)).toBe(18 * min);
    expect(estimatedReadyAt(transitionOrder(cooking, "ready", 10 * min))).toBeUndefined();
  });

  it("formats remaining minutes and elapsed timers", () => {
    expect(minutesRemaining(10 * 60_000, 0)).toBe(10);
    expect(minutesRemaining(61_000, 0)).toBe(2);
    expect(minutesRemaining(0, 5000)).toBe(0);
    expect(formatElapsed(0, 65_000)).toBe("1:05");
    expect(formatElapsed(10_000, 0)).toBe("0:00");
  });
});
