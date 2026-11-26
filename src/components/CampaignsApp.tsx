"use client";

import { useState } from "react";
import {
  CAMPAIGN_TEMPLATES,
  formatINR,
  parseRupees,
  renderTemplate,
  SEGMENT_LABELS,
  type CampaignAudience,
  type CampaignTemplate,
} from "@/domain";
import { postJson, useLive } from "@/lib/live";
import type { CampaignResult } from "@/server/store";
import { AppHeader } from "./AppHeader";

interface Data {
  results: CampaignResult[];
  outbox: { id: string; category: string; to: string; body: string; status: string; adapter: string; at: number }[];
  reachable: Record<CampaignAudience, number>;
  now: number;
}

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function CampaignsApp() {
  const live = useLive<Data>("/api/owner/campaigns", 10_000);
  const [template, setTemplate] = useState<CampaignTemplate>("winback");
  const [audience, setAudience] = useState<CampaignAudience>(CAMPAIGN_TEMPLATES.winback.defaultAudience);
  const [offerKind, setOfferKind] = useState<"percent" | "flat">("percent");
  const [offer, setOffer] = useState("10");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const data = live.data;

  const offerValue = offerKind === "percent" ? Number(offer) : parseRupees(offer);
  const offerText = offerKind === "percent" ? `${offer || "?"}% off` : `${offerValue ? formatINR(offerValue) : "₹?"} off`;
  const preview = renderTemplate(CAMPAIGN_TEMPLATES[template].body, {
    name: "Priya",
    restaurant: "your restaurant",
    offer: offerText,
    code: "JK-XXXXXX",
    detail: detail || "something special",
  });
  const reach = data?.reachable[audience] ?? 0;

  const send = async () => {
    if (!offerValue || !Number.isInteger(offerValue)) {
      setMessage({ ok: false, text: "Enter the offer as a whole percent, or rupees for a flat amount." });
      return;
    }
    if (!window.confirm(`Send to ${reach} customer${reach === 1 ? "" : "s"}? (Simulated: messages go to the outbox below.)`)) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await postJson<{ recipients: number; skipped: number }>("/api/owner/campaigns", {
        template,
        audience,
        offerKind,
        offerValue,
        detail: detail.trim() || undefined,
      });
      setMessage({
        ok: true,
        text: `Sent to ${res.recipients}. Skipped ${res.skipped} in this audience without marketing consent.`,
      });
      live.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not send" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader title="Campaigns" subtitle="WhatsApp offers to opted-in customers (simulated)" />
      <main id="main" className="console owner-wide">
        <p className="notice">
          Messages go through a simulated WhatsApp adapter and land in the outbox below. Nothing is sent to a phone.
          Only customers who ticked “offers” receive campaigns; each message carries an opt-out link.
        </p>
        {message ? (
          <p className={`notice ${message.ok ? "notice--ok" : "notice--error"}`} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        ) : null}
        <form
          className="panel"
          aria-labelledby="new-h"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <h2 id="new-h">New campaign</h2>
          <div className="form-grid">
            <label className="field">
              <span>Template</span>
              <select
                value={template}
                onChange={(e) => {
                  const t = e.target.value as CampaignTemplate;
                  setTemplate(t);
                  setAudience(CAMPAIGN_TEMPLATES[t].defaultAudience);
                }}
              >
                {(Object.keys(CAMPAIGN_TEMPLATES) as CampaignTemplate[]).map((t) => (
                  <option key={t} value={t}>
                    {CAMPAIGN_TEMPLATES[t].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Audience</span>
              <select value={audience} onChange={(e) => setAudience(e.target.value as CampaignAudience)}>
                {(["all", "new", "regular", "lapsed"] as const).map((a) => (
                  <option key={a} value={a}>
                    {a === "all" ? "Everyone" : SEGMENT_LABELS[a]} ({data?.reachable[a] ?? 0} opted in)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Offer type</span>
              <select
                value={offerKind}
                onChange={(e) => {
                  const k = e.target.value as "percent" | "flat";
                  setOfferKind(k);
                  setOffer(k === "percent" ? "10" : "100");
                }}
              >
                <option value="percent">Percent off</option>
                <option value="flat">Rupees off</option>
              </select>
            </label>
            <label className="field">
              <span>{offerKind === "percent" ? "Percent (5 to 50)" : "Rupees (20 to 1,000)"}</span>
              <input
                inputMode="numeric"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
              />
            </label>
            {template === "new_dish" || template === "event" ? (
              <label className="field field--wide">
                <span>{template === "new_dish" ? "Dish" : "Event"}</span>
                <input maxLength={120} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={template === "new_dish" ? "Smoked paneer tikka" : "Live ghazal night, Friday 8 pm"} />
              </label>
            ) : null}
          </div>
          <p className="muted small">Preview</p>
          <blockquote className="wa-preview">{preview}</blockquote>
          <button type="submit" className="btn" disabled={busy || reach === 0}>
            Send to {reach} customer{reach === 1 ? "" : "s"}
          </button>
        </form>

        <section className="panel" aria-labelledby="res-h">
          <h2 id="res-h">Results</h2>
          {data && data.results.length === 0 ? <p className="muted">No campaigns yet.</p> : null}
          {data && data.results.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">Campaign results</caption>
                <thead>
                  <tr>
                    <th scope="col">Campaign</th>
                    <th scope="col">Audience</th>
                    <th scope="col">Sent</th>
                    <th scope="col">Skipped (no consent)</th>
                    <th scope="col">Redeemed</th>
                    <th scope="col">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">
                        {r.name}
                        <span className="muted small block">{when(r.createdAt)}</span>
                      </th>
                      <td>{r.audience === "all" ? "Everyone" : SEGMENT_LABELS[r.audience as keyof typeof SEGMENT_LABELS]}</td>
                      <td>{r.recipients}</td>
                      <td>{r.skipped}</td>
                      <td>{r.redeemed}</td>
                      <td>{formatINR(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="muted small">Redeemed: campaign coupons used on a paid bill. Revenue: the total of those bills.</p>
        </section>

        <section className="panel" aria-labelledby="out-h">
          <h2 id="out-h">Outbox (simulated WhatsApp)</h2>
          {data && data.outbox.length === 0 ? <p className="muted">No messages yet.</p> : null}
          <ul className="outbox">
            {data?.outbox.map((m) => (
              <li key={m.id} className="outbox__msg">
                <p className="small muted">
                  {when(m.at)} · to {m.to} · {m.category === "marketing" ? "Offer" : "Bill update"} · {m.status.replace("_", " ")}
                </p>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
