"use client";

import { useState } from "react";

export function SettingsForm({ googleReviewUrl, isDemo }: { googleReviewUrl: string; isDemo: boolean }) {
  const [url, setUrl] = useState(googleReviewUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  return (
    <form
      className="panel"
      aria-labelledby="review-h"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(undefined);
        const res = await fetch("/api/owner/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ googleReviewUrl: url.trim() || null }),
        });
        const json = await res.json().catch(() => ({}));
        setMessage(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: json.error ?? "Could not save" });
        setBusy(false);
      }}
    >
      <h2 id="review-h">Review funnel</h2>
      <p className="muted">
        After paying, guests who give 4 or 5 stars are invited to post on Google using this link. 1 to 3 stars stay
        private and appear as an alert on your Today screen so you can follow up.
      </p>
      {message ? (
        <p className={`notice ${message.ok ? "notice--ok" : "notice--error"}`} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
      <label className="field">
        <span>Google review link</span>
        <input type="url" inputMode="url" placeholder="https://g.page/r/…/review" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <p className="muted small">
        Find it in Google Business Profile under “Ask for reviews”. {isDemo ? "The demo uses a placeholder link." : ""}
      </p>
      <button type="submit" className="btn" disabled={busy}>
        Save
      </button>
    </form>
  );
}
