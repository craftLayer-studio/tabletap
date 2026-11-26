/**
 * DineLoop growth use cases: consented phone capture, CRM, loyalty stamps, coupons, spin the wheel,
 * review funnel alerts, settings and WhatsApp campaigns (simulated adapter, marketing-consented customers only).
 */
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  audienceMatches,
  CAMPAIGN_TEMPLATES,
  checkCoupon,
  completesCard,
  computeBill,
  CONSENT_NOTICE_VERSION,
  COUPON_VALID_DAYS,
  couponCode,
  currentConsent,
  customerStats,
  formatINR,
  isFullyPaid,
  isValidHttpsUrl,
  maskPhone,
  normalizeIndianMobile,
  OPT_OUT_FOOTER,
  renderTemplate,
  repeatRate,
  segmentOf,
  spinWheel,
  splitEvenly,
  STAMP_REWARD,
  stampsOnCard,
  STAMPS_PER_CARD,
  startOfDay,
  WHEEL_PRIZES,
  type Bill,
  type CampaignAudience,
  type CampaignTemplate,
  type ConsentChannel,
  type ConsentPurpose,
  type Coupon,
  type CouponKind,
  type CouponSource,
  type CustomerStats,
  type Segment,
} from "@/domain";
import { getDb, schema as s, type DbOrTx, type Tx } from "../db/client";
import { messaging } from "../messaging";
import { StoreError } from "./errors";
import { loadBills, loadOrders, loadRestaurant, loadTable, newId, newToken, toDate, toMs, toSession } from "./repo";

const DAY = 86_400_000;
const rand = () => randomInt(0, 1_000_000) / 1_000_000;

type CouponRow = typeof s.coupons.$inferSelect;

export function toCoupon(row: CouponRow): Coupon {
  return {
    code: row.code,
    kind: row.kind,
    value: row.value,
    label: row.label,
    minBill: row.minBill,
    maxDiscount: row.maxDiscount ?? undefined,
    validFrom: toMs(row.validFrom),
    validTo: toMs(row.validTo),
    wonSessionId: row.wonSessionId ?? undefined,
    redeemedSessionId: row.redeemedSessionId ?? undefined,
  };
}

function codePrefix(restaurantName: string): string {
  const letters = restaurantName
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return (letters || "DL").slice(0, 3);
}

async function issueCoupon(
  db: DbOrTx,
  input: {
    restaurantId: string;
    prefix: string;
    kind: CouponKind;
    value: number;
    label: string;
    minBill: number;
    maxDiscount?: number;
    source: CouponSource;
    customerId?: string;
    campaignId?: string;
    wonSessionId?: string;
    now: number;
  },
): Promise<CouponRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db
      .insert(s.coupons)
      .values({
        id: newId("cpn"),
        restaurantId: input.restaurantId,
        code: couponCode(input.prefix, rand),
        kind: input.kind,
        value: input.value,
        label: input.label,
        minBill: input.minBill,
        maxDiscount: input.maxDiscount ?? null,
        validFrom: toDate(input.now),
        validTo: toDate(input.now + COUPON_VALID_DAYS * DAY),
        source: input.source,
        customerId: input.customerId ?? null,
        campaignId: input.campaignId ?? null,
        wonSessionId: input.wonSessionId ?? null,
        createdAt: toDate(input.now),
      })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
  }
  throw new Error("Could not issue a unique coupon code");
}

// Consent and phone capture ------------------------------------------------------------------------------

async function consentState(db: DbOrTx, customerId: string) {
  const rows = await db.select().from(s.consentRecords).where(eq(s.consentRecords.customerId, customerId));
  return currentConsent(rows.map((r) => ({ purpose: r.purpose, granted: r.granted, at: toMs(r.createdAt) })));
}

async function recordConsent(
  db: DbOrTx,
  input: { restaurantId: string; customerId: string; purpose: ConsentPurpose; granted: boolean; channel: ConsentChannel; sessionId?: string; now: number },
) {
  await db.insert(s.consentRecords).values({
    id: newId("con"),
    restaurantId: input.restaurantId,
    customerId: input.customerId,
    purpose: input.purpose,
    granted: input.granted,
    noticeVersion: CONSENT_NOTICE_VERSION,
    channel: input.channel,
    sessionId: input.sessionId ?? null,
    createdAt: toDate(input.now),
  });
}

