CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"template" text NOT NULL,
	"audience" text NOT NULL,
	"offer_kind" text NOT NULL,
	"offer_value" integer NOT NULL,
	"detail" text,
	"recipients" integer NOT NULL,
	"skipped" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"notice_version" text NOT NULL,
	"channel" text NOT NULL,
	"session_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"label" text NOT NULL,
	"min_bill_paise" integer DEFAULT 0 NOT NULL,
	"max_discount_paise" integer,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"customer_id" text,
	"campaign_id" text,
	"won_session_id" text,
	"redeemed_session_id" text,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "coupons_redeemed_session_id_unique" UNIQUE("redeemed_session_id")
);
--> statement-breakpoint
CREATE TABLE "customer_visits" (
	"restaurant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"session_id" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customer_visits_customer_id_session_id_pk" PRIMARY KEY("customer_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"phone_e164" text NOT NULL,
	"name" text,
	"opt_out_token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customers_opt_out_token_unique" UNIQUE("opt_out_token")
);
--> statement-breakpoint
CREATE TABLE "game_plays" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"session_id" text NOT NULL,
	"customer_id" text,
	"game" text DEFAULT 'spin' NOT NULL,
	"prize_id" text NOT NULL,
	"coupon_id" text NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	CONSTRAINT "game_plays_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "loyalty_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"session_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"channel" text NOT NULL,
	"category" text NOT NULL,
	"to_phone" text NOT NULL,
	"customer_id" text,
	"campaign_id" text,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"adapter" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"kind" text NOT NULL,
	"review_id" text,
	"session_id" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_visits" ADD CONSTRAINT "customer_visits_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_ledger" ADD CONSTRAINT "loyalty_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_alerts" ADD CONSTRAINT "owner_alerts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_customer" ON "consent_records" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_restaurant_code" ON "coupons" USING btree ("restaurant_id","code");--> statement-breakpoint
CREATE INDEX "customer_visits_session" ON "customer_visits" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_restaurant_phone" ON "customers" USING btree ("restaurant_id","phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_once_per_visit" ON "loyalty_ledger" USING btree ("customer_id","session_id","reason");--> statement-breakpoint
CREATE INDEX "outbox_restaurant" ON "outbox" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "owner_alerts_restaurant" ON "owner_alerts" USING btree ("restaurant_id");