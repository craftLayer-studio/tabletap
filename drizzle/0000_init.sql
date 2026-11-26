CREATE TABLE "bill_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"idx" integer NOT NULL,
	"amount_paise" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"session_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"discount_label" text,
	"tax_percent" double precision NOT NULL,
	"tax_paise" integer NOT NULL,
	"tip_percent" double precision NOT NULL,
	"tip_paise" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"split_count" integer NOT NULL,
	"receipt_email" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bills_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "item_allergens" (
	"item_id" text NOT NULL,
	"allergen" text NOT NULL,
	CONSTRAINT "item_allergens_item_id_allergen_pk" PRIMARY KEY("item_id","allergen")
);
--> statement-breakpoint
CREATE TABLE "item_variants" (
	"item_id" text NOT NULL,
	"id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"price_paise" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_variants_item_id_id_pk" PRIMARY KEY("item_id","id")
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"veg" boolean NOT NULL,
	"spice" integer DEFAULT 0 NOT NULL,
	"station" text NOT NULL,
	"prep_minutes" integer NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"photo_url" text,
	"deal_label" text,
	"deal_percent_off" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"name_snapshot" text NOT NULL,
	"variant_snapshot" text NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"qty" integer NOT NULL,
	"note" text,
	"station" text NOT NULL,
	"prep_minutes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"status" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"table_id" text NOT NULL,
	"session_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"bill_share_id" text NOT NULL,
	"method" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" text NOT NULL,
	"gateway" text DEFAULT 'simulated' NOT NULL,
	"gateway_ref" text,
	"confirmed_by" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"city" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"tax_percent" double precision NOT NULL,
	"upi_vpa" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"google_review_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"session_id" text NOT NULL,
	"table_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"routed_to" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reviews_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"table_id" text NOT NULL,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"table_id" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"coupon_id" text
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"label" text NOT NULL,
	"seats" integer NOT NULL,
	"qr_token" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tables_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
ALTER TABLE "bill_shares" ADD CONSTRAINT "bill_shares_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_allergens" ADD CONSTRAINT "item_allergens_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_variants" ADD CONSTRAINT "item_variants_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_events" ADD CONSTRAINT "order_status_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_share_id_bill_shares_id_fk" FOREIGN KEY ("bill_share_id") REFERENCES "public"."bill_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_shares_bill_idx" ON "bill_shares" USING btree ("bill_id","idx");--> statement-breakpoint
CREATE INDEX "menu_items_restaurant" ON "menu_items" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_status_events_order" ON "order_status_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_session" ON "orders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "orders_restaurant_status" ON "orders" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "otp_challenges_phone" ON "otp_challenges" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_success" ON "payments" USING btree ("bill_share_id") WHERE "payments"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "service_requests_session" ON "service_requests" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_restaurant_phone" ON "staff_users" USING btree ("restaurant_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_one_open" ON "table_sessions" USING btree ("table_id") WHERE "table_sessions"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "table_sessions_restaurant" ON "table_sessions" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "tables_restaurant" ON "tables" USING btree ("restaurant_id");