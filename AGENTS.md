# AGENTS.md

Rules for anyone (people or coding agents) changing this repository.

## What this is

TableTap, a QR table-ordering prototype for Indian restaurants. Read [README.md](README.md) for how to run it and [PLAN.md](PLAN.md) for the product plan and milestones. Current milestone: M0 done, M1 next.

## Ground rules

- Use pnpm. Pin exact versions for new dependencies, and only versions released more than a day ago (pnpm enforces a minimum release age here).
- `dev` and `build` must keep `--webpack`; some machines cannot load native SWC/Turbopack.
- This is Next.js 16 (App Router). Route handler and page `params` are Promises. When unsure about an API, read the docs shipped in `node_modules/next/dist/docs/` rather than relying on memory.
- Before you push: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass. CI runs the same steps.
- Push to `main` only through normal commits. Never force-push. No hosting or paid services without the owner's approval.
- Never commit secrets, API keys or `.env` files. Payment keys (M2) come from environment variables only.

## Code rules

- Business rules live in `src/domain/` as pure functions with Vitest tests next to them (`*.test.ts`). No React, Next.js or I/O imports there.
- Money is integer paise everywhere. Use `src/domain/money.ts`; never use floating rupees for totals.
- Order status changes go through `transitionOrder` in `src/domain/order.ts`. Add new states or transitions there first, with tests.
- Table state is derived (`deriveTableState`), never stored.
- Route handlers stay thin: parse and validate input (`src/server/http.ts`), call the store, return JSON. Errors that the user should see are `StoreError` with an HTTP status.
- The guest is untrusted. Prices, totals and amounts are always computed on the server from the menu and orders, never taken from the request.
- UI: plain CSS in `src/app/globals.css`, mobile first, brand colours ink `#101828`, accent `#465FFF`, light accent `#8A99FF`, canvas `#F7F8F5`. Every control needs an accessible name; keep touch targets at least 36 px.
- Be honest in copy and docs: no invented customers, metrics or market numbers. Demo data must be labelled as demo.

## Commits

- Conventional-style subjects (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Commits made by an agent end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
