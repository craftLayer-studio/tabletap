/**
 * DineLoop growth rules: consent, customer segments, loyalty stamps, coupons, the spin wheel,
 * the review funnel and campaign templates. Pure functions; the store persists the results.
 */
import { percentOf, formatINR, type Paise } from "./money";

// Consent (DPDP Act 2023) ------------------------------------------------------------------------------

/** Separate purposes, each opted into on its own, never pre-ticked. */
export type ConsentPurpose = "service" | "marketing";
export type ConsentChannel = "qr_web" | "staff" | "whatsapp" | "unsubscribe_link";

/** Bump when the notice text changes; each consent record stores the version the guest saw. */
export const CONSENT_NOTICE_VERSION = "2026-11-v1";

export const CONSENT_TEXT: Record<ConsentPurpose, string> = {
  service: "Send my bill and order updates on WhatsApp.",
  marketing: "Send me offers and news from this restaurant on WhatsApp. I can stop any time.",
};

export const CONSENT_NOTICE =
  "We use your mobile number only for the purposes you tick below, for this restaurant only. " +
  "We never sell or share it. You can withdraw consent at any time with the link in any message or by replying STOP.";

export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  at: number;
}

/** Latest decision per purpose. No record means no consent. */
export function currentConsent(records: ConsentRecord[]): Record<ConsentPurpose, boolean> {
  const latest = (p: ConsentPurpose) =>
    records.filter((r) => r.purpose === p).sort((a, b) => b.at - a.at)[0]?.granted ?? false;
  return { service: latest("service"), marketing: latest("marketing") };
}

// Customers ---------------------------------------------------------------------------------------------

export type Segment = "new" | "regular" | "lapsed";

export const SEGMENT_LABELS: Record<Segment, string> = {
  new: "New",
  regular: "Regular",
  lapsed: "Lapsed",
};

export const LAPSED_AFTER_DAYS = 30;
export const REGULAR_FROM_VISITS = 2;
const DAY_MS = 86_400_000;

/** A paid visit by a customer: when, and what share of the bill is attributed to them. */
export interface Visit {
  at: number;
  spend: Paise;
}

export interface CustomerStats {
  visits: number;
  spend: Paise;
  firstVisitAt?: number;
  lastVisitAt?: number;
}

export function customerStats(visits: Visit[]): CustomerStats {
  if (visits.length === 0) return { visits: 0, spend: 0 };
  const times = visits.map((v) => v.at);
  return {
    visits: visits.length,
    spend: visits.reduce((s, v) => s + v.spend, 0),
    firstVisitAt: Math.min(...times),
    lastVisitAt: Math.max(...times),
  };
}

/** Lapsed: no paid visit in 30 days. Regular: 2+ paid visits. New: everyone else (including no paid visit yet). */
export function segmentOf(stats: CustomerStats, now: number): Segment {
  if (stats.lastVisitAt !== undefined && now - stats.lastVisitAt > LAPSED_AFTER_DAYS * DAY_MS) return "lapsed";
  return stats.visits >= REGULAR_FROM_VISITS ? "regular" : "new";
}

/** Share of customers with at least one paid visit who came back at least once more. 0..1, undefined if none. */
export function repeatRate(stats: CustomerStats[]): number | undefined {
  const visited = stats.filter((s) => s.visits >= 1);
  if (visited.length === 0) return undefined;
  return visited.filter((s) => s.visits >= 2).length / visited.length;
}

// Loyalty stamps ----------------------------------------------------------------------------------------

/** One stamp per paid visit; a full card earns a reward coupon for the next visit. */
export const STAMPS_PER_CARD = 5;
export const STAMP_REWARD = { kind: "flat" as const, value: 15000, label: "Loyalty reward: ₹150 off" };

/** Stamps on the current card, given the total earned so far. */
export function stampsOnCard(totalStamps: number): number {
  return totalStamps % STAMPS_PER_CARD;
}

/** True when the stamp just earned completes a card. */
export function completesCard(totalStampsAfterEarn: number): boolean {
  return totalStampsAfterEarn > 0 && totalStampsAfterEarn % STAMPS_PER_CARD === 0;
}

// Coupons -----------------------------------------------------------------------------------------------

export type CouponKind = "percent" | "flat";
export type CouponSource = "game" | "loyalty" | "campaign";

export interface Coupon {
  code: string;
  kind: CouponKind;
  /** Percent (1-100) or paise. */
  value: number;
  label: string;
  minBill: Paise;
  /** Percent coupons are capped at this many paise off. */
  maxDiscount?: Paise;
  validFrom: number;
  validTo: number;
  /** The visit where it was won; it cannot be used on that same visit. */
  wonSessionId?: string;
  redeemedSessionId?: string;
}

export const COUPON_VALID_DAYS = 30;

