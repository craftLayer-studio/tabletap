# TableTap plan

TableTap is a QR-at-the-table ordering and payment system for Indian restaurants and cafes. Guests scan a code on the table, order from their own phone, follow their food, call a waiter, split the bill and pay at the table. Staff, kitchen and owner each get a live screen.

This document is the plan. The repository holds the MVP: M0, most of M1 and the DineLoop growth P0 (see [README.md](README.md)).

Nothing here claims customers, revenue, traction or market size. We have none yet. Numbers below are either computed by the prototype or explicitly marked as hypotheses.

## 1. Problem

The idea comes from a competitor's short video showing a QR table-ordering system. The flow it shows is the right one; our job is to deliver it better for Indian outlets. The everyday problems it targets:

- Guests wait to get a menu, wait to order, wait to ask for anything, and wait again for the bill.
- Paper menus cannot say clearly what is in a dish (allergens, spice, veg/non-veg) or show today's deals, and they go stale.
- Waiters carry orders to the kitchen by hand; tickets get lost or misread; nobody knows how long a table has been waiting.
- Splitting a bill between friends, adding a tip and paying by UPI at the table is clumsy.
- Owners see the day's numbers only after closing, if at all.

What "better" should mean for us (hypotheses to test in the pilot, not facts):

- Works on cheap Android phones and slow mobile data: small pages, no app install, no login for guests.
- UPI-first payment with the amount pre-filled, plus cash, card and bank transfer.
- Staff stay in control: guest orders are confirmed by staff before the kitchen sees them, which limits prank orders and lets staff upsell.
- Simple pricing that a small cafe can afford (see section 13).

## 2. Users

| User | Device | Needs |
| --- | --- | --- |
| Guest | Own phone, browser | See the menu with details, order, follow status, call staff, split and pay, review |
| Waiter / floor staff | Shared tablet or own phone | See every table's state, confirm orders, answer calls, serve, take cash |
| Kitchen | Wall-mounted screen or tablet per station | See what to cook now, by station, with timers; mark ready |
| Owner / manager | Phone or laptop | Today's tables, orders, sales, tips, ratings; edit menu and prices (M1) |

## 3. Features mapped to the flow

| # | Step from the reel | Feature | M0 prototype | Later |
| --- | --- | --- | --- | --- |
| 1 | Scan table QR, menu opens, no app | `/t/{tableId}` web page; first scan opens a table visit (session) | Yes (link per table; no QR image yet) | Printable QR sheet per table, signed table tokens (M1) |
| 2 | Full menu with details | Categories, photo placeholder, price, half/full variants, allergens, spice level, veg mark, deals, sold out, veg-only and allergen filters | Yes | Real photos, Hindi and English text, item options (extra cheese), time-based deals (M1/M3) |
| 3 | Guests order; staff confirm and send to kitchen in one tap | Cart with notes; order `placed`; staff "Send to kitchen" moves it to `confirmed` | Yes | Auto-confirm option per restaurant (M3) |
| 4 | Kitchen display by station with timers | `/kitchen`: columns per station, elapsed timer, late highlight, start cooking, mark ready | Yes, status per order | Per-item status per station, bump bar / keyboard, sound alerts (M1/M3) |
| 5 | Live status and estimated time | Status steps and "ready in about N min" from the slowest item's prep time | Yes | Estimates that learn from real kitchen times (after M3) |
| 6 | Call waiter | Button on the guest page; deduplicated open request; staff "Done" | Yes | Push/sound notification to staff phones (M1) |
| 7 | Live floor map | Derived table state: free, ordering, eating, needs help, bill requested | Yes | Drag-and-drop floor layout (later) |
| 8 | Split, tip, pay at table, receipt by email | Tip presets, even split with exact paise rounding, pay share by share by UPI, card, cash or bank transfer; receipt email captured | Simulated: shares are marked paid on tap; UPI deep link generated; no email sent | Payment gateway and webhooks (M2), staff-confirmed cash, real email receipts (M2) |
| 9 | One-tap review after paying | 1 to 5 stars plus optional comment, once per visit | Yes | Optional hand-off to the restaurant's public review page (M3) |
| 10 | Owner overview | `/owner`: tables in use, orders, items sold, money collected, tips, rating, top dishes, latest reviews, since IST midnight | Yes | Date ranges, exports, GST reports (after M3) |

## 4. MVP scope (what the pilot needs) vs later

MVP for a real pilot (M1 to M3):

- One restaurant account, many tables, one menu with categories, variants, allergens, spice, deals, availability toggle.
- Guest ordering, staff confirmation, kitchen display, live status, call waiter, floor map.
- Bill with GST, tip, even split, UPI collection through a gateway, cash marked by staff, email receipts.
- Reviews and the owner's day view.
- Staff logins with roles. Data in Postgres. Basic audit trail (order status events already exist).

Later (not in MVP):

- Hindi UI and Hindi menu text (planned right after the pilot; strings are already kept in label maps).
- Itemised split ("I had the biryani"), custom split amounts.
- Item modifiers, combos, inventory, printers (KOT printers), POS integrations, aggregator (Swiggy/Zomato) sync.
- Multiple outlets per brand, loyalty, offers engine, analytics beyond the day view.
- Native apps. The web app should stay good enough that guests never need one.

