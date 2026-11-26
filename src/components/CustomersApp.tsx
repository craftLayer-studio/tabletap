"use client";

import { useState } from "react";
import { formatINR, formatIndianMobile, SEGMENT_LABELS, type Segment } from "@/domain";
import { postJson, useLive } from "@/lib/live";
import type { CustomerRow } from "@/server/store";
import { AppHeader } from "./AppHeader";

type Row = Omit<CustomerRow, "optOutToken">;

const date = (ms?: number) =>
  ms === undefined ? "–" : new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function CustomersApp() {
  const live = useLive<{ customers: Row[]; now: number }>("/api/owner/customers", 15_000);
  const [segment, setSegment] = useState<Segment | "all">("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const all = live.data?.customers ?? [];
  const shown = all.filter((c) => segment === "all" || c.segment === segment);

  const withdraw = async (c: Row) => {
    if (!window.confirm(`Record that ${c.name ?? "this customer"} asked to stop offers?`)) return;
    setBusy(true);
    try {
      await postJson(`/api/owner/customers/${c.id}/withdraw`, { purpose: "marketing" });
      setMessage("Marketing consent withdrawn. They will not receive campaigns.");
      live.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader title="Customers" subtitle="Guests who shared their number at the table" />
      <main id="main" className="console owner-wide">
        {message ? (
          <p className="notice" role="status">
            {message}
          </p>
        ) : null}
        <section className="panel" aria-labelledby="cust-h">
          <div className="panel__head">
            <h2 id="cust-h">
              {shown.length} customer{shown.length === 1 ? "" : "s"}
            </h2>
            <fieldset className="chips">
              <legend className="sr-only">Segment</legend>
              {(["all", "new", "regular", "lapsed"] as const).map((s) => (
                <label key={s} className={`chip ${segment === s ? "chip--on" : ""}`}>
                  <input type="radio" className="sr-only" name="segment" checked={segment === s} onChange={() => setSegment(s)} />
                  {s === "all" ? "All" : SEGMENT_LABELS[s]} ({s === "all" ? all.length : all.filter((c) => c.segment === s).length})
                </label>
              ))}
            </fieldset>
          </div>
          {!live.data ? <p className="loading">Loading…</p> : null}
          {live.data && shown.length === 0 ? <p className="muted">No customers in this segment yet.</p> : null}
          {shown.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">Customers</caption>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Segment</th>
                    <th scope="col">Visits</th>
                    <th scope="col">Spend</th>
                    <th scope="col">Last visit</th>
                    <th scope="col">Stamps</th>
                    <th scope="col">Consent</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">
                        {c.name ?? "Guest"}
                        <span className="muted small block">{formatIndianMobile(c.phone)}</span>
                      </th>
                      <td>
                        <span className={`tag segment--${c.segment}`}>{SEGMENT_LABELS[c.segment]}</span>
                      </td>
                      <td>{c.stats.visits}</td>
                      <td>{formatINR(c.stats.spend)}</td>
                      <td>{date(c.stats.lastVisitAt)}</td>
                      <td>{c.stamps}/5</td>
                      <td className="small">
                        {c.consent.service ? "Bill updates" : null}
                        {c.consent.service && c.consent.marketing ? " · " : null}
                        {c.consent.marketing ? "Offers" : null}
                        {!c.consent.service && !c.consent.marketing ? <span className="muted">None</span> : null}
                      </td>
                      <td>
                        {c.consent.marketing ? (
                          <button type="button" className="btn btn--small btn--ghost" disabled={busy} onClick={() => withdraw(c)}>
                            Record STOP
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="muted small">
            Segments: new (fewer than 2 paid visits), regular (2 or more), lapsed (no paid visit in 30 days). Spend is
            each visit&apos;s total shared between the guests who gave a number. Consent comes from separate opt-ins at
            the table; every change is kept in a consent ledger.
          </p>
        </section>
      </main>
    </>
  );
}
