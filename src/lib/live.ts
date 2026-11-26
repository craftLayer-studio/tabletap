"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/** Poll interval for "live" screens. M1 replaces polling with server-sent events (see PLAN.md). */
export const POLL_MS = 2500;

interface WithNow {
  now: number;
}

/**
 * Fetch JSON from `url` now and every `intervalMs`. Returns the latest data, an error message,
 * a `refresh` to call after a mutation, and the offset between server and browser clocks.
 */
export function useLive<T extends WithNow>(url: string | null, intervalMs = POLL_MS) {
  const router = useRouter();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<number>();
  const [clockOffset, setClockOffset] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === 401) {
          // Staff session expired: go to the login page and come back here afterwards.
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        const json = await res.json();
        if (!alive) return;
        setStatus(res.status);
        if (res.ok) {
          setData(json as T);
          setClockOffset((json as T).now - Date.now());
          setError(undefined);
        } else {
          setError(typeof json.error === "string" ? json.error : "Request failed");
        }
      } catch {
        if (alive) setError("Connection lost. Retrying…");
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [url, intervalMs, tick, router]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, status, clockOffset, refresh };
}

/** Current time, re-rendered every `intervalMs`, corrected to the server clock. */
export function useNow(clockOffset = 0, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now + clockOffset;
}

export async function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json as T;
}

export function shortId(id: string): string {
  return id.slice(-4).toUpperCase();
}
