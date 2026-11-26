"use client";

import { useState } from "react";
import { postJson } from "@/lib/live";

export function OptOut({ token }: { token: string }) {
  const [state, setState] = useState<{ done?: string; error?: string; busy?: boolean }>({});
  return (
    <main id="main" className="home">
      <section className="card">
        <h1>Stop offers on WhatsApp</h1>
        {state.done ? (
          <p className="notice notice--ok" role="status">
            Done. {state.done} will not send you offers any more. Bill and order messages you asked for are not affected.
          </p>
        ) : (
          <>
            <p>Tap the button to stop receiving offers and news from this restaurant. You can opt in again at your next visit.</p>
            {state.error ? (
              <p className="notice notice--error" role="alert">
                {state.error}
              </p>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={state.busy}
              onClick={async () => {
                setState({ busy: true });
                try {
                  const res = await postJson<{ restaurantName: string }>(`/api/u/${encodeURIComponent(token)}`);
                  setState({ done: res.restaurantName });
                } catch (err) {
                  setState({ error: err instanceof Error ? err.message : "Something went wrong" });
                }
              }}
            >
              Stop offers
            </button>
          </>
        )}
      </section>
    </main>
  );
}
