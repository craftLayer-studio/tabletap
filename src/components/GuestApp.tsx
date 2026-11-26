"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  addToCart,
  ALLERGEN_LABELS,
  amountDue,
  buildUpiUri,
  canRevise,
  cartCount,
  cartTotal,
  estimatedReadyAt,
  findItem,
  findVariant,
  formatElapsed,
  formatINR,
  groupByCategory,
  isFullyPaid,
  isValidVpa,
  MAX_SPLIT,
  minutesRemaining,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  setLineQty,
  SPICE_LABELS,
  TIP_PRESETS,
  unitPrice,
  type Allergen,
  type Bill,
  type Cart,
  type MenuItem,
  type Order,
  type OrderStatus,
  type PaymentMethod,
} from "@/domain";
import { postJson, shortId, useLive, useNow } from "@/lib/live";
import type { GuestView } from "@/server/store";

type Tab = "menu" | "orders" | "bill";

/** API base for this table, e.g. "/api/t/<token>". */
const ApiBase = createContext("");

const storageKey = (tableId: string) => `tabletap:session:${tableId}`;

function readStored(tableId: string): string | undefined {
  try {
    return window.sessionStorage.getItem(storageKey(tableId)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStored(tableId: string, sessionId: string | undefined) {
  try {
    if (sessionId) window.sessionStorage.setItem(storageKey(tableId), sessionId);
    else window.sessionStorage.removeItem(storageKey(tableId));
  } catch {
    // Storage can be blocked; the visit still works until the tab is closed.
  }
}

export function GuestApp({ token }: { token: string }) {
  const tableId = token;
  const api = `/api/t/${token}`;
  const [sessionId, setSessionId] = useState<string>();
  const [joinError, setJoinError] = useState<string>();
  const [joinAttempt, setJoinAttempt] = useState(0);

  // Join the table's open visit, reusing the one this tab already joined.
  useEffect(() => {
    let alive = true;
    const join = async () => {
      const stored = readStored(tableId);
      if (stored) {
        const res = await fetch(`${api}?session=${encodeURIComponent(stored)}`, { cache: "no-store" });
        if (res.ok) {
          if (alive) setSessionId(stored);
          return;
        }
        writeStored(tableId, undefined);
      }
      try {
        const { sessionId: fresh } = await postJson<{ sessionId: string }>(`${api}/join`);
        writeStored(tableId, fresh);
        if (alive) setSessionId(fresh);
      } catch (err) {
        if (alive) setJoinError(err instanceof Error ? err.message : "Could not open this table");
      }
    };
    void join();
    return () => {
      alive = false;
    };
  }, [tableId, api, joinAttempt]);

  const live = useLive<GuestView>(
    sessionId ? `${api}?session=${encodeURIComponent(sessionId)}` : null,
  );

  const startNewVisit = () => {
    writeStored(tableId, undefined);
    setSessionId(undefined);
    setJoinAttempt((n) => n + 1);
  };

  if (joinError) {
    return (
      <main id="main" className="guest">
        <div className="notice notice--error" role="alert">
          {joinError}
        </div>
      </main>
    );
  }
  if (!live.data) {
    return (
      <main id="main" className="guest">
        <p className="loading" role="status">
          {live.status === 404 ? "This visit has ended." : "Opening the menu…"}
        </p>
        {live.status === 404 ? (
          <button type="button" className="btn" onClick={startNewVisit}>
            Start a new visit
          </button>
        ) : null}
      </main>
    );
  }
  return (
    <ApiBase.Provider value={api}>
      <GuestScreen view={live.data} clockOffset={live.clockOffset} error={live.error} refresh={live.refresh} onNewVisit={startNewVisit} />
    </ApiBase.Provider>
  );
}

function GuestScreen({
  view,
  clockOffset,
  error,
  refresh,
  onNewVisit,
}: {
  view: GuestView;
  clockOffset: number;
  error?: string;
  refresh: () => void;
  onNewVisit: () => void;
}) {
  const [tab, setTab] = useState<Tab>("menu");
  const [cart, setCart] = useState<Cart>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();
  const closed = view.session.closedAt !== undefined;
  const base = useContext(ApiBase);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await fn();
      if (ok) setMessage({ kind: "ok", text: ok });
      refresh();
      return true;
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async () => {
    const ok = await run(
      () => postJson(`${base}/orders`, { sessionId: view.session.id, cart }),
      "Order sent. Staff will confirm it shortly.",
    );
    if (ok) {
      setCart([]);
      setTab("orders");
    }
  };

  const waiterCalled = view.openRequests.some((r) => r.kind === "waiter");
  const callWaiter = () =>
    run(() => postJson(`${base}/requests`, { sessionId: view.session.id, kind: "waiter" }), "A waiter is on the way.");

  const activeOrders = view.orders.filter((o) => o.status !== "served" && o.status !== "cancelled").length;

  return (
    <div className="guest-shell">
      <header className="guest-header">
        <div>
          <p className="eyebrow">{view.restaurant.isDemo ? "Demo restaurant" : "Welcome"}</p>
          <h1>{view.restaurant.name}</h1>
        </div>
        <span className="table-badge" aria-label={`Table ${view.table.label}`}>
          {view.table.label}
        </span>
      </header>

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ["menu", "Menu"],
            ["orders", activeOrders > 0 ? `Orders (${activeOrders})` : "Orders"],
            ["bill", "Bill"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? "tab--active" : ""}`}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main id="main" className="guest">
        {error ? (
          <p className="notice notice--warn" role="status">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className={`notice ${message.kind === "error" ? "notice--error" : "notice--ok"}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}

        {tab === "menu" ? (
          <MenuSection view={view} cart={cart} setCart={setCart} disabled={closed} />
        ) : null}
        {tab === "orders" ? <OrdersSection orders={view.orders} clockOffset={clockOffset} /> : null}
        {tab === "bill" ? (
          <BillSection view={view} busy={busy} run={run} onNewVisit={onNewVisit} />
        ) : null}
      </main>

      {!closed ? (
        <div className="action-bar">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={callWaiter}
            disabled={busy || waiterCalled}
            aria-live="polite"
          >
            {waiterCalled ? "Waiter called" : "Call waiter"}
          </button>
          {tab === "menu" && cart.length > 0 ? (
            <CartDrawer view={view} cart={cart} setCart={setCart} busy={busy} onPlace={placeOrder} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function VegMark({ veg }: { veg: boolean }) {
  return (
    <span className={`veg-mark ${veg ? "veg-mark--veg" : "veg-mark--non"}`} role="img" aria-label={veg ? "Vegetarian" : "Non-vegetarian"} />
  );
}

function SpiceMeter({ level }: { level: 0 | 1 | 2 | 3 }) {
  return (
    <span className="spice" aria-label={`Spice: ${SPICE_LABELS[level]}`}>
      {[1, 2, 3].map((n) => (
        <span key={n} aria-hidden="true" className={n <= level ? "spice__dot spice__dot--on" : "spice__dot"} />
      ))}
      <span className="spice__label">{SPICE_LABELS[level]}</span>
    </span>
  );
}

const FILTER_ALLERGENS: Allergen[] = ["dairy", "gluten", "nuts", "peanuts", "egg", "fish"];

function MenuSection({
  view,
  cart,
  setCart,
  disabled,
}: {
  view: GuestView;
  cart: Cart;
  setCart: (c: Cart) => void;
  disabled: boolean;
}) {
  const [vegOnly, setVegOnly] = useState(false);
  const [avoid, setAvoid] = useState<Allergen[]>([]);
  const groups = useMemo(() => groupByCategory(view.menu), [view.menu]);

  const visible = (item: MenuItem) =>
    (!vegOnly || item.veg) && !item.allergens.some((a) => avoid.includes(a));

  if (disabled) {
    return <p className="notice">This visit is closed. Open the Bill tab to leave a review or start a new visit.</p>;
  }

  return (
    <section aria-label="Menu">
      <div className="filters">
        <label className="toggle">
          <input type="checkbox" checked={vegOnly} onChange={(e) => setVegOnly(e.target.checked)} />
          Veg only
        </label>
        <fieldset className="chips">
          <legend>Avoid</legend>
          {FILTER_ALLERGENS.map((a) => (
            <label key={a} className={`chip ${avoid.includes(a) ? "chip--on" : ""}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={avoid.includes(a)}
                onChange={(e) => setAvoid(e.target.checked ? [...avoid, a] : avoid.filter((x) => x !== a))}
              />
              {ALLERGEN_LABELS[a]}
            </label>
          ))}
        </fieldset>
      </div>

      <nav className="category-nav" aria-label="Menu categories">
        {groups.map(({ category }) => (
          <a key={category.id} href={`#cat-${category.id}`}>
            {category.name}
          </a>
        ))}
      </nav>

      {groups.map(({ category, items }) => {
        const shown = items.filter(visible);
        return (
          <section key={category.id} id={`cat-${category.id}`} className="menu-category" aria-labelledby={`h-${category.id}`}>
            <h2 id={`h-${category.id}`}>{category.name}</h2>
            {shown.length === 0 ? <p className="muted">Nothing here matches your filters.</p> : null}
            <ul className="menu-list">
              {shown.map((item) => (
                <li key={item.id}>
                  <MenuCard item={item} onAdd={(variantId) => setCart(addToCart(cart, { itemId: item.id, variantId, qty: 1 }))} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function MenuCard({ item, onAdd }: { item: MenuItem; onAdd: (variantId: string) => void }) {
  const [variantId, setVariantId] = useState(item.variants[0].id);
  const [added, setAdded] = useState(false);
  const variant = findVariant(item, variantId) ?? item.variants[0];
  const price = unitPrice(item, variant);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1200);
    return () => clearTimeout(t);
  }, [added]);

  return (
    <article className={`dish ${item.available ? "" : "dish--soldout"}`} aria-labelledby={`dish-${item.id}`}>
      <div className="dish__photo" aria-hidden="true">
        {item.name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)}
      </div>
      <div className="dish__body">
        <h3 id={`dish-${item.id}`}>
          <VegMark veg={item.veg} /> {item.name}
        </h3>
        <p className="dish__desc">{item.description}</p>
        <div className="dish__meta">
          <SpiceMeter level={item.spice} />
          {item.allergens.length > 0 ? (
            <span className="allergens">Contains: {item.allergens.map((a) => ALLERGEN_LABELS[a]).join(", ")}</span>
          ) : (
            <span className="allergens">No listed allergens</span>
          )}
        </div>
        {item.deal ? <p className="deal">{item.deal.label}</p> : null}
        {item.variants.length > 1 ? (
          <fieldset className="variants">
            <legend className="sr-only">Size for {item.name}</legend>
            {item.variants.map((v) => (
              <label key={v.id} className={`variant ${v.id === variantId ? "variant--on" : ""}`}>
                <input
                  type="radio"
                  className="sr-only"
                  name={`variant-${item.id}`}
                  value={v.id}
                  checked={v.id === variantId}
                  onChange={() => setVariantId(v.id)}
                />
                {v.name} · {formatINR(unitPrice(item, v))}
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="dish__foot">
          <span className="price">
            {formatINR(price)}
            {item.deal ? <s className="was">{formatINR(variant.price)}</s> : null}
          </span>
          {item.available ? (
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                onAdd(variant.id);
                setAdded(true);
              }}
              aria-label={`Add ${item.name} ${item.variants.length > 1 ? variant.name : ""} to order`}
            >
              {added ? "Added" : "Add"}
            </button>
          ) : (
            <span className="soldout">Sold out</span>
          )}
        </div>
      </div>
    </article>
  );
}

function CartDrawer({
  view,
  cart,
  setCart,
  busy,
  onPlace,
}: {
  view: GuestView;
  cart: Cart;
  setCart: (c: Cart) => void;
  busy: boolean;
  onPlace: () => void;
}) {
  const [open, setOpen] = useState(false);
  const total = cartTotal(view.menu, cart);
  return (
    <>
      <button type="button" className="btn btn--cart" onClick={() => setOpen(true)} aria-haspopup="dialog">
        View order · {cartCount(cart)} · {formatINR(total)}
      </button>
      {open ? (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            <div className="sheet__head">
              <h2 id="cart-title">Your order</h2>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)} autoFocus>
                Close
              </button>
            </div>
            <ul className="cart-lines">
              {cart.map((line, index) => {
                const item = findItem(view.menu, line.itemId);
                const variant = item && findVariant(item, line.variantId);
                if (!item || !variant) return null;
                return (
                  <li key={`${line.itemId}-${line.variantId}-${index}`} className="cart-line">
                    <div className="cart-line__main">
                      <strong>{item.name}</strong>
                      {item.variants.length > 1 ? <span className="muted"> · {variant.name}</span> : null}
                      <label className="note">
                        <span className="sr-only">Note for {item.name}</span>
                        <input
                          type="text"
                          maxLength={140}
                          placeholder="Note for the kitchen (optional)"
                          value={line.note ?? ""}
                          onChange={(e) =>
                            setCart(cart.map((l, i) => (i === index ? { ...l, note: e.target.value } : l)))
                          }
                        />
                      </label>
                    </div>
                    <div className="stepper" role="group" aria-label={`Quantity of ${item.name}`}>
                      <button type="button" onClick={() => setCart(setLineQty(cart, index, line.qty - 1))} aria-label="One less">
                        −
                      </button>
                      <span aria-live="polite">{line.qty}</span>
                      <button type="button" onClick={() => setCart(setLineQty(cart, index, line.qty + 1))} aria-label="One more">
                        +
                      </button>
                    </div>
                    <span className="cart-line__price">{formatINR(unitPrice(item, variant) * line.qty)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="sheet__foot">
              <span>
                Total <strong>{formatINR(total)}</strong>
                <small className="muted"> + {view.restaurant.taxPercent}% GST</small>
              </span>
              <button
                type="button"
                className="btn"
                disabled={busy || cart.length === 0}
                onClick={() => {
                  setOpen(false);
                  onPlace();
                }}
              >
                Place order
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const STATUS_STEPS: OrderStatus[] = ["placed", "confirmed", "cooking", "ready", "served"];

function OrdersSection({ orders, clockOffset }: { orders: Order[]; clockOffset: number }) {
  const now = useNow(clockOffset);
  if (orders.length === 0) {
    return <p className="empty">No orders yet. Add dishes from the menu and place your order.</p>;
  }
  return (
    <section aria-label="Your orders" className="stack">
      {[...orders].reverse().map((order) => {
        const readyAt = estimatedReadyAt(order);
        const stepIndex = STATUS_STEPS.indexOf(order.status);
        return (
          <article key={order.id} className="card order-card" aria-labelledby={`o-${order.id}`}>
            <header className="order-card__head">
              <h2 id={`o-${order.id}`}>Order #{shortId(order.id)}</h2>
              <span className={`status status--${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span>
            </header>
            {order.status !== "cancelled" ? (
              <ol className="progress" aria-label="Order progress">
                {STATUS_STEPS.map((s, i) => (
                  <li key={s} className={i <= stepIndex ? "progress__step progress__step--done" : "progress__step"} aria-current={i === stepIndex ? "step" : undefined}>
                    {ORDER_STATUS_LABELS[s]}
                  </li>
                ))}
              </ol>
            ) : null}
            <p className="eta" aria-live="polite">
              {readyAt !== undefined
                ? `Ready in about ${minutesRemaining(readyAt, now)} min`
                : order.status === "ready"
                  ? "Ready, coming to your table"
                  : order.status === "served"
                    ? "Enjoy your meal"
                    : "This order was cancelled"}
              <span className="muted"> · ordered {formatElapsed(order.createdAt, now)} ago</span>
            </p>
            <ul className="order-items">
              {order.items.map((item, i) => (
                <li key={i}>
                  {item.qty} × {item.name}
                  {item.variantName !== "Regular" ? ` (${item.variantName})` : ""}
                  {item.note ? <em className="muted"> · {item.note}</em> : null}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}

function BillSection({
  view,
  busy,
  run,
  onNewVisit,
}: {
  view: GuestView;
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  onNewVisit: () => void;
}) {
  const bill = view.bill;
  const [tipPercent, setTipPercent] = useState(bill?.summary.tipPercent ?? 0);
  const [splitCount, setSplitCount] = useState(bill?.parts.length ?? 1);
  const base = useContext(ApiBase);
  const billable = view.orders.filter((o) => o.status !== "cancelled");
  const waitingConfirm = view.orders.some((o) => o.status === "placed");

  if (bill && isFullyPaid(bill)) {
    return <PaidSection view={view} bill={bill} busy={busy} run={run} onNewVisit={onNewVisit} />;
  }
  if (billable.length === 0) {
    return <p className="empty">Your bill will appear here once you have ordered.</p>;
  }

  const revisable = !bill || canRevise(bill);
  const changed = !bill || bill.summary.tipPercent !== tipPercent || bill.parts.length !== splitCount;

  return (
    <section aria-label="Bill" className="stack">
      {revisable ? (
        <div className="card">
          <h2>Tip and split</h2>
          <fieldset className="chips">
            <legend>Tip for the staff</legend>
            {TIP_PRESETS.map((p) => (
              <label key={p} className={`chip ${tipPercent === p ? "chip--on" : ""}`}>
                <input
                  type="radio"
                  className="sr-only"
                  name="tip"
                  checked={tipPercent === p}
                  onChange={() => setTipPercent(p)}
                />
                {p === 0 ? "No tip" : `${p}%`}
              </label>
            ))}
          </fieldset>
          <div className="split-row">
            <span id="split-label">Split between</span>
            <div className="stepper" role="group" aria-labelledby="split-label">
              <button type="button" onClick={() => setSplitCount(Math.max(1, splitCount - 1))} aria-label="Fewer people">
                −
              </button>
              <span aria-live="polite">
                {splitCount} {splitCount === 1 ? "person" : "people"}
              </span>
              <button type="button" onClick={() => setSplitCount(Math.min(MAX_SPLIT, splitCount + 1))} aria-label="More people">
                +
              </button>
            </div>
          </div>
          {waitingConfirm ? (
            <p className="muted">An order is still waiting for staff to confirm it. You can get the bill once it is confirmed.</p>
          ) : null}
          <button
            type="button"
            className="btn"
            disabled={busy || waitingConfirm || !changed}
            onClick={() =>
              run(() => postJson(`${base}/bill`, { sessionId: view.session.id, tipPercent, splitCount }), bill ? "Bill updated." : undefined)
            }
          >
            {bill ? "Update bill" : "Get the bill"}
          </button>
        </div>
      ) : null}

      {bill ? <BillCard bill={bill} /> : null}
      {bill ? <SharesCard view={view} bill={bill} busy={busy} run={run} /> : null}
    </section>
  );
}

function BillCard({ bill }: { bill: Bill }) {
  const s = bill.summary;
  return (
    <div className="card">
      <h2>Bill</h2>
      <table className="bill-table">
        <caption className="sr-only">Bill items</caption>
        <tbody>
          {s.lines.map((l, i) => (
            <tr key={i}>
              <th scope="row">
                {l.qty} × {l.name}
                {l.variantName !== "Regular" ? <span className="muted"> ({l.variantName})</span> : null}
              </th>
              <td>{formatINR(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Subtotal</th>
            <td>{formatINR(s.subtotal)}</td>
          </tr>
          <tr>
            <th scope="row">GST {s.taxPercent}%</th>
            <td>{formatINR(s.tax)}</td>
          </tr>
          <tr>
            <th scope="row">Tip {s.tipPercent}%</th>
            <td>{formatINR(s.tip)}</td>
          </tr>
          <tr className="bill-total">
            <th scope="row">Total</th>
            <td>{formatINR(s.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const METHODS: PaymentMethod[] = ["upi", "card", "cash", "bank_transfer"];

function SharesCard({
  view,
  bill,
  busy,
  run,
}: {
  view: GuestView;
  bill: Bill;
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
}) {
  const base = useContext(ApiBase);
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [email, setEmail] = useState("");
  const firstUnpaid = bill.parts.find((p) => !p.payment)?.index ?? 0;
  const [selected, setSelected] = useState(firstUnpaid);
  const part = bill.parts[selected]?.payment ? bill.parts[firstUnpaid] : bill.parts[selected];
  const upiUri =
    part && isValidVpa(view.restaurant.upiVpa) && part.amount > 0
      ? buildUpiUri({
          vpa: view.restaurant.upiVpa,
          payeeName: view.restaurant.name,
          amount: part.amount,
          note: `Table ${view.table.label} share ${part.index + 1}`,
          reference: `${bill.id}-${part.index + 1}`,
        })
      : undefined;

  return (
    <div className="card">
      <h2>Pay at the table</h2>
      <p className="muted">
        {formatINR(amountDue(bill))} still to pay
        {bill.parts.length > 1 ? `, split into ${bill.parts.length} shares` : ""}.
      </p>
      {bill.parts.length > 1 ? (
        <fieldset className="shares">
          <legend>Which share are you paying?</legend>
          {bill.parts.map((p) => (
            <label key={p.index} className={`share ${p.payment ? "share--paid" : ""} ${part?.index === p.index ? "share--on" : ""}`}>
              <input
                type="radio"
                className="sr-only"
                name="share"
                disabled={!!p.payment}
                checked={part?.index === p.index}
                onChange={() => setSelected(p.index)}
              />
              Share {p.index + 1}: {formatINR(p.amount)} {p.payment ? `· paid by ${PAYMENT_METHOD_LABELS[p.payment.method]}` : ""}
            </label>
          ))}
        </fieldset>
      ) : null}

      <fieldset className="chips">
        <legend>Payment method</legend>
        {METHODS.map((m) => (
          <label key={m} className={`chip ${method === m ? "chip--on" : ""}`}>
            <input type="radio" className="sr-only" name="method" checked={method === m} onChange={() => setMethod(m)} />
            {PAYMENT_METHOD_LABELS[m]}
          </label>
        ))}
      </fieldset>

      <div className="method-help">
        {method === "upi" ? (
          <>
            <p>
              Opens your UPI app with the amount filled in.{" "}
              {view.restaurant.isDemo ? <strong>Demo UPI ID: do not complete a real payment.</strong> : null}
            </p>
            {upiUri ? (
              <a className="btn btn--ghost btn--small" href={upiUri}>
                Open UPI app
              </a>
            ) : null}
          </>
        ) : null}
        {method === "card" ? <p>Card checkout comes with the payment gateway in milestone M2. Here it is simulated.</p> : null}
        {method === "cash" ? <p>Hand the cash to your waiter. In production staff confirm cash on their screen.</p> : null}
        {method === "bank_transfer" ? (
          <p>Bank details are shown here in production. The demo has no real account.</p>
        ) : null}
      </div>

      <label className="field">
        <span>Email for the receipt (optional)</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <p className="muted small">The prototype stores the address but does not send email.</p>

      {part ? (
        <button
          type="button"
          className="btn btn--wide"
          disabled={busy}
          onClick={() =>
            run(
              () =>
                postJson(`${base}/bill/pay`, {
                  sessionId: view.session.id,
                  partIndex: part.index,
                  method,
                  receiptEmail: email.trim() || undefined,
                }),
              `Share ${part.index + 1} marked paid (simulated).`,
            )
          }
        >
          {method === "cash" ? "I paid cash" : "Mark paid"} · {formatINR(part.amount)}
        </button>
      ) : null}
    </div>
  );
}

function PaidSection({
  view,
  bill,
  busy,
  run,
  onNewVisit,
}: {
  view: GuestView;
  bill: Bill;
  busy: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  onNewVisit: () => void;
}) {
  const base = useContext(ApiBase);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <section className="stack" aria-label="Paid">
      <div className="card paid">
        <h2>Paid. Thank you!</h2>
        <p>
          {formatINR(bill.summary.total)} settled
          {bill.receiptEmail ? `. Receipt address saved: ${bill.receiptEmail} (not sent in the prototype).` : "."}
        </p>
      </div>
      {view.review ? (
        <div className="card">
          <h2>Thanks for the review</h2>
          <p aria-label={`${view.review.rating} out of 5`}>{"★".repeat(view.review.rating)}{"☆".repeat(5 - view.review.rating)}</p>
        </div>
      ) : (
        <div className="card">
          <h2>How was it?</h2>
          <fieldset className="stars">
            <legend className="sr-only">Rating out of 5</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={`star ${n <= rating ? "star--on" : ""}`}>
                <input type="radio" className="sr-only" name="rating" checked={rating === n} onChange={() => setRating(n)} />
                <span aria-hidden="true">★</span>
                <span className="sr-only">
                  {n} {n === 1 ? "star" : "stars"}
                </span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>Anything to add? (optional)</span>
            <textarea rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy || rating === 0}
            onClick={() =>
              run(() => postJson(`${base}/review`, { sessionId: view.session.id, rating, comment }), "Review saved.")
            }
          >
            Send review
          </button>
        </div>
      )}
      <button type="button" className="btn btn--ghost" onClick={onNewVisit}>
        Start a new visit at this table
      </button>
    </section>
  );
}
