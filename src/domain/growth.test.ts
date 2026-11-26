import { describe, expect, it } from "vitest";
import {
  checkCoupon,
  completesCard,
  couponCode,
  couponDiscount,
  currentConsent,
  customerStats,
  renderTemplate,
  repeatRate,
  routeReview,
  segmentOf,
  spinWheel,
  stampsOnCard,
  WHEEL_PRIZES,
  type Coupon,
} from "./growth";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 19, 8, 0);

describe("consent", () => {
  it("uses the latest record per purpose and defaults to no consent", () => {
    expect(currentConsent([])).toEqual({ service: false, marketing: false });
    expect(
      currentConsent([
        { purpose: "marketing", granted: true, at: 1 },
        { purpose: "service", granted: true, at: 1 },
        { purpose: "marketing", granted: false, at: 2 },
      ]),
    ).toEqual({ service: true, marketing: false });
  });
});

describe("customers", () => {
  it("computes stats, segments and repeat rate", () => {
    const one = customerStats([{ at: NOW - DAY, spend: 50000 }]);
    const two = customerStats([
      { at: NOW - 20 * DAY, spend: 40000 },
      { at: NOW - 2 * DAY, spend: 60000 },
    ]);
    const old = customerStats([
      { at: NOW - 90 * DAY, spend: 30000 },
      { at: NOW - 45 * DAY, spend: 30000 },
    ]);
    expect(two).toEqual({ visits: 2, spend: 100000, firstVisitAt: NOW - 20 * DAY, lastVisitAt: NOW - 2 * DAY });
    expect(segmentOf(one, NOW)).toBe("new");
    expect(segmentOf(two, NOW)).toBe("regular");
    expect(segmentOf(old, NOW)).toBe("lapsed");
    expect(segmentOf(customerStats([]), NOW)).toBe("new");
    expect(repeatRate([one, two, old, customerStats([])])).toBeCloseTo(2 / 3);
    expect(repeatRate([])).toBeUndefined();
  });
});

describe("loyalty", () => {
  it("fills a card every five stamps", () => {
    expect(stampsOnCard(7)).toBe(2);
    expect(completesCard(5)).toBe(true);
    expect(completesCard(6)).toBe(false);
    expect(completesCard(0)).toBe(false);
  });
});

describe("coupons", () => {
  const coupon: Coupon = {
    code: "JK-ABCDEF",
    kind: "percent",
    value: 10,
    label: "10% off",
    minBill: 50000,
    maxDiscount: 20000,
    validFrom: NOW - DAY,
    validTo: NOW + DAY,
    wonSessionId: "ses_won",
  };

  it("computes capped discounts", () => {
    expect(couponDiscount(coupon, 100000)).toBe(10000);
    expect(couponDiscount(coupon, 500000)).toBe(20000);
    expect(couponDiscount({ kind: "flat", value: 20000 }, 15000)).toBe(15000);
  });

  it("is for the next visit only, once, within dates and above the minimum", () => {
    const ctx = { sessionId: "ses_next", subtotal: 60000, now: NOW };
    expect(checkCoupon(coupon, ctx)).toEqual({ ok: true, discount: 6000 });
    expect(checkCoupon(coupon, { ...ctx, sessionId: "ses_won" }).ok).toBe(false);
    expect(checkCoupon(coupon, { ...ctx, subtotal: 40000 })).toEqual({ ok: false, reason: "Valid on bills of ₹500 or more." });
    expect(checkCoupon(coupon, { ...ctx, now: NOW + 2 * DAY }).ok).toBe(false);
    expect(checkCoupon({ ...coupon, redeemedSessionId: "ses_other" }, ctx).ok).toBe(false);
    expect(checkCoupon({ ...coupon, redeemedSessionId: "ses_next" }, ctx).ok).toBe(true);
  });

  it("makes readable codes", () => {
    expect(couponCode("JK", () => 0)).toBe("JK-AAAAAA");
    expect(couponCode("JK", () => 0.999)).toMatch(/^JK-[A-Z2-9]{6}$/);
  });
});

describe("spin wheel", () => {
  it("picks prizes by weight", () => {
    expect(spinWheel(() => 0).id).toBe("p10");
    expect(spinWheel(() => 0.36).id).toBe("f50");
    expect(spinWheel(() => 0.999).id).toBe("f200");
    const counts = new Map<string, number>();
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 10_000; i++) {
      const p = spinWheel(rand).id;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    expect(counts.get("p10")! / 10_000).toBeCloseTo(0.35, 1);
    expect(WHEEL_PRIZES.every((p) => counts.has(p.id))).toBe(true);
  });
});

describe("review funnel and templates", () => {
  it("routes by rating", () => {
    expect(routeReview(5, "https://g.page/r/demo/review")).toBe("google");
    expect(routeReview(4, undefined)).toBe("none");
    expect(routeReview(3, "https://g.page/r/demo/review")).toBe("owner");
    expect(routeReview(1, null)).toBe("owner");
  });

  it("fills template variables and leaves unknown ones", () => {
    expect(renderTemplate("Hi {name}, code {code} {x}", { name: "Priya", code: "JK-1" })).toBe("Hi Priya, code JK-1 {x}");
  });
});
