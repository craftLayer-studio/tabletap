"use client";

import { useState } from "react";
import { CONSENT_NOTICE, CONSENT_NOTICE_VERSION, CONSENT_TEXT, formatINR } from "@/domain";
import { postJson } from "@/lib/live";
import type { GuestView } from "@/server/store";

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

/**
 * Optional phone capture with a DPDP notice and two separate opt-ins that start unticked.
 * Nothing on the menu or bill depends on it.
 */
export function PhoneCapture({ view, base, busy, run }: { view: GuestView; base: string; busy: boolean; run: Run }) {
  const linked = view.growth.customer;
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [service, setService] = useState(false);
  const [marketing, setMarketing] = useState(false);

  if (linked && !open) {
    return (
      <div className="card growth-card">
        <h2>Loyalty card</h2>
        <Stamps count={linked.stamps} of={view.growth.stampsPerCard} />
        <p className="muted small">
          Saved for {linked.phoneMasked}
          {linked.consent.service ? " · bill on WhatsApp" : ""}
          {linked.consent.marketing ? " · offers on" : " · no offers"}.{" "}
          <button type="button" className="link-button" onClick={() => setOpen(true)}>
            Change choices
          </button>
        </p>
      </div>
    );
  }

  return (
    <form
      className="card growth-card"
      aria-labelledby="stay-h"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(
          () =>
            postJson(`${base}/customer`, {
              sessionId: view.session.id,
              phone,
              name: name.trim() || undefined,
              consentService: service,
              consentMarketing: marketing,
            }),
          "Saved. Thank you!",
        );
        if (ok) setOpen(false);
      }}
    >
      <h2 id="stay-h">Collect a stamp for every visit</h2>
      <p className="muted small">
        Optional. Every {view.growth.stampsPerCard}th visit earns {formatINR(15000)} off. Your order works the same
        without it.
      </p>
      <label className="field">
        <span>Mobile number</span>
        <input type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>
      <label className="field">
        <span>Name (optional)</span>
        <input autoComplete="given-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="consent-notice small">{CONSENT_NOTICE}</p>
      <label className="consent">
        <input type="checkbox" checked={service} onChange={(e) => setService(e.target.checked)} />
        <span>{CONSENT_TEXT.service}</span>
      </label>
      <label className="consent">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
        <span>{CONSENT_TEXT.marketing}</span>
      </label>
      <p className="muted small">
        {view.restaurant.name} is responsible for this data. Notice version {CONSENT_NOTICE_VERSION}. Messages in this
        demo are simulated and never sent.
      </p>
      <button type="submit" className="btn" disabled={busy || phone.trim().length < 10}>
        Save my number
      </button>
    </form>
  );
}

function Stamps({ count, of }: { count: number; of: number }) {
  return (
    <p className="stamps" aria-label={`${count} of ${of} stamps`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < count ? "stamp stamp--on" : "stamp"} aria-hidden="true">
          ★
        </span>
      ))}
      <span className="muted small"> {count}/{of}</span>
    </p>
  );
}

/** Enter a coupon won earlier (wheel, loyalty or a WhatsApp offer). */
export function CouponCard({
  view,
  base,
  busy,
  run,
  onApplied,
}: {
  view: GuestView;
  base: string;
  busy: boolean;
  run: Run;
  onApplied: () => Promise<unknown>;
}) {
  const [code, setCode] = useState("");
  if (view.growth.coupon) {
    return (
      <p className="notice notice--ok" role="status">
        Coupon {view.growth.coupon.code} applied: {view.growth.coupon.label}.
      </p>
    );
  }
  return (
    <form
      className="card inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await postJson(`${base}/coupon`, { sessionId: view.session.id, code });
          await onApplied();
        }, "Coupon applied.");
      }}
    >
      <label className="field">
        <span>Have a coupon code?</span>
        <input value={code} maxLength={12} placeholder="JK-AB23CD" autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </label>
      <button type="submit" className="btn btn--ghost" disabled={busy || code.trim().length < 6}>
        Apply
      </button>
    </form>
  );
}

/** One spin per paid visit; every slice is a coupon for the next visit. */
export function SpinCard({ view, base, busy, run }: { view: GuestView; base: string; busy: boolean; run: Run }) {
  const [spinning, setSpinning] = useState(false);
  const won = view.growth.spin;
  const prizes = view.growth.prizes;
  if (won) {
    return (
      <div className="card growth-card spin-card">
        <h2>You won {won.label}</h2>
        <p>
          Code <strong className="coupon-code">{won.code}</strong>
        </p>
        <p className="muted small">
          Use it on your next visit{won.minBill > 0 ? ` on bills of ${formatINR(won.minBill)} or more` : ""}, until{" "}
          {new Date(won.validTo).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}.
          {view.growth.customer ? " It is saved to your number." : " Take a screenshot, or save your number above to keep it."}
        </p>
      </div>
    );
  }
  return (
    <div className="card growth-card spin-card">
      <h2>Spin the wheel</h2>
      <p className="muted small">One spin per visit. Every prize is a coupon for your next visit.</p>
      <ul className={`wheel ${spinning ? "wheel--spinning" : ""}`} aria-label="Prizes">
        {prizes.map((p) => (
          <li key={p.id}>{p.label}</li>
        ))}
      </ul>
      <button
        type="button"
        className="btn"
        disabled={busy || spinning}
        onClick={async () => {
          setSpinning(true);
          await new Promise((r) => setTimeout(r, 900));
          await run(() => postJson(`${base}/spin`, { sessionId: view.session.id }));
          setSpinning(false);
        }}
      >
        {spinning ? "Spinning…" : "Spin"}
      </button>
    </div>
  );
}
