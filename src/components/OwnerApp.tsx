"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatINR, TABLE_STATE_LABELS } from "@/domain";
import { postJson, useLive } from "@/lib/live";
import type { GrowthSummary, OwnerView } from "@/server/store";
import Link from "next/link";

type Dashboard = OwnerView & { growth: GrowthSummary };
import { AppHeader } from "./AppHeader";

export function OwnerApp({ canReset }: { canReset: boolean }) {
  const live = useLive<Dashboard>("/api/owner", 5000);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!window.confirm("Wipe all demo data and start again? You will be signed out.")) return;
    setBusy(true);
    await postJson("/api/demo/reset").catch(() => undefined);
    router.push("/login");
    router.refresh();
  };
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

            <GrowthCard growth={data.growth} busy={busy} onResolve={async (id) => {
              setBusy(true);
              await postJson(`/api/owner/alerts/${id}/resolve`).catch(() => undefined);
              setBusy(false);
              live.refresh();
            }} />

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

            {canReset && data.restaurant.isDemo ? (
              <p className="muted small reset-row">
                Demo data is stored in the database.{" "}
                <button type="button" className="link-button" disabled={busy} onClick={reset}>
                  Reset demo
                </button>
              </p>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}

function GrowthCard({ growth, busy, onResolve }: { growth: GrowthSummary; busy: boolean; onResolve: (id: string) => void }) {
  const rate = growth.repeatRate === undefined ? "–" : `${Math.round(growth.repeatRate * 100)}%`;
  return (
    <section className="panel panel--wide growth-panel" aria-labelledby="growth-h">
      <div className="panel__head">
        <h2 id="growth-h">Guests coming back</h2>
        <span className="row-actions">
          <Link href="/owner/customers" className="btn btn--small btn--ghost">
            Customers
          </Link>
          <Link href="/owner/campaigns" className="btn btn--small btn--ghost">
            Campaigns
          </Link>
        </span>
      </div>
      <dl className="stats">
        <div className="stat">
          <dt>Repeat rate</dt>
          <dd>{rate}</dd>
        </div>
        <div className="stat">
          <dt>Customers</dt>
          <dd>
            {growth.customers}
            {growth.capturedToday > 0 ? <small> +{growth.capturedToday} today</small> : null}
          </dd>
        </div>
        <div className="stat">
          <dt>Offers opt-in</dt>
          <dd>{growth.marketingOptIns}</dd>
        </div>
        <div className="stat">
          <dt>Campaign redemptions</dt>
          <dd>{growth.campaignRedemptions}</dd>
        </div>
        <div className="stat">
          <dt>Campaign revenue</dt>
          <dd>{formatINR(growth.campaignRevenue)}</dd>
        </div>
      </dl>
      <p className="muted small">
        Repeat rate: customers with a paid visit who came back at least once. Segments: {growth.bySegment.new} new,{" "}
        {growth.bySegment.regular} regular, {growth.bySegment.lapsed} lapsed (no visit in 30 days).
      </p>
      {growth.campaigns.length > 0 ? (
        <table className="data-table">
          <caption className="sr-only">Recent campaigns</caption>
          <thead>
            <tr>
              <th scope="col">Campaign</th>
              <th scope="col">Sent</th>
              <th scope="col">Redeemed</th>
              <th scope="col">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {growth.campaigns.map((c) => (
              <tr key={c.id}>
                <th scope="row">
                  {c.name}
                  <span className="muted small"> · {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</span>
                </th>
                <td>{c.recipients}</td>
                <td>{c.redeemed}</td>
                <td>{formatINR(c.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No campaigns yet.</p>
      )}
      <h3>Private feedback to follow up</h3>
      {growth.openAlerts.length === 0 ? <p className="muted">Nothing to follow up.</p> : null}
      <ul className="list" aria-live="polite">
        {growth.openAlerts.map((a) => (
          <li key={a.id} className="list-row list-row--waiter">
            <span>{a.message}</span>
            <button type="button" className="btn btn--small" disabled={busy} onClick={() => onResolve(a.id)}>
              Done
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
