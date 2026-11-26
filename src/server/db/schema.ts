/**
 * Postgres schema (Drizzle). Follows PLAN.md section 5. Every tenant row carries `restaurant_id`
 * and every query in the store filters by it. Money is integer paise; times are UTC timestamptz.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const restaurants = pgTable("restaurants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  city: text("city").notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  taxPercent: doublePrecision("tax_percent").notNull(),
  upiVpa: text("upi_vpa").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  googleReviewUrl: text("google_review_url"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const staffUsers = pgTable(
  "staff_users",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    role: text("role").$type<"owner" | "manager" | "waiter" | "kitchen">().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("staff_users_restaurant_phone").on(t.restaurantId, t.phone)],
);

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: ts("consumed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("otp_challenges_phone").on(t.phone)],
);

export const tables = pgTable(
  "tables",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    seats: integer("seats").notNull(),
    qrToken: text("qr_token").notNull().unique(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("tables_restaurant").on(t.restaurantId)],
);

export const tableSessions = pgTable(
  "table_sessions",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    openedAt: ts("opened_at").notNull(),
    closedAt: ts("closed_at"),
    /** Coupon applied to this visit's bill, if any. */
    couponId: text("coupon_id"),
  },
  (t) => [
    // A table has at most one open session.
    uniqueIndex("table_sessions_one_open").on(t.tableId).where(sql`${t.closedAt} is null`),
    index("table_sessions_restaurant").on(t.restaurantId),
  ],
);

export const menuCategories = pgTable("menu_categories", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const menuItems = pgTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => menuCategories.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    veg: boolean("veg").notNull(),
    spice: integer("spice").notNull().default(0),
    station: text("station").notNull(),
    prepMinutes: integer("prep_minutes").notNull(),
    available: boolean("available").notNull().default(true),
    photoUrl: text("photo_url"),
    dealLabel: text("deal_label"),
    dealPercentOff: integer("deal_percent_off"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("menu_items_restaurant").on(t.restaurantId)],
);

export const itemVariants = pgTable(
  "item_variants",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    pricePaise: integer("price_paise").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.id] })],
);

export const itemAllergens = pgTable(
  "item_allergens",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    allergen: text("allergen").notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.allergen] })],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => tableSessions.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("orders_session").on(t.sessionId), index("orders_restaurant_status").on(t.restaurantId, t.status)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    lineNo: integer("line_no").notNull(),
    // No foreign key to menu_items: lines are snapshots and survive menu edits and deletes.
    itemId: text("item_id").notNull(),
    variantId: text("variant_id").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    variantSnapshot: text("variant_snapshot").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    qty: integer("qty").notNull(),
    note: text("note"),
    station: text("station").notNull(),
    prepMinutes: integer("prep_minutes").notNull(),
  },
  (t) => [index("order_items_order").on(t.orderId)],
);

export const orderStatusEvents = pgTable(
  "order_status_events",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    at: ts("at").notNull(),
    /** "guest", "system" or a staff user id. */
    actor: text("actor").notNull(),
  },
  (t) => [index("order_status_events_order").on(t.orderId)],
);

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => tableSessions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: ts("created_at").notNull(),
    resolvedAt: ts("resolved_at"),
    resolvedBy: text("resolved_by"),
  },
  (t) => [index("service_requests_session").on(t.sessionId)],
);

export interface BillLineJson {
  name: string;
  variantName: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export const bills = pgTable("bills", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  sessionId: text("session_id")
    .notNull()
    .unique()
    .references(() => tableSessions.id, { onDelete: "cascade" }),
  lines: jsonb("lines").$type<BillLineJson[]>().notNull(),
  subtotal: integer("subtotal_paise").notNull(),
  discount: integer("discount_paise").notNull().default(0),
  discountLabel: text("discount_label"),
  taxPercent: doublePrecision("tax_percent").notNull(),
  tax: integer("tax_paise").notNull(),
  tipPercent: doublePrecision("tip_percent").notNull(),
  tip: integer("tip_paise").notNull(),
  total: integer("total_paise").notNull(),
  splitCount: integer("split_count").notNull(),
  receiptEmail: text("receipt_email"),
  createdAt: ts("created_at").notNull(),
});

