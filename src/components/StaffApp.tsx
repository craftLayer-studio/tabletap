"use client";

import { useState } from "react";
import {
  formatElapsed,
  formatINR,
  ORDER_STATUS_LABELS,
  SERVICE_REQUEST_LABELS,
  TABLE_STATE_LABELS,
  type Order,
  type OrderStatus,
} from "@/domain";
import { postJson, shortId, useLive, useNow } from "@/lib/live";
import type { StaffView } from "@/server/store";
import { AppHeader } from "./AppHeader";

export function StaffApp() {
  const live = useLive<StaffView>("/api/staff");
  const now = useNow(live.clockOffset);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const act = async (url: string, body?: unknown) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await postJson(url, body);
      live.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  const move = (order: Order, to: OrderStatus) => act(`/api/orders/${order.id}/status`, { to });

  const data = live.data;
  const labelOf = (tableId: string) => data?.floor.find((f) => f.table.id === tableId)?.table.label ?? tableId;

  return (
    <>
      <AppHeader title="Staff" subtitle={data ? `${data.restaurant.name} · live, refreshes every few seconds` : "Loading…"} />
      <main id="main" className="console">
        {live.error ? <p className="notice notice--warn" role="status">{live.error}</p> : null}
        {message ? <p className="notice notice--error" role="alert">{message}</p> : null}
        {!data ? (
          <p className="loading" role="status">Loading the floor…</p>
        ) : (
          <>
            <section aria-labelledby="floor-h" className="panel">
              <h2 id="floor-h">Floor</h2>
              <ul className="floor">
                {data.floor.map((f) => (
                  <li key={f.table.id} className={`floor-table floor-table--${f.state}`}>
                    <span className="floor-table__label">{f.table.label}</span>
                    <span className="floor-table__state">{TABLE_STATE_LABELS[f.state]}</span>
                    <span className="floor-table__meta">
                      {f.table.seats} seats
                      {f.openedAt ? ` · ${formatElapsed(f.openedAt, now)}` : ""}
                      {f.activeOrders > 0 ? ` · ${f.activeOrders} open order${f.activeOrders > 1 ? "s" : ""}` : ""}
                      {f.billDue ? ` · ${formatINR(f.billDue)} due` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="legend" aria-label="Legend">
                {Object.entries(TABLE_STATE_LABELS).map(([k, v]) => (
                  <li key={k}>
                    <span className={`legend__dot floor-table--${k}`} aria-hidden="true" /> {v}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="req-h" className="panel">
              <h2 id="req-h">Requests {data.openRequests.length > 0 ? `(${data.openRequests.length})` : ""}</h2>
              {data.openRequests.length === 0 ? <p className="muted">No one is waiting.</p> : null}
              <ul className="list" aria-live="polite">
                {data.openRequests.map((r) => (
                  <li key={r.id} className={`list-row list-row--${r.kind}`}>
                    <span>
                      <strong>{labelOf(r.tableId)}</strong> {SERVICE_REQUEST_LABELS[r.kind]}
                      <span className="muted"> · {formatElapsed(r.createdAt, now)} ago</span>
                    </span>
                    <button type="button" className="btn btn--small" disabled={busy} onClick={() => act(`/api/requests/${r.id}/resolve`)}>
                      Done
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="orders-h" className="panel panel--wide">
              <h2 id="orders-h">Orders</h2>
              {data.activeOrders.length === 0 ? <p className="muted">No open orders.</p> : null}
              <ul className="order-grid">
                {data.activeOrders.map((o) => (
                  <li key={o.id} className={`ticket ticket--${o.status}`}>
                    <header className="ticket__head">
                      <strong>
                        {labelOf(o.tableId)} · #{shortId(o.id)}
                      </strong>
                      <span className={`status status--${o.status}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                    </header>
                    <ul className="ticket__items">
                      {o.items.map((i, idx) => (
                        <li key={idx}>
                          {i.qty} × {i.name}
                          {i.variantName !== "Regular" ? ` (${i.variantName})` : ""}
                          {i.note ? <em className="muted"> · {i.note}</em> : null}
                        </li>
                      ))}
                    </ul>
                    <p className="muted small">Placed {formatElapsed(o.createdAt, now)} ago</p>
                    <div className="ticket__actions">
                      {o.status === "placed" ? (
                        <>
                          <button type="button" className="btn btn--small" disabled={busy} onClick={() => move(o, "confirmed")}>
                            Send to kitchen
                          </button>
                          <button type="button" className="btn btn--small btn--danger" disabled={busy} onClick={() => move(o, "cancelled")}>
                            Cancel
                          </button>
                        </>
                      ) : null}
                      {o.status === "ready" ? (
                        <button type="button" className="btn btn--small" disabled={busy} onClick={() => move(o, "served")}>
                          Mark served
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <p className="muted small reset-row">
              Demo data is stored in the database.{" "}
              <button type="button" className="link-button" disabled={busy} onClick={() => act("/api/demo/reset")}>
                Reset demo
              </button>
            </p>
          </>
        )}
      </main>
    </>
  );
}
