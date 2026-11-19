"use client";

import { formatINR, TABLE_STATE_LABELS } from "@/domain";
import { useLive } from "@/lib/live";
import type { OwnerView } from "@/server/store";
import { AppHeader } from "./AppHeader";

export function OwnerApp() {
  const live = useLive<OwnerView>("/api/owner", 5000);
  const data = live.data;
  const s = data?.summary;
  return (
    <>
      <AppHeader title="Today" subtitle={data ? `${data.restaurant.name} · since midnight IST` : "Loading…"} />
      <main id="main" className="console">
        {live.error ? <p className="notice notice--warn" role="status">{live.error}</p> : null}
        {!data || !s ? (
          <p className="loading" role="status">Loading today…</p>
        ) : (
          <>
            {data.restaurant.isDemo ? (
              <p className="notice">Demo figures: two seeded meals plus whatever you do in this session.</p>
            ) : null}
            <dl className="stats">
              <div className="stat">
                <dt>Tables in use</dt>
                <dd>
                  {data.tablesInUse}/{data.tableCount}
                </dd>
              </div>
              <div className="stat">
                <dt>Orders</dt>
                <dd>{s.orders}</dd>
              </div>
              <div className="stat">
                <dt>Items sold</dt>
                <dd>{s.itemsSold}</dd>
              </div>
              <div className="stat">
                <dt>Collected</dt>
                <dd>{formatINR(s.collected)}</dd>
              </div>
              <div className="stat">
                <dt>Tips</dt>
                <dd>{formatINR(s.tips)}</dd>
              </div>
              <div className="stat">
                <dt>Rating</dt>
                <dd>{s.averageRating !== undefined ? `${s.averageRating} ★ (${s.reviews})` : "–"}</dd>
              </div>
            </dl>

            <section className="panel" aria-labelledby="top-h">
              <h2 id="top-h">Top dishes</h2>
              {s.topItems.length === 0 ? <p className="muted">No orders yet today.</p> : null}
              <ol className="list">
                {s.topItems.map((t) => (
                  <li key={t.name} className="list-row">
                    <span>{t.name}</span>
                    <strong>{t.qty}</strong>
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel" aria-labelledby="tables-h">
              <h2 id="tables-h">Tables now</h2>
              <ul className="list">
                {data.floor.map((f) => (
                  <li key={f.table.id} className="list-row">
                    <span>{f.table.label}</span>
                    <span className={`tag floor-table--${f.state}`}>{TABLE_STATE_LABELS[f.state]}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel" aria-labelledby="rev-h">
              <h2 id="rev-h">Latest reviews</h2>
              {data.recentReviews.length === 0 ? <p className="muted">No reviews yet today.</p> : null}
              <ul className="list">
                {data.recentReviews.map((r) => (
                  <li key={r.id} className="list-row">
                    <span aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}</span>
                    <span className="muted">{r.comment ?? "No comment"}</span>
                  </li>
                ))}
              </ul>
              {s.cancelledOrders > 0 ? <p className="muted small">{s.cancelledOrders} cancelled order(s) not counted.</p> : null}
            </section>
          </>
        )}
      </main>
    </>
  );
}