export const billShares = pgTable(
  "bill_shares",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    index: integer("idx").notNull(),
    amount: integer("amount_paise").notNull(),
  },
  (t) => [uniqueIndex("bill_shares_bill_idx").on(t.billId, t.index)],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    billShareId: text("bill_share_id")
      .notNull()
      .references(() => billShares.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    amount: integer("amount_paise").notNull(),
    status: text("status").notNull(),
    gateway: text("gateway").notNull().default("simulated"),
    gatewayRef: text("gateway_ref"),
    confirmedBy: text("confirmed_by"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [
    // At most one successful payment per share.
    uniqueIndex("payments_one_success").on(t.billShareId).where(sql`${t.status} = 'succeeded'`),
  ],
);

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  sessionId: text("session_id")
    .notNull()
    .unique()
    .references(() => tableSessions.id, { onDelete: "cascade" }),
  tableId: text("table_id")
    .notNull()
    .references(() => tables.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  /** Where the review funnel sent the guest: google (4-5 stars with a link set), owner (1-3) or none. */
  routedTo: text("routed_to").notNull().default("none"),
  createdAt: ts("created_at").notNull(),
});

// DineLoop growth layer ------------------------------------------------------------------------------

/** A guest who gave their phone number at one restaurant. Never shared across restaurants. */
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    phone: text("phone_e164").notNull(),
    name: text("name"),
    /** Random token for the one-tap opt-out link in messages. */
    optOutToken: text("opt_out_token").notNull().unique(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("customers_restaurant_phone").on(t.restaurantId, t.phone)],
);

/** Append-only consent ledger (DPDP): one row per decision, per purpose. The latest row wins. */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<"service" | "marketing">().notNull(),
    granted: boolean("granted").notNull(),
    noticeVersion: text("notice_version").notNull(),
    channel: text("channel").notNull(),
    sessionId: text("session_id"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("consent_records_customer").on(t.customerId)],
);

/** Links a visit (table session) to a customer. */
export const customerVisits = pgTable(
  "customer_visits",
  {
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => tableSessions.id, { onDelete: "cascade" }),
    linkedAt: ts("linked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.sessionId] }), index("customer_visits_session").on(t.sessionId)],
);

/** Loyalty stamps: +1 per paid visit (unique per visit), -STAMPS_PER_CARD when a card is turned into a reward. */
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").$type<"earn" | "reward">().notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("loyalty_once_per_visit").on(t.customerId, t.sessionId, t.reason)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    kind: text("kind").$type<"percent" | "flat">().notNull(),
    value: integer("value").notNull(),
    label: text("label").notNull(),
    minBill: integer("min_bill_paise").notNull().default(0),
    maxDiscount: integer("max_discount_paise"),
    validFrom: ts("valid_from").notNull(),
    validTo: ts("valid_to").notNull(),
    source: text("source").$type<"game" | "loyalty" | "campaign">().notNull(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    campaignId: text("campaign_id"),
    wonSessionId: text("won_session_id"),
    redeemedSessionId: text("redeemed_session_id").unique(),
    redeemedAt: ts("redeemed_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("coupons_restaurant_code").on(t.restaurantId, t.code)],
);

/** One spin of the wheel per paid visit. */
export const gamePlays = pgTable("game_plays", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  sessionId: text("session_id")
    .notNull()
    .unique()
    .references(() => tableSessions.id, { onDelete: "cascade" }),
  customerId: text("customer_id"),
  game: text("game").notNull().default("spin"),
  prizeId: text("prize_id").notNull(),
  couponId: text("coupon_id").notNull(),
  playedAt: ts("played_at").notNull(),
});

/** Private alerts for the owner, e.g. a 1-3 star review to follow up. */
export const ownerAlerts = pgTable(
  "owner_alerts",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    reviewId: text("review_id"),
    sessionId: text("session_id"),
    message: text("message").notNull(),
    createdAt: ts("created_at").notNull(),
    resolvedAt: ts("resolved_at"),
    resolvedBy: text("resolved_by"),
  },
  (t) => [index("owner_alerts_restaurant").on(t.restaurantId)],
);

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  template: text("template").notNull(),
  audience: text("audience").notNull(),
  offerKind: text("offer_kind").$type<"percent" | "flat">().notNull(),
  offerValue: integer("offer_value").notNull(),
  detail: text("detail"),
  recipients: integer("recipients").notNull(),
  skipped: integer("skipped").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: ts("created_at").notNull(),
});

/** Messages "sent" by the simulated WhatsApp adapter. Nothing leaves the server. */
export const outbox = pgTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    category: text("category").$type<"marketing" | "utility">().notNull(),
    toPhone: text("to_phone").notNull(),
    customerId: text("customer_id"),
    campaignId: text("campaign_id"),
    body: text("body").notNull(),
    status: text("status").notNull(),
    adapter: text("adapter").notNull(),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("outbox_restaurant").on(t.restaurantId)],
);
