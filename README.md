# TableTap

Scan, order, track and pay at the table. TableTap is a QR-at-the-table ordering system for Indian restaurants and cafes: guests open the menu from a QR code (no app), order from their phone, follow their food, call a waiter, split the bill, tip and pay by UPI, card, cash or bank transfer, then leave a one-tap review. Staff get a live floor map, the kitchen gets a station display with timers, and the owner sees today's numbers.

> **Status: prototype (milestone M0). In-memory, not production.** All data lives in server memory and resets on restart. Payments are simulated: nothing is charged and no email is sent. "Juniper Kitchen" is a made-up demo restaurant.

The plan, data model, payments approach and milestones are in [PLAN.md](PLAN.md).

## What works in the prototype

- `/` overview with links to every demo view.
- `/t/t1` … `/t/t6` guest view: menu by category with photo placeholder, price, half/full sizes, allergens, spice level, veg mark, deals and sold-out items; veg-only and allergen filters; cart with notes; place order; order status with progress and estimated time; call waiter; bill with GST, tip presets and even split; pay share by share (UPI deep link, card, cash, bank transfer, simulated); review after paying.
- `/staff` live floor map (free, ordering, eating, needs help, bill requested), service requests, incoming orders with "Send to kitchen", cancel and "Mark served", reset demo.
- `/kitchen` orders by station with elapsed timers and late highlighting, start cooking, mark ready.
- `/owner` tables in use, orders, items sold, money collected, tips, average rating, top dishes and latest reviews since midnight IST.

Screens poll the API every 2.5 seconds (owner every 5). Open a table on your phone or in one tab and `/staff` and `/kitchen` in others to see updates move between them.

## Run it

Requirements: Node.js 20.9 or newer and pnpm (the version is pinned in `package.json` under `packageManager`).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Other commands:

```bash
pnpm test         # Vitest unit tests (domain rules and store flow)
pnpm typecheck    # next typegen, then tsc --noEmit
pnpm lint         # ESLint (next core-web-vitals + typescript)
pnpm build        # production build
pnpm start        # serve the production build
```

`dev` and `build` use webpack (`--webpack`) because one of our development machines cannot load the native SWC/Turbopack binaries.

To try it from a phone on the same Wi-Fi, run `pnpm dev -H 0.0.0.0` and open `http://<your-computer-ip>:3000/t/t1`.

## Folder map

```
src/
  domain/            Pure business rules, no framework code. Unit tested.
    money.ts         Paise helpers and INR formatting (Indian digit grouping)
    menu.ts          Menu, items, variants, allergens, spice, stations, deals
    cart.ts          Cart editing and validated order items (price snapshots)
    order.ts         Order state machine, status events, estimated ready time
    table.ts         Tables, sessions and derived floor-map state
    service.ts       Call-waiter / bill requests and reviews
    bill.ts          Bill totals, GST, tip, even split with exact paise, share payments
    upi.ts           UPI intent link builder
    report.ts        Owner's day summary
    time.ts          IST start of day
  server/
    seed.ts          Demo restaurant "Juniper Kitchen", 6 tables, menu
    store.ts         In-memory store (replaced by Postgres in M1)
    http.ts, parse.ts  JSON handling and input validation for route handlers
  app/
    api/             Route handlers (tables, orders, requests, staff, owner, demo reset)
    t/[tableId]/     Guest page
    staff/ kitchen/ owner/   Restaurant screens
  components/        Client components for each screen
  lib/live.ts        Polling hook, clock, POST helper
PLAN.md              Product and technical plan
AGENTS.md            Rules for contributors and coding agents
```

## API (prototype)

| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/tables/{tableId}/join` | none; returns `{ sessionId }` |
| GET | `/api/tables/{tableId}?session={sessionId}` | guest view |
| POST | `/api/tables/{tableId}/orders` | `{ sessionId, cart: [{ itemId, variantId, qty, note? }] }` |
| POST | `/api/tables/{tableId}/requests` | `{ sessionId, kind: "waiter" \| "bill" }` |
| POST | `/api/tables/{tableId}/bill` | `{ sessionId, tipPercent, splitCount }` |
| POST | `/api/tables/{tableId}/bill/pay` | `{ sessionId, partIndex, method, receiptEmail? }` |
| POST | `/api/tables/{tableId}/review` | `{ sessionId, rating, comment? }` |
| GET | `/api/staff` | floor, active orders, open requests |
| POST | `/api/orders/{orderId}/status` | `{ to }` |
| POST | `/api/requests/{requestId}/resolve` | none |
| GET | `/api/owner` | today's summary |
| POST | `/api/demo/reset` | none; re-seeds the demo |

There is no authentication in the prototype. Do not expose it on the public internet with real data.