/**
 * A guest gives their phone number at the table, with a separate yes/no for each purpose. Unticked boxes
 * never grant anything; unticking a purpose the guest had granted before records a withdrawal.
 */
export async function captureCustomer(
  tableId: string,
  sessionId: string,
  input: { phone: string; name?: string; consentService: boolean; consentMarketing: boolean },
  now = Date.now(),
): Promise<{ customerId: string }> {
  const phone = normalizeIndianMobile(input.phone);
  if (!phone) throw new StoreError(400, "Enter a 10-digit Indian mobile number.");
  const name = input.name?.trim().slice(0, 60) || undefined;
  const db = await getDb();
  return db.transaction(async (tx) => {
    const table = await loadTable(tx, tableId);
    const rid = table.restaurantId;
    const [sessionRow] = await tx
      .select()
      .from(s.tableSessions)
      .where(and(eq(s.tableSessions.id, sessionId), eq(s.tableSessions.tableId, table.id), eq(s.tableSessions.restaurantId, rid)));
    if (!sessionRow) throw new StoreError(404, "This table visit has ended. Scan the QR code again.");

    await tx
      .insert(s.customers)
      .values({ id: newId("cus"), restaurantId: rid, phone, name: name ?? null, optOutToken: newToken(), createdAt: toDate(now) })
      .onConflictDoNothing();
    const [customer] = await tx
      .select()
      .from(s.customers)
      .where(and(eq(s.customers.restaurantId, rid), eq(s.customers.phone, phone)));
    if (name && name !== customer.name) await tx.update(s.customers).set({ name }).where(eq(s.customers.id, customer.id));

    const before = await consentState(tx, customer.id);
    const wanted: Record<ConsentPurpose, boolean> = { service: input.consentService, marketing: input.consentMarketing };
    for (const purpose of ["service", "marketing"] as const) {
      if (wanted[purpose] !== before[purpose]) {
        await recordConsent(tx, { restaurantId: rid, customerId: customer.id, purpose, granted: wanted[purpose], channel: "qr_web", sessionId, now });
      }
    }
    await tx
      .insert(s.customerVisits)
      .values({ restaurantId: rid, customerId: customer.id, sessionId, linkedAt: toDate(now) })
      .onConflictDoNothing();
    // The spin-wheel prize of this visit belongs to the guest who now identified themselves.
    await tx
      .update(s.coupons)
      .set({ customerId: customer.id })
      .where(and(eq(s.coupons.restaurantId, rid), eq(s.coupons.wonSessionId, sessionId), isNull(s.coupons.customerId)));

    const bills = await loadBills(tx, rid, { sessionIds: [sessionId] });
    if (bills[0] && isFullyPaid(bills[0])) await onVisitPaid(tx, rid, sessionId, bills[0], now);
    return { customerId: customer.id };
  });
}

/** Opt out of marketing with the link in a message. Idempotent. */
export async function optOutByToken(token: string, now = Date.now()): Promise<{ restaurantName: string }> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new StoreError(404, "This link is not valid.");
  const db = await getDb();
  const [customer] = await db.select().from(s.customers).where(eq(s.customers.optOutToken, token));
  if (!customer) throw new StoreError(404, "This link is not valid.");
  const state = await consentState(db, customer.id);
  if (state.marketing) {
    await recordConsent(db, { restaurantId: customer.restaurantId, customerId: customer.id, purpose: "marketing", granted: false, channel: "unsubscribe_link", now });
  }
  const restaurant = await loadRestaurant(db, customer.restaurantId);
  return { restaurantName: restaurant.name };
}

/** Staff record a withdrawal, e.g. the guest replied STOP on WhatsApp or asked in person. */
export async function withdrawConsent(
  restaurantId: string,
  customerId: string,
  purpose: ConsentPurpose,
  channel: ConsentChannel,
  now = Date.now(),
): Promise<void> {
  const db = await getDb();
  const [customer] = await db
    .select({ id: s.customers.id })
    .from(s.customers)
    .where(and(eq(s.customers.id, customerId), eq(s.customers.restaurantId, restaurantId)));
  if (!customer) throw new StoreError(404, "Unknown customer");
  if ((await consentState(db, customerId))[purpose]) {
    await recordConsent(db, { restaurantId, customerId, purpose, granted: false, channel, now });
  }
}

// Paid visit: stamps, coupon redemption, bill message ----------------------------------------------------

