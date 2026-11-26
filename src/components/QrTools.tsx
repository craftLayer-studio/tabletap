"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/live";

/** Print, re-issue a table's code, and add a table. */
export function QrTools({ tables }: { tables: { id: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState(4);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await fn();
      setMessage({ ok: true, text: ok });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="qr-tools">
      {message ? (
        <p className={`notice ${message.ok ? "notice--ok" : "notice--error"}`} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
      <button type="button" className="btn" onClick={() => window.print()}>
        Print QR sheet
      </button>
      <details>
        <summary>Re-issue a code</summary>
        <ul className="chips">
          {tables.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Re-issue the code for ${t.label}? The printed code stops working.`)) {
                    void run(() => postJson(`/api/owner/tables/${t.id}/rotate`), `New code issued for ${t.label}. Print it again.`);
                  }
                }}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </details>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => postJson("/api/owner/tables", { label, seats }), `Table ${label} added.`).then(() => setLabel(""));
        }}
      >
        <label className="field">
          <span>New table label</span>
          <input value={label} maxLength={12} onChange={(e) => setLabel(e.target.value)} placeholder="T7" required />
        </label>
        <label className="field">
          <span>Seats</span>
          <input type="number" min={1} max={30} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
        </label>
        <button type="submit" className="btn btn--ghost" disabled={busy || !label.trim()}>
          Add table
        </button>
      </form>
    </div>
  );
}
