/**
 * In-memory sliding-window rate limiter for public endpoints (one process; a shared store such as Redis is
 * needed once there are several instances). Keys are e.g. "order:<ip>:<table token>".
 */
export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly maxKeys = 10_000) {}

  /** Record a hit and return whether it is allowed, plus seconds until the next allowed hit when not. */
  hit(key: string, limit: Limit, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const since = now - limit.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= limit.max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + limit.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(now, limit.windowMs);
    return { ok: true };
  }

  private prune(now: number, windowMs: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= now - windowMs)) this.hits.delete(key);
    }
    // Still too many keys: drop the oldest inserted ones.
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(key);
    }
  }

  reset() {
    this.hits.clear();
  }
}

/** Limits for guest writes. Generous enough for a table of friends, tight enough to stop scripted spam. */
export const GUEST_LIMITS = {
  join: { max: 30, windowMs: 60_000 },
  order: { max: 10, windowMs: 60_000 },
  request: { max: 10, windowMs: 60_000 },
  bill: { max: 20, windowMs: 60_000 },
  pay: { max: 20, windowMs: 60_000 },
  review: { max: 5, windowMs: 60_000 },
  customer: { max: 5, windowMs: 60_000 },
  game: { max: 5, windowMs: 60_000 },
  coupon: { max: 10, windowMs: 60_000 },
  otp: { max: 5, windowMs: 10 * 60_000 },
} satisfies Record<string, Limit>;