/** Run once a visit's bill is fully paid (and again when a phone is added afterwards). Idempotent. */
export async function onVisitPaid(tx: Tx, restaurantId: string, sessionId: string, bill: Bill, now: number): Promise<void> {
  await tx
    .update(s.coupons)
    .set({ redeemedAt: toDate(now) })
    .where(and(eq(s.coupons.restaurantId, restaurantId), eq(s.coupons.redeemedSessionId, sessionId), isNull(s.coupons.redeemedAt)));

  const links = await tx
    .select({ customer: s.customers })
    .from(s.customerVisits)
    .innerJoin(s.customers, eq(s.customers.id, s.customerVisits.customerId))
    .where(and(eq(s.customerVisits.sessionId, sessionId), eq(s.customerVisits.restaurantId, restaurantId)));
  if (links.length === 0) return;
  const restaurant = await loadRestaurant(tx, restaurantId);

  for (const { customer } of links) {
    const earned = await tx
      .insert(s.loyaltyLedger)
      .values({ id: newId("loy"), restaurantId, customerId: customer.id, sessionId, delta: 1, reason: "earn", createdAt: toDate(now) })
      .onConflictDoNothing()
      .returning({ id: s.loyaltyLedger.id });
    if (earned.length === 0) continue; // already handled for this visit

    const earnRows = await tx
      .select({ delta: s.loyaltyLedger.delta })
      .from(s.loyaltyLedger)
      .where(and(eq(s.loyaltyLedger.customerId, customer.id), eq(s.loyaltyLedger.reason, "earn")));
    const totalEarned = earnRows.reduce((sum, r) => sum + r.delta, 0);
    if (completesCard(totalEarned)) {
      await issueCoupon(tx, {
        restaurantId,
        prefix: codePrefix(restaurant.name),
        kind: STAMP_REWARD.kind,
        value: STAMP_REWARD.value,
        label: STAMP_REWARD.label,
        minBill: 0,
        source: "loyalty",
        customerId: customer.id,
        wonSessionId: sessionId,
        now,
      });
      await tx.insert(s.loyaltyLedger).values({
        id: newId("loy"),
        restaurantId,
        customerId: customer.id,
        sessionId,
        delta: -STAMPS_PER_CARD,
        reason: "reward",
        createdAt: toDate(now),
      });
    }

    if ((await consentState(tx, customer.id)).service) {
      await messaging().send(tx, {
        restaurantId,
        toPhone: customer.phone,
        customerId: customer.id,
        category: "utility",
        body: `Thanks for visiting ${restaurant.name}. Your bill: ${formatINR(bill.summary.total)} paid. Stamps: ${stampsOnCard(totalEarned)}/${STAMPS_PER_CARD}.`,
        at: now,
      });
    }
  }
}

// Coupons at the table -----------------------------------------------------------------------------------

/** Attach a coupon code to the visit. The bill applies it when it is (re)prepared. */
export async function applyCoupon(tableId: string, sessionId: string, codeInput: string, now = Date.now()) {
  const code = codeInput.trim().toUpperCase();
  if (!/^[A-Z]{1,3}-[A-Z0-9]{6}$/.test(code)) throw new StoreError(400, "That code does not look right.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const table = await loadTable(tx, tableId);
    const rid = table.restaurantId;
    const [sessionRow] = await tx
      .select()
      .from(s.tableSessions)
      .where(and(eq(s.tableSessions.id, sessionId), eq(s.tableSessions.tableId, table.id)))
      .for("update");
    if (!sessionRow) throw new StoreError(404, "This table visit has ended. Scan the QR code again.");
    if (sessionRow.closedAt) throw new StoreError(409, "This table visit is already closed.");
    if (sessionRow.couponId) throw new StoreError(409, "A coupon is already applied to this visit.");
    const [row] = await tx
      .select()
      .from(s.coupons)
      .where(and(eq(s.coupons.restaurantId, rid), eq(s.coupons.code, code)))
      .for("update");
    if (!row) throw new StoreError(404, "We could not find that code.");
    // The subtotal comes from the visit's orders on the server, never from the guest.
    const orders = await loadOrders(tx, rid, { sessionIds: [sessionId] });
    const { subtotal } = computeBill(orders, { taxPercent: 0, tipPercent: 0 });
    const check = checkCoupon(toCoupon(row), { sessionId, subtotal, now });
    if (!check.ok) throw new StoreError(409, check.reason);
    await tx.update(s.coupons).set({ redeemedSessionId: sessionId }).where(eq(s.coupons.id, row.id));
    await tx.update(s.tableSessions).set({ couponId: row.id }).where(eq(s.tableSessions.id, sessionId));
    return { code: row.code, label: row.label };
  });
}