/** Short human-friendly code without look-alike characters, e.g. "JK-7HQ4MX". */
export function couponCode(prefix: string, random: () => number): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  return `${prefix}-${out}`;
}

export type CouponCheck = { ok: true; discount: Paise } | { ok: false; reason: string };

/** Can this coupon be used on this visit, and for how much? */
export function checkCoupon(coupon: Coupon, ctx: { sessionId: string; subtotal: Paise; now: number }): CouponCheck {
  if (coupon.redeemedSessionId && coupon.redeemedSessionId !== ctx.sessionId) {
    return { ok: false, reason: "This coupon has already been used." };
  }
  if (coupon.wonSessionId === ctx.sessionId) return { ok: false, reason: "Coupons you win are for your next visit." };
  if (ctx.now < coupon.validFrom) return { ok: false, reason: "This coupon is not valid yet." };
  if (ctx.now > coupon.validTo) return { ok: false, reason: "This coupon has expired." };
  if (ctx.subtotal < coupon.minBill) {
    return { ok: false, reason: `Valid on bills of ${formatINR(coupon.minBill)} or more.` };
  }
  return { ok: true, discount: couponDiscount(coupon, ctx.subtotal) };
}

export function couponDiscount(coupon: Pick<Coupon, "kind" | "value" | "maxDiscount">, subtotal: Paise): Paise {
  const raw = coupon.kind === "percent" ? percentOf(subtotal, coupon.value) : coupon.value;
  const capped = coupon.maxDiscount !== undefined ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.max(0, Math.min(capped, subtotal));
}

// Spin the wheel ----------------------------------------------------------------------------------------

export interface WheelPrize {
  id: string;
  label: string;
  kind: CouponKind;
  value: number;
  minBill: Paise;
  maxDiscount?: Paise;
  /** Relative chance. */
  weight: number;
}

/** Every slice wins something modest, redeemable on the next visit. */
export const WHEEL_PRIZES: readonly WheelPrize[] = [
  { id: "p10", label: "10% off", kind: "percent", value: 10, minBill: 50000, maxDiscount: 20000, weight: 35 },
  { id: "f50", label: "₹50 off", kind: "flat", value: 5000, minBill: 40000, weight: 30 },
  { id: "f100", label: "₹100 off", kind: "flat", value: 10000, minBill: 80000, weight: 20 },
  { id: "p15", label: "15% off", kind: "percent", value: 15, minBill: 80000, maxDiscount: 30000, weight: 10 },
  { id: "f200", label: "₹200 off", kind: "flat", value: 20000, minBill: 150000, weight: 5 },
];

/** Pick a prize. `random` returns [0, 1); pass a seeded function in tests. */
export function spinWheel(random: () => number, prizes: readonly WheelPrize[] = WHEEL_PRIZES): WheelPrize {
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  let roll = random() * total;
  for (const p of prizes) {
    if (roll < p.weight) return p;
    roll -= p.weight;
  }
  return prizes[prizes.length - 1];
}

// Review funnel -----------------------------------------------------------------------------------------

export type ReviewRoute = "google" | "owner" | "none";

/** 4-5 stars: invite to post on Google (if the owner set a link). 1-3 stars: private alert to the owner. */
export function routeReview(rating: number, googleReviewUrl?: string | null): ReviewRoute {
  if (rating <= 3) return "owner";
  return googleReviewUrl ? "google" : "none";
}

export function isValidHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && value.length <= 300;
  } catch {
    return false;
  }
}

// Campaigns ---------------------------------------------------------------------------------------------

export type CampaignTemplate = "winback" | "weekday" | "new_dish" | "event";
export type CampaignAudience = "all" | Segment;

export const CAMPAIGN_TEMPLATES: Record<CampaignTemplate, { label: string; body: string; defaultAudience: CampaignAudience }> = {
  winback: {
    label: "We miss you (win-back)",
    body: "Hi {name}, it has been a while! Come back to {restaurant} this week and get {offer} with code {code}.",
    defaultAudience: "lapsed",
  },
  weekday: {
    label: "Weekday offer",
    body: "Hi {name}, quiet weekday? Enjoy {offer} at {restaurant}, Monday to Thursday. Show code {code} when you order.",
    defaultAudience: "all",
  },
  new_dish: {
    label: "New dish",
    body: "Hi {name}, something new on the menu at {restaurant}: {detail}. Try it with {offer}, code {code}.",
    defaultAudience: "regular",
  },
  event: {
    label: "Event",
    body: "Hi {name}, you are invited: {detail} at {restaurant}. Show code {code} for {offer}.",
    defaultAudience: "all",
  },
};

export const OPT_OUT_FOOTER = "Reply STOP or tap {optout} to stop offers.";

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (m, key: string) => vars[key] ?? m);
}

export function audienceMatches(audience: CampaignAudience, segment: Segment): boolean {
  return audience === "all" || audience === segment;
}
