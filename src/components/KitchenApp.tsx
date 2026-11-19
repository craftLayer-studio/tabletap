"use client";

import { useState } from "react";
import { enteredAt, formatElapsed, STATION_LABELS, type Order, type OrderStatus, type Station } from "@/domain";
import { postJson, shortId, useLive, useNow } from "@/lib/live";
import type { StaffView } from "@/server/store";
import { AppHeader } from "./AppHeader";

const STATIONS = Object.keys(STATION_LABELS) as Station[];

export function KitchenApp() {
  const live = useLive<StaffView>("/api/staff");
  const now = useNow(live.clockOffset);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const move = async (order: Order, to: OrderStatus) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await postJson(`/api/orders/${order.id}/status`, { to });
      live.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const data = live.data;
  const kitchenOrders = data?.activeOrders.filter((o) => o.status === "confirmed" || o.status === "cooking") ?? [];
  const labelOf = (tableId: string) => data?.floor.find((f) => f.table.id === tableId)?.table.label ?? tableId;

  return (
    <>
      <AppHeader title="Kitchen" subtitle={`${kitchenOrders.length} order${kitchenOrders.length === 1 ? "" : "s"} in the kitchen`} />
      <main id="main" className="kitchen">
        {live.error ? <p className="notice notice--warn" role="status">{live.error}</p> : null}
        {message ? <p className="notice notice--error" role="alert">{message}</p> : null}
        {!data ? <p className="loading" role="status">Loading orders…</p> : null}
        <div className="stations">
          {STATIONS.map((station) => {
            const tickets = kitchenOrders
              .map((o) => ({ order: o, items: o.items.filter((i) => i.station === station) }))
              .filter((t) => t.items.length > 0);
            return (
              <section key={station} className="station" aria-labelledby={`st-${station}`}>
                <h2 id={`st-${station}`}>
                  {STATION_LABELS[station]} <span className="count">{tickets.length}</span>
                </h2>
                {tickets.length === 0 ? <p className="muted small">Clear</p> : null}
                <ul className="stack">
                  {tickets.map(({ order, items }) => {
                    const since = enteredAt(order, "confirmed") ?? order.createdAt;
                    const target = Math.max(...items.map((i) => i.prepMinutes)) * 60_000;
                    const late = now - since > target;
                    return (
                      <li key={order.id} className={`ticket ticket--${order.status} ${late ? "ticket--late" : ""}`}>
                        <header className="ticket__head">
                          <strong>
                            {labelOf(order.tableId)} · #{shortId(order.id)}
                          </strong>
                          <span className="timer" aria-label={`Elapsed ${formatElapsed(since, now)}${late ? ", running late" : ""}`}>
                            {formatElapsed(since, now)}
                          </span>
                        </header>
                        <ul className="ticket__items ticket__items--big">
                          {items.map((i, idx) => (
                            <li key={idx}>
                              <strong>{i.qty}×</strong> {i.name}
                              {i.variantName !== "Regular" ? ` (${i.variantName})` : ""}
                              {i.note ? <em className="ticket__note"> {i.note}</em> : null}
                            </li>
                          ))}
                        </ul>
                        <div className="ticket__actions">
                          {order.status === "confirmed" ? (
                            <button type="button" className="btn btn--small" disabled={busy} onClick={() => move(order, "cooking")}>
                              Start cooking
                            </button>
                          ) : (
                            <button type="button" className="btn btn--small btn--ok" disabled={busy} onClick={() => move(order, "ready")}>
                              Mark ready
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="muted small">
          Prototype: status is per order, so &quot;Mark ready&quot; at one station marks the whole order ready. Per-station
          item status is planned (see PLAN.md).
        </p>
      </main>
    </>
  );
}