/** The coupon attached to a visit, if any, as a bill discount. Detaches it when it no longer applies. */
export async function visitDiscount(
  tx: Tx,
  restaurantId: string,
  sessionId: string,
  subtotal: number,
  now: number,
): Promise<{ amount: (subtotal: number) => number; label: string } | undefined> {
  const [sessionRow] = await tx.select().from(s.tableSessions).where(eq(s.tableSessions.id, sessionId));
  if (!sessionRow?.couponId) return undefined;
  const [row] = await tx
    .select()
    .from(s.coupons)
    .where(and(eq(s.coupons.id, sessionRow.couponId), eq(s.coupons.restaurantId, restaurantId)));
  const check = row ? checkCoupon(toCoupon(row), { sessionId, subtotal, now }) : undefined;
  if (!row || !check?.ok) {
    if (row) await tx.update(s.coupons).set({ redeemedSessionId: null }).where(eq(s.coupons.id, row.id));
    await tx.update(s.tableSessions).set({ couponId: null }).where(eq(s.tableSessions.id, sessionId));
    return undefined;
  }
  const discount = check.discount;
  return { amount: () => discount, label: `${row.label} (${row.code})` };
}

// Spin the wheel ----------------------------------------------------------------------------------------

export async function spinForVisit(tableId: string, sessionId: string, now = Date.now(), random: () => number = rand) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const table = await loadTable(tx, tableId);
    const rid = table.restaurantId;
    const [sessionRow] = await tx
      .select()
      .from(s.tableSessions)
      .where(and(eq(s.tableSessions.id, sessionId), eq(s.tableSessions.tableId, table.id)))
      .for("update");
    if (!sessionRow) throw new StoreError(404, "This table visit has ended. Scan the QR code again.");
    const bills = await loadBills(tx, rid, { sessionIds: [sessionId] });
    if (!bills[0] || !isFullyPaid(bills[0])) throw new StoreError(409, "The wheel opens after the bill is paid.");
    const [played] = await tx.select().from(s.gamePlays).where(eq(s.gamePlays.sessionId, sessionId));
    if (played) throw new StoreError(409, "You have already spun the wheel for this visit.");

    const prize = spinWheel(random);
    const restaurant = await loadRestaurant(tx, rid);
    const [link] = await tx
      .select({ customerId: s.customerVisits.customerId })
      .from(s.customerVisits)
      .where(eq(s.customerVisits.sessionId, sessionId))
      .orderBy(asc(s.customerVisits.linkedAt))
      .limit(1);
    const coupon = await issueCoupon(tx, {
      restaurantId: rid,
      prefix: codePrefix(restaurant.name),
      kind: prize.kind,
      value: prize.value,
      label: prize.label,
      minBill: prize.minBill,
      maxDiscount: prize.maxDiscount,
      source: "game",
      customerId: link?.customerId,
      wonSessionId: sessionId,
      now,
    });
    await tx.insert(s.gamePlays).values({
      id: newId("gam"),
      restaurantId: rid,
      sessionId,
      customerId: link?.customerId ?? null,
      prizeId: prize.id,
      couponId: coupon.id,
      playedAt: toDate(now),
    });
    return { prizeId: prize.id, label: prize.label, code: coupon.code, minBill: prize.minBill, validTo: toMs(coupon.validTo) };
  });
}

// Guest-facing growth state ----------------------------------------------------------------------------

export interface GuestGrowth {
  customer?: { name?: string; phoneMasked: string; consent: Record<ConsentPurpose, boolean>; stamps: number };
  coupon?: { code: string; label: string };
  spin?: { label: string; code: string; minBill: number; validTo: number };
  prizes: { id: string; label: string }[];
  stampsPerCard: number;
  googleReviewUrl?: string;
}