## 5. Data model

All money is integer paise. Every row that belongs to a restaurant carries `restaurant_id` (see multi-tenancy). Times are UTC timestamps; each restaurant has a time zone (default `Asia/Kolkata`).

```
restaurants      id, name, slug, city, timezone, tax_percent, upi_vpa, created_at
staff_users      id, restaurant_id, name, phone/email, role (owner|manager|waiter|kitchen), password_hash or OTP identity
tables           id, restaurant_id, label, seats, qr_token (random, rotatable), active
table_sessions   id, restaurant_id, table_id, opened_at, closed_at          -- one guest visit
menu_categories  id, restaurant_id, name, sort_order
menu_items       id, restaurant_id, category_id, name, description, veg, spice (0-3),
                 station, prep_minutes, available, photo_url, deal_label, deal_percent_off
item_variants    id, item_id, name (Half/Full/Regular), price_paise, sort_order
item_allergens   item_id, allergen (enum: gluten, dairy, nuts, peanuts, soy, egg, shellfish, fish, sesame, mustard)
orders           id, restaurant_id, table_id, session_id, status, created_at
order_items      id, order_id, item_id, variant_id, name_snapshot, variant_snapshot,
                 unit_price_paise, qty, note, station, prep_minutes
order_status_events  id, order_id, status, at, actor (guest|staff_user_id|system)
service_requests id, restaurant_id, table_id, session_id, kind (waiter|bill), created_at, resolved_at, resolved_by
bills            id, restaurant_id, session_id, subtotal, tax_percent, tax, tip_percent, tip, total,
                 split_count, receipt_email, created_at
bill_shares      id, bill_id, index, amount_paise
payments         id, restaurant_id, bill_share_id, method (upi|card|cash|bank_transfer), amount_paise,
                 status (pending|succeeded|failed|refunded), gateway, gateway_ref, confirmed_by, created_at
reviews          id, restaurant_id, session_id, table_id, rating (1-5), comment, created_at
```

Notes:

- Order items snapshot name and price, so editing the menu never changes past bills. The prototype already does this (`src/domain/cart.ts`).
- The bill is computed from the session's non-cancelled orders. Once any share is paid the bill is locked; new items after that go on a new bill (M1 decision; the prototype simply refuses new orders after payment starts).
- `payments` is separate from `bill_shares` so a failed UPI attempt and a later cash payment are both recorded.

The TypeScript types in `src/domain/` are the source for these tables.

## 6. Order state machine

```
placed ──confirm──▶ confirmed ──start──▶ cooking ──ready──▶ ready ──serve──▶ served
   │                    │                   │
   └──cancel──▶ cancelled ◀──cancel─────────┘ (and from confirmed)
```

| From | Allowed to | Who |
| --- | --- | --- |
| placed | confirmed, cancelled | staff |
| confirmed | cooking, cancelled | kitchen / staff |
| cooking | ready, cancelled | kitchen / staff |
| ready | served | staff |
| served | (none) | |
| cancelled | (none) | |

Every transition appends an `order_status_events` row. Implemented and tested in `src/domain/order.ts`. In M1 the server also checks the actor's role for each transition.

Table state on the floor map is derived, never stored: no open session is free; an open waiter call is needs help; a bill request or an unpaid bill is bill requested; any served order is eating; otherwise ordering (`src/domain/table.ts`).

## 7. Realtime approach

- M0 (this repo): every screen polls a JSON endpoint every 2.5 s (owner every 5 s) and pauses while the tab is hidden. Simple and good enough for a demo on one machine.
- M1 (deferred, screens still poll): Postgres plus server-sent events (SSE). Each mutation writes the change and publishes an event on a per-restaurant channel (Postgres `LISTEN/NOTIFY` to start; a hosted pub/sub only if we outgrow it). Staff and kitchen screens hold one SSE connection; guest pages subscribe to their own session only. Clients still refetch on reconnect, so a missed event never leaves a screen stale.
- Why SSE over WebSockets: updates flow server to client; writes are normal HTTP POSTs. SSE works through most proxies and is simpler to host.

## 8. Multi-tenancy

- Shared database, `restaurant_id` on every tenant row, enforced in the data layer and backed by Postgres row-level security so one missed `WHERE` cannot leak another restaurant's data.
- Guest URLs use a random, rotatable table token (`/t/{qr_token}`), not a guessable id. Re-printing a QR code invalidates the old token.
- A guest's session id is the capability for acting on that visit (order, call, pay, review). It is already required by every guest endpoint in M0.
- Staff sessions are scoped to one restaurant and a role.
- Rate limits per table token and per IP on guest writes (orders, calls) to limit abuse.

## 9. Payments

Order of work:

1. UPI intent and QR (M0 prototype, M2 real). `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…&tr=…` opens any UPI app with the amount filled in; on desktop the same string is shown as a QR. The prototype builds this link (`src/domain/upi.ts`) with a deliberately fake demo UPI ID.
   - Limitation: a plain intent link gives no reliable confirmation back to us. Without a gateway, staff must confirm receipt (as many outlets already do with a soundbox).
2. Payment gateway (M2), for example Razorpay (others such as Cashfree or PhonePe PG are alternatives to compare on fees and settlement). Server creates a payment for a bill share; the guest pays by UPI, card or netbanking in the gateway's checkout; a signed webhook marks the payment succeeded. Shares are marked paid only by webhook, or by staff for cash.
3. Cash and bank transfer: recorded by staff on their screen, never by the guest alone.

Rules:

- No API keys or secrets in the repository. Keys live in the host's secret store and are read from environment variables; `.env*` files are git-ignored. Webhook signatures are verified; amounts always come from our database, never from the client.
- We do not store card data. Card entry stays in the gateway's hosted checkout.
- GST: the demo uses 5% on food. Real rates and whether service charge applies depend on the outlet; the rate is a per-restaurant setting and must be confirmed with each restaurant's accountant before the pilot.
- Refunds and partial refunds go through the gateway's refund API (after M2).

## 10. Architecture and stack

- Next.js (App Router) and TypeScript, one deployable app: guest pages, staff/kitchen/owner pages and the JSON API (route handlers).
- `src/domain/`: pure TypeScript business rules (menu, cart, order state machine, table state, bill, split, UPI link, day report). No framework imports; fully unit tested with Vitest. This is the part we keep as the app grows.
- `src/server/`: the store. In M0 an in-memory object seeded with one demo restaurant; in M1 the same functions backed by Postgres (Drizzle or Kysely, decided at M1) with transactions around order and payment writes.
- `src/app/api/`: thin route handlers that validate input and call the store.
- Client screens are React client components that poll the API (SSE in M1). Plain CSS, mobile first, no UI kit.
- Hosting: not chosen yet and nothing is deployed. Any Node host with Postgres works. Builds use `next build --webpack` because one development machine cannot load native SWC/Turbopack.

## 11. Milestones

| Milestone | Scope | Exit criteria |
| --- | --- | --- |
| M0 prototype (done) | Domain module with tests, in-memory store, guest/staff/kitchen/owner screens, polling, simulated payments, CI | `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass in CI; full table visit works end to end in the demo |
| M1 database and auth (mostly done: Postgres via Drizzle, migrations, seed, OTP login with roles, menu editor, QR tokens and sheet, rate limits; still open: RLS, SSE, per-item station status, error tracking) | Postgres schema above, migrations, row-level security, staff login with roles, menu editor for owners, table QR tokens and printable QR sheet, SSE instead of polling, per-item station status, rate limits, error tracking | All M0 flows work against Postgres across restarts and multiple server instances; role checks on every staff action; seed script for demo data |
| M2 payments | Gateway integration (test mode first), webhooks, staff-confirmed cash and transfer, refunds path, email receipts through a transactional email provider, GST-correct receipts | A test-mode payment for a split bill completes end to end; no secrets in the repo; webhook replay is idempotent |
| M3 pilot with one real restaurant | Real menu and photos, QR codes printed for every table, staff training, Hindi menu text if the restaurant wants it, monitoring, daily backup | One restaurant runs real service on TableTap for an agreed period (target: two weeks); we collect their feedback and our own measurements of order and payment times |

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Restaurants already use a POS or aggregator tablet and will not want another screen | Start with outlets without a POS; plan POS/KOT printer integration after the pilot; keep staff flow to one tap per step |
| Guests on weak mobile data | Small pages, no images required, polling pauses in hidden tabs; offline-tolerant UI in M1 |
| Prank or mistaken orders | Staff confirm every order before the kitchen sees it (already in M0); rotating table tokens; rate limits |
| Payment confirmation without a gateway is unreliable | Gateway webhooks in M2; until then staff confirm |
| Wrong tax or receipt format | Tax rate per restaurant; confirm with the pilot's accountant; receipts reviewed before M3 |
| Data leak between restaurants | `restaurant_id` everywhere plus row-level security; tests for cross-tenant access in M1 |
| Kitchen ignores the screen in a rush | Large type, sound alerts, late highlighting; gather feedback in the pilot |
| Prototype mistaken for production | Every screen shows a Demo badge; README states it is in-memory and not production |
| Competitors with funding and sales teams | Focus on a narrow segment first (independent cafes and casual dining), fast setup, low price; learn from the pilot before scaling |

## 13. Pricing idea (hypothesis, not validated)

Hypothesis to test with the pilot and in conversations with owners, not a decision:

- Free during the pilot.
- After that, a flat monthly fee per outlet with unlimited tables and orders, in the range of a few hundred to about two thousand rupees a month depending on features, plus the payment gateway's own fees passed through at cost. No commission on orders.
- Questions to answer before setting a price: what outlets pay today for POS and QR menus, whether they prefer per-outlet or per-table pricing, and whether the gateway's fees are acceptable to them compared with a UPI soundbox.

We have not interviewed restaurants yet; these figures are placeholders until we do.
