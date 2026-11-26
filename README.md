# TableTap

Scan, order, track and pay at the table. TableTap is a QR-at-the-table ordering system for Indian restaurants and cafes: guests open the menu from a QR code (no app), order from their phone, follow their food, call a waiter, split the bill, tip and pay by UPI, card, cash or bank transfer, then leave a one-tap review. Staff get a live floor map, the kitchen gets a station display with timers, and the owner sees today's numbers.

TableTap is the ordering module of **DineLoop** ([product plan](https://github.com/craftLayer-studio/dineloop)), which adds the guest-revenue layer on top: consented phone capture, a customer CRM, loyalty stamps, a spin-the-wheel reward, a Google review funnel and WhatsApp campaigns. Production URL (not deployed yet): <https://dineloop.craftlayer.store>. Company site: <https://craftlayer.store>.

> **Status: MVP, demo data, simulated messaging and payments.** Data is stored in Postgres (PGlite locally). Payments are simulated: nothing is charged. WhatsApp, SMS and email are simulated: messages are written to an outbox shown to the owner and never leave the server. "Juniper Kitchen" is a made-up demo restaurant in Pune; every name and phone number in the demo is invented.

The plan, data model, payments approach and milestones are in [PLAN.md](PLAN.md).

## Run it

Requirements: Node.js 20.9 or newer and pnpm (pinned in `package.json` under `packageManager`).

```bash
pnpm install
cp .env.example .env.local   # optional; set APP_URL=http://localhost:3101 for local QR codes
pnpm dev --port 3101         # http://localhost:3101
```

The first request creates a PGlite database in `./.data/pglite`, runs the migrations in `./drizzle` and seeds the demo restaurant. Set `DATABASE_URL` to use a real Postgres instead (node-postgres). Tests use an in-memory PGlite.

| Command | What it does |
| --- | --- |
| `pnpm test` | Vitest: domain unit tests and store integration tests on in-memory PGlite |
| `pnpm typecheck` | `next typegen`, then `tsc --noEmit` |
| `pnpm lint` | ESLint (next core-web-vitals + typescript) |
| `pnpm build` / `pnpm start` | production build (webpack) / serve it |
| `pnpm db:generate` | generate a SQL migration after changing `src/server/db/schema.ts` |
| `pnpm db:migrate` | apply migrations (and seed an empty database) |
| `pnpm db:seed` | seed the demo if the database is empty |
| `pnpm db:reset` | wipe all data and seed the demo again |

Stop the dev server before `db:*` commands: a PGlite file database can be opened by one process at a time. If you upgrade from an older checkout, run `pnpm db:reset` once so the demo staff and customers exist.

`dev` and `build` use webpack (`--webpack`) because some development machines cannot load the native SWC/Turbopack binaries.

## Demo walkthrough

1. Open `/` and pick a table. The link is the table's QR URL, `/t/{token}`, with a random token.
2. As the guest: filter the menu, add dishes, place the order. Optionally save a phone number on the Bill tab, with two separate, unticked opt-ins (bill updates; offers).
3. Open `/login` in another tab and tap **Sign in as waiter**. The one-time code is shown on screen (demo). On `/staff`, press **Send to kitchen**. Sign in as kitchen for `/kitchen` (start cooking, mark ready).
4. Back on the guest tab: get the bill (enter a coupon if you have one), pay a share (simulated). After paying: one stamp on the loyalty card, one spin of the wheel (the prize is a coupon for the next visit), and a review. 4-5 stars shows a "Post a Google review" button; 1-3 stars goes privately to the owner.
5. Sign in as owner. `/owner` shows today's numbers plus **Guests coming back**: repeat rate, customers, opt-ins, campaign redemptions and revenue, and private feedback to follow up.
6. `/owner/customers`: CRM with visits, spend, last visit, stamps, consent and segment (new, regular, lapsed). **Record STOP** withdraws marketing consent.
7. `/owner/campaigns`: pick a template, audience and offer, preview, send. Only marketing-consented customers receive it; each gets a personal coupon and an opt-out link (`/u/{token}`). Messages appear in the outbox.
8. `/owner/menu` (edit categories, dishes, sizes, prices, deals, availability), `/owner/qr` (printable QR sheet, re-issue a table's code, add a table), `/owner/settings` (Google review link). **Reset demo** is at the bottom of `/owner`.

Demo staff (made-up numbers, code shown on screen): owner +91 98000 00001, manager +91 98000 00002, waiter +91 98000 00003, kitchen +91 98000 00004.

## Features

Built:

- Guest QR page: menu with sizes, allergens, spice, veg mark, deals, sold out, filters; cart with notes; live order status with ETA; call waiter; GST bill, tip, even split; pay per share (UPI intent link, simulated card, cash, bank transfer); review.
- Staff floor map and order confirmation, kitchen display by station with timers, owner day summary.
- Postgres via Drizzle with SQL migrations and a seed; one open session per table (partial unique index); every query scoped by restaurant.
- Random, rotatable table QR tokens and a printable QR sheet (built from `APP_URL`).
- Staff and owner phone + OTP sign-in (demo code on screen), signed httpOnly session cookie, server-side role checks (owner, manager, waiter, kitchen).
- Owner menu editor: categories, dishes, sizes and prices, deals, availability.
- In-memory rate limits on guest writes and sign-in.
- Guest phone capture with a DPDP notice and separate opt-ins (service, marketing), an append-only consent ledger and one-tap opt-out.
- Customer CRM: profiles, visits, spend, last visit, segments new / regular / lapsed.
- Loyalty stamps (one per paid visit; five earn ₹150 off), spin-the-wheel (one play per paid visit, coupon for the next visit), coupons applied before GST.
- Review funnel: 4-5 stars to the Google review link setting, 1-3 stars to a private owner alert.
- WhatsApp campaigns (win-back, weekday offer, new dish, event) through a simulated adapter writing to an outbox; bill updates as utility messages to service-consented guests; campaign results (sent, skipped, redeemed, revenue) and repeat rate on the owner dashboard.

Planned (see PLAN.md and the DineLoop plan): server-sent events instead of polling (screens poll every 2.5 s), row-level security, OTP verification of guest phone numbers, real payment gateway with webhooks (M2), real WhatsApp/SMS adapters, menu import from CSV/photo, birthday campaigns, direct online ordering, POS integrations, Hindi menus.

## Folder map

```
drizzle/             SQL migrations (generated by drizzle-kit, committed)
scripts/db.ts        db:migrate / db:seed / db:reset
src/
  domain/            Pure business rules, unit tested (money, menu, cart, order, bill, table, roles, phone,
                     menu-edit, growth: consent, segments, loyalty, coupons, wheel, review funnel, templates)
  server/
    db/              schema.ts (Drizzle), client.ts (PGlite file / in-memory / pg)
    store/           Data access and use cases: table-service, admin (tables, menu), auth (OTP, sessions),
                     growth (CRM, consent, loyalty, coupons, wheel, campaigns); tests on in-memory PGlite
    seed.ts, seed-db.ts  Demo data and seeder
    session.ts       Staff cookie and role checks for routes and pages
    messaging.ts     Messaging adapter interface and the simulated WhatsApp adapter (outbox)
    rate-limit.ts    In-memory limiter
    http.ts, parse.ts  JSON handling and input validation for route handlers
  app/               Pages and thin route handlers (api/t/{token}/..., api/owner/..., api/auth/...)
  components/        Client components for each screen
  lib/live.ts        Polling hook, clock, POST helper
```

## Security notes

- Guests are untrusted: prices, totals, discounts and amounts are computed on the server.
- Set `SESSION_SECRET` (32+ random characters) anywhere other than your own machine; without it a development secret is used and a warning is logged.
- `DEMO_OTP=on` shows sign-in codes on screen. Turn it off once a real SMS adapter exists.
- Rate limits are per process; use a shared store once there are several instances.

Contact: hello@craftlayer.store (general), dineloop@craftlayer.store (product support).