export async function guestGrowth(db: DbOrTx, restaurantId: string, sessionId: string): Promise<GuestGrowth> {
  const [links, sessionRows, play, restaurant] = await Promise.all([
    db
      .select({ customer: s.customers })
      .from(s.customerVisits)
      .innerJoin(s.customers, eq(s.customers.id, s.customerVisits.customerId))
      .where(and(eq(s.customerVisits.sessionId, sessionId), eq(s.customerVisits.restaurantId, restaurantId)))
      .orderBy(desc(s.customerVisits.linkedAt))
      .limit(1),
    db.select().from(s.tableSessions).where(eq(s.tableSessions.id, sessionId)),
    db
      .select({ coupon: s.coupons })
      .from(s.gamePlays)
      .innerJoin(s.coupons, eq(s.coupons.id, s.gamePlays.couponId))
      .where(eq(s.gamePlays.sessionId, sessionId)),
    loadRestaurant(db, restaurantId),
  ]);
  let customer: GuestGrowth["customer"];
  if (links[0]) {
    const c = links[0].customer;
    const ledger = await db.select({ delta: s.loyaltyLedger.delta, reason: s.loyaltyLedger.reason }).from(s.loyaltyLedger).where(eq(s.loyaltyLedger.customerId, c.id));
    const earned = ledger.filter((l) => l.reason === "earn").reduce((sum, l) => sum + l.delta, 0);
    customer = { name: c.name ?? undefined, phoneMasked: maskPhone(c.phone), consent: await consentState(db, c.id), stamps: stampsOnCard(earned) };
  }
  let coupon: GuestGrowth["coupon"];
  if (sessionRows[0]?.couponId) {
    const [row] = await db.select().from(s.coupons).where(eq(s.coupons.id, sessionRows[0].couponId));
    if (row) coupon = { code: row.code, label: row.label };
  }
  const won = play[0]?.coupon;
  return {
    customer,
    coupon,
    spin: won ? { label: won.label, code: won.code, minBill: won.minBill, validTo: toMs(won.validTo) } : undefined,
    prizes: WHEEL_PRIZES.map((p) => ({ id: p.id, label: p.label })),
    stampsPerCard: STAMPS_PER_CARD,
    googleReviewUrl: restaurant.googleReviewUrl,
  };
}

// CRM ---------------------------------------------------------------------------------------------------

export interface CustomerRow {
  id: string;
  name?: string;
  phone: string;
  createdAt: number;
  stats: CustomerStats;
  segment: Segment;
  consent: Record<ConsentPurpose, boolean>;
  stamps: number;
  openCoupons: number;
  optOutToken: string;
}

export async function listCustomers(restaurantId: string, now = Date.now()): Promise<CustomerRow[]> {
  const db = await getDb();
  const [customers, visits, consents, ledger, open] = await Promise.all([
    db.select().from(s.customers).where(eq(s.customers.restaurantId, restaurantId)).orderBy(desc(s.customers.createdAt)),
    db.select().from(s.customerVisits).where(eq(s.customerVisits.restaurantId, restaurantId)),
    db.select().from(s.consentRecords).where(eq(s.consentRecords.restaurantId, restaurantId)),
    db.select().from(s.loyaltyLedger).where(eq(s.loyaltyLedger.restaurantId, restaurantId)),
    db
      .select({ customerId: s.coupons.customerId, validTo: s.coupons.validTo })
      .from(s.coupons)
      .where(and(eq(s.coupons.restaurantId, restaurantId), isNull(s.coupons.redeemedSessionId), isNotNull(s.coupons.customerId))),
  ]);
  const sessionIds = [...new Set(visits.map((v) => v.sessionId))];
  const bills = (await loadBills(db, restaurantId, { sessionIds })).filter(isFullyPaid);
  const sessions = sessionIds.length
    ? (await db.select().from(s.tableSessions).where(inArray(s.tableSessions.id, sessionIds))).map(toSession)
    : [];
  // Each paid visit's total is split evenly between the customers linked to it.
  const spendBy = new Map<string, { at: number; spend: number }[]>();
  for (const bill of bills) {
    const linked = visits.filter((v) => v.sessionId === bill.sessionId).map((v) => v.customerId).sort();
    const shares = splitEvenly(bill.summary.total, Math.min(Math.max(linked.length, 1), 20));
    const at = sessions.find((x) => x.id === bill.sessionId)?.closedAt ?? bill.createdAt;
    linked.forEach((cid, i) => spendBy.set(cid, [...(spendBy.get(cid) ?? []), { at, spend: shares[i] ?? 0 }]));
  }
  return customers.map((c) => {
    const stats = customerStats(spendBy.get(c.id) ?? []);
    const earned = ledger.filter((l) => l.customerId === c.id && l.reason === "earn").reduce((sum, l) => sum + l.delta, 0);
    return {
      id: c.id,
      name: c.name ?? undefined,
      phone: c.phone,
      createdAt: toMs(c.createdAt),
      stats,
      segment: segmentOf(stats, now),
      consent: currentConsent(
        consents.filter((r) => r.customerId === c.id).map((r) => ({ purpose: r.purpose, granted: r.granted, at: toMs(r.createdAt) })),
      ),
      stamps: stampsOnCard(earned),
      openCoupons: open.filter((o) => o.customerId === c.id && toMs(o.validTo) >= now).length,
      optOutToken: c.optOutToken,
    };
  });
}

// Campaigns ---------------------------------------------------------------------------------------------

export interface CampaignInput {
  template: CampaignTemplate;
  audience: CampaignAudience;
  offerKind: CouponKind;
  /** Percent (5-50) or paise (₹20 to ₹1,000). */
  offerValue: number;
  detail?: string;
}

function validateCampaign(input: CampaignInput) {
  if (!(input.template in CAMPAIGN_TEMPLATES)) throw new StoreError(400, "Pick a template");
  if (!["all", "new", "regular", "lapsed"].includes(input.audience)) throw new StoreError(400, "Pick an audience");
  if (input.offerKind === "percent" && (!Number.isInteger(input.offerValue) || input.offerValue < 5 || input.offerValue > 50)) {
    throw new StoreError(400, "Percent offers must be 5 to 50");
  }
  if (input.offerKind === "flat" && (!Number.isInteger(input.offerValue) || input.offerValue < 2000 || input.offerValue > 100000)) {
    throw new StoreError(400, "Flat offers must be ₹20 to ₹1,000");
  }
  if ((input.detail ?? "").length > 120) throw new StoreError(400, "Detail must be at most 120 characters");
}

/**
 * Send a campaign through the messaging adapter. Only customers whose latest marketing consent is "granted"
 * and who match the audience receive it; each gets a personal coupon so redemptions can be counted.
 */
export async function sendCampaign(
  restaurantId: string,
  staffId: string,
  input: CampaignInput,
  appUrl: string,
  now = Date.now(),
): Promise<{ campaignId: string; recipients: number; skipped: number }> {
  validateCampaign(input);
  const customers = await listCustomers(restaurantId, now);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const restaurant = await loadRestaurant(tx, restaurantId);
    const template = CAMPAIGN_TEMPLATES[input.template];
    const inAudience = customers.filter((c) => audienceMatches(input.audience, c.segment));
    const recipients = inAudience.filter((c) => c.consent.marketing);
    const campaignId = newId("cmp");
    const offer = input.offerKind === "percent" ? `${input.offerValue}% off` : `${formatINR(input.offerValue)} off`;
    await tx.insert(s.campaigns).values({
      id: campaignId,
      restaurantId,
      name: template.label,
      template: input.template,
      audience: input.audience,
      offerKind: input.offerKind,
      offerValue: input.offerValue,
      detail: input.detail?.trim() || null,
      recipients: recipients.length,
      skipped: inAudience.length - recipients.length,
      createdBy: staffId,
      createdAt: toDate(now),
    });
    for (const c of recipients) {
      const coupon = await issueCoupon(tx, {
        restaurantId,
        prefix: codePrefix(restaurant.name),
        kind: input.offerKind,
        value: input.offerValue,
        label: `${template.label}: ${offer}`,
        minBill: 0,
        maxDiscount: input.offerKind === "percent" ? 50000 : undefined,
        source: "campaign",
        customerId: c.id,
        campaignId,
        now,
      });
      const body =
        renderTemplate(template.body, {
          name: c.name?.split(" ")[0] ?? "there",
          restaurant: restaurant.name,
          offer,
          code: coupon.code,
          detail: input.detail?.trim() || "something special",
        }) +
        " " +
        renderTemplate(OPT_OUT_FOOTER, { optout: `${appUrl}/u/${c.optOutToken}` });
      await messaging().send(tx, { restaurantId, toPhone: c.phone, customerId: c.id, campaignId, category: "marketing", body, at: now });
    }
    return { campaignId, recipients: recipients.length, skipped: inAudience.length - recipients.length };
  });
}

export interface CampaignResult {
  id: string;
  name: string;
  audience: string;
  createdAt: number;
  recipients: number;
  skipped: number;
  redeemed: number;
  /** Total of paid bills where a campaign coupon was used. */
  revenue: number;
}

export async function campaignResults(restaurantId: string): Promise<CampaignResult[]> {
  const db = await getDb();
  const rows = await db.select().from(s.campaigns).where(eq(s.campaigns.restaurantId, restaurantId)).orderBy(desc(s.campaigns.createdAt));
  if (rows.length === 0) return [];
  const used = await db
    .select({ campaignId: s.coupons.campaignId, sessionId: s.coupons.redeemedSessionId })
    .from(s.coupons)
    .where(and(eq(s.coupons.restaurantId, restaurantId), inArray(s.coupons.campaignId, rows.map((r) => r.id)), isNotNull(s.coupons.redeemedAt)));
  const bills = await loadBills(db, restaurantId, { sessionIds: used.map((u) => u.sessionId!).filter(Boolean) });
  return rows.map((r) => {
    const mine = used.filter((u) => u.campaignId === r.id);
    return {
      id: r.id,
      name: r.name,
      audience: r.audience,
      createdAt: toMs(r.createdAt),
      recipients: r.recipients,
      skipped: r.skipped,
      redeemed: mine.length,
      revenue: mine.reduce((sum, u) => sum + (bills.find((b) => b.sessionId === u.sessionId)?.summary.total ?? 0), 0),
    };
  });
}

export async function listOutbox(restaurantId: string, limit = 50) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.outbox)
    .where(eq(s.outbox.restaurantId, restaurantId))
    .orderBy(desc(s.outbox.createdAt), desc(s.outbox.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    to: maskPhone(r.toPhone),
    body: r.body,
    status: r.status,
    adapter: r.adapter,
    at: toMs(r.createdAt),
  }));
}

// Review alerts and settings ------------------------------------------------------------------------------

export async function listAlerts(restaurantId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.ownerAlerts)
    .where(and(eq(s.ownerAlerts.restaurantId, restaurantId), isNull(s.ownerAlerts.resolvedAt)))
    .orderBy(desc(s.ownerAlerts.createdAt));
  return rows.map((r) => ({ id: r.id, kind: r.kind, message: r.message, at: toMs(r.createdAt) }));
}

export async function resolveAlert(restaurantId: string, alertId: string, staffId: string, now = Date.now()) {
  const db = await getDb();
  const res = await db
    .update(s.ownerAlerts)
    .set({ resolvedAt: toDate(now), resolvedBy: staffId })
    .where(and(eq(s.ownerAlerts.id, alertId), eq(s.ownerAlerts.restaurantId, restaurantId)))
    .returning({ id: s.ownerAlerts.id });
  if (res.length === 0) throw new StoreError(404, "Unknown alert");
}

export async function updateSettings(restaurantId: string, input: { googleReviewUrl?: string | null }) {
  const url = input.googleReviewUrl?.trim() || null;
  if (url && !isValidHttpsUrl(url)) throw new StoreError(400, "The review link must be an https:// address.");
  const db = await getDb();
  await db.update(s.restaurants).set({ googleReviewUrl: url }).where(eq(s.restaurants.id, restaurantId));
}

/** Owner dashboard card: customers, consent, repeat rate and campaign results. */
export async function growthSummary(restaurantId: string, now = Date.now()) {
  const [customers, campaigns, alerts] = await Promise.all([
    listCustomers(restaurantId, now),
    campaignResults(restaurantId),
    listAlerts(restaurantId),
  ]);
  const since = startOfDay(now);
  const bySegment = { new: 0, regular: 0, lapsed: 0 } as Record<Segment, number>;
  for (const c of customers) bySegment[c.segment] += 1;
  return {
    customers: customers.length,
    capturedToday: customers.filter((c) => c.createdAt >= since).length,
    marketingOptIns: customers.filter((c) => c.consent.marketing).length,
    repeatRate: repeatRate(customers.map((c) => c.stats)),
    bySegment,
    campaigns: campaigns.slice(0, 5),
    campaignRevenue: campaigns.reduce((sum, c) => sum + c.revenue, 0),
    campaignRedemptions: campaigns.reduce((sum, c) => sum + c.redeemed, 0),
    openAlerts: alerts,
  };
}

export type GrowthSummary = Awaited<ReturnType<typeof growthSummary>>;
